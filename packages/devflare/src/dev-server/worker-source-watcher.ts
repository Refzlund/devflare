import type { FSWatcher } from 'chokidar'
import type { ConsolaInstance } from 'consola'

export interface WorkerSourceWatcherOptions {
	watchTargets: string[]
	resolvedWorkerConfigPath: string | null
	logger?: ConsolaInstance
	onConfigChange: () => Promise<void>
	onWorkerChange: () => Promise<void>
}

export async function startWorkerSourceWatcher(
	options: WorkerSourceWatcherOptions
): Promise<FSWatcher | null> {
	const { watchTargets, resolvedWorkerConfigPath, logger, onConfigChange, onWorkerChange } = options

	if (watchTargets.length === 0) {
		return null
	}

	const chokidar = await import('chokidar')
	const isWindows = process.platform === 'win32'
	const ignoredSegments = ['/node_modules/', '/.git/', '/.devflare/', '/dist/']

	const normalizePath = (filePath: string) => filePath.replace(/\\/g, '/')
	const isIgnoredPath = (filePath: string) => {
		const normalizedPath = normalizePath(filePath)
		return ignoredSegments.some((segment) => normalizedPath.includes(segment))
	}

	let reloadTimeout: ReturnType<typeof setTimeout> | null = null
	let reloadInProgress = false
	let pendingReloadPath: string | null = null

	const flushPendingReload = async () => {
		if (!pendingReloadPath) {
			return
		}

		const nextPath = pendingReloadPath
		pendingReloadPath = null
		await triggerReload(nextPath)
	}

	const triggerReload = async (filePath: string) => {
		if (reloadInProgress) {
			pendingReloadPath = filePath
			return
		}

		reloadInProgress = true

		try {
			const normalizedConfigPath = resolvedWorkerConfigPath
				? normalizePath(resolvedWorkerConfigPath)
				: null
			if (normalizedConfigPath && normalizePath(filePath) === normalizedConfigPath) {
				logger?.info(`Devflare config changed: ${filePath}`)
				await onConfigChange()
				return
			}

			logger?.info(`Worker source changed: ${filePath}`)
			await onWorkerChange()
		} catch (error) {
			logger?.error('Worker source reload failed:', error)
		} finally {
			reloadInProgress = false
			await flushPendingReload()
		}
	}

	const scheduleReload = (filePath: string) => {
		if (reloadTimeout) {
			clearTimeout(reloadTimeout)
		}

		reloadTimeout = setTimeout(() => {
			reloadTimeout = null
			void triggerReload(filePath)
		}, 150)
	}

	const watcher = chokidar.watch(watchTargets, {
		ignoreInitial: true,
		usePolling: isWindows,
		interval: isWindows ? 300 : undefined,
		awaitWriteFinish: {
			stabilityThreshold: 100,
			pollInterval: 50
		},
		ignored: (filePath) => isIgnoredPath(filePath)
	})

	const onFileEvent = (filePath: string) => {
		if (isIgnoredPath(filePath)) {
			return
		}

		scheduleReload(filePath)
	}

	watcher.on('change', onFileEvent)
	watcher.on('add', onFileEvent)
	watcher.on('unlink', onFileEvent)
	watcher.on('error', (error) => {
		logger?.error('Worker source watcher error:', error)
	})

	await new Promise<void>((resolvePromise, rejectPromise) => {
		const handleReady = () => {
			watcher.off('error', handleInitialError)
			logger?.info(`Worker source watcher ready (${watchTargets.length} target(s))`)
			resolvePromise()
		}

		const handleInitialError = (error: unknown) => {
			watcher.off('ready', handleReady)
			rejectPromise(error instanceof Error ? error : new Error(String(error)))
		}

		watcher.once('ready', handleReady)
		watcher.once('error', handleInitialError)
	})

	return watcher
}

/**
 * Compute the diff between current and next watch-target lists and apply it
 * to the given watcher. Returns the deduped next-targets array which the
 * caller should store as the new "current" state.
 */
export async function applyWatcherTargetDiff(
	watcher: FSWatcher,
	currentTargets: string[],
	nextTargets: string[]
): Promise<string[]> {
	const nextSet = new Set(nextTargets)
	const targetsToRemove = currentTargets.filter((t) => !nextSet.has(t))
	const targetsToAdd = nextTargets.filter((t) => !currentTargets.includes(t))

	if (targetsToRemove.length > 0) {
		await watcher.unwatch(targetsToRemove)
	}
	if (targetsToAdd.length > 0) {
		watcher.add(targetsToAdd)
	}
	return nextTargets
}
