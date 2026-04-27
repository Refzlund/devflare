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

export const devflareDocsPart3: DocPage[] = [
	{
		slug: 'why-testing-feels-native',
		group: 'Devflare',
		navTitle: 'Why tests feel native',
		readTime: '7 min read',
		eyebrow: 'Testing advantage',
		title: 'Why Devflare tests feel like using the worker instead of mocking around it',
		summary:
			'Devflare’s standout testing trick is that the same config, bindings, env surface, runtime helpers, and even direct Durable Object method calls can stay available in Bun tests without a hand-built fake layer in the middle.',
		description:
			'The experience feels better because Devflare does more than boot Miniflare. `createTestContext()` loads the nearest config, wires the real worker surfaces, installs runtime-shaped helper entrypoints, and bridges Node or Bun test code back into the worker world so `env`, `cf.*`, and bridge-backed Durable Object calls keep the same mental model.',
		highlights: [
			'The same authored config drives the app and the tests; there is no separate test-only binding schema to babysit.',
			'The unified `env` proxy works inside request handlers, inside `createTestContext()` tests, and through the bridge when code needs to cross back into the worker world.',
			'`cf.worker`, `cf.queue`, `cf.scheduled`, `cf.email`, and `cf.tail` run user code with the same runtime context helpers the app expects.',
			'Durable Object methods can be called directly through `env.MY_DO.getByName(...).myMethod()` instead of forcing every stateful test through HTTP glue.',
			'When a bridge-backed call returns a custom class, `src/transport.ts` can rebuild that class on the caller side instead of flattening it into plain JSON.'
		],
		facts: [
			{ label: 'Key advantage', value: 'Tests can stay worker-shaped instead of mock-shaped' },
			{
				label: 'Core trick',
				value: '`createTestContext()` plus a unified `env` proxy and bridge-backed bindings'
			},
			{
				label: 'Durable Object experience',
				value: 'Direct `env.COUNTER.getByName(...).increment()` calls in tests'
			},
			{
				label: 'Optional extra',
				value: '`src/transport.ts` when bridge-backed calls must round-trip custom classes'
			}
		],
		sourcePages: [
			'src/test/simple-context.ts',
			'src/test/simple-context-durable-objects.ts',
			'src/test/simple-context-gateway-script.ts',
			'src/test/cf.ts',
			'src/test/worker.ts',
			'src/test/queue.ts',
			'src/test/resolve-service-bindings.ts',
			'src/bridge/proxy.ts',
			'src/bridge/client.ts',
			'src/env.ts',
			'tests/integration/test-context/config-autodiscovery.test.ts'
		],
		sections: [
			{
				id: 'why-it-feels-better',
				title: 'The experience feels better because Devflare removes a whole fake layer',
				paragraphs: [
					'A lot of Worker testing feels disconnected. One layer of code is written against real bindings and Worker surfaces, then the tests either fake those APIs by hand or retreat to heavier integration paths for everything.',
					'Devflare tries to keep one authored story instead. The same config that boots the app can boot the test harness, the same `env` import can keep working, and bridge-backed bindings can cross from Bun back into the worker world without forcing every test to speak raw HTTP or a custom mock vocabulary.'
				],
				cards: [
					{
						title: 'One config',
						body: '`createTestContext()` loads the same `devflare.config.*` model the app uses instead of a second test-only binding map.'
					},
					{
						title: 'One env surface',
						body: 'The unified `env` proxy uses request context in handlers, test context in tests, and the bridge when code needs to reach Miniflare-backed bindings.'
					},
					{
						title: 'One set of helper surfaces',
						body: '`cf.worker`, `cf.queue`, `cf.scheduled`, `cf.email`, and `cf.tail` trigger the same handler families your package actually owns.'
					},
					{
						title: 'One honest Durable Object story',
						body: 'Direct `env.MY_DO.getByName(...).method()` calls work in tests, so stateful code does not need a fake facade just to become testable.'
					}
				],
				callouts: [
					{
						tone: 'accent',
						title: 'This is the key advantage',
						body: [
							'Devflare is at its best when a test can read like app code instead of a ceremony for building a fake Cloudflare universe first.'
						]
					}
				]
			},
			{
				id: 'bridge-layers',
				title: 'The bridge is the difference, but it is not the only layer doing useful work',
				paragraphs: [
					'The seamless part comes from several user-visible pieces cooperating: config autodiscovery, the unified `env` proxy, runtime-shaped helper entrypoints, and bridge proxies that forward binding calls into the local worker world.',
					'That is also why Devflare testing scales beyond one fetch route. The same system can cover direct binding calls, queue and scheduled helpers, Tail events, and bridge-backed Durable Object or service interactions without making you rewire the whole harness every time the package grows a new surface.'
				],
				table: {
					headers: ['Layer', 'What Devflare wires', 'Why it feels smoother'],
					rows: [
						[
							'`createTestContext()`',
							'Finds the nearest config, boots Miniflare, discovers worker surfaces, and prepares bindings from the same authored project shape.',
							'The harness starts where the app starts instead of from a separate test-only setup story.'
						],
						[
							'Unified `env` proxy',
							'Prefers request-scoped env, then test-context env, then bridge-backed env access.',
							"One `import { env } from 'devflare'` can stay valid across app code, tests, and local bridge-backed flows."
						],
						[
							'`cf.*` helpers',
							'Create runtime-shaped fetch, queue, scheduled, email, and tail events/controllers before user code runs.',
							'Helpers such as `getFetchEvent()` and `locals` keep working in tests instead of only in real requests.'
						],
						[
							'Bridge proxies',
							'Route KV, D1, R2, Durable Object, queue, service, and send-email calls into the local worker world.',
							'Bindings can be exercised through their real shapes instead of custom in-memory fakes.'
						],
						[
							'Transport hooks',
							'Optionally encode and decode custom values for local RPC-style bridge calls.',
							'A Durable Object method can return a real class again on the caller side when that behavior matters.'
						]
					]
				},
				bullets: [
					'Service binding refs and cross-worker Durable Object refs can trigger extra worker resolution automatically, so multi-worker tests still begin from the same config model.',
					'For single-worker tests, the bridge-backed env proxy is the normal path. For multi-worker refs, `createTestContext()` can boot the extra workers directly through Miniflare worker configuration.',
					'The bridge is there to remove translation pain, not to make the test vocabulary magical or mysterious.'
				]
			},
			{
				id: 'durable-object-round-trip',
				title:
					'This is the part that usually sells people: a Durable Object method can feel native in a test',
				paragraphs: [
					"One of Devflare's nicest testing moves is that a Durable Object method can be called straight from the test through `env.COUNTER.getByName('main').increment(2)` instead of forcing you through a fake stub or an HTTP wrapper route.",
					'When the return value is more than plain JSON, `src/transport.ts` can keep the bridge honest by rebuilding the real class on the caller side. That is how a local test can still receive a `DoubleableNumber` with working instance behavior instead of a flattened object.'
				],
				snippets: [
					{
						title: 'The test reads like app code, not like bridge setup',
						description:
							'This mirrors the integration behavior Devflare proves itself: config autodiscovery, a direct Durable Object method call, and a custom class round-trip through `transport.ts`.',
						activeFile: 'tests/counter.test.ts',
						structure: testingFeelsNativeStructure,
						files: [
							{
								path: 'devflare.config.ts',
								language: 'ts',
								focusLines: [[3, 11]],
								code: testingFeelsNativeConfigCode
							},
							{
								path: 'src/DoubleableNumber.ts',
								language: 'ts',
								focusLines: [[1, 10]],
								code: testingFeelsNativeValueCode
							},
							{
								path: 'src/transport.ts',
								language: 'ts',
								focusLines: [[1, 8]],
								code: testingFeelsNativeTransportCode
							},
							{
								path: 'src/do.counter.ts',
								language: 'ts',
								focusLines: [[1, 10]],
								code: testingFeelsNativeDurableObjectCode
							},
							{
								path: 'tests/counter.test.ts',
								language: 'ts',
								focusLines: [[1, 13]],
								code: testingFeelsNativeTestCode
							}
						]
					}
				],
				callouts: [
					{
						tone: 'success',
						title: 'The bridge disappears when it is working well',
						body: [
							'That is the real win. You still benefit from the bridge, but the test itself mostly reads like “boot the worker, call the thing, assert the domain value.”'
						]
					}
				]
			},
			{
				id: 'not-just-http',
				title: 'The same smooth story extends beyond plain HTTP',
				table: {
					headers: ['Surface', 'What the test calls', 'What Devflare keeps aligned'],
					rows: [
						[
							'Routes and fetch middleware',
							'`cf.worker.get()` or `cf.worker.fetch()`',
							'Request shape, route params, and runtime helper access.'
						],
						[
							'Queue consumers',
							'`cf.queue.trigger()`',
							'Batch shape, retry or ack behavior, and queued `waitUntil()` work.'
						],
						[
							'Scheduled jobs',
							'`cf.scheduled.trigger()`',
							'Cron controller shape, scheduled context, and background work timing.'
						],
						[
							'Email and tail handlers',
							'`cf.email.send()` and `cf.tail.trigger()`',
							'Handler-style invocation with the right local helper semantics instead of custom throwaway scaffolding.'
						],
						[
							'Bindings and Durable Object methods',
							'`env.DB`, `env.CACHE`, `env.FILES`, or `env.COUNTER.getByName(...).increment()`',
							'The same binding contract app code uses, optionally with transport-backed custom value round-trips.'
						]
					]
				},
				paragraphs: [
					'That range is why the testing story feels bigger than one fetch helper. Devflare is not only helping you send requests; it is helping your tests talk to the same worker-owned surfaces your app logic actually depends on.',
					'When the package grows queues, schedules, email handlers, or Tail processing, the harness grows with the same worker-shaped mindset instead of forcing a whole new testing abstraction for each runtime surface.'
				],
				cards: [
					{
						href: docsLink('create-test-context'),
						label: 'Testing',
						meta: 'Harness details',
						title: 'createTestContext()',
						body: 'Open this when the next question is the exact helper behavior, autodiscovery rules, or background-work timing.'
					},
					{
						href: docsLink('transport-file'),
						label: 'Runtime',
						meta: 'Bridge transport',
						title: 'transport.ts',
						body: 'Open this when the next question is how to preserve real class instances across a local bridge-backed RPC call.'
					},
					{
						href: docsLink('binding-testing-guides'),
						label: 'Testing',
						meta: 'Binding-specific',
						title: 'Binding testing guides',
						body: 'Jump here when the binding is already chosen and the only remaining question is the most honest test posture for that binding.'
					}
				]
			},
			{
				id: 'keep-it-honest',
				title: 'Caveats worth knowing',
				bullets: [
					'`cf.worker.fetch()` returns when the handler resolves, so some `waitUntil()` side effects may still be running afterward.',
					'`transport.ts` is for bridge-backed RPC-style calls, not a replacement for normal HTTP request or response serialization.',
					'Remote-heavy bindings such as AI and Vectorize still need higher-fidelity or remote checks sooner than KV, D1, R2, or many Durable Object flows do.',
					'Preview and CI validation still matter for Cloudflare ingress, routing, and deployment lifecycle questions that local tests do not pretend to answer completely.'
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Smooth local tests are the default, not the whole verification plan',
						body: [
							'Devflare makes honest local tests much easier, but it does not claim that every Cloudflare behavior is now a unit test. The strong story is “less mocking, more truthful local coverage, then higher-fidelity checks when the question changes.”'
						]
					}
				]
			}
		]
	},
	{
		slug: 'testing-overview',
		group: 'Devflare',
		navTitle: 'Testing overview',
		readTime: '7 min read',
		eyebrow: 'Testing map',
		title: 'Use one testing map so you know which Devflare page answers which testing question',
		summary:
			'Devflare’s testing story is layered: start with one real unit test, use `createTestContext()` and `cf.*` for the runtime-shaped harness, then jump to binding-specific guides or CI-focused pages only when the question changes.',
		description:
			'The docs already explain starter tests, harness behavior, runtime-context caveats, transport round-trips, binding-specific testing, and automation. This page gathers those lanes into one map so you can open the right testing page first instead of re-deriving the docs structure from memory.',
		highlights: [
			'Start with `your first unit test` when the goal is simply “prove the worker boots and answers one request.”',
			'Open `Why tests feel native` when the question is what makes Devflare’s bridge-backed harness feel smoother than the usual Worker testing setup.',
			'Use `createTestContext()` when you need the real worker surface, helper timing rules, and autodiscovery behavior.',
			'Every binding overview page already links its own testing guide at the bottom in the “Go deeper” section.',
			'Use `Testing & automation` when the question shifts from local harness behavior to CI, preview validation, and workflow observability.'
		],
		facts: [
			{
				label: 'Best for',
				value: 'Finding the right testing doc before you disappear into the wrong rabbit hole'
			},
			{ label: 'Default harness', value: '`createTestContext()` plus `cf.*` helpers' },
			{
				label: 'Binding-specific docs',
				value: 'At the bottom of each binding overview page and in the binding testing index'
			},
			{
				label: 'Automation lane',
				value: '`/docs/testing-and-automation` for CI, preview checks, and workflow feedback'
			}
		],
		sourcePages: [
			'packages/devflare/src/test/simple-context.ts',
			'README.md',
			'simple-context.ts',
			'cf.ts',
			'apps/testing/*'
		],
		sections: [
			{
				id: 'start-with-one-proof',
				title: 'Start with one honest proof before you optimize the testing story',
				paragraphs: [
					'The safest Devflare testing habit is boring: prove one worker path with one real request first, then only add more harness machinery when a binding, background surface, or preview concern genuinely needs it.',
					'The docs split testing into layers for this reason. A starter request test, a runtime-shaped harness page, binding-specific testing guides, and a CI/automation page each answer different questions. Trying to make one page carry all of that usually makes the guidance worse.'
				],
				snippets: [
					{
						title: 'The boring first loop is still the right default',
						language: 'ts',
						code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, cf, env } from 'devflare/test'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('GET /health proves the worker boots', async () => {
	const response = await cf.worker.get('/health')
	expect(response.status).toBe(200)
})`
					}
				],
				bullets: [
					'If the worker cannot answer one truthful request, the next testing abstraction is probably not the rescue mission you need.',
					'Start route-level when the app behavior is the point, and binding-level when the binding itself is the point.',
					'Keep one small proof test around even after the suite grows so the runtime contract stays visible.'
				]
			},
			{
				id: 'open-the-right-page',
				title: 'Open the page that matches the question you actually have',
				cards: [
					{
						href: docsLink('why-testing-feels-native'),
						label: 'Testing',
						meta: 'Why it feels better',
						title: 'Why tests feel native',
						body: 'Open this when the question is less “how do I use the harness?” and more “why does Devflare testing feel so much smoother than the usual Worker setup?”'
					},
					{
						href: docsLink('first-unit-test'),
						label: 'Quickstart',
						meta: 'Starter proof',
						title: 'Your first unit test',
						body: 'Use this when the goal is simply to prove a worker boots, answers one request, and can be exercised through the real Devflare test harness.'
					},
					{
						href: docsLink('create-test-context'),
						label: 'Testing',
						meta: 'Harness',
						title: 'createTestContext()',
						body: 'Use this when you need the real worker-shaped harness, autodiscovered surfaces, helper timing rules, and the `cf.*` testing helpers.'
					},
					{
						href: docsLink('binding-testing-guides'),
						label: 'Testing',
						meta: 'Binding index',
						title: 'Binding testing guides',
						body: 'Use this when the binding already exists and the open question is how to test KV, D1, R2, Queues, Durable Objects, AI, Vectorize, or another binding accurately.'
					},
					{
						href: docsLink('runtime-context'),
						label: 'Runtime',
						meta: 'Runtime helpers',
						title: 'Runtime context',
						body: 'Open this when missing-context errors, getters, or runtime proxies are making tests feel harder to trace than they should.'
					},
					{
						href: docsLink('transport-file'),
						label: 'Runtime',
						meta: 'Bridge transport',
						title: 'transport.ts',
						body: 'Open this when a test needs a bridge-backed RPC call to return a real class instance instead of collapsing into plain JSON.'
					},
					{
						href: docsLink('testing-and-automation'),
						label: 'Ship & operate',
						meta: 'CI and release lanes',
						title: 'Testing & automation',
						body: 'Use this page when the question changes from local test harness behavior to CI workflows, preview checks, and observable automation.'
					}
				]
			},
			{
				id: 'choose-the-layer',
				title: 'The right testing layer depends on what changed',
				table: {
					headers: ['If the question is...', 'Open this page first', 'Why'],
					rows: [
						[
							'Can I prove the worker answers one real request?',
							'`Your first unit test`',
							'It keeps the first check small and prevents the harness from becoming accidental ceremony.'
						],
						[
							'Why does Devflare testing feel smoother than the usual Worker setup?',
							'`Why tests feel native`',
							'It explains the unified env, bridge-backed bindings, runtime helper surfaces, and direct Durable Object story.'
						],
						[
							'How does the default runtime-shaped harness behave?',
							'`createTestContext()`',
							'It documents autodiscovery, `cf.*`, helper timing, and when the harness waits for background work.'
						],
						[
							'How should I test this specific binding?',
							'`Binding testing guides`',
							'Each binding has its own testing page with the right default harness and escalation path.'
						],
						[
							'Why are getters or proxies failing in a test?',
							'`Runtime context`',
							'The runtime-context page explains when helper APIs can read the active request, env, ctx, event, and locals.'
						],
						[
							'Why is a custom class not round-tripping in a test?',
							'`transport.ts`',
							'Transport docs explain the extra serialization hook for bridge-backed calls.'
						],
						[
							'How should this fit into CI or preview validation?',
							'`Testing & automation`',
							'Automation guidance belongs on the CI-facing page, not in the local harness docs.'
						]
					]
				},
				callouts: [
					{
						tone: 'info',
						title: 'One page per question is a feature',
						body: [
							'Devflare’s testing docs are intentionally split so starter tests, binding nuance, runtime context, and automation do not blur into one giant advice blob.'
						]
					}
				]
			},
			{
				id: 'where-binding-guides-live',
				title: 'Binding-specific testing pages already exist — they were just easy to miss',
				paragraphs: [
					'Each binding overview page already links its testing and example pages. That means the binding-specific testing content is already in the library, but it was discoverable mostly if you were already reading the right binding page.',
					'Use the binding testing index when you know which binding changed and want the testing guide directly. Use the binding overview page first when you still need the config shape, runtime usage, or local support notes before the tests make sense.'
				],
				cards: [
					{
						href: docsLink('binding-testing-guides'),
						label: 'Testing',
						meta: 'Binding index',
						title: 'Binding testing guides',
						body: 'Jump straight to the testing page for KV, D1, R2, Durable Objects, Queues, AI, Vectorize, Hyperdrive, Browser Rendering, Analytics Engine, or Send Email.'
					}
				],
				bullets: [
					'Open the binding overview page when you need config or runtime context first.',
					'Open the binding testing page when the binding already exists and the question is purely about the right harness or escalation path.',
					'Remote-oriented bindings like AI and Vectorize deliberately have a different testing posture from KV or D1, and the testing guides say that out loud.'
				]
			}
		]
	},
	{
		slug: 'binding-testing-guides',
		group: 'Devflare',
		navTitle: 'Binding testing',
		readTime: '8 min read',
		eyebrow: 'Testing index',
		title:
			'Open the right binding testing guide instead of reconstructing the test story from scratch',
		summary:
			'Every binding overview page already links a hidden testing guide. This page collects those guides in one place so you can jump straight to the right harness, caveats, and escalation path for the binding that changed.',
		description:
			'Binding testing is not one-size-fits-all. KV, D1, R2, Durable Objects, Queues, and several other bindings are strong local-first stories, while AI, Vectorize, and a few infrastructure-heavy bindings need more remote or higher-fidelity checks sooner. Use this page when you know the binding but do not want to hunt through the whole binding library first.',
		highlights: [
			'Every binding overview page links its testing guide.',
			'Most bindings still start with `createTestContext()` plus the real binding or helper surface, not a hand-built fake.',
			'Remote-oriented guides say so explicitly instead of pretending every binding has the same local story.',
			'Open the binding overview page first when you need config or runtime shape; open the testing guide first when the binding already exists and the only question left is test design.'
		],
		facts: [
			{ label: 'Best for', value: 'Jumping straight to the right binding-specific testing guide' },
			{
				label: 'Where the links also live',
				value: 'At the bottom of each binding overview page'
			},
			{
				label: 'Default pattern',
				value: 'Usually `createTestContext()` plus the real binding or helper surface'
			},
			{
				label: 'Notable exceptions',
				value:
					'AI and Vectorize are remote-oriented, and some other bindings need higher-fidelity checks sooner'
			}
		],
		sourcePages: [
			'packages/devflare/src/test/simple-context.ts',
			'README.md',
			'simple-context.ts',
			'cf.ts',
			'apps/testing/*'
		],
		sections: [
			{
				id: 'how-to-use-this-index',
				title: 'Use this page as the index, but remember where the links already live',
				paragraphs: [
					'The binding library intentionally keeps only the main binding overview pages visible in the sidebar. The testing pages are still real docs pages, but they stay linked from the bottom of each binding overview so the sidebar does not turn into a twelve-level nesting doll.',
					'That is great once you already opened the right binding page. This index is for the opposite moment: you know the binding that changed and you want the testing guide immediately.'
				],
				bullets: [
					'Open the binding overview page first when you need authoring, runtime, or preview context before the tests make sense.',
					'Open the testing guide first when the binding already exists and the only remaining question is how to test it.',
					'Use `Testing overview` when you need the bigger map across starter tests, harness behavior, binding guides, runtime helpers, and automation.'
				],
				cards: [
					{
						href: docsLink('testing-overview'),
						label: 'Testing',
						meta: 'Map',
						title: 'Testing overview',
						body: 'Use the broader testing map when you are not yet sure whether the next question belongs to starter tests, binding guides, runtime context, or automation.'
					}
				]
			},
			{
				id: 'open-the-guide',
				title: 'Open the testing guide for the binding that actually changed',
				cards: bindingTestingGuideCards
			},
			{
				id: 'testing-posture',
				title: 'The testing posture is not identical for every binding',
				table: {
					headers: ['Binding', 'Testing posture', 'Default harness'],
					rows: bindingTestingGuideRows
				},
				callouts: [
					{
						tone: 'warning',
						title: 'Different defaults are a good thing',
						body: [
							'KV, D1, R2, and Queues should not be documented like remote AI inference, and remote AI inference should not be documented like local KV. The different testing guides are there to keep those truths visible.'
						]
					}
				]
			},
			{
				id: 'copyable-helper-chooser',
				title: 'Copy the smallest helper that matches the boundary',
				paragraphs: [
					'Pick the helper from the thing you need to prove. Use pure mocks for small functions, `createOfflineEnv()` when config-derived binding names matter, `createTestContext()` when the Worker surface matters, and skip-gated lanes when Docker/Podman or Cloudflare credentials are part of the test.'
				],
				snippets: [
					{
						title: 'Four helper lanes in one test file',
						language: 'ts',
						code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import {
	cf,
	createMockEnv,
	createOfflineEnv,
	createTestContext,
	env,
	shouldSkip
} from 'devflare/test'
import config from '../devflare.config'

test('pure binding logic uses a mock env', async () => {
	const env = createMockEnv({ kv: { CACHE: 'CACHE' } })
	await env.CACHE.put('key', 'value')
	expect(await env.CACHE.get('key')).toBe('value')
})

test('config-derived offline tests keep real binding names', () => {
	const env = createOfflineEnv(config, {
		secretsStore: {
			API_TOKEN: 'test-token'
		}
	})

	expect(env.API_TOKEN).toBeDefined()
})

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('worker behavior uses the runtime-shaped harness', async () => {
	const response = await cf.worker.get('/health')
	expect(response.status).toBe(200)
})

const skipContainers = await shouldSkip.containers

test.skipIf(skipContainers)('container tests are explicit opt-in lanes', async () => {
	expect(skipContainers).toBe(false)
})`
					}
				],
				table: {
					headers: ['Need to prove', 'Start with', 'Runs in ordinary CI?'],
					rows: [
						[
							'A pure function calls one binding method',
							'`createMockEnv()` or a specific `createMock*` helper',
							'Yes'
						],
						[
							'The env should match `devflare.config.ts` without booting Miniflare',
							'`createOfflineEnv()`',
							'Yes'
						],
						[
							'A Worker route, queue, scheduled, email, tail, or service flow works',
							'`createTestContext()` plus `cf.*`',
							'Yes, unless the feature itself needs a remote boundary'
						],
						[
							'Docker/Podman, Cloudflare auth, or deployed behavior is the point',
							'`shouldSkip.*` plus a separate integration lane',
							'Only when the runner has the dependency'
						]
					]
				}
			}
		]
	}
]
