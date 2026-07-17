// =============================================================================
// Workspace — merge many apps' worker sets into ONE Miniflare config
// =============================================================================
// Pure helpers (no I/O, no Miniflare) implementing §5.2 of
// docs/shared-bindings-dev.md: take each app's `buildMiniflareDevConfig`
// worker array, namespace the worker names per app (rewriting intra-app
// service-binding / durable-object / outbound references to match), drop the
// per-gateway `routes: ['*']` (they would contend on the shared entry socket),
// and attach a per-app direct socket so each app keeps its own browser origin.
//
// Storage services dedupe automatically by binding id inside one instance, so
// there is nothing to merge there: matching ids share a live store, differing
// ids stay separate — exactly like prod.
// =============================================================================

import { resolve } from 'pathe'

/** A Miniflare worker config object (shape owned by `makeMiniflareWorker`). */
type MiniflareWorker = Record<string, any>

/** One app's contribution to the merged instance. */
export interface WorkspaceAppWorkers {
	/** Unique per-app namespace (prefixes every worker name). */
	appName: string
	/** The app's worker array from `buildMiniflareDevConfig` (the gateway is first). */
	workers: MiniflareWorker[]
	/** Browser-reachable port for this app's gateway direct socket. */
	directSocketPort: number
}

/** The subset of persist paths an instance can carry (one dir per storage plugin). */
export interface WorkspacePersistPaths {
	kvPersist?: string
	r2Persist?: string
	d1Persist?: string
	cachePersist?: string
	durableObjectsPersist?: string
	workflowsPersist?: string
	imagesPersist?: string
	streamPersist?: string
}

/**
 * Prefix `name` with `${appName}/` — but only when it is one of this app's own
 * worker names. External/cross-app targets are left untouched.
 */
function namespaceIfLocal(name: string, appName: string, localNames: Set<string>): string {
	return localNames.has(name) ? `${appName}/${name}` : name
}

/** Rewrite an intra-app worker reference on a service-binding value (object or string form). */
function rewriteServiceBindingTarget(
	value: unknown,
	appName: string,
	localNames: Set<string>
): unknown {
	if (typeof value === 'string') {
		return namespaceIfLocal(value, appName, localNames)
	}
	if (value && typeof value === 'object' && typeof (value as any).name === 'string') {
		;(value as any).name = namespaceIfLocal((value as any).name, appName, localNames)
	}
	return value
}

/**
 * Namespace one app's workers in place: rename each worker `${appName}/<name>`,
 * rewrite every intra-app reference (service bindings, `durableObjects`
 * scriptName, `outboundService`) to the new names, drop `routes`, and attach the
 * app's direct socket to its gateway (entry) worker.
 *
 * @param appName - The app namespace (must be unique across the workspace).
 * @param workers - The app's worker array (mutated). The gateway is `workers[0]`.
 * @param options - `host`/`directSocketPort` for the gateway's direct socket.
 * @returns The (same) workers plus the namespaced gateway worker name — the key
 *   for `miniflare.unsafeGetDirectURL(...)`.
 */
export function namespaceAppWorkers(
	appName: string,
	workers: MiniflareWorker[],
	options: { host: string; directSocketPort: number }
): { workers: MiniflareWorker[]; gatewayWorkerName: string } {
	// Capture the ORIGINAL names first; every rewrite decides "is this a local
	// worker?" against this set, so renaming order within the loop is irrelevant.
	const localNames = new Set(workers.map((worker) => String(worker.name)))

	for (const worker of workers) {
		// The shared entry socket has ONE route table; two apps' gateways each
		// claiming `*` would contend. Direct sockets bypass routing, so routes
		// are unnecessary here.
		delete worker.routes

		if (worker.serviceBindings && typeof worker.serviceBindings === 'object') {
			for (const [bindingName, target] of Object.entries(worker.serviceBindings)) {
				worker.serviceBindings[bindingName] = rewriteServiceBindingTarget(
					target,
					appName,
					localNames
				)
			}
		}

		if (worker.durableObjects && typeof worker.durableObjects === 'object') {
			for (const value of Object.values(worker.durableObjects)) {
				// Only the `{ className, scriptName }` form references another
				// worker; a bare string value is a class name on the DO's own worker.
				if (value && typeof value === 'object' && typeof (value as any).scriptName === 'string') {
					;(value as any).scriptName = namespaceIfLocal(
						(value as any).scriptName,
						appName,
						localNames
					)
				}
			}
		}

		if (worker.outboundService !== undefined) {
			worker.outboundService = rewriteServiceBindingTarget(
				worker.outboundService,
				appName,
				localNames
			)
		}

		worker.name = `${appName}/${worker.name}`
	}

	// The gateway is the app's entry worker (buildMiniflareDevConfig puts it
	// first and names it `gateway`). Its direct socket IS the app's browser
	// origin for a pure worker, and the bridge port for a Vite app.
	const gatewayWorkerName = `${appName}/gateway`
	const gatewayWorker = workers.find((worker) => worker.name === gatewayWorkerName) ?? workers[0]
	gatewayWorker.unsafeDirectSockets = [
		{ host: options.host, port: options.directSocketPort, entrypoint: 'default' }
	]

	return { workers, gatewayWorkerName: gatewayWorker.name }
}

/** Compute the one persist block for the whole workspace, or `undefined` when off. */
export function resolveWorkspacePersistPaths(
	persist: boolean,
	persistDir: string
): WorkspacePersistPaths | undefined {
	if (!persist) {
		return undefined
	}
	return {
		kvPersist: resolve(persistDir, 'kv'),
		r2Persist: resolve(persistDir, 'r2'),
		d1Persist: resolve(persistDir, 'd1'),
		cachePersist: resolve(persistDir, 'cache'),
		durableObjectsPersist: resolve(persistDir, 'do'),
		workflowsPersist: resolve(persistDir, 'workflows'),
		imagesPersist: resolve(persistDir, 'images'),
		streamPersist: resolve(persistDir, 'stream')
	}
}

/** Input for {@link buildMergedWorkspaceConfig}. */
export interface BuildMergedWorkspaceConfigInput {
	/** Each app's (already-built) worker set + its direct-socket port. */
	apps: WorkspaceAppWorkers[]
	/** Host for the entry + direct sockets. */
	host: string
	/** Whether to persist storage to disk. */
	persist: boolean
	/** The single workspace persist directory (used only when `persist`). */
	persistDir: string
	/**
	 * Entry-socket port. Browsers use the direct sockets, so this is only for
	 * stray top-level requests; default `0` (ephemeral).
	 */
	entryPort?: number
}

/**
 * Assemble the final single-instance Miniflare config: one entry socket, one
 * persist dir, and the union of every app's namespaced workers (each with its
 * own direct socket).
 *
 * @param input - Apps, host, persist settings, and entry port.
 * @returns `{ config, directSockets }` where `config` is the Miniflare options
 *   object and `directSockets` maps each app name to its gateway worker name
 *   and port (for `unsafeGetDirectURL` + logging).
 * @throws When two apps share a namespace or a direct-socket port (which would
 *   collide inside the one instance).
 */
export function buildMergedWorkspaceConfig(input: BuildMergedWorkspaceConfigInput): {
	config: Record<string, any>
	directSockets: Array<{ appName: string; gatewayWorkerName: string; port: number }>
} {
	const seenAppNames = new Set<string>()
	const seenPorts = new Map<number, string>()
	const mergedWorkers: MiniflareWorker[] = []
	const directSockets: Array<{ appName: string; gatewayWorkerName: string; port: number }> = []

	for (const app of input.apps) {
		if (seenAppNames.has(app.appName)) {
			throw new Error(
				`Duplicate workspace app namespace "${app.appName}". Give each app a unique name.`
			)
		}
		seenAppNames.add(app.appName)

		const portOwner = seenPorts.get(app.directSocketPort)
		if (portOwner !== undefined) {
			throw new Error(
				`Workspace apps "${portOwner}" and "${app.appName}" both use port ${app.directSocketPort}. ` +
					`Each app needs a distinct direct-socket port.`
			)
		}
		seenPorts.set(app.directSocketPort, app.appName)

		const { workers, gatewayWorkerName } = namespaceAppWorkers(app.appName, app.workers, {
			host: input.host,
			directSocketPort: app.directSocketPort
		})
		mergedWorkers.push(...workers)
		directSockets.push({ appName: app.appName, gatewayWorkerName, port: app.directSocketPort })
	}

	const persistPaths = resolveWorkspacePersistPaths(input.persist, input.persistDir)

	const config: Record<string, any> = {
		host: input.host,
		// Ephemeral by default — the entry socket is unused (browsers hit the
		// per-app direct sockets); no worker claims `*`, so it 404s.
		port: input.entryPort ?? 0,
		...(persistPaths ?? {}),
		workers: mergedWorkers
	}

	return { config, directSockets }
}
