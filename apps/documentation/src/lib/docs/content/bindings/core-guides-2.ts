import type { BindingGuideDefinition } from './shared'

export const bindingGuidesPart2: BindingGuideDefinition[] = [
	{
		slugBase: 'durable-object',
		label: 'Durable Objects',
		categoryDescription:
			'Stateful coordination primitives with strong local support, cross-worker wiring, and important preview caveats.',
		configKey: 'bindings.durableObjects',
		authoringShape: 'Record<string, string | { className: string; scriptName?: string }>',
		localStory: 'First-class local runtime and tests, including cross-worker references',
		sourcePages: [
			'schema-bindings.ts',
			'ref.ts',
			'do-bundler.ts',
			'simple-context.ts',
			'packages/devflare/src/cli/commands/deploy.ts'
		],
		overview: {
			readTime: '5 min read',
			title:
				'Use Durable Objects when coordination or state really belongs with a single object identity',
			summary:
				'The fast Devflare payoff is simple: put one counter object in a `do.*` file, call it from the worker, and call the same object directly in tests.',
			description:
				'Devflare auto-discovers `**/do.*.{ts,js}` by default, wires the Durable Object binding into the worker env, and lets tests use the same namespace without making you invent a fake DO harness first.',
			highlights: [
				'You can start with one `src/do.counter.ts` file and skip custom DO file-glob config entirely.',
				"Worker code can call `env.COUNTER.getByName('main').increment()` directly.",
				'Tests can call that same DO method through the default Devflare harness.',
				'Devflare still handles the bundling, generated types, and Wrangler binding shape underneath.'
			],
			bestFor:
				'Stateful sessions, locks, room state, and coordination that should not be faked as random stateless requests',
			authoringParagraphs: [
				'The easiest honest starting point is one local Durable Object class and one binding that points at it by class name.',
				'If the class lives in a `do.*` file, Devflare discovers it with the default `**/do.*.{ts,js}` pattern, so the first example does not need extra DO file config.'
			],
			authoringSnippet: {
				title: 'Start with one discovered Durable Object and one binding',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'counter-worker',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		durableObjects: {
			COUNTER: 'Counter'
		}
	},
	migrations: [
		{
			tag: 'v1',
			new_classes: ['Counter']
		}
	]
})`
			},
			fitBullets: [
				'Use Durable Objects when state or coordination should live behind one object identity, not when you merely want a fancy singleton.',
				'They are a good fit for counters, rooms, distributed locks, and request serialization.',
				'If the state is really just data you query, D1 or KV may stay simpler and easier to preview.'
			],
			caveatBullets: [
				'DO-heavy apps need extra preview care because same-worker preview URLs do not cover every real DO deployment case.',
				'`wrangler versions upload` does not currently apply Durable Object migrations, so migration-sensitive previews need a stronger plan.',
				'Test and review worker naming carefully when DO bindings cross worker boundaries.'
			],
			caveatCallout: {
				tone: 'warning',
				title: 'The preview caveat is real, not optional trivia',
				body: [
					'If previews must exercise real Durable Object behavior, branch-scoped preview workers are often safer than hoping same-worker preview URLs will be enough.'
				]
			}
		},
		internals: {
			readTime: '4 min read',
			summary:
				'Durable Object bindings normalize into a stable binding shape, compile into Wrangler `durable_objects.bindings`, and participate in Devflare’s own DO bundling path.',
			description:
				'This is one of the places where Devflare feels the most application-aware. It is not only compiling config — it is discovering DO classes, bundling them, and keeping local runtime behavior coherent.',
			highlights: [
				'String shorthand becomes `{ className }` in the normalized shape.',
				'Cross-worker bindings can carry `__ref` metadata and be resolved through the referenced worker config.',
				'DO bundling and transform steps are part of the build pipeline, not just a config pass-through.',
				'Compile emits `durable_objects.bindings` with `class_name` and optional `script_name`.'
			],
			normalizationFact:
				'Local strings, explicit objects, and cross-worker refs normalize into one DO binding model',
			compileTarget: 'Wrangler `durable_objects.bindings`',
			previewNote:
				'DO apps often need branch-scoped preview workers instead of same-worker preview URLs',
			normalizationParagraphs: [
				'DO bindings accept a string, an explicit `{ className, scriptName? }` object, or a cross-worker reference produced by `ref()`. Devflare normalizes those into one internal shape before later steps inspect them.',
				'That normalized shape is what lets config, compiler, and test-context setup all speak the same language even when a DO comes from another worker package.'
			],
			localRuntimeBullets: [
				'The local test context can auto-detect cross-worker DO refs and stand up the required multi-worker Miniflare shape for them.',
				'The DO bundler discovers classes from `files.durableObjects`, emits worker-compatible code, and even handles special cases like `@cloudflare/puppeteer` usage.',
				'Tests can use the normal DO namespace ergonomics instead of a custom fake API surface.'
			],
			compileBullets: [
				'Compile emits `class_name` and optional `script_name` for each binding, which is what Wrangler-facing output expects.',
				'Cross-worker DO references are resolved before compile output is treated as final.',
				'Preview and deploy workflows need to respect real DO migration and preview caveats instead of pretending the platform limitations disappeared.'
			],
			callout: {
				tone: 'accent',
				title: 'This is where coherent tooling matters most',
				body: [
					'If a tool cannot keep DO authoring, local runtime, and test setup coherent, DO-heavy apps get painful fast. Devflare’s value is that these pieces stay part of one story.'
				]
			}
		},
		testing: {
			readTime: '4 min read',
			summary:
				'Durable Objects are well-supported in the default Devflare harness, which means you can test real object behavior without hand-building a fake namespace first.',
			description:
				'That support extends to cross-worker DO scenarios too, as long as the config relationships are explicit. The main testing question is whether you are checking local object behavior or deployment caveats.',
			highlights: [
				'Use the default harness before inventing a custom DO mock layer.',
				'Cross-worker DO bindings can still work in the test context when `ref()` wiring is explicit.',
				'Object-level behavior can be tested locally with real namespace and direct method calls.',
				'Preview caveats still need higher-level validation.'
			],
			bestFor: 'Local stateful behavior, object methods, and cross-worker DO wiring checks',
			defaultHarness: '`createTestContext()` with the real DO namespace in `env`',
			escalation: 'The question is preview URLs, migrations, or branch-scoped deploy behavior',
			paragraphs: [
				'Start by creating the test context and calling the object through its real namespace. That proves the binding, the identity lookup, and the object behavior in one go.',
				'Keep one test close to the object semantics even if your app later wraps DO access behind services or helper modules.'
			],
			mainSnippet: {
				title: 'Testing a Durable Object through the real namespace',
				language: 'ts',
				code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, env } from 'devflare/test'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('the counter object increments', async () => {
	const counter = env.COUNTER.getByName('main')
	expect(await counter.increment()).toBe(1)
	expect(await counter.increment()).toBe(2)
	expect(await counter.getValue()).toBe(2)
})`
			},
			helperBullets: [
				'Use the real DO namespace in `env` whenever possible instead of a fake interface.',
				'If the object is reached through a route or another worker, keep a worker-level test around as well.',
				'Use cross-worker refs in config rather than loose string conventions so the test context can understand the relationship.'
			],
			caveatBullets: [
				'Local DO tests do not replace migration reviews or branch-scoped preview checks.',
				'If the real risk is deployment naming or preview topology, write a higher-level preview test instead of stretching the local harness past its job.',
				'DO apps often need stronger preview isolation than a same-worker upload path can give them.'
			],
			callout: {
				tone: 'warning',
				title: 'Separate object behavior from preview behavior',
				body: [
					'The default harness is excellent for object logic. It is not a substitute for the preview strategy decisions that DO-heavy apps still need.'
				]
			}
		},
		example: {
			readTime: '4 min read',
			summary:
				'This example shows the whole Durable Object story in the smallest useful shape: one auto-discovered object, one worker route, and one direct test.',
			description:
				'A counter is enough to show why Devflare is valuable here: you do not need custom DO glue just to get a real local loop. The same `env.COUNTER` namespace works in the worker and in tests.',
			highlights: [
				'One `do.*` file plus one binding is enough to learn the surface.',
				'The example uses Devflare’s default DO discovery pattern instead of extra file-glob ceremony.',
				'The worker can increment the object and the test can call the same object directly.',
				'The first example proves the state model without dragging in a chat app or a fake RPC layer.'
			],
			configFocus: 'Auto-discovered `do.*` file plus one DO binding',
			runtimeShape: 'Direct namespace method calls from the worker and the test harness',
			bestUse: 'Counters, room state, and small single-identity coordination examples',
			configSnippet: {
				title: 'Minimal Durable Object config using the default discovery pattern',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'do-example',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		durableObjects: {
			COUNTER: 'Counter'
		}
	},
	migrations: [
		{
			tag: 'v1',
			new_classes: ['Counter']
		}
	]
})

// Devflare auto-discovers src/do.counter.ts via the default:
// durableObjects: '**/do.*.{ts,js}'`
			},
			usageSnippet: {
				title: 'A tiny object and one worker path',
				language: 'ts',
				activeFile: 'src/fetch.ts',
				structure: [
					{ path: 'devflare.config.ts' },
					{ path: 'src', kind: 'folder' },
					{ path: 'src/do.counter.ts' },
					{ path: 'src/fetch.ts' }
				],
				files: [
					{
						path: 'src/do.counter.ts',
						language: 'ts',
						code: String.raw`import { DurableObject } from 'cloudflare:workers'

${'export'} ${'class'} ${'Counter'} extends DurableObject<DevflareEnv> {
	async increment(amount = 1): Promise<number> {
		const current = (await this.ctx.storage.get<number>('value')) ?? 0
		const next = current + amount
		await this.ctx.storage.put('value', next)
		return next
	}

	async getValue(): Promise<number> {
		return (await this.ctx.storage.get<number>('value')) ?? 0
	}
}`
					},
					{
						path: 'src/fetch.ts',
						language: 'ts',
						code: String.raw`import { env } from 'devflare/runtime'

export async function fetch(request: Request): Promise<Response> {
	const url = new URL(request.url)
	const counter = env.COUNTER.getByName('main')

	if (url.pathname === '/value') {
		return Response.json({ value: await counter.getValue() })
	}

	return Response.json({ value: await counter.increment() })
}`
					}
				],
				code: String.raw`import { env } from 'devflare/runtime'

export async function fetch(request: Request): Promise<Response> {
	const url = new URL(request.url)
	const counter = env.COUNTER.getByName('main')

	if (url.pathname === '/value') {
		return Response.json({ value: await counter.getValue() })
	}

	return Response.json({ value: await counter.increment() })
}`
			},
			notes: [
				'This tiny shape already proves that the object class, namespace, storage, and worker path are wired correctly.',
				'Once this works, richer room, session, or lock logic becomes a normal extension instead of a blind leap.'
			],
			callout: {
				tone: 'info',
				title: 'This is the valuable bit',
				body: [
					'You do not need a chat app to feel the Devflare advantage. One counter already proves that DO files, env bindings, and tests stay part of one simple loop.'
				]
			}
		}
	},
	{
		slugBase: 'queue',
		label: 'Queues',
		categoryDescription:
			'Producer and consumer bindings for background work with a strong local trigger story.',
		configKey: 'bindings.queues',
		authoringShape: '{ producers?: Record<string, string>; consumers?: QueueConsumer[] }',
		localStory: 'First-class local runtime and queue-trigger tests',
		sourcePages: [
			'schema-bindings.ts',
			'compiler.ts',
			'preview-resources.ts',
			'queue.ts',
			'case6/*'
		],
		overview: {
			readTime: '4 min read',
			title: 'Use Queues when work should happen later, in batches, or with retries',
			summary:
				'Devflare models Queue producers and consumers explicitly, which makes local tests and preview naming much easier to reason about.',
			description:
				'The config shape keeps the relationship visible: which bindings can enqueue work, which consumer handles that queue, and how retries or dead-letter behavior should look.',
			highlights: [
				'Producers and consumers are modeled in one consistent `bindings.queues` shape.',
				'Compile turns that into Wrangler producer and consumer entries.',
				'`cf.queue.trigger()` makes local queue-consumer tests straightforward.',
				'Preview lifecycle can include queue and DLQ naming when branch-specific infrastructure matters.'
			],
			bestFor: 'Background jobs, async processing, fan-out work, and controlled retry behavior',
			authoringParagraphs: [
				'Queues are easiest to understand when the producer names and consumer config live together in the same authored source of truth.',
				'That way the code review already shows who sends messages, who processes them, and where failures go when retries run out.'
			],
			authoringSnippet: {
				title: 'Queue producer and consumer authoring',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'queue-worker',
	bindings: {
		queues: {
			producers: {
				JOBS: 'jobs-queue'
			},
			consumers: [
				{
					queue: 'jobs-queue',
					deadLetterQueue: 'jobs-dlq',
					maxRetries: 3
				}
			]
		}
	}
})`
			},
			fitBullets: [
				'Use Queues when the worker should hand work off instead of blocking the original request.',
				'They are a good fit for batch processing, notifications, post-request writes, and work that deserves retry control.',
				'If the task must happen synchronously in the request path, a queue is probably the wrong tool.'
			],
			caveatBullets: [
				'Keep producer and consumer intent explicit so dead-letter and retry behavior is reviewable.',
				'Preview-scoped queues and DLQs are possible, but they should be created only when the preview really owns separate async infrastructure.',
				'Queue tests should separate handler behavior from wider route or scheduling concerns.'
			],
			caveatCallout: {
				tone: 'info',
				title: 'The queue rule of thumb',
				body: [
					'If a request can safely say “I accepted the work” before the work is complete, queues are a good candidate. If not, keep it in the request path.'
				]
			}
		},
		internals: {
			readTime: '3 min read',
			summary:
				'Queue config is compiled into explicit producer and consumer blocks, with preview resource materialization available for both queue names and DLQs.',
			description:
				'This is one of the clearer compiler paths in Devflare: producers become env bindings, consumers become worker-side queue listeners, and preview lifecycle code can materialize names when the preview should own separate queues.',
			highlights: [
				'Compiler emits Wrangler `queues.producers` and `queues.consumers`.',
				'Consumer options like retries and concurrency are converted into the output shape Wrangler expects.',
				'Preview resource logic can materialize queue names and dead-letter queues.',
				'Local queue triggers fit naturally into the Devflare test harness.'
			],
			normalizationFact:
				'Producer and consumer config is split into one normalized queue model before compile',
			compileTarget: 'Wrangler `queues.producers` and `queues.consumers`',
			previewNote:
				'Preview queue names and DLQs can be provisioned and cleaned up when the preview owns them',
			normalizationParagraphs: [
				'Devflare does not treat queue producers and queue consumers as unrelated configuration fragments. It keeps them in one coherent config namespace so later compile and preview code can see the whole story.',
				'Review and runtime stay aligned: the config already names the queue, the producer binding, the consumer, and the dead-letter relationship in one place.'
			],
			localRuntimeBullets: [
				'The local harness can stand up queue producers as real env bindings and trigger the queue handler through test helpers.',
				'Queue helper behavior is different from plain worker fetch behavior because `cf.queue.trigger()` waits for queued background work before returning.',
				'That makes queue tests a good place to assert post-processing side effects directly.'
			],
			compileBullets: [
				'Compile converts consumer options into the output shape Wrangler expects, including retry and dead-letter fields.',
				'Preview materialization can generate branch-specific queue and DLQ names when the preview environment should own separate async infrastructure.',
				'This lifecycle support covers queue resources more directly than service bindings, which mostly stay name-based references.'
			],
			callout: {
				tone: 'success',
				title: 'Queues stay reviewable when the config stays explicit',
				body: [
					'The combination of producers, consumers, and dead-letter settings is much easier to trust when it lives in one visible authored shape.'
				]
			}
		},
		testing: {
			readTime: '4 min read',
			summary:
				'Queue testing is one of the places where Devflare’s helper surface feels especially good because the queue trigger already knows how to drive the real handler shape.',
			description:
				'That means you can test a queue consumer without bootstrapping your own fake message batch or pretending the queue handler is just a random function.',
			highlights: [
				'`cf.queue.trigger()` is the normal first tool for queue-consumer tests.',
				'Queue triggers wait for background work before they return.',
				'Producer-side tests can still use the real binding through `env.JOBS.send(...)`.',
				'Use higher-level worker tests only when queueing is part of a larger route behavior.'
			],
			bestFor: 'Queue consumer behavior, retries, and queue-driven side effects',
			defaultHarness: '`createTestContext()` plus `cf.queue.trigger()`',
			escalation: 'You need to verify preview queue lifecycle or deployment topology',
			paragraphs: [
				'Start by triggering the consumer directly. That is usually the shortest path to proving retries, acknowledgements, and side effects like KV writes or database updates.',
				'If the queue is reached from an HTTP route, keep one route-level test too so the enqueue step itself stays visible.'
			],
			mainSnippet: {
				title: 'Testing a queue consumer through Devflare helpers',
				language: 'ts',
				code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, cf, env } from 'devflare/test'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('queue consumer stores a processed result', async () => {
	await cf.queue.trigger([
		{
			id: 'job-1',
			body: { id: 'task-1', type: 'process', createdAt: Date.now() }
		}
	])

	expect(await env.RESULTS.get('result:task-1')).not.toBeNull()
})`
			},
			helperBullets: [
				'Use `cf.queue.trigger()` when the consumer behavior is what you care about.',
				'Use `env.JOBS.send()` when you want to prove enqueue code in the same runtime path.',
				'Queue tests are a good place to assert retries or DLQ behavior because the helper already understands the message shape.'
			],
			caveatBullets: [
				'Queue helper success does not automatically prove your preview or deploy queue topology is right.',
				'If the route-to-queue path matters, keep one request test so the enqueue boundary stays visible.',
				'Batch semantics and failure handling deserve their own tests instead of one giant everything-at-once assertion.'
			],
			callout: {
				tone: 'accent',
				title: 'Queue tests are allowed to be direct',
				body: [
					'You do not need to sneak queue behavior behind HTTP if the queue consumer itself is the thing you want confidence in.'
				]
			}
		},
		example: {
			readTime: '3 min read',
			summary:
				'This starter example wires one producer, one consumer, and one stored result so you can see the whole queue loop without ceremony.',
			description:
				'A good queue example should prove three things quickly: the request can enqueue work, the consumer can process it, and some visible side effect confirms the work ran.',
			highlights: [
				'One producer plus one consumer is enough to learn the shape.',
				'The side effect should be visible and cheap to assert.',
				'Retries belong in tests once the happy path is working.',
				'This shape scales naturally into larger background pipelines later.'
			],
			configFocus: 'Explicit producer and consumer config',
			runtimeShape: 'Request enqueues work, queue handler stores result',
			bestUse: 'Background jobs and post-request processing',
			configSnippet: {
				title: 'Minimal queue config',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'queue-example',
	bindings: {
		kv: {
			RESULTS: 'results-kv'
		},
		queues: {
			producers: {
				JOBS: 'jobs-queue'
			},
			consumers: [
				{
					queue: 'jobs-queue'
				}
			]
		}
	}
})`
			},
			usageSnippet: {
				title: 'One fetch path and one queue consumer',
				language: 'ts',
				code: String.raw`import { env } from 'devflare/runtime'
import type { MessageBatch } from '@cloudflare/workers-types'

export async function fetch(): Promise<Response> {
	await env.JOBS.send({ id: 'job-1', createdAt: Date.now() })
	return new Response('queued', { status: 202 })
}

export async function queue(batch: MessageBatch<{ id: string }>): Promise<void> {
	for (const message of batch.messages) {
		await env.RESULTS.put('job:' + message.body.id, 'done')
		message.ack()
	}
}`
			},
			notes: [
				'Once this shape works, you can add retries, DLQs, and richer payloads without changing the fundamental loop.',
				'This example stays intentionally small so the queue contract is the thing you notice first.'
			],
			callout: {
				tone: 'info',
				title: 'Keep the first side effect visible',
				body: [
					'Writing one result record is a better first example than a complex job pipeline you cannot see end to end.'
				]
			}
		}
	}
]
