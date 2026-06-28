import type { DocPage } from '../../types'
import {
	browserBindingsStructure,
	browserConfigCode,
	browserRouteCode,
	counterObjectCode,
	counterTransportCode,
	counterValueCode,
	docsLink,
	durableObjectBindingsStructure,
	durableObjectConfigCode,
	durableObjectRouteCode,
	firstWorkerConfigCode,
	firstWorkerFetchCode,
	firstWorkerStructure,
	firstWorkerTestCode,
	r2BindingsStructure,
	r2ConfigCode,
	r2RouteCode,
	requestContextHelperCode,
	routedWorkerConfigCode,
	routedWorkerFetchCode,
	routedWorkerIndexRouteCode,
	routedWorkerStructure,
	supportCoverageTooltips
} from './shared'

export const startHereDocsPart3: DocPage[] = [
	{
		slug: 'runtime-context',
		group: 'Devflare',
		navTitle: 'Runtime context',
		readTime: '8 min read',
		eyebrow: 'Runtime helpers',
		title: 'Use runtime helpers without passing the event through every function',
		summary:
			'Use explicit event parameters at handler boundaries, then use `getFetchEvent()`, `getQueueEvent()`, `getContext()`, `env`, `ctx`, `event`, and `locals` inside helper code that runs during the same request or job.',
		description:
			'The everyday rule is simple: accept the event in the handler, pass explicit data where it is clearer, and use runtime helpers when nested helper code needs the active request, env, context, event, or request-scoped `locals`.',
		highlights: [
			'If you came here because of `getFetchEvent()`, `getQueueEvent()`, `getContext()`, `env`, `ctx`, `event`, or `locals`, you are in the right place.',
			'Prefer explicit event parameters at the handler boundary and getters inside helpers called by that handler.',
			'`env`, `ctx`, and `event` from `devflare/runtime` are readonly proxies, while `locals` is mutable request-scoped storage.',
			'Per-surface getters such as `getFetchEvent()` and `getQueueEvent()` also expose `.safe()` for nullable access.',
			'Open runtime context internals only when you are debugging helper setup or changing runtime infrastructure.'
		],
		facts: [
			{
				label: 'Main rule',
				value: 'Event at the boundary, helpers inside the same handler trail'
			},
			{
				label: 'Main helpers',
				value:
					'`getFetchEvent()`, `getQueueEvent()`, `getContext()`, `env`, `ctx`, `event`, and `locals`'
			},
			{
				label: 'Stored shape',
				value: '`env`, `ctx`, `request`, `event`, and `locals` while a handler is active'
			},
			{ label: 'Mutable lane', value: '`locals` / `event.locals`' },
			{
				label: 'Failure mode',
				value: 'Strict runtime helpers throw outside an active handler trail'
			}
		],
		sourcePages: [
			'packages/devflare/README.md',
			'context.ts',
			'context-events.ts',
			'context-types.ts',
			'exports.ts',
			'validation.ts',
			'context.test.ts',
			'exports.test.ts',
			'validation.test.ts',
			'worker-only-multi-surface-events.test.ts',
			'event-accessors.test.ts'
		],
		sections: [
			{
				id: 'helper-map',
				title: 'Pick the helper that matches where your code is running',
				paragraphs: [
					'If `getFetchEvent()` or `env.DB` works in one helper and fails in another, first check whether that code still runs during the active request, job, or Durable Object call.',
					'Use per-surface getters when the helper needs the current event, use `env` or `ctx` when a helper only needs active bindings or execution context, and use `locals` for request-scoped data shared across middleware and helper calls.'
				],
				table: {
					headers: ['Helper family', 'Examples', 'Use it for'],
					rows: [
						[
							'Per-surface getters',
							'`getFetchEvent()`, `getQueueEvent()`, `getScheduledEvent()`, `getEmailEvent()`, `getTailEvent()`',
							'Return the current rich event after verifying the active surface type; `.safe()` returns `null` instead of throwing.'
						],
						[
							'Generic context getter',
							'`getContext()`',
							'Returns the active stored context shape when one exists and throws when code is running outside an active handler trail.'
						],
						[
							'Readonly runtime proxies',
							'`env`, `ctx`, `event`',
							'Read the active environment bindings, execution context, or current event without threading parameters through every helper.'
						],
						[
							'Mutable runtime proxy',
							'`locals`',
							'Reads and writes the per-request or per-job mutable storage object attached to the active context.'
						]
					]
				},
				callouts: [
					{
						tone: 'accent',
						title: 'A practical reading guide',
						body: [
							'If the question in your head is “when can I safely call `getFetchEvent()` or read `env` without passing the event around?”, the rest of this page is answering exactly that.'
						]
					}
				]
			},
			{
				id: 'event-first',
				title: 'Start with event-first handlers and let helpers discover the active event later',
				paragraphs: [
					'Event-first handlers keep runtime state explicit at the boundary and still let nested helpers recover the current event later when plumbing it through every function call would be pure ceremony. That is the everyday job for helpers like `getFetchEvent()` and `locals`.',
					'In normal application code you should not need to establish runtime context manually. Devflare already does that for generated worker entrypoints, middleware, route dispatch, Durable Object wrappers, the dev server, and the built-in test helpers.'
				],
				snippets: [
					{
						title: 'Use the explicit event at the boundary and a getter inside the helper',
						description:
							'This keeps the handler honest while still letting helper code read the active request and shared locals later in the same call trail.',
						activeFile: 'src/fetch.ts',
						structure: [
							{ path: 'src', kind: 'folder' },
							{ path: 'src/fetch.ts' },
							{ path: 'src/lib', kind: 'folder' },
							{ path: 'src/lib/current-path.ts' }
						],
						files: [
							{
								path: 'src/fetch.ts',
								language: 'ts',
								focusLines: [[1, 11]],
								code: String.raw`import { locals, type FetchEvent } from 'devflare/runtime'
import { currentPath } from './lib/current-path'

export async function fetch(event: FetchEvent): Promise<Response> {
	event.locals.requestId = crypto.randomUUID()

	return Response.json({
		path: currentPath(),
		method: event.request.method,
		requestId: String(locals.requestId)
	})
}`
							},
							{
								path: 'src/lib/current-path.ts',
								language: 'ts',
								focusLines: [[1, 4]],
								code: String.raw`import { getFetchEvent } from 'devflare/runtime'

export function currentPath(): string {
	return getFetchEvent().url.pathname
}`
							}
						]
					}
				]
			},
			{
				id: 'runtime-context-internals-link',
				title: 'Open internals only when helper setup is the problem',
				paragraphs: [
					'The normal runtime-context page should help you write application code. Open the internals page only when you are changing runtime infrastructure, debugging helper setup, or checking how Devflare creates the active context.'
				],
				cards: [
					{
						href: docsLink('runtime-context-internals'),
						label: 'Internals',
						meta: 'Runtime context',
						title: 'Runtime context internals',
						body: 'Read the stored context shape, setup steps, and advanced helper details.'
					}
				]
			},
			{
				id: 'access-order',
				title: 'Getters and proxies are just different ways of reading the same store',
				table: {
					headers: ['API', 'What it reads', 'Failure behavior', 'Mutation'],
					rows: [
						[
							'Handler parameters',
							'The explicit event object Devflare passes to the handler boundary.',
							'No lookup needed at the boundary.',
							'`event.locals` is mutable.'
						],
						[
							'Per-surface getters like `getFetchEvent()`',
							'The stored `context.event` after Devflare verifies the active surface type.',
							'Throws `ContextAccessError`, while `.safe()` returns `null`.',
							'Readonly event view.'
						],
						[
							'`getContext()`',
							'The full active `RequestContext` object for the current handler trail.',
							'Throws `ContextAccessError` outside an active handler trail.',
							'Use this mostly for debugging or advanced infrastructure helpers.'
						],
						[
							'`env`, `ctx`, `event` proxies',
							'`getContextOrNull()` through readonly proxy wrappers.',
							'Property access throws `ContextAccessError` outside an active handler trail.',
							'Readonly.'
						],
						[
							'`locals` proxy',
							'`getContextOrNull()?.locals` through the mutable context proxy.',
							'Property access throws `ContextAccessError` outside an active handler trail.',
							'Mutable and shared with `event.locals`.'
						]
					]
				},
				paragraphs: [
					'Pass the event explicitly at the top of the stack. Reach for getters or proxies only when helper code is still running in the same handler trail and threading that event downward would make the code noisier than the value it adds.',
					'This is also why strict runtime helpers throwing outside context is healthy: it stops top-level module code and random utility calls from pretending they are running inside a request when they are not.'
				],
				callouts: [
					{
						tone: 'accent',
						title: 'A simple rule',
						body: [
							'Use explicit handler parameters first, getters second, proxies third, and mutable `locals` only for data that truly belongs to the current request or job.'
						]
					}
				]
			},
			{
				id: 'surface-coverage',
				title: 'Runtime helpers cover more than fetch',
				table: {
					headers: ['Surface', 'Event shape', 'Getter'],
					rows: [
						['HTTP worker', '`FetchEvent`', '`getFetchEvent()`'],
						['Queue consumer', '`QueueEvent`', '`getQueueEvent()`'],
						['Scheduled handler', '`ScheduledEvent`', '`getScheduledEvent()`'],
						['Inbound email', '`EmailEvent`', '`getEmailEvent()`'],
						['Tail handler', '`TailEvent`', '`getTailEvent()`'],
						['Durable Object fetch', '`DurableObjectFetchEvent`', '`getDurableObjectFetchEvent()`'],
						['Durable Object alarm', '`DurableObjectAlarmEvent`', '`getDurableObjectAlarmEvent()`'],
						[
							'Durable Object WebSocket message / close / error',
							'Dedicated WebSocket event types',
							'`getDurableObjectWebSocketMessageEvent()`, `getDurableObjectWebSocketCloseEvent()`, `getDurableObjectWebSocketErrorEvent()`'
						],
						['Any Durable Object surface', '`DurableObjectEvent`', '`getDurableObjectEvent()`']
					]
				},
				paragraphs: [
					'Worker surfaces expose `event.ctx` as the current `ExecutionContext`. Durable Object surfaces expose `event.ctx` as the current `DurableObjectState`, and Devflare also aliases that same value as `event.state` for clarity.',
					'For fetch and Durable Object fetch, Devflare augments the actual `Request` instance. For queue, scheduled, email, tail, and Durable Object WebSocket surfaces, it augments the native carrier object instead of replacing it with a fantasy wrapper.',
					'Three general-purpose utilities round out the API: `hasContext()` checks whether a context is active, `getEventContext()` returns the current event regardless of surface type, and `getEventContextOrNull()` does the same but returns `null` outside a context.'
				]
			},
			{
				id: 'locals-model',
				title: '`locals` is the mutable storage lane, and it is isolated per context',
				paragraphs: [
					'Use `locals` for auth state, derived request data, request ids, or other values that belong to the current request or job and should be shared across middleware or helper layers.',
					'Within one handler trail, `locals` and `event.locals` point at the same underlying object. Across requests and jobs, each context gets a fresh locals object so state does not bleed between invocations.'
				],
				snippets: [
					{
						title: 'Write to `event.locals`, read from `locals` later in the same trail',
						filename: 'src/fetch.ts',
						language: 'ts',
						code: String.raw`import { locals, sequence, type FetchEvent, type ResolveFetch } from 'devflare/runtime'

async function requestId(event: FetchEvent, resolve: ResolveFetch): Promise<Response> {
	event.locals.requestId = crypto.randomUUID()

	const response = await resolve(event)
	const next = new Response(response.body, response)
	next.headers.set('x-request-id', String(locals.requestId))
	return next
}

export const handle = sequence(requestId)`
					}
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Mutate `locals`, not the readonly proxies',
						body: [
							'`env`, `ctx`, and `event` are readonly runtime views. If you need shared mutable state, put it on `locals` instead of trying to assign back into the underlying context objects.'
						]
					}
				]
			},
			{
				id: 'when-context-is-missing',
				title: 'Context is not available everywhere, and that is intentional',
				bullets: [
					'Module top-level code runs at cold start, not inside a request or job, so strict runtime helpers are unavailable there.',
					'Callbacks that run after the handler trail ends should take explicit inputs instead of assuming context is still alive.',
					'Timer callbacks like `setTimeout()` and `setInterval()` are outside the normal Devflare-managed handler trail.',
					'Per-surface getters and `getContext()` throw `ContextAccessError` describing the unavailable context, while proxy property access such as `env.DB` or `locals.userId` throws `ContextAccessError` naming the missing property.',
					'If you are unsure whether the matching surface is active, prefer `.safe()` accessors such as `getFetchEvent.safe()` over catching thrown errors.',
					'If runtime context access fails unexpectedly while bypassing Devflare-generated config or harnesses, open the runtime context internals page and verify the Worker still includes the compatibility flags Devflare normally adds for you.'
				],
				callouts: [
					{
						tone: 'info',
						title: 'The fix is usually simpler than the error feels',
						body: [
							'Move the context access inside the handler, middleware, or helper that is called from that handler trail. If there is no active trail, take explicit inputs instead of hoping context exists.'
						]
					}
				]
			}
		]
	},
	{
		slug: 'runtime-context-internals',
		group: 'Devflare',
		navTitle: 'Runtime internals',
		sidebarHidden: true,
		readTime: '4 min read',
		eyebrow: 'Runtime internals',
		title: 'How Devflare establishes runtime context',
		summary:
			'This page keeps the AsyncLocalStorage mechanics out of the normal usage guide while preserving them for maintainers and advanced debugging.',
		description:
			'Use this page when helpers work in one runtime lane but not another, when you are changing runtime infrastructure, or when you need to verify exactly what Devflare stores while a handler is active.',
		highlights: [
			'Devflare stores a full request or job context while user code runs.',
			'Generated entrypoints, middleware, routes, Durable Object wrappers, the dev server, and test helpers use the same setup model.',
			'`runWithEventContext()` and `runWithContext()` are infrastructure helpers, not the normal application API.'
		],
		facts: [
			{ label: 'Audience', value: 'Maintainers and advanced runtime debugging' },
			{ label: 'Normal app page', value: '`runtime-context`' },
			{ label: 'Core primitive', value: '`AsyncLocalStorage<RequestContext>`' }
		],
		sourcePages: [
			'packages/devflare/README.md',
			'context.ts',
			'context-events.ts',
			'context-types.ts',
			'exports.ts',
			'validation.ts',
			'context.test.ts',
			'exports.test.ts',
			'validation.test.ts',
			'worker-only-multi-surface-events.test.ts',
			'event-accessors.test.ts'
		],
		sections: [
			{
				id: 'what-gets-stored',
				title: 'What Devflare stores while a handler is active',
				paragraphs: [
					'Devflare creates `AsyncLocalStorage<RequestContext>()` and stores more than the current request. The context includes environment bindings, execution context or Durable Object state, optional request, mutable locals, runtime surface type, and the original event object.',
					'That is why the higher-level runtime APIs can stay small. Per-surface getters return the stored event when the active surface matches, and the runtime proxies read the same context without forcing every helper to receive the event manually.'
				],
				snippets: [
					{
						title: 'Simplified shape of the stored runtime context',
						filename: 'src/runtime/context.ts',
						language: 'ts',
						code: String.raw`type RequestContext = {
	env: TEnv
	ctx: ExecutionContext | DurableObjectState | null
	request: Request | null
	locals: Record<string, unknown>
	type: RuntimeEventType
	event: EventContext<TEnv>
}`
					}
				],
				callouts: [
					{
						tone: 'info',
						title: 'The original event object is preserved',
						body: [
							'Devflare does not discard the richer surface event after extracting a request or context. The original event stays on `context.event`, which is what the per-surface getters read later.'
						]
					}
				]
			},
			{
				id: 'how-devflare-establishes-context',
				title: 'How Devflare creates and installs the context',
				paragraphs: [
					'For fetch, queue, scheduled, email, tail, and Durable Object surfaces, Devflare first creates a rich event object using helpers such as `createFetchEvent()`, `createQueueEvent()`, or the Durable Object event builders. It then builds a `RequestContext` from that event and runs the handler trail inside `storage.run(...)`.',
					'The same mechanism is reused by generated worker entrypoints, request-wide middleware, route resolution, Durable Object wrappers, the dev server, and `createTestContext()` helpers such as `cf.worker`, `cf.queue`, `cf.scheduled`, `cf.email`, and `cf.tail`.'
				],
				steps: [
					'Devflare builds the rich event object for the active surface.',
					'It creates a `RequestContext` from `event.env`, `event.ctx`, `event.request ?? null`, `event.locals`, `event.type`, and the original event object.',
					'It runs middleware, route resolution, or the surface handler inside `AsyncLocalStorage` with that context.',
					'Helpers call getters or proxies, which read the current store instead of receiving the event manually.',
					'When the handler trail ends, strict runtime helpers stop exposing context.'
				],
				snippets: [
					{
						title: 'The important part of `runWithEventContext()` is intentionally small',
						filename: 'src/runtime/context.ts',
						language: 'ts',
						code: String.raw`const context = {
	env: event.env,
	ctx: event.ctx,
	request: event.request ?? null,
	locals: event.locals,
	type: event.type,
	event
}

return storage.run(context, fn)`
					}
				]
			},
			{
				id: 'advanced-helpers',
				title: '`runWithEventContext()` and `runWithContext()` are infrastructure helpers',
				paragraphs: [
					'By the time you are considering these helpers, the normal app-facing story should already be working: handlers, middleware, generated entrypoints, and `createTestContext()` establish context for you. These APIs exist for runtime and test infrastructure that must preserve or synthesize that context deliberately.',
					'`runWithEventContext(event, fn)` preserves an existing rich event object. `runWithContext(env, ctx, request, fn, type)` is the lower-level compatibility helper: it creates fresh locals, synthesizes a default event with `createDefaultEvent()`, and then stores that event before running your function.'
				],
				snippets: [
					{
						title: 'Wrap one infrastructure assertion with an existing event',
						filename: 'src/test/runtime-context.ts',
						language: 'ts',
						code: String.raw`import { getFetchEvent, runWithEventContext, type FetchEvent } from 'devflare/runtime'

export async function readPathInsideContext(event: FetchEvent): Promise<string> {
	return runWithEventContext(event, async () => {
		return getFetchEvent().url.pathname
	})
}`
					}
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Do not reach for the escape hatch by habit',
						body: [
							'If you are writing app code instead of runtime or test infrastructure, pass the event into your handler and let Devflare establish the context automatically.'
						]
					}
				]
			}
		]
	},
	{
		slug: 'http-routing',
		group: 'Devflare',
		navTitle: 'Routing',
		readTime: '6 min read',
		eyebrow: 'HTTP layer',
		title: 'Split request-wide middleware from route leaves so HTTP stays easy to read',
		summary:
			'Use `src/fetch.ts` for request-wide behavior, `src/routes/**` for leaf handlers, and `files.routes` when you need a custom root, prefix, or route-only app.',
		description:
			'Devflare gives you a request-wide fetch entry and a built-in file router. The safest mental model is simple: keep broad middleware in `src/fetch.ts`, keep URL-specific behavior in `src/routes/**`, and reach for `files.routes` when the route tree needs custom mounting rules.',
		highlights: [
			'`src/fetch.ts` is for whole-app middleware, not leaf business logic.',
			'`src/routes/**` can be auto-discovered, remapped with `files.routes`, or disabled with `files.routes: false`.',
			'Same-module method handlers in `src/fetch.ts` take precedence before the matched route file runs.',
			'`files.routes` is app routing config, not Cloudflare deployment `routes`.'
		],
		facts: [
			{
				label: 'Best for',
				value: 'HTTP apps that need middleware, route params, or a mounted route tree'
			},
			{
				label: 'Primary order',
				value: '`src/fetch.ts` → same-module methods → matched route file'
			},
			{ label: 'Route config', value: '`files.routes`' }
		],
		sourcePages: [
			'README.md',
			'packages/devflare/README.md',
			'packages/devflare/src/config/schema.ts',
			'packages/devflare/src/test/simple-context.ts'
		],
		sections: [
			{
				id: 'two-layers',
				title: 'Two HTTP layers by design',
				cards: [
					{
						title: '`src/fetch.ts`',
						body: 'Use it for request-wide behavior that should apply before or after the final leaf handler runs.'
					},
					{
						title: '`src/routes/**`',
						body: 'Use it for specific URL handlers so the file tree mirrors the URLs you serve.'
					}
				],
				paragraphs: [
					'If `src/fetch.ts` exports `fetch` or `handle`, that module becomes the primary HTTP entry. Inside `resolve(event)`, Devflare checks same-module method handlers first and then dispatches to the matched route file when needed.',
					'That ordering is what lets middleware stay global while route files remain the clean leaf-handler story.'
				],
				steps: [
					'Devflare enters through `src/fetch.ts` when that file exports `fetch` or `handle`.',
					'Inside `resolve(event)`, exact same-module HTTP method handlers such as `GET` or `POST` are checked first, `HEAD` falls back to `GET` with an empty body, and `ALL` is the last module-local fallback.',
					'If no same-module method handler answers the request, Devflare falls through to the matched route file.',
					'Devflare computes route params before request-wide middleware continues, so `event.params` is available to both outer middleware and the leaf handler.'
				]
			},
			{
				id: 'middleware-pattern',
				title: 'Use middleware for broad concerns, not leaf business logic',
				snippets: [
					{
						title: 'Keep the middleware file and the leaf route side by side',
						description:
							'The global file owns request-wide behavior. The route file owns one URL. When those stay separate, the whole HTTP layer stays readable.',
						activeFile: 'src/fetch.ts',
						structure: [
							{ path: 'src', kind: 'folder' },
							{ path: 'src/fetch.ts' },
							{ path: 'src/routes', kind: 'folder' },
							{ path: 'src/routes/users', kind: 'folder' },
							{ path: 'src/routes/users/[id].ts' }
						],
						files: [
							{
								path: 'src/fetch.ts',
								language: 'ts',
								focusLines: [[4, 18]],
								code: String.raw`import { sequence } from 'devflare/runtime'
import type { FetchEvent, ResolveFetch } from 'devflare/runtime'

async function cors(event: FetchEvent, resolve: ResolveFetch): Promise<Response> {
	if (event.request.method === 'OPTIONS') {
		return new Response(null, {
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
			}
		})
	}

	const response = await resolve(event)
	const next = new Response(response.body, response)
	next.headers.set('Access-Control-Allow-Origin', '*')
	return next
}

export const handle = sequence(cors)`
							},
							{
								path: 'src/routes/users/[id].ts',
								language: 'ts',
								focusLines: [[2, 5]],
								code: String.raw`import type { FetchEvent } from 'devflare/runtime'

export async function GET(event: FetchEvent): Promise<Response> {
	return Response.json({ id: event.params.id })
}`
							}
						]
					}
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Keep the split clean',
						body: [
							'If a piece of logic only matters for one URL, it probably belongs in a route file, not in global middleware.'
						]
					}
				]
			},
			{
				id: 'route-only-apps',
				title: 'Route-only apps are valid when you do not need global middleware',
				paragraphs: [
					'You do not need `src/fetch.ts` just to use the file router. If every concern is leaf-local, a route tree on its own is a clean supported shape.',
					'That is especially useful for small APIs where a mounted route prefix matters more than request-wide middleware.'
				],
				snippets: [
					{
						title: 'Mount a route tree under `/api` without a `src/fetch.ts` file',
						description:
							'Explicit `files.routes` keeps the route root and prefix obvious in code review while the app stays route-only.',
						activeFile: 'devflare.config.ts',
						structure: [
							{ path: 'devflare.config.ts' },
							{ path: 'src', kind: 'folder' },
							{ path: 'src/routes', kind: 'folder' },
							{ path: 'src/routes/users', kind: 'folder' },
							{ path: 'src/routes/users/[id].ts' }
						],
						files: [
							{
								path: 'devflare.config.ts',
								language: 'ts',
								focusLines: [[3, 9]],
								code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'users-api',
	files: {
		routes: {
			dir: 'src/routes',
			prefix: '/api'
		}
	}
})`
							},
							{
								path: 'src/routes/users/[id].ts',
								language: 'ts',
								focusLines: [[1, 5]],
								code: String.raw`import type { FetchEvent } from 'devflare/runtime'

export async function GET({ params }: FetchEvent): Promise<Response> {
	return Response.json({ id: params.id })
}`
							}
						]
					}
				],
				callouts: [
					{
						tone: 'info',
						title: 'Start route-only when the app really is route-only',
						body: [
							'Skip `src/fetch.ts` until you genuinely need request-wide auth, logging, CORS, or response shaping. Add the global file later; the route tree stays valid.'
						]
					}
				]
			},
			{
				id: 'route-config',
				title: 'Use `files.routes` to remap, prefix, or disable the route tree',
				table: {
					headers: ['Shape', 'What it does'],
					rows: [
						['Omit `files.routes`', '`src/routes` is auto-discovered when that directory exists.'],
						[
							"`{ dir: 'app-routes' }`",
							'Changes the route root without changing the rest of the routing model.'
						],
						[
							"`{ dir: 'src/routes', prefix: '/api' }`",
							'Mounts discovered routes under a fixed prefix such as `/api`.'
						],
						['`false`', 'Disables file-route discovery entirely.']
					]
				},
				paragraphs: [
					'`files.routes` is app routing config. It controls how Devflare discovers and mounts route modules inside the Worker package.',
					'It is not the same thing as top-level Cloudflare deployment `routes`, which decide which hostnames and path patterns reach the Worker in the first place.'
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Do not blur app routing and deployment routing',
						body: [
							'If you are choosing files inside your Worker, you want `files.routes`. If you are deciding which traffic reaches the Worker at all, you want top-level Cloudflare `routes`.'
						]
					}
				]
			},
			{
				id: 'route-semantics',
				title: 'Specificity and guardrails matter once the tree grows',
				table: {
					headers: ['Filename', 'Meaning'],
					rows: [
						['`src/routes/index.ts`', 'Matches `/`.'],
						['`src/routes/users/[id].ts`', 'Matches `/users/:id` and exposes `event.params.id`.'],
						[
							'`src/routes/blog/[...slug].ts`',
							'Matches one-or-more trailing segments and exposes `slug` as joined path text.'
						],
						[
							'`src/routes/docs/[[...slug]].ts`',
							'Matches both the directory root and deeper optional rest paths.'
						]
					]
				},
				bullets: [
					'Static routes beat dynamic routes, dynamic routes beat rest routes, and optional rest routes are checked last.',
					'`src/routes/users/[id].ts` and `src/routes/users/[slug].ts` normalize to the same pattern and are rejected as conflicts.',
					'Files or directories beginning with `_` are ignored so route-local helpers can live beside handlers.',
					'`HEAD` falls back to `GET` if you do not export a dedicated `HEAD` handler.',
					'Route modules can use HTTP method exports, or a primary `fetch` / `handle` export, just like the fetch module.'
				],
				callouts: [
					{
						tone: 'accent',
						title: 'Conflict errors are a feature, not a nuisance',
						body: [
							'If two files normalize to the same route pattern, Devflare rejects the tree instead of guessing. That makes route review boring in the best possible way.'
						]
					}
				]
			}
		]
	}
]
