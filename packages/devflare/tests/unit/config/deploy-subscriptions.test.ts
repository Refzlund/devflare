import { describe, expect, mock, test } from 'bun:test'
import { prepareMaterializedConfigResourcesForDeploy } from '../../../src/config/deploy-resources'
import {
	type SubscriptionProvisionApi,
	SubscriptionProvisionError,
	type SubscriptionProvisionResult,
	provisionEventSubscriptions
} from '../../../src/config/deploy-subscriptions'
import type { DevflareConfig } from '../../../src/config/schema'

/** The Cloudflare calls, with an account that already has one queue and no subscriptions. */
function makeApi(overrides: Partial<SubscriptionProvisionApi> = {}) {
	return {
		listEventSubscriptions: mock(async () => []),
		createEventSubscription: mock(async (_accountId: string, subscription) => subscription),
		listQueues: mock(async () => [{ id: 'q_1', name: 'email-events' }]),
		...overrides
	} satisfies SubscriptionProvisionApi
}

/** Run a pass and hand back the accumulator it filled. */
async function provision(
	subscriptions: DevflareConfig['eventSubscriptions'],
	api: SubscriptionProvisionApi
): Promise<SubscriptionProvisionResult> {
	const result: SubscriptionProvisionResult = { created: [], existing: [], warnings: [] }
	await provisionEventSubscriptions(subscriptions, 'acct_1', api, result)
	return result
}

const emailSource = { type: 'email.sending', zone_id: 'zone_1', domain: 'example.com' }
const declared = [
	{ queue: 'email-events', source: emailSource, events: ['message.delivered', 'message.bounced'] }
]

describe('provisionEventSubscriptions', () => {
	test('creates a missing subscription, resolving the queue NAME to its id', async () => {
		const api = makeApi()

		const result = await provision(declared, api)

		expect(api.createEventSubscription).toHaveBeenCalledTimes(1)
		expect(api.createEventSubscription.mock.calls[0]?.[1]).toEqual({
			name: 'devflare: email-events email.sending',
			enabled: true,
			events: ['message.delivered', 'message.bounced'],
			source: emailSource,
			destination: { type: 'queues.queue', queue_id: 'q_1' }
		})
		expect(result.created[0]).toContain('email.sending')
	})

	test('the source object is forwarded VERBATIM, unknown fields included', async () => {
		// The whole reason it is a passthrough. Cloudflare's published schema does not describe every
		// source it accepts, so anything Devflare filtered or renamed would break a source that works.
		const api = makeApi()
		const exotic = { type: 'something.new', someField: 42, nested: { a: true } }

		await provision([{ queue: 'email-events', source: exotic, events: ['a.b'] }], api)

		expect(api.createEventSubscription.mock.calls[0]?.[1].source).toEqual(exotic)
	})

	test('an existing subscription for the same source and queue is REUSED', async () => {
		const api = makeApi({
			listEventSubscriptions: mock(async () => [
				{
					id: 's_1',
					events: ['message.delivered'],
					source: emailSource,
					destination: { type: 'queues.queue' as const, queue_id: 'q_1' }
				}
			])
		})

		const result = await provision(declared, api)

		expect(api.createEventSubscription).not.toHaveBeenCalled()
		expect(result.existing[0]).toContain('email.sending')
	})

	test('key ORDER in the source does not make it look different', async () => {
		// Cloudflare is under no obligation to echo fields in the order they were sent, and comparing
		// raw JSON would then report the subscription as missing and create a duplicate on every deploy.
		const api = makeApi({
			listEventSubscriptions: mock(async () => [
				{
					id: 's_1',
					events: ['message.delivered'],
					source: { domain: 'example.com', type: 'email.sending', zone_id: 'zone_1' },
					destination: { type: 'queues.queue' as const, queue_id: 'q_1' }
				}
			])
		})

		await provision(declared, api)

		expect(api.createEventSubscription).not.toHaveBeenCalled()
	})

	test('the SAME source on a DIFFERENT queue is a different subscription', async () => {
		const api = makeApi({
			listQueues: mock(async () => [
				{ id: 'q_1', name: 'email-events' },
				{ id: 'q_2', name: 'audit-events' }
			]),
			listEventSubscriptions: mock(async () => [
				{
					id: 's_1',
					events: ['message.delivered'],
					source: emailSource,
					destination: { type: 'queues.queue' as const, queue_id: 'q_1' }
				}
			])
		})

		await provision(
			[{ queue: 'audit-events', source: emailSource, events: ['message.delivered'] }],
			api
		)

		expect(api.createEventSubscription).toHaveBeenCalledTimes(1)
	})

	test('a queue that does not exist fails, and says a subscription cannot create one', async () => {
		const api = makeApi({ listQueues: mock(async () => []) })

		const failure = provision(declared, api)

		await expect(failure).rejects.toThrow(SubscriptionProvisionError)
		await failure.catch((error: unknown) => {
			expect((error as Error).message).toContain('bindings.queues')
		})
		expect(api.createEventSubscription).not.toHaveBeenCalled()
	})

	test('when nothing matches, the account EXISTING sources are reported', async () => {
		// The intended way to discover the field names for a source Cloudflare has not documented:
		// create one by hand, deploy, and read the real shape out of the output instead of guessing
		// between `zoneId` and `zone_id`.
		const api = makeApi({
			listEventSubscriptions: mock(async () => [
				{
					id: 's_1',
					events: ['message.delivered'],
					source: { type: 'email.sending', zoneId: 'zone_1', domain: 'example.com' },
					destination: { type: 'queues.queue' as const, queue_id: 'q_1' }
				}
			])
		})

		const result = await provision(declared, api)

		expect(result.warnings).toHaveLength(1)
		expect(result.warnings[0]).toContain('zoneId')
		expect(result.warnings[0]).toContain('copy its source fields verbatim')
	})

	test('an account with NO subscriptions gets no such warning — there is nothing to copy', async () => {
		const result = await provision(declared, makeApi())

		expect(result.warnings).toEqual([])
	})

	test('an absent or empty declaration makes no call at all', async () => {
		const absent = makeApi()
		await provision(undefined, absent)
		expect(absent.listEventSubscriptions).not.toHaveBeenCalled()

		const empty = makeApi()
		await provision([], empty)
		expect(empty.listEventSubscriptions).not.toHaveBeenCalled()
	})

	test('partial progress SURVIVES a throw', async () => {
		const api = makeApi({
			listQueues: mock(async () => [{ id: 'q_1', name: 'email-events' }]),
			createEventSubscription: mock(async (_accountId: string, subscription) => {
				if (subscription.source.type === 'second') throw new Error('Cloudflare 400')
				return subscription
			})
		})

		const result: SubscriptionProvisionResult = { created: [], existing: [], warnings: [] }
		const failure = provisionEventSubscriptions(
			[
				{ queue: 'email-events', source: { type: 'first' }, events: ['a'] },
				{ queue: 'email-events', source: { type: 'second' }, events: ['a'] }
			],
			'acct_1',
			api,
			result
		)

		await expect(failure).rejects.toThrow('Cloudflare 400')
		expect(result.created).toHaveLength(1)
		expect(result.created[0]).toContain('first')
	})
})

describe('the deploy path guards subscriptions', () => {
	const config: DevflareConfig = {
		name: 'sub-worker',
		compatibilityDate: '2026-05-01',
		compatibilityFlags: [],
		eventSubscriptions: declared
	}

	/** The account API a deploy needs, on top of the subscription calls. */
	function deployApi() {
		return {
			listEventSubscriptions: mock(async () => []),
			createEventSubscription: mock(async (_accountId: string, subscription) => subscription),
			listQueues: mock(async () => [{ id: 'q_1', name: 'email-events' }])
		}
	}

	test('describeOnly creates nothing, but still reads', async () => {
		const api = deployApi()

		const result = await prepareMaterializedConfigResourcesForDeploy(config, {
			accountId: 'acct_1',
			describeOnly: true,
			cloudflare: api
		})

		expect(api.createEventSubscription).not.toHaveBeenCalled()
		// The positive control: it really did run, rather than being skipped.
		expect(api.listEventSubscriptions).toHaveBeenCalledTimes(1)
		expect(result.created.subscriptions.length).toBeGreaterThan(0)
	})

	test('a PREVIEW deploy provisions none, and does not look', async () => {
		const api = deployApi()

		const result = await prepareMaterializedConfigResourcesForDeploy(config, {
			accountId: 'acct_1',
			environment: 'preview',
			cloudflare: api
		})

		expect(api.createEventSubscription).not.toHaveBeenCalled()
		expect(api.listEventSubscriptions).not.toHaveBeenCalled()
		expect(result.created.subscriptions).toEqual([])
	})

	test('a real deploy DOES create, so both guards are measuring something', async () => {
		const api = deployApi()

		await prepareMaterializedConfigResourcesForDeploy(config, {
			accountId: 'acct_1',
			cloudflare: api
		})

		expect(api.createEventSubscription).toHaveBeenCalledTimes(1)
	})
})
