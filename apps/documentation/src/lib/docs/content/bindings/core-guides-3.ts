import type { BindingGuideDefinition } from './shared'

export const bindingGuidesPart3: BindingGuideDefinition[] = [
	{
		slugBase: 'service',
		label: 'Services',
		categoryDescription:
			'Worker-to-worker bindings with `ref()` support, typed env generation, and good local multi-worker tests.',
		configKey: 'bindings.services',
		authoringShape:
			'Record<string, { service: string; environment?: string; entrypoint?: string }> | ref().worker(...)',
		localStory: 'Local runtime and multi-worker tests',
		sourcePages: [
			'schema-bindings.ts',
			'ref.ts',
			'resolve-service-bindings.ts',
			'generator.ts',
			'case5/*'
		],
		overview: {
			readTime: '4 min read',
			title: 'Use service bindings to keep multi-worker apps explicit instead of magical',
			summary:
				'The fast Devflare payoff is simple: wire one worker to another with `ref()`, call it through `env.MATH_SERVICE`, and prove the same relationship locally in one test.',
			description:
				'This is the clean lane for apps that genuinely need more than one worker. Devflare keeps the worker family explicit in config, resolves the referenced surface, and lets local tests use the same service binding contract instead of copied worker names or hand-built internal URLs.',
			highlights: [
				'`ref()` keeps worker relationships explicit instead of hiding them in env vars or copied script names.',
				'Gateway code calls the service through the same `env.MATH_SERVICE` contract the tests use.',
				'Local multi-worker tests work through the default harness instead of custom setup glue.',
				'`devflare types` can generate typed service bindings and fall back to `Fetcher` when a service cannot be typed.'
			],
			bestFor: 'Multi-worker systems, internal RPC boundaries, and explicit service composition',
			authoringParagraphs: [
				'The easiest honest starting point is one gateway worker, one referenced worker, and one service binding in config.',
				'`ref()` is especially useful because it keeps the dependency explicit while still giving Devflare enough structure to resolve, type, and boot the linked worker locally later.'
			],
			authoringSnippet: {
				title: 'Service binding authoring with `ref()`',
				language: 'ts',
				code: String.raw`import { defineConfig, ref } from 'devflare/config'

const mathService = ref(() => import('../math-service/devflare.config'))

export default defineConfig({
	name: 'gateway',
	bindings: {
		services: {
			MATH_SERVICE: mathService.worker,
			ADMIN: mathService.worker('AdminEntrypoint')
		}
	}
})`
			},
			fitBullets: [
				'Use service bindings when another worker is a real dependency, not when one large worker is merely inconvenient to think about.',
				'They are a strong fit for internal APIs, admin surfaces, search workers, and explicit worker-family boundaries.',
				'If the dependency is actually shared data rather than another service boundary, a direct binding like D1, KV, or DO may stay simpler.'
			],
			caveatBullets: [
				'Preview isolation follows resolved worker names, not just whatever branch or alias string you passed to a deploy command.',
				'Named entrypoints are modeled, but critical production wiring is still worth validating in compiled output.',
				'Service bindings are references, not preview-managed account resources like KV, D1, or queues.'
			],
			caveatCallout: {
				tone: 'info',
				title: 'A very good review question',
				body: [
					'Ask which worker names a preview will actually deploy before you assume the worker family is isolated.'
				]
			}
		},
		internals: {
			readTime: '4 min read',
			summary:
				'Devflare resolves referenced worker configs, bundles the linked worker surfaces, and then exposes those services as local multi-worker bindings.',
			description:
				'Service bindings feel more than cosmetic: the tooling follows the relationship far enough to keep local tests, type generation, and compiled output aligned.',
			highlights: [
				'Compiler emits Wrangler `services` entries.',
				'`ref()` can resolve both default worker exports and named entrypoints.',
				'Local multi-worker setup uses generated service binding metadata, not lucky guesses.',
				'Type generation can map service bindings to real interfaces when Devflare knows enough about the target.'
			],
			normalizationFact:
				'Plain objects and `ref().worker(...)` values normalize into one service-binding model',
			compileTarget: 'Wrangler `services`',
			previewNote:
				'Preview can rewrite service names, but service bindings are not preview-managed resources like KV or D1',
			normalizationParagraphs: [
				'Service bindings can be authored as plain binding objects or as `ref().worker(...)` results. Devflare normalizes those into one shape so compiler, type generation, and test setup can all reason about them consistently.',
				'When a binding comes from `ref()`, Devflare can follow the referenced config, discover the relevant worker surface, and keep that relationship visible in local tooling.'
			],
			localRuntimeBullets: [
				'`resolveServiceBindings()` is responsible for following referenced configs and bundling the default `worker.ts` export or named entrypoints as needed.',
				'Local multi-worker Miniflare wiring uses the resolved service metadata so a gateway worker can call another worker naturally in tests.',
				'Type generation can emit service-specific interfaces; if that is not possible, the binding falls back to a generic `Fetcher` contract.'
			],
			compileBullets: [
				'Compile emits the standard `services` array that Wrangler expects.',
				'Preview flows can rewrite service names when the preview naming rules say they should, but there is no separate resource-provisioning lifecycle for services themselves.',
				'Critical production wiring is still worth checking through `config print`, `build`, or dry-run deploy output.'
			],
			callout: {
				tone: 'success',
				title: 'This is configuration as architecture, not just syntax',
				body: [
					'Service bindings work well in Devflare because the relationships are explicit enough for tooling to follow, type, and test.'
				]
			}
		},
		testing: {
			readTime: '4 min read',
			summary:
				'Service bindings are one of the clearest Devflare wins in multi-worker apps: you can keep the real worker boundary and still prove it through the default local harness.',
			description:
				'Start with `createTestContext()`, then call the bound service through the generated env shape. That proves the config relationship, the local worker family, and the callable contract in the same language the app itself uses.',
			highlights: [
				'`createTestContext()` can auto-detect service bindings from config.',
				'One direct env call is usually enough to prove the wiring honestly.',
				'The default and named entrypoint stories are both testable through the env.',
				'Generated env types make service calls much easier to trust.',
				'You only need higher-level deploy checks when naming or preview topology is the real risk.'
			],
			bestFor: 'Gateway-to-service calls, entrypoint wiring, and typed multi-worker behavior',
			defaultHarness: '`createTestContext()` plus `env.MY_SERVICE`',
			escalation:
				'The risk is worker naming drift, preview topology, or compiled output correctness',
			paragraphs: [
				'The shortest honest test is usually one real service call through the generated env binding. That already proves the config relationship and the callable surface.',
				'Keep one test for the default worker entry and one for any named entrypoint that matters operationally.'
			],
			mainSnippet: {
				title: 'Testing a service binding through the env',
				language: 'ts',
				code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, env } from 'devflare/test'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('service binding calls the default worker export', async () => {
	expect(await env.MATH_SERVICE.add(5, 3)).toBe(8)
})`
			},
			helperBullets: [
				'Use the bound env service directly when the service relationship is the thing you want to prove.',
				'Keep named entrypoints explicit in tests so they do not quietly drift from the config contract.',
				'Run `devflare types` whenever service entrypoints change so env autocomplete and generated types stay in sync.'
			],
			caveatBullets: [
				'Local tests prove the callable relationship, not that your preview or production worker names are what you intended.',
				'If the service graph is business-critical, validate compiled output before deploys as well.',
				'Test naming and topology at preview or build time when those are the real failure modes.'
			],
			callout: {
				tone: 'warning',
				title: 'A typed local call is not the whole deploy story',
				body: [
					'The local harness tells you the relationship is modeled correctly. A preview or build check tells you the resolved worker names are still the ones you expect.'
				]
			}
		},
		example: {
			readTime: '3 min read',
			summary:
				'This example shows the smallest useful service-binding loop: one `ref()`, one gateway route, and one local multi-worker test.',
			description:
				'That is enough to show why Devflare helps here: the relationship stays explicit in config, typed in env, and testable without hand-assembling your own mini service mesh in the test file.',
			highlights: [
				'One worker calling another is enough to learn the pattern.',
				'`ref()` keeps the dependency visible.',
				'The env binding is the public contract the gateway uses.',
				'You can grow into named entrypoints later without changing the mental model.'
			],
			configFocus: 'Explicit `ref()` wiring',
			runtimeShape: 'One env service call from the gateway worker',
			bestUse: 'Internal APIs and worker-family boundaries',
			configSnippet: {
				title: 'Gateway config with a service ref',
				language: 'ts',
				code: String.raw`import { defineConfig, ref } from 'devflare/config'

const mathService = ref(() => import('../math-service/devflare.config'))

export default defineConfig({
	name: 'gateway',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		services: {
			MATH_SERVICE: mathService.worker
		}
	}
})`
			},
			usageSnippet: {
				title: 'Use the service in the gateway worker',
				language: 'ts',
				code: String.raw`import { env } from 'devflare/runtime'

export async function fetch(): Promise<Response> {
	const result = await env.MATH_SERVICE.add(4, 5)
	return Response.json({ result })
}`
			},
			notes: [
				'Once this tiny path works, adding named entrypoints becomes an incremental extension, not a different architecture.',
				'Keep one simple service example like this around if you want a smoke check for multi-worker wiring.'
			],
			callout: {
				tone: 'accent',
				title: 'This is the valuable bit',
				body: [
					'You do not need a whole microservice fleet to feel the Devflare value. One gateway call already proves that config refs, env bindings, and local multi-worker tests stay part of one coherent loop.'
				]
			}
		}
	},
	{
		slugBase: 'ai',
		label: 'AI',
		categoryDescription:
			'Workers AI bindings for remote inference, with a deliberately remote-oriented testing story.',
		configKey: 'bindings.ai',
		authoringShape: '{ binding: string }',
		localStory: 'Remote-oriented; local tests require remote mode',
		sourcePages: [
			'schema-bindings.ts',
			'compiler.ts',
			'wrangler-auth.ts',
			'remote-ai.ts',
			'packages/devflare/src/test/simple-context.ts'
		],
		overview: {
			readTime: '4 min read',
			title:
				'Use the AI binding when the worker needs real Workers AI inference, not just a local mock',
			summary:
				'Devflare makes Workers AI usable by keeping the binding tiny in config, the worker call obvious, and the remote smoke test explicit instead of fake.',
			description:
				'AI is still remote-oriented, but the first useful path is simple: one worker route, one `env.AI.run(...)` call, and one skip-aware remote test that says clearly when the real platform was involved.',
			highlights: [
				'Config is intentionally tiny: declare the binding name and keep the interesting part in worker code.',
				'Compiler emits the Wrangler AI binding shape directly.',
				'`shouldSkip.ai` and remote mode let tests say exactly when they exercised real inference.',
				'Local-only app work can still stub above the worker boundary without lying about the binding path.'
			],
			bestFor: 'Real inference against Workers AI models',
			authoringParagraphs: [
				'AI is a remote-oriented binding, but the first worker path should still be tiny and concrete: receive one request, call one model, return one JSON response.',
				'The Devflare-specific win is not fake local inference. It is that config, worker code, and remote test gating stay explicit enough that you know when the real platform was actually exercised.'
			],
			authoringSnippet: {
				title: 'Workers AI binding authoring',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'ai-worker',
	bindings: {
		ai: {
			binding: 'AI'
		}
	}
})`
			},
			fitBullets: [
				'Use AI when the worker should call a real Workers AI model.',
				'Keep the binding dedicated to model work instead of pretending every route needs AI by default.',
				'If the only goal is local happy-path UI wiring, use a normal fake at the app edge and reserve remote AI tests for the worker boundary.'
			],
			caveatBullets: [
				'AI is remote-oriented, so local-only test runs should not be expected to exercise real inference.',
				'Cloudflare auth and a resolvable account are part of the contract for meaningful AI tests. An explicit `accountId` helps when the target account would otherwise be ambiguous, but it is not the only way Devflare can resolve one.',
				'Because inference has cost and availability implications, it deserves more deliberate test gating than local-first bindings.'
			],
			caveatCallout: {
				tone: 'warning',
				title: 'Do not present AI as a local-first binding',
				body: [
					'The honest story is that Devflare supports the binding cleanly, but real AI behavior still requires remote infrastructure.'
				]
			}
		},
		internals: {
			readTime: '3 min read',
			summary:
				'AI has a smaller compiler story than storage bindings, but a more explicit auth and remote-runtime story.',
			description:
				'Devflare does not invent a fake local AI runtime. It compiles the binding, checks remote requirements when needed, and exposes remote helpers for tests that intentionally opt in.',
			highlights: [
				'Compiler emits the Wrangler AI binding directly.',
				'Auth checks treat AI as a remote binding with real account requirements.',
				'`createTestContext()` can inject a remote AI binding when remote mode is enabled.',
				'Test skip helpers exist specifically because AI is not a universal local path.'
			],
			normalizationFact:
				'The authored shape is small, so the important complexity lives in auth and remote enablement rather than config normalization',
			compileTarget: 'Wrangler `ai` binding',
			previewNote:
				'AI is remote-oriented; preview is less about provisioning and more about whether the worker path may call the model',
			normalizationParagraphs: [
				'AI does not need the same name-versus-id resolution dance as KV or D1. The authored shape is basically “which env binding name should exist.”',
				'The heavier implementation work lives in auth checks and remote-test setup, because the value of the binding only appears once the worker can reach real Cloudflare AI services.'
			],
			localRuntimeBullets: [
				'`checkRemoteBindingRequirements()` treats AI as a binding that requires remote account context.',
				'`createTestContext()` can inject a remote AI helper when remote mode is enabled and an account can be resolved.',
				'`Ai.gateway()` is not supported by the current remote AI test helper, so gateway-specific flows need a higher-level integration path.',
				'`shouldSkip.ai` exists so tests can say clearly when remote inference is unavailable instead of failing opaquely.'
			],
			compileBullets: [
				'Compile emits the AI binding shape directly into generated Wrangler output.',
				'Because the runtime behavior is remote-oriented, the major operational risk is not syntax — it is auth, availability, and cost control.',
				'Preview behavior is mostly about whether that worker path should call real models, not about separate preview-managed AI resources.'
			],
			callout: {
				tone: 'info',
				title: 'Honest tooling beats fake local magic',
				body: [
					'Devflare makes AI explicit and testable, but it does not pretend local emulation is equivalent to real inference.'
				]
			}
		},
		testing: {
			readTime: '4 min read',
			summary:
				'The right AI test strategy is selective: use remote mode when you mean to test inference, and skip cleanly when the environment is not allowed to do that.',
			description:
				'Trying to force AI into the same local-only expectations as KV or D1 leads to misleading tests. Devflare already gives you the right gates — use them.',
			highlights: [
				'AI tests are usually remote-mode integration tests with explicit opt-in.',
				'`shouldSkip.ai` is the intended guard for unsupported or unauthenticated environments.',
				'Keep prompts and assertions small so the test verifies the binding contract, not a giant product behavior.',
				'Local-only flows should stub above the worker boundary rather than pretending AI itself was tested.'
			],
			bestFor: 'Remote inference checks and binding-level AI smoke tests',
			defaultHarness: '`createTestContext()` after remote mode is enabled, plus `shouldSkip.ai`',
			escalation:
				'The AI call is expensive, flaky, or business-critical enough to need a separate release gate',
			paragraphs: [
				'Start with a tiny inference call and a tiny assertion. The goal is to prove that the binding works and the worker can talk to the intended model, not to test your entire AI product in one unit test.',
				'Enable remote mode first — for example with `devflare remote enable ...` or `DEVFLARE_REMOTE=1` (or another truthy value) in automation — and skip explicitly when the environment still cannot support remote AI instead of forcing the test to fail in noisy ways.'
			],
			mainSnippet: {
				title: 'A remote-oriented AI test',
				language: 'ts',
				code: String.raw`import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createTestContext, env, shouldSkip } from 'devflare/test'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

const skipAI = await shouldSkip.ai

describe.skipIf(skipAI)('AI binding', () => {
	test('runs a tiny inference request', async () => {
		const result = await env.AI.run('@cf/meta/llama-3.2-1b-instruct', {
			messages: [{ role: 'user', content: 'Reply with OK only.' }],
			max_tokens: 4
		})

		expect(result).toBeDefined()
	})
})`
			},
			helperBullets: [
				'Enable remote mode before expecting `createTestContext()` to inject a real AI binding, for example with `DEVFLARE_REMOTE=1` in automation.',
				'Use `shouldSkip.ai` to make remote prerequisites explicit in the test file itself.',
				'Keep AI assertions small enough that failures teach you about the binding path, not about prompt engineering drift.',
				'Use non-AI stubs above the worker layer when the app UI only needs a placeholder during purely local development.'
			],
			caveatBullets: [
				'Remote AI tests are not free; keep them targeted and intentional.',
				'If the worker depends on `Ai.gateway()`, test that path outside the remote AI helper because the helper warns and does not implement gateway mode.',
				'If the worker contract is business-critical, move AI smoke tests into an explicit integration or release lane rather than running them everywhere.',
				'Do not confuse local app mocks with proof that the real AI binding path works.'
			],
			callout: {
				tone: 'accent',
				title: 'Skip is not weakness here',
				body: [
					'For remote bindings, a clear skip condition is often more trustworthy than a forced local pseudo-test that never exercised the real platform.'
				]
			}
		},
		example: {
			readTime: '3 min read',
			summary:
				'This example keeps the AI story honest and useful: one binding, one tiny inference route, and one skip-aware remote smoke test.',
			description:
				'That is enough to show the Devflare value: config stays tiny, the worker code stays normal, and the test tells you clearly when remote AI was really available.',
			highlights: [
				'One model call is enough to show the shape.',
				'The example stays focused on the worker boundary, not app-level chat UX.',
				'The smoke test uses Devflare’s remote gate instead of pretending inference is local.',
				'You can stub above this route in local UI work without changing the worker contract.'
			],
			configFocus: 'Minimal binding declaration',
			runtimeShape: 'Call `env.AI.run(...)` from the worker',
			bestUse: 'Small inference endpoints and smoke checks',
			configSnippet: {
				title: 'Minimal AI config',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'ai-example',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		ai: {
			binding: 'AI'
		}
	}
})`
			},
			usageSnippet: {
				title: 'A tiny inference endpoint',
				language: 'ts',
				code: String.raw`import { env } from 'devflare/runtime'

export async function fetch(): Promise<Response> {
	const result = await env.AI.run('@cf/meta/llama-3.2-1b-instruct', {
		messages: [{ role: 'user', content: 'Reply with OK only.' }],
		max_tokens: 4
	})

	return Response.json({ result })
}`
			},
			notes: [
				'Use a cheap, small model in smoke paths unless the point is to verify a specific expensive production model.',
				'Keep local app mocks above this worker route if you need offline UI development.'
			],
			callout: {
				tone: 'accent',
				title: 'The Devflare win is the explicit remote gate',
				body: [
					'A clear skip condition is more trustworthy than a fake local AI emulator that never touched the real platform. That honesty is part of what makes the Devflare AI story usable.'
				]
			}
		}
	}
]
