import type { BindingGuideDefinition } from './shared'

export const bindingGuidesPart1: BindingGuideDefinition[] = [
	{
		slugBase: 'kv',
		label: 'KV',
		categoryDescription:
			'Fast lookup state, cache-like reads, and lightweight shared data with strong local support.',
		configKey: 'bindings.kv',
		authoringShape: 'Record<string, string | { name: string } | { id: string }>',
		localStory: 'First-class local runtime and tests',
		sourcePages: [
			'schema-bindings.ts',
			'schema-normalization.ts',
			'resource-resolution.ts',
			'simple-context.ts',
			'apps/testing/*'
		],
		overview: {
			readTime: '4 min read',
			title: 'Use KV for fast lookup state without losing a real local loop',
			summary:
				'KV bindings are first-class in Devflare: author stable names in config, keep env typed, and run real get or put flows locally.',
			description:
				'Devflare lets you keep KV intent human-readable in `devflare.config.ts` and only resolve opaque namespace ids when build or deploy flows actually need them.',
			highlights: [
				'String shorthand and `{ name }` keep namespace intent readable in source.',
				'`createTestContext()` wires KV into the real env contract used by worker code.',
				'Preview-scoped KV names can be materialized and lifecycle-managed automatically.',
				'`devflare types` keeps `env.d.ts` aligned with the bindings you actually declared.'
			],
			bestFor: 'Cache-like lookups, sessions, feature flags, and lightweight request metadata',
			authoringParagraphs: [
				'KV is happiest when you keep the namespace name stable in authored config and let Devflare resolve ids later. That keeps reviews readable and avoids hiding infrastructure intent in random environment variables.',
				'When you truly already know the namespace id, Devflare accepts that too. The important part is that both shapes compile down to the same deploy-facing contract.'
			],
			authoringSnippet: {
				title: 'KV authoring with stable names or explicit ids',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'kv-worker',
	bindings: {
		kv: {
			CACHE: 'cache-kv',
			SESSIONS: { name: 'sessions-kv' },
				REPORTING_CACHE: { id: 'kv-namespace-id' }
		}
	}
})`
			},
			fitBullets: [
				'Reach for KV when reads are by key and you do not need relational queries.',
				'It is a good home for feature flags, lightweight session markers, or cache records that are cheap to recompute.',
				'If you need SQL, batch transactions, or richer query patterns, use D1 instead of forcing KV to act like a database.'
			],
			caveatBullets: [
				'Rerun `devflare types` after adding or renaming a binding so the generated env contract stays honest.',
				'Preview-scoped names work well for namespace-per-branch flows, but they are still a naming strategy worth reviewing.',
				'KV is local-friendly, but account-level provisioning behavior still belongs in build, preview, or deploy checks when the lifecycle matters.'
			],
			caveatCallout: {
				tone: 'info',
				title: 'The safest authoring instinct',
				body: [
					'Prefer stable names in source and let Devflare resolve ids later. It keeps config readable without giving up deploy-ready output.'
				]
			}
		},
		internals: {
			readTime: '3 min read',
			summary:
				'KV goes through the full Devflare pipeline: normalize authoring, resolve names when needed, then compile to Wrangler output.',
			description:
				'The important detail is that Devflare does not force ids too early. It keeps stable names readable in source and only turns them into deploy-ready output in flows that truly require it.',
			highlights: [
				'String shorthand is treated as a stable namespace name.',
				'Name-based bindings stay name-based until a build or deploy flow resolves them.',
				'Local runtime can wire KV without Cloudflare lookup when all you need is a local namespace identifier.',
				'Compile emits Wrangler-compatible `kv_namespaces`.'
			],
			normalizationFact: 'String and `{ name }` forms both normalize to name-based bindings first',
			compileTarget: 'Wrangler `kv_namespaces`',
			previewNote: 'Preview-scoped KV namespaces can be provisioned and cleaned up automatically',
			normalizationParagraphs: [
				'`bindings.kv` accepts a plain string, `{ name }`, or `{ id }`. Devflare normalizes those into one internal shape so later code can reason about them consistently.',
				'Authored config can stay human-readable without making compiler or deploy code guess what each record means at the last second.'
			],
			localRuntimeBullets: [
				'Local runtime resolution can keep the configured name as the local namespace identifier instead of forcing a Cloudflare API lookup.',
				'The env proxy supports the real KV methods you expect in worker code, including `get`, `put`, `delete`, `list`, and `getWithMetadata`.',
				'If you only need isolated unit tests, the repo also exposes `createMockKV()` and `createMockEnv()` helpers.'
			],
			compileBullets: [
				'Build and deploy flows resolve stable namespace names into ids when the output must be Wrangler-ready.',
				'If unresolved name-based KV bindings remain at compile time, Devflare rejects the config instead of silently guessing.',
				'Preview-scoped KV names are treated as lifecycle-managed resources, so branch-specific namespaces can be provisioned and cleaned up deliberately.'
			],
			callout: {
				tone: 'success',
				title: 'Why the split matters',
				body: [
					'Authored config can stay stable and readable even though deploy output eventually needs concrete ids. That separation is a big part of why KV feels pleasant in Devflare.'
				]
			}
		},
		testing: {
			readTime: '4 min read',
			summary:
				'Use the default test harness first. KV is one of the bindings Devflare supports best in local tests.',
			description:
				'When you call `createTestContext()`, KV namespaces are wired into the same env contract your worker code uses. That lets you test reads and writes without inventing a fake abstraction first.',
			highlights: [
				'`createTestContext()` is usually enough for meaningful KV tests.',
				'Use `env.CACHE` directly for fast binding-focused checks.',
				'Use `cf.worker.fetch()` when the binding matters as part of a route or handler flow.',
				'Mock helpers exist, but the default local harness is usually better.'
			],
			bestFor: 'Worker tests that read and write real KV values through the local harness',
			defaultHarness: '`createTestContext()` plus `env.CACHE` or `cf.worker.fetch()`',
			escalation: 'You need to verify provisioning, preview naming, or account-side behavior',
			paragraphs: [
				'Start small: create the test context, write a value, read it back, and only then move outward to HTTP or queue-driven flows.',
				'If the binding matters because a route uses it, test through that route. If the binding itself is the thing you are verifying, talk to `env.CACHE` directly.'
			],
			mainSnippet: {
				title: 'Testing KV through the real Devflare env',
				language: 'ts',
				code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, env } from 'devflare/test'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('stores and reads a cache value', async () => {
	await env.CACHE.put('feature:search', 'on')
	expect(await env.CACHE.get('feature:search')).toBe('on')
})`
			},
			helperBullets: [
				'Use `env.CACHE` or the specific KV binding directly when you want the shortest binding-focused assertion.',
				'Use `cf.worker.fetch()` if the behavior only matters once a request has gone through your real handler.',
				'Use `createMockKV()` only when the test truly should not boot the runtime-shaped harness.'
			],
			caveatBullets: [
				'Local KV tests are excellent for behavior and shape, but they do not replace deploy-time checks for account provisioning or preview cleanup.',
				'If a test is really about routing, auth, or caching headers, keep the assertion at the worker level instead of overfocusing on the namespace API.',
				'Preview-specific namespace naming is worth one dedicated integration check when branch isolation matters.'
			],
			callout: {
				tone: 'accent',
				title: 'A good default split',
				body: [
					'Test binding semantics locally and test lifecycle semantics in preview or deploy-oriented paths. Trying to make one test do both usually makes it worse at each job.'
				]
			}
		},
		example: {
			readTime: '3 min read',
			summary: 'This example keeps KV simple: one binding, one fetch handler, one assertion.',
			description:
				'The fastest way to trust a binding is to wire one small use case end to end before you hide it behind a bigger app.',
			highlights: [
				'One binding in config is enough to learn the shape.',
				'A simple `put()` plus `get()` route already proves the local story.',
				'The first version should be about clarity, not cache invalidation genius.',
				'You can keep this same pattern while the app grows.'
			],
			configFocus: 'Stable namespace naming',
			runtimeShape: 'Direct `put()` and `get()` calls in a fetch handler',
			bestUse: 'A tiny cache or session-marker flow',
			configSnippet: {
				title: 'Minimal KV config',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'kv-example',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		kv: {
			CACHE: 'cache-kv'
		}
	}
})`
			},
			usageSnippet: {
				title: 'A tiny fetch handler that uses KV',
				language: 'ts',
				code: String.raw`import { env } from 'devflare/runtime'

export async function fetch(request: Request): Promise<Response> {
	const url = new URL(request.url)

	if (url.pathname === '/write') {
		await env.CACHE.put('hello', 'from-kv')
		return new Response('stored')
	}

	return new Response((await env.CACHE.get('hello')) ?? 'missing')
}`
			},
			notes: [
				'Run `devflare types` once the binding exists so `env.CACHE` is typed in both worker code and tests.',
				'Prefer a tiny route like this before you wrap KV behind a helper or service layer.'
			],
			callout: {
				tone: 'info',
				title: 'Start with the boring shape',
				body: [
					'If the first KV example already feels abstract, it is probably hiding the actual binding semantics instead of teaching them.'
				]
			}
		}
	},
	{
		slugBase: 'd1',
		label: 'D1',
		categoryDescription:
			'SQLite-style relational queries with a strong local harness and id or name-based authoring.',
		configKey: 'bindings.d1',
		authoringShape: 'Record<string, string | { name: string } | { id: string }>',
		localStory: 'First-class local runtime and tests',
		sourcePages: [
			'schema-bindings.ts',
			'schema-normalization.ts',
			'resource-resolution.ts',
			'simple-context.ts',
			'case18/*'
		],
		overview: {
			readTime: '4 min read',
			title: 'Use D1 when the worker wants real queries instead of key-value tricks',
			summary:
				'D1 gets the same stable-name authoring story as KV, but the runtime shape is relational: `prepare`, `batch`, `exec`, and prepared statements.',
			description:
				'Devflare keeps D1 readable in config and testable in local runtime, which means you can model actual query behavior before you wire up preview or deploy steps.',
			highlights: [
				'String shorthand means a stable database name, not a magic hidden id.',
				'Local runtime supports the D1 methods developers actually use in worker code.',
				'Build and deploy can resolve names to ids when they need Wrangler-ready output.',
				'Preview-scoped D1 names can be lifecycle-managed when branch isolation matters.'
			],
			bestFor: 'Structured data, SQL queries, and cases where key-based lookup is not enough',
			authoringParagraphs: [
				'D1 follows the same stable-name instinct as KV: author by readable name unless you intentionally already have a database id you want to pin to.',
				'That gives teams one repeatable review habit: look for human-meaningful names in source, then inspect generated or resolved output only when a deploy flow needs it.'
			],
			authoringSnippet: {
				title: 'D1 binding authoring',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'd1-worker',
	bindings: {
		d1: {
			DB: 'app-db',
			AUDIT: { name: 'audit-db' },
				REPORTING: { id: 'd1-database-id' }
		}
	}
})`
			},
			fitBullets: [
				'Use D1 when the worker needs SQL, joins, or a schema that should be queried instead of fetched by a single key.',
				'It fits better than KV for records that need filtering, ordering, or transactional updates.',
				'If the only operation is key lookup or a tiny cache record, KV usually stays simpler.'
			],
			caveatBullets: [
				'Run `devflare types` after binding changes so the database bindings show up correctly in `env.d.ts`.',
				'Preview-scoped databases are useful when branch data must stay isolated, but they should still be provisioned and cleaned up deliberately.',
				'Name-based D1 authoring is readable, but build and deploy still need a path that resolves those names to ids before output is treated as final.'
			],
			caveatCallout: {
				tone: 'info',
				title: 'Do not hide the database shape',
				body: [
					'The point of D1 docs is to keep SQL visible enough that reviewers can still understand what the worker is doing, not to hide every query behind framework glue.'
				]
			}
		},
		internals: {
			readTime: '3 min read',
			summary:
				'D1 uses the same normalize-then-resolve pattern as KV, but compiles to Wrangler `d1_databases` and exposes a relational local runtime surface.',
			description:
				'The key implementation detail is that Devflare can keep a stable database name around until a flow truly needs the real database id. That keeps config readable without giving up deploy precision.',
			highlights: [
				'String shorthand and `{ name }` both normalize to name-based D1 bindings first.',
				'Local runtime can wire D1 without forcing Cloudflare lookups up front.',
				'Compile emits `d1_databases` after resolution.',
				'Prepared statements, `batch()`, and `exec()` are all part of the supported local runtime story.'
			],
			normalizationFact:
				'Name-based authoring stays name-based until a build or deploy flow resolves it',
			compileTarget: 'Wrangler `d1_databases`',
			previewNote: 'Preview-scoped D1 databases can be provisioned and cleaned up by Devflare',
			normalizationParagraphs: [
				'Like KV, D1 bindings normalize into one internal shape so compiler and runtime code do not need to special-case string versus object authoring everywhere.',
				'That normalized form is what lets Devflare keep the friendly source-of-truth shape while still generating strict Wrangler-facing output later.'
			],
			localRuntimeBullets: [
				'The local bridge exposes the D1 APIs people actually use: `prepare()`, `batch()`, `exec()`, and the prepared-statement helpers like `first`, `all`, `run`, and `raw`.',
				'`createTestContext()` can boot those bindings without a custom mock layer, which is why D1 tests can stay close to production query code.',
				'If you only need isolated unit tests, `createMockD1()` exists, but it is usually weaker than the full runtime-shaped harness.'
			],
			compileBullets: [
				'Build and deploy resolve name-based D1 records to real database ids before Devflare emits compiled config.',
				'Compile rejects unresolved name-based D1 bindings instead of silently producing half-finished Wrangler output.',
				'Preview resource management can create and later remove branch-specific D1 databases when the preview model truly owns separate data.'
			],
			callout: {
				tone: 'success',
				title: 'Same authoring rule, different runtime shape',
				body: [
					'The config story is close to KV, but the runtime story is SQL-shaped — as it should be.'
				]
			}
		},
		testing: {
			readTime: '4 min read',
			summary:
				'D1 is one of the easiest bindings to test meaningfully with Devflare because the local runtime already speaks the same database API your worker uses.',
			description:
				'Start with `createTestContext()`, then either query the database directly through `env.DB` or exercise it through your real routes. Both are normal, not exotic.',
			highlights: [
				'Use the local harness before you build fake database abstractions.',
				'`env.DB.prepare(...).first()` is already a good binding test.',
				'Worker-level tests are better when SQL behavior only matters through an HTTP or queue path.',
				'Escalate to integration only when schema migrations or account-side provisioning are the real question.'
			],
			bestFor: 'Query behavior, route-level database flows, and schema-aware worker tests',
			defaultHarness: '`createTestContext()` with `env.DB` or `cf.worker.fetch()`',
			escalation: 'You need migration, provisioning, or branch-scoped preview verification',
			paragraphs: [
				'The cleanest D1 test loop mirrors how the worker really behaves: boot the test context, run a small query, and assert the returned row or route result.',
				'If a helper wraps the query logic, keep one direct database test around anyway so the underlying binding contract stays visible.'
			],
			mainSnippet: {
				title: 'A tiny D1 test through the local harness',
				language: 'ts',
				code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, env } from 'devflare/test'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('D1 answers a simple health query', async () => {
	const row = await env.DB.prepare('select 1 as ok').first<{ ok: number }>()
	expect(row?.ok).toBe(1)
})`
			},
			helperBullets: [
				'Use `env.DB` when the binding itself is the thing you care about.',
				'Use `cf.worker.fetch()` when the database matters because a route, queue consumer, or other handler reaches it.',
				'Keep the schema setup close to the test when possible so the query story stays visible.'
			],
			caveatBullets: [
				'Local tests are excellent for query logic, but they are not a substitute for migration review or account-side database provisioning checks.',
				'If the assertion is really about a business route, do not collapse the entire behavior down to one raw SQL assertion and pretend that is the full story.',
				'Preview-specific D1 isolation is worth its own higher-level check when branch data boundaries matter.'
			],
			callout: {
				tone: 'warning',
				title: 'Do not let SQL disappear into helper fog',
				body: [
					'One reason D1 feels good in Devflare is that the runtime API is still recognizable. Keep at least one test close enough to see the actual query behavior.'
				]
			}
		},
		example: {
			readTime: '3 min read',
			summary:
				'This starter example keeps D1 focused on one job: answer a single query and prove the binding works locally.',
			description:
				'You do not need a giant ORM story to prove D1 is wired correctly. One table-shaped query is already enough to make the point.',
			highlights: [
				'One binding plus one query proves the setup.',
				'The same shape scales into larger route handlers later.',
				'Keep SQL visible in the example so the binding story stays honest.',
				'If the app grows, you can still keep one tiny D1 route as a smoke path.'
			],
			configFocus: 'Stable database naming',
			runtimeShape: 'Prepared statement query in a fetch handler',
			bestUse: 'Health checks, small lookup routes, and early schema experiments',
			configSnippet: {
				title: 'Minimal D1 config',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'd1-example',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		d1: {
			DB: 'app-db'
		}
	}
})`
			},
			usageSnippet: {
				title: 'A tiny route that proves the binding works',
				language: 'ts',
				code: String.raw`import { env } from 'devflare/runtime'

export async function fetch(): Promise<Response> {
	const row = await env.DB.prepare('select 1 as ok').first<{ ok: number }>()
	return Response.json({ ok: row?.ok === 1 })
}`
			},
			notes: [
				'You can replace the health query with a real table lookup later without changing the binding shape.',
				'Keep one route like this around if you want a cheap deploy smoke path for D1.'
			],
			callout: {
				tone: 'info',
				title: 'The first example does not need a migration epic',
				body: [
					'Prove the binding first. Add richer schema setup only after the worker already has one truthful D1 path.'
				]
			}
		}
	},
	{
		slugBase: 'r2',
		label: 'R2',
		categoryDescription:
			'Object storage bindings with strong local support and one important rule: do not assume a browser URL contract.',
		configKey: 'bindings.r2',
		authoringShape: 'Record<string, string>',
		localStory: 'First-class local runtime and tests',
		sourcePages: [
			'schema-bindings.ts',
			'compiler.ts',
			'simple-context.ts',
			'packages/devflare/src/test/simple-context.ts',
			'apps/testing/*'
		],
		overview: {
			readTime: '4 min read',
			title: 'Use R2 for object storage, but route browser delivery deliberately',
			summary:
				'R2 is straightforward in config and well-supported locally, but browser-facing delivery should usually go through a Worker route instead of assuming bucket URLs.',
			description:
				'Devflare treats R2 as a first-class binding in worker code and tests. The main discipline is deciding which files are public, which are private, and which paths should stay app-controlled.',
			highlights: [
				'R2 authoring is intentionally simple: binding name to bucket name.',
				'Local runtime supports `head`, `get`, `put`, `delete`, and `list`.',
				'Preview-scoped bucket names can be materialized and lifecycle-managed.',
				'Devflare does not promise a stable browser-facing local bucket URL contract.'
			],
			bestFor: 'Files, uploads, generated assets, and private object delivery through a Worker',
			authoringParagraphs: [
				'R2 is the least ambiguous storage binding to author: you bind a name in env to a bucket name in config.',
				'The real architectural choice is not the config key. It is whether the browser talks to a public bucket, a signed upload path, or a worker-controlled route that checks auth first.'
			],
			authoringSnippet: {
				title: 'R2 binding authoring',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'r2-worker',
	bindings: {
		r2: {
			ASSETS: 'assets-bucket',
			PRIVATE_FILES: 'private-files-bucket'
		}
	}
})`
			},
			fitBullets: [
				'Use R2 for large objects, uploads, or file delivery that does not belong in D1 or KV.',
				'Keep private file delivery in a Worker route so auth and response headers stay under your control.',
				'If the browser needs a direct public asset origin, use a public bucket on a custom domain rather than by accident.'
			],
			caveatBullets: [
				'Do not assume local bucket URLs are a public contract your app can safely depend on.',
				'Use `devflare types` after binding changes so bucket names show up correctly in `env.d.ts`.',
				'Preview-scoped buckets are useful, but they should still be cleaned up intentionally when previews expire.'
			],
			caveatCallout: {
				tone: 'warning',
				title: 'The browser-delivery rule',
				body: [
					'If the browser needs the file in local dev, route through your worker unless you intentionally chose a public bucket contract.'
				]
			}
		},
		internals: {
			readTime: '3 min read',
			summary:
				'R2 is simpler than KV or D1 because the authored value is already the bucket name, so there is no name-versus-id resolution dance.',
			description:
				'That simplicity is part of why R2 feels predictable in Devflare. The runtime and compiler story mostly focuses on wiring methods and generated output cleanly, not on translating names into ids.',
			highlights: [
				'`bindings.r2` is just a record of binding name to bucket name.',
				'Compile emits Wrangler `r2_buckets` directly.',
				'The bridge supports the core object methods and can move large puts over HTTP when needed.',
				'Preview-scoped bucket names are part of the managed preview resource story.'
			],
			normalizationFact: 'There is no separate id-resolution phase for the authored bucket name',
			compileTarget: 'Wrangler `r2_buckets`',
			previewNote: 'Preview-scoped buckets can be provisioned and cleaned up by Devflare',
			normalizationParagraphs: [
				'R2 is one of the cleanest bindings internally because the authored string is already the thing Wrangler expects later: the bucket name.',
				'That means Devflare mostly needs to preserve the mapping faithfully, generate output, and expose the runtime methods cleanly in local mode.'
			],
			localRuntimeBullets: [
				'The local bridge supports `head`, `get`, `put`, `delete`, and `list` on R2 buckets.',
				'Large `put()` operations can switch to HTTP transfer inside the bridge rather than trying to force every object body through one RPC path.',
				'`createMockR2()` exists for isolated tests, but the real local harness is usually the better default.'
			],
			compileBullets: [
				'Compile emits `r2_buckets` directly from the authored mapping.',
				'Preview resource lifecycle code can materialize branch-scoped bucket names, provision them, and later clean them up.',
				'The browser URL story is intentionally left to your app architecture rather than being smuggled into the binding implementation.'
			],
			callout: {
				tone: 'info',
				title: 'Simple binding, nontrivial delivery choices',
				body: [
					'R2 config is easy. The interesting decisions are about how files flow through your app, not about how many nested objects the config needs.'
				]
			}
		},
		testing: {
			readTime: '4 min read',
			summary:
				'R2 is local-friendly, which means you can test real object operations without inventing a storage adapter just to get off the ground.',
			description:
				'Use the runtime-shaped harness for direct bucket tests, then move up to worker-level tests when headers, auth, or file routing matter.',
			highlights: [
				'Bucket operations work through the local harness.',
				'Worker-level tests are the right place for auth or response-header behavior.',
				'The local story is strong, but public asset delivery still needs architectural intent.',
				'Use preview or deploy checks when the real question is bucket provisioning or cleanup.'
			],
			bestFor: 'Object reads, writes, deletes, and route-level file-serving checks',
			defaultHarness: '`createTestContext()` with `env.ASSETS` or `cf.worker.fetch()`',
			escalation: 'You need to verify public delivery contracts or preview resource lifecycle',
			paragraphs: [
				'R2 tests can be extremely small: put one object, read it back, and confirm the content or headers through the same worker path users will actually hit.',
				'That is often enough to prove the binding, while the route test proves your app-level delivery rules.'
			],
			mainSnippet: {
				title: 'Testing a real R2 binding',
				language: 'ts',
				code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, env } from 'devflare/test'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('stores and reads an object', async () => {
	await env.ASSETS.put('hello.txt', 'from-r2')
	const object = await env.ASSETS.get('hello.txt')
	expect(await object?.text()).toBe('from-r2')
})`
			},
			helperBullets: [
				'Use `env.ASSETS` when you are verifying the bucket contract itself.',
				'Use `cf.worker.fetch()` when the route, auth, or response metadata is the thing that matters.',
				'Keep at least one test close to the bucket API so the storage shape stays visible.'
			],
			caveatBullets: [
				'A passing local bucket test does not mean your public asset topology is good; that still belongs to route and deployment design.',
				'If the browser-facing path matters, assert the worker response instead of treating a bucket read as the whole user story.',
				'Bucket provisioning and cleanup belong in preview or deploy-oriented checks when branch infrastructure matters.'
			],
			callout: {
				tone: 'warning',
				title: 'Test the right layer',
				body: [
					'An object round-trip proves the binding. It does not automatically prove your file-delivery architecture.'
				]
			}
		},
		example: {
			readTime: '3 min read',
			summary:
				'This example uses one private bucket and one route, which is still the cleanest default shape for many real apps.',
			description:
				'A good first R2 example teaches both the binding and the delivery boundary: the worker decides what the browser gets.',
			highlights: [
				'One bucket plus one route is enough to teach the real shape.',
				'Private delivery through a Worker is a strong default.',
				'Headers are part of the example because files are not just bytes.',
				'You can grow into signed uploads or public assets later.'
			],
			configFocus: 'Direct bucket naming',
			runtimeShape: 'Get an object from R2 and stream it through a route',
			bestUse: 'Private file delivery or media endpoints',
			configSnippet: {
				title: 'Minimal R2 config',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'r2-example',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		r2: {
			FILES: 'private-files'
		}
	}
})`
			},
			usageSnippet: {
				title: 'Serve an object through the worker',
				language: 'ts',
				code: String.raw`import { env } from 'devflare/runtime'

export async function fetch(request: Request): Promise<Response> {
	const url = new URL(request.url)
	const key = url.pathname.replace(/^\/files\//, '')
	const object = await env.FILES.get(key)

	if (!object) {
		return new Response('Not found', { status: 404 })
	}

	return new Response(object.body, {
		headers: {
			'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream'
		}
	})
}`
			},
			notes: [
				'This route pattern keeps auth, caching, and content-type decisions in your app instead of in an assumed bucket URL contract.',
				'If you later choose a public bucket, make that an explicit architecture decision rather than a hidden side effect.'
			],
			callout: {
				tone: 'info',
				title: 'A better first instinct than “just use the bucket URL”',
				body: [
					'Routing through the worker teaches the real boundary between stored objects and browser-facing responses.'
				]
			}
		}
	}
]
