// =============================================================================
// Durable Object Alarm Test Helper — Trigger a DO `alarm()` handler in tests
// =============================================================================
// Usage:
//   import { cf } from 'devflare/test'
//
//   // Fire a Durable Object's alarm() handler and assert its effects.
//   const instance = new MyDurableObject(state, env)
//   await cf.alarm.trigger(instance)
//
//   // Or pass an explicit env/state if your alarm() reads them through the
//   // Devflare event context (getDurableObjectAlarmEvent()).
//   await cf.alarm.trigger(instance, { env, state })
// =============================================================================

import { createDurableObjectAlarmEvent, runWithEventContext } from '../runtime'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Minimal shape a Durable Object instance must satisfy to have its alarm fired:
 * an `alarm()` method, plus the `state`/`ctx` and `env` the runtime injects.
 * Matches the wrapper the Devflare DO transform generates around `alarm()`.
 */
export interface AlarmTriggerTarget {
	alarm?: (...args: unknown[]) => unknown
	state?: DurableObjectState
	ctx?: DurableObjectState
	env?: unknown
}

export interface AlarmTriggerOptions {
	/**
	 * Durable Object state to attach to the alarm event. Defaults to the
	 * instance's `state` (or `ctx`) when present.
	 */
	state?: DurableObjectState
	/**
	 * Env to attach to the alarm event. Defaults to the instance's `env` when
	 * present, otherwise an empty object.
	 */
	env?: unknown
}

export interface AlarmTriggerResult {
	/** Whether the alarm handler completed successfully. */
	success: boolean
	/** Error message if the handler threw. */
	error?: string
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Trigger a Durable Object's `alarm()` handler.
 *
 * This mirrors how the Devflare runtime invokes a DO alarm: it builds a
 * `durable-object-alarm` event with the instance's env + state, installs it into
 * AsyncLocalStorage via `runWithEventContext`, and calls the instance's
 * `alarm()` with that event (so `getDurableObjectAlarmEvent()` works inside the
 * handler). The instance keeps using its own `this.env` / `this.ctx`; the event
 * is supplied for context-aware code paths.
 *
 * @param target - The Durable Object instance whose `alarm()` should be fired.
 * @param options - Optional explicit `state`/`env` for the alarm event.
 * @returns Result object with success status.
 *
 * @example
 * const counter = new Counter(state, env)
 * await counter.scheduleAlarm()
 * const result = await cf.alarm.trigger(counter)
 * expect(result.success).toBe(true)
 */
async function trigger(
	target: AlarmTriggerTarget,
	options: AlarmTriggerOptions = {}
): Promise<AlarmTriggerResult> {
	if (!target || typeof target.alarm !== 'function') {
		throw new Error(
			'cf.alarm.trigger(target): the target Durable Object instance has no alarm() method. ' +
				'Pass a DO instance whose class defines an async alarm() handler (and enable alarms ' +
				'via the @durableObject({ alarms: true }) decorator so the runtime wraps it).'
		)
	}

	const state = options.state ?? target.state ?? target.ctx
	const env = options.env ?? target.env ?? {}

	const alarmEvent = createDurableObjectAlarmEvent(env, state as DurableObjectState)

	try {
		await runWithEventContext(alarmEvent, () => target.alarm?.(alarmEvent))
		return { success: true }
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error)
		}
	}
}

// -----------------------------------------------------------------------------
// Export
// -----------------------------------------------------------------------------

export const alarm = {
	trigger
}
