// =============================================================================
// Config refs — resolve the ref() bindings a loaded config declares
// =============================================================================
// A `ref()` binding names its worker lazily: `service`, `scriptName` and
// `className` read the `<pending>` sentinel until something calls the ref's
// `resolve()`. Only `resolveServiceBindings` used to, so every other consumer of
// a loaded config — a Vite build, `devflare deploy`, `devflare build` — compiled
// `<pending>` into the Wrangler config it emitted. Resolving at load time is the
// one place every consumer passes through.
//
// → NOTE: ONE level only — the config's own bindings, and those of its `env`
//   overrides. A referenced config's own refs are resolved where that config is
//   used (`resolveServiceBindings` recurses), so nothing here can cycle.
// =============================================================================

import { PENDING_REF_VALUE } from './ref'
import type { DevflareConfig } from './schema'

/** The binding groups whose entries can be a `ref()` binding (`.worker`, `.DO_NAME`). */
const REF_BINDING_GROUPS = ['services', 'durableObjects'] as const

/** What this module needs of a `ref()` result: something whose `resolve()` loads its config. */
interface ResolvableRef {
	resolve(): Promise<unknown>
}

/** A ref found in a config, with the config path that declares it, for the error message. */
interface DeclaredRef {
	/** Where the binding sits, e.g. `bindings.services.API` or `env.production.bindings.services.API`. */
	path: string
	/** The group it sits in, which decides what a resolved binding must then carry. */
	group: (typeof REF_BINDING_GROUPS)[number]
	/** The binding itself, read again once its ref has resolved. */
	binding: unknown
	ref: ResolvableRef
}

/**
 * @description Reads a binding's `__ref`. The bindings come in three shapes — an object, the
 * `.worker` accessor (a function), and a copy of either — and every shape answers a property read
 * of `__ref`, which is the one question asked here.
 * @param binding - one entry of a binding group, of any shape
 * @returns the ref when the binding carries a resolvable one
 */
function refOf(binding: unknown): ResolvableRef | undefined {
	if ((typeof binding !== 'object' && typeof binding !== 'function') || binding === null) {
		return undefined
	}

	const ref = (binding as { __ref?: unknown }).__ref
	if ((typeof ref !== 'object' && typeof ref !== 'function') || ref === null) {
		return undefined
	}

	return typeof (ref as Partial<ResolvableRef>).resolve === 'function'
		? (ref as ResolvableRef)
		: undefined
}

/**
 * @description Lists the refs a config's own bindings declare, top level first, then each
 * `env` override in declaration order.
 * @param config - the loaded config
 * @returns every declared ref with the path that declares it; the same ref may appear twice
 */
function collectDeclaredRefs(config: DevflareConfig): DeclaredRef[] {
	const scopes: Array<[string, DevflareConfig['bindings']]> = [
		['bindings', config.bindings],
		...Object.entries(config.env ?? {}).map(
			([name, overrides]): [string, DevflareConfig['bindings']] => [
				`env.${name}.bindings`,
				overrides?.bindings as DevflareConfig['bindings']
			]
		)
	]

	return scopes.flatMap(([scopePath, bindings]) =>
		REF_BINDING_GROUPS.flatMap((group) =>
			Object.entries((bindings?.[group] ?? {}) as Record<string, unknown>).flatMap(
				([bindingName, binding]) => {
					const ref = refOf(binding)
					return ref ? [{ path: `${scopePath}.${group}.${bindingName}`, group, binding, ref }] : []
				}
			)
		)
	)
}

/**
 * @description Resolves every `ref()` binding a loaded config declares, so each one names its
 * real worker from here on. A ref caches its resolution, so a later `resolve()` — the dev server
 * and the test contexts make one — returns the same result without importing again.
 * @param config - the config as it was validated; its ref proxies are resolved in place
 * @param configFile - the file the config was loaded from, named in the error
 * @returns nothing; the effect is on the refs, which cache their resolution
 * @throws {Error} When a ref's config cannot be imported or has no `name`. The message names the
 *   binding and the config that declares it, and the original error is the `cause`.
 * @throws {Error} When a `ref().DO_NAME` binding names a Durable Object its config does not
 *   declare, which would otherwise compile as `class_name: "<pending>"`.
 */
export async function resolveConfigRefs(config: DevflareConfig, configFile: string): Promise<void> {
	// Sequential on purpose: refs to one config share a single import, and the first failure is
	// then always the first declared binding, so the error is the same on every run.
	for (const { path, group, binding, ref } of collectDeclaredRefs(config)) {
		try {
			await ref.resolve()
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error)
			throw new Error(
				`Could not resolve the ref() at ${path} in ${configFile}: ${reason}\n` +
					'A ref() binding names its worker from the config it imports, so that import must load.',
				{ cause: error }
			)
		}

		// A resolved DO ref reads its class from the referenced config's `durableObjects`; a name
		// that config never declared stays `<pending>` with nothing else to say so.
		const className = (binding as { className?: unknown }).className
		if (group === 'durableObjects' && className === PENDING_REF_VALUE) {
			throw new Error(
				`The ref() at ${path} in ${configFile} names a Durable Object binding that the ` +
					'referenced config does not declare in its bindings.durableObjects.'
			)
		}
	}
}
