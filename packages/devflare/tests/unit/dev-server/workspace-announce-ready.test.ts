// =============================================================================
// announceWorkspaceReady — "Workspace ready" is said only once it is true
// =============================================================================
// The workspace used to print `Workspace ready` the moment its startup steps
// finished, about ten seconds before a slow Vite app was serving.
// =============================================================================

import { describe, expect, test } from 'bun:test'
import type { ConsolaInstance } from 'consola'
import type { ViteReadyOutcome } from '../../../src/dev-server/vite-utils'
import {
	announceWorkspaceReady,
	type WorkspaceViteReadiness
} from '../../../src/dev-server/workspace/announce-ready'

/** A Vite app whose startup the test decides. */
function controllableApp(appName: string): WorkspaceViteReadiness & {
	decide(outcome: ViteReadyOutcome): void
} {
	let outcome: ViteReadyOutcome | null = null
	let resolve!: (outcome: ViteReadyOutcome) => void
	const ready = new Promise<ViteReadyOutcome>((done) => {
		resolve = done
	})
	return {
		appName,
		startup: {
			ready,
			get outcome() {
				return outcome
			}
		},
		decide(decided) {
			outcome = decided
			resolve(decided)
		}
	}
}

/** A Vite app that was already serving when the workspace finished starting. */
function readyApp(appName: string): WorkspaceViteReadiness {
	const app = controllableApp(appName)
	app.decide({ status: 'ready', url: 'http://127.0.0.1:5173/' })
	return app
}

/** A logger recording `level: message` lines. */
function recordingLogger(): { logger: ConsolaInstance; lines: string[] } {
	const lines: string[] = []
	const at = (level: string) => (message: string) => {
		lines.push(`${level}: ${message}`)
	}
	const logger = {
		success: at('success'),
		info: at('info'),
		warn: at('warn')
	} as unknown as ConsolaInstance
	return { logger, lines }
}

describe('announceWorkspaceReady', () => {
	test('every Vite app already serving: ready at once', async () => {
		const { logger, lines } = recordingLogger()

		await announceWorkspaceReady({
			appCount: 3,
			viteApps: [readyApp('uidini-web')],
			logger,
			isStopping: () => false
		})

		expect(lines).toEqual(['success: Workspace ready — 3 app(s) sharing one instance'])
	})

	// Kills: today's unconditional "Workspace ready" at the end of start().
	test('a Vite app still starting: "started, waiting for", then ready once it serves', async () => {
		const { logger, lines } = recordingLogger()
		const web = controllableApp('uidini-web')

		const announced = announceWorkspaceReady({
			appCount: 3,
			viteApps: [web],
			logger,
			isStopping: () => false
		})
		await Bun.sleep(0)

		expect(lines).toEqual([
			'info: Workspace started — 3 app(s) sharing one instance; waiting for Vite: "uidini-web"'
		])

		web.decide({ status: 'ready', url: 'http://127.0.0.1:5173/' })
		await announced

		expect(lines.at(-1)).toBe('success: Workspace ready — 3 app(s) sharing one instance')
	})

	// Kills: announcing ready once the pending apps SETTLE, whatever they settled as.
	test('a Vite app that exits before serving: a warning naming it, never "ready"', async () => {
		const { logger, lines } = recordingLogger()
		const web = controllableApp('uidini-web')

		const announced = announceWorkspaceReady({
			appCount: 2,
			viteApps: [web, readyApp('admin')],
			logger,
			isStopping: () => false
		})
		web.decide({ status: 'failed', error: new Error('exit code 1') })
		await announced

		expect(lines).toHaveLength(2)
		expect(lines[1]).toBe(
			'warn: Workspace running — 2 app(s) sharing one instance, but Vite for "uidini-web" exited ' +
				'before it became ready; those apps are not being served'
		)
	})

	test('nothing more is announced once the workspace is stopping', async () => {
		const { logger, lines } = recordingLogger()
		const web = controllableApp('uidini-web')
		let stopping = false

		const announced = announceWorkspaceReady({
			appCount: 1,
			viteApps: [web],
			logger,
			isStopping: () => stopping
		})
		stopping = true
		web.decide({ status: 'failed', error: new Error('signal SIGTERM') })
		await announced

		expect(lines).toHaveLength(1)
		expect(lines[0]).toStartWith('info: Workspace started')
	})
})
