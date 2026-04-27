import type { BindingGuideDefinition } from './shared'

export const bindingGuidesPart4: BindingGuideDefinition[] = [
	{
		slugBase: 'vectorize',
		label: 'Vectorize',
		categoryDescription:
			'Vector similarity indexes with explicit remote testing and preview-aware index naming.',
		configKey: 'bindings.vectorize',
		authoringShape: 'Record<string, { indexName: string }>',
		localStory: 'Remote-oriented; local tests require remote mode or explicit mocks',
		sourcePages: [
			'schema-bindings.ts',
			'compiler.ts',
			'preview-resources.ts',
			'remote-vectorize.ts',
			'case15/*'
		],
		overview: {
			readTime: '4 min read',
			title:
				'Use Vectorize when the worker really owns similarity search, not just string matching',
			summary:
				'Devflare makes Vectorize usable by keeping the index name explicit in config, preview naming honest, and the real smoke test explicit instead of buried under mocks.',
			description:
				'The right first path is small: one binding, one tiny upsert-and-query route, and one skip-aware remote smoke test that tells the truth about whether the real index was involved.',
			highlights: [
				'Each binding declares an explicit `indexName`.',
				'Compile emits Wrangler `vectorize` entries.',
				'Preview-scoped Vectorize indexes are part of Devflare’s resource lifecycle story.',
				'`shouldSkip.vectorize` makes the remote test contract obvious instead of noisy.'
			],
			bestFor:
				'Similarity search, embedding-backed lookup, and retrieval paths that belong in the worker',
			authoringParagraphs: [
				'Vectorize authoring is simple in config, but the operational story matters: an index must exist, dimensions must match, and tests should acknowledge that they are calling a real remote system.',
				'Devflare helps by keeping the binding explicit, the index name visible, and preview resource handling deliberate when the preview needs its own index.'
			],
			authoringSnippet: {
				title: 'Vectorize binding authoring',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'search-worker',
	bindings: {
		vectorize: {
			DOCUMENT_INDEX: {
				indexName: 'document-index'
			}
		}
	}
})`
			},
			fitBullets: [
				'Use Vectorize when semantic similarity is part of the worker’s real job, not when plain text search is already enough.',
				'It fits best when the worker is already producing or consuming embeddings as part of the application flow.',
				'If the vector store is optional or external to the worker, keep the boundary explicit and do not force Vectorize into every local path.'
			],
			caveatBullets: [
				'Real Vectorize tests need remote access and an index that actually exists.',
				'Preview-scoped indexes are possible and lifecycle-managed, but they should be created only when the preview really needs isolated vector state.',
				'Local fake vector stores can be useful above the worker boundary, but they are not proof that the real binding path works.'
			],
			caveatCallout: {
				tone: 'warning',
				title: 'Dimension and index setup are part of the contract',
				body: [
					'A passing unit test with a fake array is not equivalent to a real Vectorize call against the configured index.'
				]
			}
		},
		internals: {
			readTime: '3 min read',
			summary:
				'Vectorize compiles cleanly into Wrangler output and participates in preview resource lifecycle, but the runtime value of the binding mostly lives in remote infrastructure.',
			description:
				'The codebase treats Vectorize as supported but remote-oriented. Config and preview handling are strong; local emulation is intentionally not oversold.',
			highlights: [
				'Compile emits `vectorize` entries with `index_name`.',
				'Preview resource logic can provision and later clean up preview-scoped indexes.',
				'`createTestContext()` can inject remote Vectorize helpers when remote mode is enabled.',
				'`shouldSkip.vectorize` exists because real remote prerequisites are part of the contract.'
			],
			normalizationFact:
				'The authored shape is small, so most complexity is in remote access and preview resource lifecycle',
			compileTarget: 'Wrangler `vectorize`',
			previewNote: 'Preview-scoped Vectorize indexes are lifecycle-managed resources in Devflare',
			normalizationParagraphs: [
				'Each Vectorize binding is a named env entry pointing to an explicit `indexName`. There is not much normalization complexity because the important value is already visible in source.',
				'The heavier internal story is around preview resource handling and remote test support, because that is where real index existence and lifecycle start to matter.'
			],
			localRuntimeBullets: [
				'`createTestContext()` can supply a remote Vectorize binding when remote mode is enabled.',
				'The codebase uses `shouldSkip.vectorize` to make missing remote prerequisites explicit in tests.',
				'The exhaustive smoke app also uses mocks for some integration checks, which is fine as long as the docs do not confuse that with full local emulation.'
			],
			compileBullets: [
				'Compile emits `index_name` into generated Wrangler-facing config.',
				'Preview resource lifecycle code can materialize branch-specific index names and later clean them up.',
				'Because the binding is remote-oriented, the hardest failures are usually missing indexes, dimension mismatches, or auth — not config syntax.'
			],
			callout: {
				tone: 'info',
				title: 'Supported does not mean locally emulated',
				body: [
					'Vectorize is fully part of the config schema and preview story, but the meaningful runtime path still belongs to the remote platform.'
				]
			}
		},
		testing: {
			readTime: '4 min read',
			summary:
				'The right Vectorize tests are targeted remote checks: a small insert or query, a clear skip condition, and a real index behind the binding.',
			description:
				'Avoid pretending a local fake embedding store proved the same thing. It may still be useful for UI or higher-level app tests, but it is not the binding test.',
			highlights: [
				'Use remote mode plus `shouldSkip.vectorize` for truthful binding tests.',
				'Keep the vector dimensions and index name explicit in the test setup.',
				'Small insert/query flows are enough for a smoke test.',
				'Local mocks are fine higher up the stack, just not as evidence that the binding itself works.'
			],
			bestFor: 'Remote similarity-search checks and index smoke tests',
			defaultHarness: '`createTestContext()` in remote mode plus `shouldSkip.vectorize`',
			escalation:
				'The index contract is business-critical enough to need explicit CI or release gating',
			paragraphs: [
				'Keep the test as small as possible: insert one vector or query one known embedding and verify the shape of the result.',
				'If the index is missing, skip with a clear message. That teaches future maintainers more than a mysterious failure ever will.'
			],
			mainSnippet: {
				title: 'A remote Vectorize smoke test',
				language: 'ts',
				code: String.raw`import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createTestContext, env, shouldSkip } from 'devflare/test'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

const skipVectorize = await shouldSkip.vectorize

describe.skipIf(skipVectorize)('Vectorize binding', () => {
	test('accepts one upsert and one query', async () => {
		const vector = Array(32).fill(0.5)
		await env.DOCUMENT_INDEX.upsert?.([
			{ id: 'doc-1', values: vector, metadata: { kind: 'demo' } }
		])

		const result = await env.DOCUMENT_INDEX.query?.(vector, { topK: 1 })
		expect(result).toBeDefined()
	})
})`
			},
			helperBullets: [
				'Use `shouldSkip.vectorize` so missing remote prerequisites are explicit instead of noisy.',
				'Keep the vector size and index name close to the test so the contract remains visible.',
				'If the surrounding app only needs a demo path locally, mock above the worker boundary instead of pretending the remote index was exercised.'
			],
			caveatBullets: [
				'Running Vectorize tests everywhere is rarely necessary; put them where the signal is worth the cost.',
				'A passing local mock tells you nothing about index existence or vector dimension compatibility.',
				'If a preview environment owns its own index, add one lifecycle-aware check for that path specifically.'
			],
			callout: {
				tone: 'accent',
				title: 'A tiny real query beats a giant fake suite',
				body: [
					'For remote vector search, one truthful remote smoke check is often worth more than a dozen intricate local fakes.'
				]
			}
		},
		example: {
			readTime: '3 min read',
			summary:
				'This example keeps Vectorize honest and usable: one index binding, one upsert-and-query route, and one skip-aware remote smoke test.',
			description:
				'That is enough to show the binding shape, the worker contract, and the Devflare remote gate without dragging in a whole retrieval stack on page one.',
			highlights: [
				'The index name stays explicit in config.',
				'The runtime path shows both write and read shape.',
				'The remote smoke test uses Devflare’s skip gate instead of pretending similarity search is local.',
				'The worker contract remains visible even if the app wraps it elsewhere.'
			],
			configFocus: 'Explicit index naming',
			runtimeShape: 'Upsert one vector and query it back',
			bestUse: 'Search prototypes and embedding-backed retrieval endpoints',
			configSnippet: {
				title: 'Minimal Vectorize config',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'vectorize-example',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		vectorize: {
			DOCUMENT_INDEX: {
				indexName: 'document-index'
			}
		}
	}
})`
			},
			usageSnippet: {
				title: 'A tiny write-and-query route',
				language: 'ts',
				code: String.raw`import { env } from 'devflare/runtime'

export async function fetch(): Promise<Response> {
	const vector = Array(32).fill(0.5)

	await env.DOCUMENT_INDEX.upsert?.([
		{ id: 'doc-1', values: vector, metadata: { title: 'Demo doc' } }
	])

	const result = await env.DOCUMENT_INDEX.query?.(vector, {
		topK: 1,
		returnMetadata: true
	})

	return Response.json({ result })
}`
			},
			notes: [
				'Keep the embedding dimension explicit and consistent with the actual index you created.',
				'If you later split write and read into separate routes, this same example still teaches the core binding path.'
			],
			callout: {
				tone: 'accent',
				title: 'The Devflare win is honest lifecycle plus honest gating',
				body: [
					'The named index still has to exist, but Devflare keeps that reality visible in config, preview naming, and skip-aware tests instead of hiding it behind fake local success.'
				]
			}
		}
	},
	{
		slugBase: 'hyperdrive',
		label: 'Hyperdrive',
		categoryDescription:
			'PostgreSQL-oriented bindings with schema support, name resolution, and local connection strings for Miniflare.',
		configKey: 'bindings.hyperdrive',
		authoringShape:
			'Record<string, string | { name; localConnectionString? } | { id; localConnectionString? }>',
		localStory:
			'Full local support when Devflare has a local database connection string for the binding',
		sourcePages: [
			'schema-bindings.ts',
			'schema-normalization.ts',
			'resource-resolution.ts',
			'preview-resources.ts',
			'case14/*'
		],
		overview: {
			readTime: '4 min read',
			title:
				'Use Hyperdrive when the worker needs a real PostgreSQL path behind Cloudflare’s pooling layer',
			summary:
				'Hyperdrive is modeled in Devflare config, compile flows, local Miniflare wiring, and pure tests through explicit local connection strings.',
			description:
				'For local work, point the binding at a local or test PostgreSQL database. Cloudflare still owns the hosted pooling layer, placement, account credentials, and production routing.',
			highlights: [
				'String shorthand means a stable Hyperdrive configuration name.',
				'Build and deploy can resolve names to Hyperdrive ids.',
				'Local dev and tests can use `localConnectionString` or the Hyperdrive local connection env var.',
				'Preview handling is special because Hyperdrive configs cannot always be cloned automatically.'
			],
			bestFor: 'Workers that connect to PostgreSQL through Hyperdrive',
			authoringParagraphs: [
				'Hyperdrive follows the same stable-name instinct as KV and D1: author a readable name in source when you can, then let Devflare resolve ids later when a flow actually needs them.',
				'Add `localConnectionString` when local dev or tests should query a local database without contacting Cloudflare.'
			],
			authoringSnippet: {
				title: 'Hyperdrive binding authoring',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'postgres-worker',
	bindings: {
		hyperdrive: {
			DB: {
				name: 'app-postgres',
				localConnectionString: 'postgres://user:pass@localhost:5432/app'
			},
			ANALYTICS_DB: { id: 'hyperdrive-id' }
		}
	}
})`
			},
			fitBullets: [
				'Use Hyperdrive when the worker needs PostgreSQL and you want the Cloudflare-managed connection path rather than raw direct wiring.',
				'It fits best when a real Postgres database already exists and the worker boundary should speak to it deliberately.',
				'If your data is already a comfortable fit for D1, D1 may still be the simpler first choice.'
			],
			caveatBullets: [
				'Use `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_DB` to override the configured local connection string in CI or per-developer shells.',
				'Preview-scoped Hyperdrive configs are not auto-cloned from the base configuration because stored credentials are not always available for that.',
				'When a preview Hyperdrive config does not exist, Devflare may fall back to the base configuration and warn.'
			],
			caveatCallout: {
				tone: 'warning',
				title: 'Local and hosted responsibilities are different',
				body: [
					'Devflare can wire the local database path. Cloudflare still owns hosted pooling, production credentials, placement, billing, and account state.'
				]
			}
		},
		internals: {
			readTime: '3 min read',
			summary:
				'Hyperdrive uses the same normalize-and-resolve pattern as KV and D1, and local runtime config is driven by the binding connection string.',
			description:
				'That fallback behavior is worth documenting explicitly because it changes how you should think about preview isolation and cleanup for database-backed flows.',
			highlights: [
				'String shorthand means a stable Hyperdrive configuration name.',
				'Compile emits Wrangler `hyperdrive` entries after resolution.',
				'Local Miniflare config receives `hyperdrives` only when a local connection string is available.',
				'Cleanup can remove preview Hyperdrives that actually exist, but cloning is not automatic.'
			],
			normalizationFact:
				'Hyperdrive follows the same name-versus-id normalization family as KV and D1',
			compileTarget: 'Wrangler `hyperdrive`',
			previewNote:
				'Preview Hyperdrive configs may fall back to the base config when a preview clone cannot be materialized',
			normalizationParagraphs: [
				'Hyperdrive authoring accepts a string, `{ name }`, or `{ id }`, and Devflare normalizes those into one internal binding shape so later code can treat them consistently.',
				'That part looks familiar if you already understand KV or D1. The unusual part is preview lifecycle, not the authored schema.'
			],
			localRuntimeBullets: [
				'Devflare passes `bindings.hyperdrive.*.localConnectionString` into Miniflare `hyperdrives` so local Worker code can use the normal Hyperdrive binding shape.',
				'`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING>` and the legacy `WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING>` override config for local runs.',
				'Pure tests can use `createOfflineEnv()` or `createMockHyperdrive()` when the application code only needs the connection string.'
			],
			compileBullets: [
				'Build and deploy resolve name-based Hyperdrive bindings to real configuration ids before generating output.',
				'Preview resource logic cannot always clone a base Hyperdrive config because Cloudflare does not expose stored credentials for that workflow.',
				'When a preview Hyperdrive config is missing but the base config exists, Devflare can fall back to the base binding and warn instead of pretending isolation happened.'
			],
			callout: {
				tone: 'info',
				title: 'This is a lifecycle caveat, not a syntax caveat',
				body: [
					'The config shape is straightforward. The reason Hyperdrive needs extra documentation is the preview and credential story, not the authoring syntax.'
				]
			}
		},
		testing: {
			readTime: '4 min read',
			summary:
				'Hyperdrive testing should start with a local connection string, then add a focused query test against the database shape your app actually uses.',
			description:
				'Devflare can provide the binding locally. Your test database still has to exist, just like any other local Postgres dependency.',
			highlights: [
				'Start with a deterministic local connection string.',
				'Prefer targeted integration tests for the real PostgreSQL path.',
				'Keep preview-fallback behavior visible in tests when preview isolation matters.',
				'Use Cloudflare only when hosted pooling, placement, or account lifecycle is the assertion.'
			],
			bestFor: 'Local PostgreSQL integration paths and connection-string-driven app code',
			defaultHarness: '`createTestContext()` or `createOfflineEnv()` with `localConnectionString`',
			escalation: 'The app depends on real preview isolation or actual Postgres query behavior',
			paragraphs: [
				'Start with one small assertion that the binding exposes the local connection string your database client expects.',
				'Then add focused integration tests against the actual local database path instead of involving Cloudflare for application-owned SQL behavior.'
			],
			mainSnippet: {
				title: 'A conservative Hyperdrive smoke test',
				language: 'ts',
				code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, env } from 'devflare/test'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('Hyperdrive binding exposes local connection info', () => {
	expect(env.DB).toBeDefined()
	expect(env.DB.connectionString).toContain('localhost')
})`
			},
			helperBullets: [
				'Use `localConnectionString` in config when the test should run without Cloudflare.',
				'Use `createMockHyperdrive` when a pure unit test needs a Hyperdrive-shaped binding without Miniflare.',
				'Keep one higher-level integration path for the real database behavior you actually care about.',
				'If preview isolation matters, test the fallback or dedicated preview strategy explicitly.'
			],
			caveatBullets: [
				'Do not run local Hyperdrive tests against a shared production database.',
				'If the worker truly depends on live query behavior, prefer an integration test against a real database path.',
				'Preview-specific Hyperdrive expectations deserve a dedicated test because automatic cloning is not guaranteed.'
			],
			callout: {
				tone: 'warning',
				title: 'Keep database ownership explicit',
				body: [
					'Devflare owns the binding wiring; the test suite owns the local database lifecycle and seed data.'
				]
			}
		},
		example: {
			readTime: '3 min read',
			summary:
				'This example uses Hyperdrive in an application route that reads one product from PostgreSQL.',
			description:
				'Use the same route locally with a local Postgres connection string, then deploy with the Cloudflare Hyperdrive configuration id or name.',
			highlights: [
				'The config stays readable through a stable Hyperdrive name.',
				'The runtime example uses a real PostgreSQL client.',
				'The route returns a concrete product record.',
				'The production boundary stays visible next to the local connection string.'
			],
			configFocus: 'Stable Hyperdrive naming',
			runtimeShape: 'Query through `env.DB.connectionString`',
			bestUse: 'Product, order, account, or tenant data stored in PostgreSQL',
			configSnippet: {
				title: 'Minimal Hyperdrive config',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'hyperdrive-example',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		hyperdrive: {
			DB: {
				name: 'app-postgres',
				localConnectionString: 'postgres://user:pass@localhost:5432/app'
			}
		}
	}
})`
			},
			usageSnippet: {
				title: 'Read one product through Hyperdrive',
				language: 'ts',
				code: String.raw`import postgres from 'postgres'
import { env, getFetchEvent } from 'devflare/runtime'

const sql = postgres(env.DB.connectionString)

export async function fetch(): Promise<Response> {
	const event = getFetchEvent()
	const slug = new URL(event.request.url).searchParams.get('slug') ?? 'starter-kit'
	const [product] = await sql.unsafe(
		'select slug, name, price_cents from products where slug = $1 limit 1',
		[slug]
	)

	return product ? Response.json(product) : new Response('not found', { status: 404 })
}`
			},
			notes: [
				'Install the client with `bun add postgres` and point `localConnectionString` at a local or CI Postgres database.',
				'Use Cloudflare-backed tests when the assertion depends on hosted pooling, placement, credentials, or deployed account behavior.'
			],
			callout: {
				tone: 'info',
				title: 'Use a real local database',
				body: [
					'Hyperdrive local support means Devflare can pass the connection path through the binding. It does not create or seed PostgreSQL for you.'
				]
			}
		}
	}
]
