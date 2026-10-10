// =============================================================================
// Test Context — Config resolution + dispose helpers
// =============================================================================
// Pure helpers extracted from createTestContext():
//   - resolveTestContextConfig: locate and load the devflare.config.* file
//   - createDisposeContext: build the dispose() function that drains the
//     waitUntil work cf.worker.fetch left running, then tears down
//     bridge client + miniflare + per-handler state
// =============================================================================

import { dirname, resolve } from 'path'
import type { BridgeClient } from '../bridge/client'
import type { DevflareConfig } from '../config'
import { loadConfig } from '../config'
import { resolveDevConfig } from '../config/dev-config'
import { __clearTestContext, type EnvDisposeOptions } from '../env'
import { disposeLocalWorkerLoaderBindings } from '../shims/local-worker-loader'
import { stopActiveContainers } from './containers'
import { resetEmailState } from './email'
import { resetQueueState } from './queue'
import { resetScheduledState } from './scheduled'
import { findNearestConfig, getCallerDirectory } from './simple-context-paths'
import { resetTailState } from './tail'
import { type WaitUntilScope, waitUntilDrainError } from './wait-until-tracker'
import { resetWorkerState } from './worker'

interface DisposeStateView {
	client: BridgeClient | null
	miniflare: any
	envProxy: Record<string, unknown> | null
	transportDecode: unknown
	remoteBindings: Record<string, unknown> | null
	miniflareBindings: Record<string, unknown> | null
}

export interface ResolvedTestContextConfig {
	absolutePath: string
	configDir: string
	config: DevflareConfig
}

/**
 * Configs already loaded in this process, keyed by their absolute path.
 *
 * Loading one costs ~100ms — evaluating the config module, then resolving env
 * placeholders and `.dev.vars` — and a suite creating a context per test file
 * paid it every time. The config module itself was never actually re-read: the
 * loader evaluates it once per process and hands back that same instance
 * afterwards, rewritten file or not. What the memo additionally holds still is
 * the env / `.dev.vars` overlay, which no longer follows a change made between
 * two contexts. Use {@link __resetTestContextConfigCache} where that matters.
 */
const loadedConfigs = new Map<string, ResolvedTestContextConfig>()

/**
 * Resolve and load the devflare config for the test context.
 *
 * If `configPath` is given, it is interpreted relative to the caller's
 * directory (the file that invoked `createTestContext()`). Otherwise the
 * resolver walks upward from the caller's directory looking for a supported
 * `devflare.config.*` file.
 *
 * The load is memoised per resolved path, so several test files sharing one
 * config in a single process load it once. Different callers reaching the same
 * file share the result; a different file is loaded on its own.
 */
export async function resolveTestContextConfig(
	configPath: string | undefined,
	callerDir: string = getCallerDirectory()
): Promise<ResolvedTestContextConfig> {
	let foundPath: string

	if (configPath) {
		foundPath = resolve(callerDir, configPath)
	} else {
		const found = await findNearestConfig(callerDir)
		if (!found) {
			throw new Error(
				`Could not find a devflare config file. Searched upward from: ${callerDir}\n` +
					'Expected one of: devflare.config.ts, devflare.config.mts, devflare.config.js, devflare.config.mjs\n' +
					`Either create a config file or provide an explicit path: createTestContext('./path/to/config.ts')`
			)
		}
		foundPath = found
	}

	// Autodiscovery answers in posix separators and an explicit path in the
	// platform's, so one config file reached both ways spelled itself two ways.
	// Left alone that is two memo entries and two config objects for one file.
	const absolutePath = resolve(foundPath)

	const remembered = loadedConfigs.get(absolutePath)
	if (remembered) {
		return remembered
	}

	const configDir = dirname(absolutePath)
	const loadedConfig = await loadConfig({
		cwd: configDir,
		configFile: absolutePath.split(/[/\\]/).pop()
	})
	const config = await resolveDevConfig(loadedConfig, {
		cwd: configDir,
		configPath: absolutePath
	})

	const resolved: ResolvedTestContextConfig = { absolutePath, configDir, config }
	loadedConfigs.set(absolutePath, resolved)
	return resolved
}

/**
 * Forget every config loaded in this process, so the next resolve re-reads the
 * env and `.dev.vars` overlay.
 */
export function __resetTestContextConfigCache(): void {
	loadedConfigs.clear()
}

/**
 * How long `env.dispose()` waits, by default, for pending `cf.worker.fetch`
 * waitUntil work before tearing down regardless. A consumer raises it per
 * call with `env.dispose({ waitUntilTimeoutMs })`.
 *
 * → workerd lets waitUntil work run for 30s past the response, but a drain
 *   that long cannot finish where dispose is normally called. bun 1.4 fails an
 *   `afterAll` hook at 5s by default and moves on without running the rest of
 *   it, so a hook killed mid-drain never reaches the teardown and Miniflare is
 *   left running. The default is therefore well inside 5s: the teardown after
 *   it measured 24-36ms for a single-worker context (a dispose whose work never
 *   settled took 2,024-2,036ms), and the remaining ~3s is for slower machines,
 *   multi-worker contexts and containers.
 * → Background work in a test is a few binding calls and settles in
 *   milliseconds; work that needs seconds is better awaited by the test, or
 *   given a larger budget together with a larger hook timeout.
 */
export const DEFAULT_WAIT_UNTIL_TIMEOUT_MS = 2_000

/**
 * The longest delay a timer honours: 2^31-1 ms, about 24.8 days. A longer one,
 * Infinity included, fires after about 1ms instead.
 */
const MAX_TIMER_DELAY_MS = 2_147_483_647

/**
 * @description Reads the drain budget from `env.dispose()`'s options.
 * @param options - what the consumer passed, if anything
 * @returns the budget in milliseconds
 * @throws TypeError when `waitUntilTimeoutMs` is not a number from 0 to
 *   {@link MAX_TIMER_DELAY_MS}. A larger one (Infinity included) is refused
 *   rather than clamped: the timer would fire after about 1ms and abandon all
 *   work at once, the opposite of what asking for a long wait means, and a
 *   silent clamp would hide that the value was never usable.
 */
function drainBudgetMs(options: EnvDisposeOptions | undefined): number {
	const requested = options?.waitUntilTimeoutMs
	if (requested === undefined) {
		return DEFAULT_WAIT_UNTIL_TIMEOUT_MS
	}
	const usable = typeof requested === 'number' && requested >= 0 && requested <= MAX_TIMER_DELAY_MS
	if (!usable) {
		throw new TypeError(
			`env.dispose({ waitUntilTimeoutMs }) needs a number of milliseconds from 0 to ${MAX_TIMER_DELAY_MS}; got ${String(requested)}`
		)
	}
	return requested
}

/**
 * @description Builds the dispose() function that tears down a test context.
 * It first drains the waitUntil work `cf.worker.fetch` left running in the
 * context's scope (for at most {@link DEFAULT_WAIT_UNTIL_TIMEOUT_MS}, or the
 * `waitUntilTimeoutMs` it is given), then disconnects the bridge client,
 * disposes Miniflare, clears per-handler global state, and clears the
 * registered test-context env accessor.
 * @param state - the context's live handles, nulled as they are torn down
 * @param waitUntilScope - the context's waitUntil scope; another context's
 *   work is never drained here
 * @returns the dispose function
 * @throws from that function, before anything is torn down: a TypeError for a
 *   bad `waitUntilTimeoutMs`, leaving the context in place to dispose again.
 *   AFTER the teardown has completed: the attributed error for waitUntil work
 *   that rejected during the drain or was still pending when it gave up (an
 *   `AggregateError` when there are several). A teardown failure is thrown as
 *   it was, or folded into an `AggregateError` with those when both happen,
 *   so neither hides the other.
 */
export function createDisposeContext(
	state: DisposeStateView,
	waitUntilScope: WaitUntilScope
): (options?: EnvDisposeOptions) => Promise<void> {
	return async (options) => {
		const budgetMs = drainBudgetMs(options)

		// Before the teardown, never after: the work may still be calling the
		// bindings the teardown is about to close.
		const backgroundError = waitUntilDrainError(await waitUntilScope.drain(budgetMs))

		try {
			await tearDown(state)
		} catch (teardownError) {
			if (!backgroundError) {
				throw teardownError
			}
			throw new AggregateError(
				[teardownError, backgroundError],
				'env.dispose() failed to tear down, and waitUntil work did not finish cleanly:\n' +
					`  - ${describeError(teardownError)}\n  - ${backgroundError.message}`
			)
		}

		if (backgroundError) {
			throw backgroundError
		}
	}
}

/**
 * @description One-line description of a thrown value, for an aggregate message.
 * @param error - anything that was thrown
 */
function describeError(error: unknown): string {
	return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

/**
 * @description Tears a test context down: the bridge client, Miniflare, the
 * worker-loader and container shims, the per-handler helper state and the
 * registered env accessor.
 * @param state - the context's live handles, nulled as they are released
 */
async function tearDown(state: DisposeStateView): Promise<void> {
	if (state.client) {
		await state.client.disconnect()
		state.client = null
	}
	if (state.miniflare) {
		await state.miniflare.dispose()
		state.miniflare = null
	}
	await disposeLocalWorkerLoaderBindings()
	await stopActiveContainers()
	state.envProxy = null
	state.transportDecode = null
	state.remoteBindings = null
	state.miniflareBindings = null

	resetQueueState()
	resetScheduledState()
	resetWorkerState()
	resetTailState()
	resetEmailState()

	__clearTestContext()
}
