import { describe, expect, test } from 'bun:test'
import { getDurableObjectAlarmEvent } from '../../../src/runtime'
import { alarm, cf } from '../../../src/test'

describe('cf.alarm.trigger', () => {
	test('fires a DO instance alarm() and reports success', async () => {
		let alarmCount = 0
		const instance = {
			env: { FLAG: 'on' },
			state: {} as DurableObjectState,
			async alarm() {
				alarmCount++
			}
		}

		const result = await cf.alarm.trigger(instance)
		expect(result.success).toBe(true)
		expect(result.error).toBeUndefined()
		expect(alarmCount).toBe(1)
	})

	test('exposes the same trigger via the standalone alarm export', () => {
		expect(cf.alarm).toBe(alarm)
		expect(typeof cf.alarm.trigger).toBe('function')
	})

	test('installs a durable-object-alarm event accessible inside alarm()', async () => {
		let observedType: string | undefined
		let observedEnv: unknown
		const env = { TOKEN: 'secret' }
		const instance = {
			env,
			state: {} as DurableObjectState,
			async alarm() {
				const event = getDurableObjectAlarmEvent()
				observedType = event.type
				observedEnv = event.env
			}
		}

		await cf.alarm.trigger(instance)
		expect(observedType).toBe('durable-object-alarm')
		// The wrapped env proxies SendEmail bindings but exposes the same vars.
		expect((observedEnv as typeof env).TOKEN).toBe('secret')
	})

	test('lets an explicit env/state override the instance values', async () => {
		let observedToken: string | undefined
		const instance = {
			env: { TOKEN: 'instance' },
			state: {} as DurableObjectState,
			async alarm() {
				observedToken = (getDurableObjectAlarmEvent().env as { TOKEN: string }).TOKEN
			}
		}

		await cf.alarm.trigger(instance, { env: { TOKEN: 'override' } })
		expect(observedToken).toBe('override')
	})

	test('captures handler errors as a failed result', async () => {
		const instance = {
			env: {},
			state: {} as DurableObjectState,
			async alarm() {
				throw new Error('alarm boom')
			}
		}

		const result = await cf.alarm.trigger(instance)
		expect(result.success).toBe(false)
		expect(result.error).toBe('alarm boom')
	})

	test('throws when the target has no alarm() method', async () => {
		await expect(cf.alarm.trigger({ env: {}, state: {} as DurableObjectState })).rejects.toThrow(
			'no alarm() method'
		)
	})
})
