import type { ConsolaInstance } from 'consola'
import type { ViteReadyOutcome } from '../vite-utils'

/** One workspace app's Vite child, as far as the ready announcement needs to know it. */
export interface WorkspaceViteReadiness {
	/** The app's manifest name, used in the log line. */
	appName: string
	/** Its startup outcome if already decided, read synchronously; null while it is still starting. */
	readonly outcome: ViteReadyOutcome | null
	/** Settles once its startup is decided; never rejects. */
	ready: Promise<ViteReadyOutcome>
}

/** What {@link announceWorkspaceReady} reports on. */
export interface AnnounceWorkspaceReadyOptions {
	/** How many apps the workspace serves, Vite or not. */
	appCount: number
	/** Every Vite child the workspace started. */
	viteApps: readonly WorkspaceViteReadiness[]
	logger?: ConsolaInstance
	/** True once the workspace is stopping; nothing more is announced from then. */
	isStopping: () => boolean
}

/**
 * @description Says the workspace is ready only once it is. When every Vite app
 * is already serving, logs `Workspace ready` at once. When some are still
 * starting, logs `Workspace started` naming them, then `Workspace ready` once
 * they all serve — or, if any exited first, a warning naming those instead.
 * A Vite that never serves and never exits leaves the final line unprinted;
 * its own watcher warns that it may be stuck.
 * @param options - the apps, the logger and the stop flag
 * @returns settles after the final announcement (or after deciding there is
 *   none to make); callers need not await it, and it never rejects on its own
 */
export function announceWorkspaceReady(options: AnnounceWorkspaceReadyOptions): Promise<void> {
	const { appCount, viteApps, logger, isStopping } = options
	const sharing = `${appCount} app(s) sharing one instance`

	const announceFinal = () => {
		if (isStopping()) {
			return
		}
		const failed = viteApps.filter((app) => app.outcome?.status === 'failed')
		if (failed.length === 0) {
			logger?.success(`Workspace ready — ${sharing}`)
			return
		}
		const names = failed.map((app) => `"${app.appName}"`).join(', ')
		logger?.warn(
			`Workspace running — ${sharing}, but Vite for ${names} exited before it became ready; ` +
				'those apps are not being served'
		)
	}

	const pending = viteApps.filter((app) => app.outcome === null)
	if (pending.length === 0) {
		announceFinal()
		return Promise.resolve()
	}

	const names = pending.map((app) => `"${app.appName}"`).join(', ')
	logger?.info(`Workspace started — ${sharing}; waiting for Vite: ${names}`)
	return Promise.all(pending.map((app) => app.ready)).then(announceFinal)
}
