import type { DocPage } from '../../types'
import {
	bindingTestingGuideCards,
	bindingTestingGuideRows,
	docsLink,
	projectArchitectureFullSurfaceConfigCode,
	projectArchitectureFullSurfaceDurableObjectCode,
	projectArchitectureFullSurfaceQueueCode,
	projectArchitectureFullSurfaceStructure,
	projectArchitectureHostedAppConfigCode,
	projectArchitectureHostedAppPackageCode,
	projectArchitectureHostedAppStructure,
	projectArchitectureHostedAppViteCode,
	projectArchitectureMonorepoCommandsCode,
	projectArchitectureMonorepoRootPackageCode,
	projectArchitectureMonorepoStructure,
	projectArchitectureMonorepoTurboCode,
	projectArchitectureStarterConfigCode,
	projectArchitectureStarterFetchCode,
	projectArchitectureStarterPackageCode,
	projectArchitectureStarterRouteCode,
	projectArchitectureStarterStructure,
	projectArchitectureSveltekitCase18ConfigCode,
	testingFeelsNativeConfigCode,
	testingFeelsNativeDurableObjectCode,
	testingFeelsNativeStructure,
	testingFeelsNativeTestCode,
	testingFeelsNativeTransportCode,
	testingFeelsNativeValueCode
} from './shared'

export const devflareDocsPart4: DocPage[] = [
	{
		slug: 'create-test-context',
		group: 'Devflare',
		navTitle: 'createTestContext()',
		readTime: '6 min read',
		eyebrow: 'Test harness',
		title: 'Use `createTestContext()` and `cf.*` as the default runtime-shaped test harness',
		summary:
			'Start tests with `createTestContext()` so the same config, bindings, routes, and handler surfaces the app uses in real runtime flows are available in Bun tests.',
		description:
			'Devflare’s recommended test story is not a pile of hand-built mocks. `createTestContext()` loads the nearest supported config, wires the local runtime surface, and gives you `cf.*` helpers that feel like the Worker entrypoints the app actually uses.',
		highlights: [
			'`createTestContext()` autodiscovers the nearest supported config when you omit the path.',
			'It also autodiscovers conventional worker surfaces such as fetch, routes, queue, scheduled, email, and tail handlers.',
			'The helpers are runtime-shaped and context-accurate for handler logic, but they do not try to replay every internal Cloudflare dispatch detail byte for byte.',
			'`cf.worker.fetch()` does not eagerly wait for all `waitUntil()` work, while queue, scheduled, and tail helpers do wait for their background work.',
			'`src/transport.ts` stays optional and only matters when a local RPC-style bridge call under test—most commonly a Durable Object method round-trip—must preserve custom classes.'
		],
		facts: [
			{
				label: 'Best for',
				value: 'Runtime-shaped tests that should stay close to the real worker surface'
			},
			{ label: 'Default harness', value: '`createTestContext()` plus `cf.*` helpers' },
			{
				label: 'Optional extra',
				value:
					'`src/transport.ts` for custom class round-trips across local RPC-style bridge calls, especially Durable Object methods'
			}
		],
		sourcePages: [
			'src/test/simple-context.ts',
			'src/test/simple-context-durable-objects.ts',
			'src/test/simple-context-paths.ts',
			'src/test/cf.ts',
			'src/test/tail.ts',
			'src/runtime/context.ts',
			'tests/integration/test-context/config-autodiscovery.test.ts'
		],
		sections: [
			{
				id: 'autodiscovery',
				title: 'Let the harness discover the normal worker shape first',
				paragraphs: [
					'When you omit the config path, `createTestContext()` walks upward from the calling test file and finds the nearest supported config filename. It then autodetects the conventional worker surfaces that belong to that package instead of making you wire each one by hand.',
					'That is the main reason the built-in harness scales: the same config and file conventions keep working as the package gains routes, queues, scheduled handlers, inbound email, or tail handlers.'
				],
				bullets: [
					'Config path autodiscovery starts from the calling test file when you omit the argument.',
					'Conventional files such as `src/fetch.ts`, `src/routes/**`, `src/queue.ts`, `src/scheduled.ts`, `src/email.ts`, and `src/tail.ts` are discovered automatically when present.',
					'Service bindings and other config-driven runtime surfaces are discovered from the same authored config instead of a separate test-only schema.',
					'If a local RPC-style bridge call under test later needs custom class round-trips, the harness can also discover `src/transport.{ts,js,mts,mjs}` automatically.'
				]
			},
			{
				id: 'helper-behavior',
				title: 'Know which helpers wait for background work and which do not',
				table: {
					headers: ['Helper', 'Current behavior'],
					rows: [
						[
							'`cf.worker.fetch()`',
							'Returns when the handler resolves and does not eagerly wait for all `waitUntil()` work.'
						],
						['`cf.queue.trigger()`', 'Waits for queued background work before it returns.'],
						['`cf.scheduled.trigger()`', 'Waits for scheduled background work before it returns.'],
						[
							'`cf.email.send()`',
							'In `createTestContext()` tests, directly invokes the configured local email handler and waits for its queued `waitUntil()` work; otherwise it falls back to the local email endpoint.'
						],
						[
							'`cf.tail.trigger()`',
							'Works when `src/tail.ts` exists, supports a default or named `tail` export, and waits for the handler plus its `waitUntil()` work before it returns.'
						],
						[
							'`cf.alarm.trigger(instance)`',
							'Fires a Durable Object instance’s `alarm()` handler under a `durable-object-alarm` event context (the standalone `alarm` export is the same trigger) and awaits it, returning `{ success, error? }`.'
						]
					]
				},
				paragraphs: [
					'These helpers are runtime-shaped and context-accurate for handler logic, but they do not try to recreate every internal Cloudflare dispatch step byte for byte. Their timing rules are documented explicitly instead of being left to guesswork.',
					'Each surface is also exported standalone for tree-shaking — `cf.alarm.trigger()` is the same function as the named `alarm` export, just as `cf.queue` mirrors `queue`. The Durable Object `alarm` helper takes a DO instance you construct in the test (not a handler file path), mirroring how the runtime wrapper invokes `alarm()`.'
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Do not assert the wrong timing contract',
						body: [
							'If a test depends on `waitUntil()` side effects being complete, a plain `cf.worker.fetch()` assertion may be too early. Either assert the side effect directly or move that check into a higher-fidelity path.'
						]
					}
				]
			},
			{
				id: 'tail-support',
				title: 'Tail handlers are a public config surface with a real test helper',
				paragraphs: [
					'Tail support is a real helper surface in the harness and a public `files.tail` config key, alongside `files.fetch`, `files.queue`, `files.scheduled`, and `files.email`. When `files.tail` is unset, `createTestContext()` auto-discovers `src/tail.ts`, wires `cf.tail.trigger()` automatically, and runs the handler with the same runtime helper access as the other test surfaces.',
					'The handler can export a default function or a named `tail` function. The helper accepts either full trace items or smaller option objects through `cf.tail.create(...)`, then waits for the handler and any queued `waitUntil()` work before it returns.'
				],
				snippets: [
					{
						title: 'A tiny tail handler plus one honest harness test',
						activeFile: 'tests/tail.test.ts',
						structure: [
							{ path: 'src', kind: 'folder' },
							{ path: 'src/tail-state.ts' },
							{ path: 'src/tail.ts' },
							{ path: 'tests', kind: 'folder' },
							{ path: 'tests/tail.test.ts' }
						],
						files: [
							{
								path: 'src/tail-state.ts',
								language: 'ts',
								code: String.raw`export const seenScripts: string[] = []`
							},
							{
								path: 'src/tail.ts',
								language: 'ts',
								code: String.raw`import type { TailEvent } from 'devflare/runtime'
import { seenScripts } from './tail-state'

export async function tail({ events }: TailEvent): Promise<void> {
	for (const item of events) {
		seenScripts.push(item.scriptName)
	}
}`
							},
							{
								path: 'tests/tail.test.ts',
								language: 'ts',
								code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, cf, env } from 'devflare/test'
import { seenScripts } from '../src/tail-state'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('tail handler sees trace items', async () => {
	seenScripts.length = 0

	const result = await cf.tail.trigger([
		cf.tail.create({
			scriptName: 'jobs-worker',
			logs: [{ level: 'error', message: ['queue failed'], timestamp: Date.now() }]
		})
	])

	expect(result.success).toBe(true)
	expect(seenScripts).toEqual(['jobs-worker'])
})`
							}
						]
					}
				],
				bullets: [
					'`src/tail.ts` is auto-discovered when `files.tail` is unset; set `files.tail` to point at a custom path, or `files.tail: false` to disable discovery — the same model as `files.fetch`, `files.queue`, `files.scheduled`, and `files.email`.',
					'Use `cf.tail.create()` when the test only needs a few trace fields, and pass full trace items when the payload details are the point of the assertion.',
					'Reach for a higher-fidelity integration path when the question is Cloudflare ingress behavior rather than your own log or trace handling logic.'
				],
				callouts: [
					{
						tone: 'info',
						title: 'Documented like the other handler surfaces',
						body: [
							'Tail has a public `files.tail` config key and is documented like fetch, queue, scheduled, and email: leave it unset to auto-discover `src/tail.ts`, point it at a custom path, or set it to `false` to disable discovery.'
						]
					}
				]
			},
			{
				id: 'small-proof',
				title: 'Start with one small proof test before layering helpers on top',
				snippets: [
					{
						title: 'A minimal runtime-shaped test',
						filename: 'tests/worker.test.ts',
						language: 'ts',
						code: String.raw`import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createTestContext, cf, env } from 'devflare/test'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

describe('worker runtime', () => {
	test('routes through the built-in router', async () => {
		const response = await cf.worker.get('/users/123')
		expect(response.status).toBe(200)
	})
})`
					}
				],
				callouts: [
					{
						tone: 'success',
						title: 'Keep the first test boring',
						body: [
							'If the harness is working, you should be able to prove one route or handler path quickly before you hide it behind bigger factory helpers or shared test setup.'
						]
					}
				]
			},
			{
				id: 'when-to-add-transport',
				title:
					'Add `transport.ts` only when local RPC-style bridge calls in tests must preserve custom classes',
				paragraphs: [
					'Most `createTestContext()` tests do not need a transport file because strings, numbers, arrays, and plain JSON objects already cross the bridge naturally.',
					'Reach for `src/transport.ts` when a local RPC-style bridge call returns a real class instance and the caller needs that class again instead of a plain object. In practice that is most often a Durable Object method round-trip inside `createTestContext()`, not an ordinary HTTP response.'
				],
				bullets: [
					'Keep the encoded payload plain and JSON-friendly.',
					'Use one small transport entry per value type so decode rules stay reviewable.',
					'Set `files.transport: null` when you want to disable the convention explicitly for one package.'
				]
			},
			{
				id: 'where-to-go-next',
				title: 'Know where to go when the harness is only part of the question',
				cards: [
					{
						href: docsLink('testing-overview'),
						label: 'Testing',
						meta: 'Map',
						title: 'Testing overview',
						body: 'Use the overview page when you are not sure whether the next question belongs to starter tests, binding-specific guides, runtime helpers, or CI.'
					},
					{
						href: docsLink('binding-testing-guides'),
						label: 'Testing',
						meta: 'Binding index',
						title: 'Binding testing guides',
						body: 'Jump straight to the binding-specific testing page when KV, D1, R2, Durable Objects, Queues, AI, or another binding needs a more specific test story.'
					},
					{
						href: docsLink('runtime-context'),
						label: 'Runtime',
						meta: 'Runtime helpers',
						title: 'Runtime context',
						body: 'Read this when getter failures, missing context, or proxy behavior are making the test harness harder to trace than it should be.'
					},
					{
						href: docsLink('testing-and-automation'),
						label: 'Ship & operate',
						meta: 'Automation',
						title: 'Testing & automation',
						body: 'Use the CI-facing page when the question becomes preview validation, workflow structure, or what should happen in automation instead of local tests.'
					}
				],
				callouts: [
					{
						tone: 'info',
						title: 'The harness is the center, not the whole map',
						body: [
							'`createTestContext()` is the default test loop, but binding-specific caveats, runtime-context rules, and automation concerns still belong on their own pages.'
						]
					}
				]
			}
		]
	},
	{
		slug: 'transport-file',
		group: 'Devflare',
		navTitle: 'transport.ts',
		readTime: '4 min read',
		eyebrow: 'Runtime transport',
		title:
			'Use `src/transport.ts` when local RPC-style bridge calls must round-trip custom classes cleanly',
		summary:
			'Most workers do not need a transport file. Add one when Devflare’s local RPC-style bridge must encode and decode custom values, especially across Durable Object method calls in tests.',
		description:
			'`src/transport.ts` is Devflare’s custom serialization hook for local RPC-style bridge calls, especially the Durable Object round-trips Devflare manages in tests. It customizes the serialization layer for that bridge; it is not a replacement for ordinary fetch request or response handling. Its job is to let values that would otherwise collapse into plain JSON be rebuilt as real class instances on the caller side.',
		highlights: [
			'Use the conventional `src/transport.{ts,js,mts,mjs}` file or point `files.transport` at a custom path.',
			'The file must export a named `transport` object.',
			'Each transport entry needs an `encode` and `decode` pair.',
			'Set `files.transport: null` to disable autodiscovery explicitly.'
		],
		facts: [
			{
				label: 'Best for',
				value: 'Bridge-backed Durable Object results that return custom classes'
			},
			{ label: 'Usually unnecessary', value: 'Strings, numbers, arrays, and plain JSON objects' },
			{ label: 'Disable rule', value: '`files.transport: null`' }
		],
		sourcePages: [
			'src/test/simple-context.ts',
			'src/test/simple-context-durable-objects.ts',
			'src/test/simple-context-paths.ts',
			'src/dev-server/worker-surface-paths.ts',
			'src/config/schema-runtime.ts',
			'tests/integration/test-context/config-autodiscovery.test.ts'
		],
		sections: [
			{
				id: 'when-you-need-it',
				title: 'Reach for it only when local RPC-style bridge calls must preserve real classes',
				paragraphs: [
					'Most workers do not need a transport file because plain data already crosses the bridge naturally.',
					'Add `src/transport.ts` when a local RPC-style bridge call returns a custom class instance and you want the caller to receive that class again instead of a plain object.'
				],
				cards: [
					{
						title: 'Good fit',
						body: 'A Durable Object method or another Devflare-managed RPC boundary returns a small domain value like `Money`, `DoubleableNumber`, or another class with behavior you want to keep intact.'
					},
					{
						title: 'Usually unnecessary',
						body: 'The handler or RPC call returns plain strings, numbers, arrays, or JSON objects that do not need custom decode logic.'
					}
				],
				callouts: [
					{
						tone: 'info',
						title: 'Think “bridge-backed RPC”, not “normal JSON responses”',
						body: [
							'This file matters when Devflare is proxying values across its local RPC bridge. It is not a replacement for ordinary Worker request or response serialization.'
						]
					}
				]
			},
			{
				id: 'transport-shape',
				title: 'Export one named `transport` object with small encode and decode pairs',
				description:
					'Keep each entry boring and explicit: detect one value shape, encode it into plain data, and decode that data back into the class on the caller side.',
				snippets: [
					{
						title: 'Keep the transport file next to the class it knows how to round-trip',
						description:
							'The transport file teaches Devflare how to turn a custom class into plain data for the bridge, then rebuild that class for the caller.',
						activeFile: 'src/transport.ts',
						structure: [
							{ path: 'src', kind: 'folder' },
							{ path: 'src/DoubleableNumber.ts' },
							{ path: 'src/transport.ts' },
							{ path: 'src/do.counter.ts' }
						],
						files: [
							{
								path: 'src/DoubleableNumber.ts',
								language: 'ts',
								focusLines: [[1, 10]],
								code: String.raw`export class DoubleableNumber {
	value: number

	constructor(value: number) {
		this.value = value
	}

	get double() {
		return this.value * 2
	}
}`
							},
							{
								path: 'src/transport.ts',
								language: 'ts',
								focusLines: [[3, 8]],
								code: String.raw`import { DoubleableNumber } from './DoubleableNumber'

export const transport = {
	DoubleableNumber: {
		encode: (value: unknown) =>
			value instanceof DoubleableNumber ? value.value : false,
		decode: (value: number) => new DoubleableNumber(value)
	}
}`
							},
							{
								path: 'src/do.counter.ts',
								language: 'ts',
								focusLines: [[5, 8]],
								code: String.raw`import { DoubleableNumber } from './DoubleableNumber'

export class Counter {
	private count = 0

	increment(n: number = 1): DoubleableNumber {
		this.count += n
		return new DoubleableNumber(this.count)
	}
}`
							}
						]
					}
				],
				bullets: [
					'Return `false` or `undefined` from `encode` when the value is not a match.',
					'Keep the encoded payload plain and JSON-friendly.',
					'Use one transport key per value type so decoding stays obvious in code review.'
				]
			},
			{
				id: 'prove-it',
				title: 'A tiny test is still the easiest proof of the round-trip',
				snippets: [
					{
						title: 'Test the round-trip, not just the numeric value',
						filename: 'tests/counter.test.ts',
						language: 'ts',
						code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, env } from 'devflare/test'
import { DoubleableNumber } from '../src/DoubleableNumber'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('custom transport restores the class instance', async () => {
	const result = await env.COUNTER.getByName('main').increment(2)

	expect(result).toBeInstanceOf(DoubleableNumber)
	expect(result.value).toBe(2)
	expect(result.double).toBe(4)
})`
					}
				],
				callouts: [
					{
						tone: 'success',
						title: 'Keep the first proof small',
						body: [
							'If the transport works, you should be able to prove it with one class, one method call, and one `instanceof` assertion before you hide it inside bigger helpers.'
						]
					}
				]
			},
			{
				id: 'autodiscovery-rules',
				title: 'Know the autodiscovery and disable rules',
				bullets: [
					'Use the conventional `src/transport.{ts,js,mts,mjs}` path when you want the default location.',
					'Use `files.transport` when the transport file lives somewhere else.',
					'Set `files.transport: null` when you want to disable the convention explicitly for a package.',
					'If the file exists but does not export a named `transport` object, Devflare warns and continues without custom transport decoding.'
				],
				snippets: [
					{
						title: 'Point at a custom transport path when the convention is not enough',
						language: 'ts',
						code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'transport-example',
	files: {
		fetch: 'src/fetch.ts',
		transport: 'src/transport.ts'
	}
})`
					},
					{
						title: 'Disable transport autodiscovery explicitly',
						filename: 'devflare.config.ts',
						language: 'ts',
						code: String.raw`files: {
	transport: null
}`
					}
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Do not treat the warning as success',
						body: [
							'If Devflare warns that the file does not export a named `transport` object, custom decode is off. The test may still run, but your class round-trip will not.'
						]
					}
				]
			}
		]
	}
]
