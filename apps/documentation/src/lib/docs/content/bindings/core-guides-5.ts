import type { BindingGuideDefinition } from './shared'

export const bindingGuidesPart5: BindingGuideDefinition[] = [
	{
		slugBase: 'browser',
		label: 'Browser Rendering',
		categoryDescription:
			'Headless browser support with an explicit single-binding limit and a stronger dev-server story than test-helper story.',
		configKey: 'bindings.browser',
		authoringShape: 'Record<string, string> with exactly one entry',
		localStory:
			'Supported, but the strongest story is dev server and integration rather than a dedicated test helper',
		sourcePages: [
			'schema-bindings.ts',
			'compiler.ts',
			'browser-shim/*',
			'dev-server/server.ts',
			'case18/*'
		],
		overview: {
			readTime: '5 min read',
			title: 'Use Browser Rendering when the worker really needs a headless browser path',
			summary:
				'Browser Rendering shines in Devflare’s bridge-backed dev story: keep one browser binding, one narrow worker route, and one smoke path that proves launch works.',
			description:
				'The platform limit is still real — exactly one browser binding — but Devflare adds the missing local ergonomics through the browser shim, binding worker, and integration-friendly route model.',
			highlights: [
				'Current schema allows exactly one browser binding.',
				'Compile emits the single Wrangler browser binding shape from the named env key.',
				'Devflare ships a browser shim and binding worker to support the local/dev story.',
				'`devflare types` currently models the binding as `Fetcher`, so the worker boundary is the thing to test and document.',
				'The best first proof is one narrow route that launches Puppeteer, reads one title, and closes cleanly.',
				'Preview naming exists, but browser bindings are not lifecycle-managed account resources like KV or D1.'
			],
			bestFor: 'PDF generation, screenshots, and other worker-side headless browser tasks',
			authoringParagraphs: [
				'Browser Rendering looks a little unusual in config because the current contract is a named map with exactly one entry. The env key matters more than the configured string value that appears beside it.',
				'That is also why generated env typing stays conservative today: `devflare types` can model the binding as `Fetcher`, while the richer browser behavior comes from the dev server shim and browser-aware libraries.',
				'That single-binding constraint is not a Devflare whim. It reflects the current Wrangler and platform support Devflare is choosing to expose accurately.'
			],
			authoringSnippet: {
				title: 'Browser binding authoring',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'browser-worker',
	bindings: {
		browser: {
			BROWSER: 'browser-resource'
		}
	}
})`
			},
			fitBullets: [
				'Use Browser Rendering when the worker truly needs a browser — for PDF generation, screenshots, or browser-like page evaluation.',
				'Keep browser usage narrow and explicit because browser work is usually heavier than normal request handling.',
				'If a feature can be expressed as a plain fetch or HTML transform, it probably should be.'
			],
			caveatBullets: [
				'Only one browser binding is currently supported.',
				'The strongest local story lives in dev-server and integration flows, not in a rich browser-specific test helper API.',
				'Preview naming exists, but browser resources are not provisioned or deleted like account-managed storage resources.'
			],
			caveatCallout: {
				tone: 'warning',
				title: 'Exactly one really means one',
				body: [
					'If you configure more than one browser binding, schema validation rejects it because the underlying Wrangler contract only supports one.'
				]
			}
		},
		internals: {
			readTime: '4 min read',
			summary:
				'Browser Rendering support in Devflare is more than a config pass-through: the dev server starts a browser shim and a binding worker that line up with Cloudflare and puppeteer expectations.',
			description:
				'That implementation detail is why the binding belongs in the docs library even though the test helper surface is narrower. There is real, deliberate runtime support here.',
			highlights: [
				'Schema validates that there is exactly one browser binding name.',
				'Compiler emits `browser: { binding: <env-key> }` from that single env key.',
				'The browser shim installs and proxies the local browser runtime used in dev flows.',
				'The binding worker exists specifically to satisfy the Worker-facing browser contract expected by `@cloudflare/puppeteer`.'
			],
			normalizationFact:
				'The env binding name is the important authoring value, while the configured string is mainly used for naming and preview materialization',
			compileTarget: 'Wrangler `browser` binding',
			previewNote:
				'Preview can materialize the binding name, but browser resources are not lifecycle-managed account resources',
			normalizationParagraphs: [
				'The browser binding schema accepts a record but then validates that only one key exists. Devflare treats that key as the meaningful env binding name and compiles it into the single `browser.binding` entry Wrangler expects.',
				'Emphasize the env key and the single-binding limit rather than implying the string value behaves like a normal bucket or namespace resource.'
			],
			localRuntimeBullets: [
				'The dev server starts a browser shim that can install Chrome Headless Shell and proxy the Browser Rendering protocol over HTTP and WebSocket.',
				'The binding worker exists so browser libraries like `@cloudflare/puppeteer` can talk to the expected Worker-side contract.',
				'Generated env typing stays conservative here too: the binding currently lands as `Fetcher`, which is another reason to keep the worker-facing browser path narrow and explicit.',
				'This is why browser local support feels more like dev-server infrastructure than like a small `cf.browser.*` helper.'
			],
			compileBullets: [
				'Compile emits the single browser binding from the configured env key.',
				'Preview logic can materialize names, but Devflare does not provision or delete browser “resources” because they are not account-managed the same way storage bindings are.',
				'The browser path can also warn about missing local WebSocket support when the environment lacks the `ws` dependency needed for proxying.'
			],
			callout: {
				tone: 'info',
				title: 'Local browser-rendering shim',
				body: [
					'The dev-side endpoint Devflare exposes for `@cloudflare/puppeteer` is the **local browser-rendering shim**. It accepts only loopback browser origins (e.g. `http://127.0.0.1:*`, `http://localhost:*`) plus origin-less tool traffic such as Puppeteer or curl.',
					'This loopback-only posture is the security model of the shim itself — it is devflare’s protected helper endpoint for the local Browser Rendering binding. It is **not** a policy applied to your normal worker routes; user app routes still follow whatever request and CORS rules the worker code itself defines.'
				]
			}
		},
		testing: {
			readTime: '4 min read',
			summary:
				'Browser tests should usually be integration-flavored: either drive the worker in dev or exercise a thin smoke path that proves the binding can launch and fetch.',
			description:
				'That is more truthful than pretending the browser binding has the same helper depth as `cf.queue.trigger()` or `env.DB.prepare()`.',
			highlights: [
				'Prefer integration or dev-server smoke paths for browser-heavy behavior.',
				'A tiny dev-server, preview, or other integration-style smoke request is often enough for a binding smoke test.',
				'Keep heavy browser workflows behind narrow routes or DO methods so they remain testable.',
				'You can still use normal worker tests around those routes even if there is no dedicated browser helper.'
			],
			bestFor: 'Launch smoke tests, PDF generation routes, and browser-backed worker endpoints',
			defaultHarness:
				'A narrow browser route exercised through the dev server, a preview URL, or another integration-style path',
			escalation: 'A real browser workflow is mission-critical or too heavy for ordinary test runs',
			paragraphs: [
				'Keep the worker-side browser entry small enough that one smoke path can prove it launches, opens a page, or returns a generated artifact.',
				'If the real logic is bigger — for example a full PDF renderer DO — write one narrow end-to-end check and keep the rest of the code tested at smaller layers.'
			],
			mainSnippet: {
				title: 'A tiny dev-server browser smoke check',
				language: 'ts',
				code: String.raw`import { expect, test } from 'bun:test'

const baseUrl = process.env.DEVFLARE_TEST_URL ?? 'http://127.0.0.1:8787'

test('browser-backed route responds', async () => {
	const response = await fetch(new URL('/browser-health', baseUrl))
	expect(response.ok).toBe(true)
})`
			},
			helperBullets: [
				'Prefer one narrow worker route or DO method for browser tasks so the binding path stays testable.',
				'Drive that route through the dev server, a preview URL, or another integration path when browser launch itself is the thing under test.',
				'If you want Bun-only unit tests, stub above the browser boundary instead of expecting `createTestContext()` to create a browser binding for you.',
				'Treat browser local checks as smoke tests unless the app really needs a heavier dedicated lane.'
			],
			caveatBullets: [
				'No dedicated browser helper surface means you should test the worker boundary or integration path instead of reaching for fictional convenience APIs.',
				'`createTestContext()` is still useful around surrounding worker code, but it is not a browser-specific helper that automatically populates `env.BROWSER` for you.',
				'Browser workloads are heavier than typical request tests, so they deserve intentional scheduling in CI.',
				'If the route depends on browser proxying or WebSockets, test that path in an environment close to the real dev server.'
			],
			callout: {
				tone: 'accent',
				title: 'Smoke test the launch path, not the whole internet',
				body: [
					'Browser bindings get expensive fast. One honest launch or render smoke path is usually better than an enormous browser suite that nobody trusts.'
				]
			}
		},
		example: {
			readTime: '4 min read',
			summary:
				'This example shows the real browser path people actually need: one binding, one title-read route, and one smoke check through the dev server.',
			description:
				'It is intentionally smaller than a full PDF pipeline, but it uses the same Devflare idea: a narrow worker route on top of a bridge-backed local browser lane.',
			highlights: [
				'The env binding name is what matters in config.',
				'The runtime example uses `@cloudflare/puppeteer` directly.',
				'The smoke check proves the browser route through the same dev/integration boundary users will rely on.',
				'Browser cleanup is part of the example, not an optional footnote.',
				'This is enough to turn into a PDF or screenshot path later.'
			],
			configFocus: 'Single browser binding',
			runtimeShape: 'Launch puppeteer with the Worker binding and close it cleanly',
			bestUse: 'Small screenshot, title-read, or PDF-generation entrypoints',
			configSnippet: {
				title: 'Minimal browser config',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'browser-example',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		browser: {
			BROWSER: 'browser-resource'
		}
	}
})`
			},
			usageSnippet: {
				title: 'Read one page title with Puppeteer',
				language: 'ts',
				code: String.raw`import puppeteer from '@cloudflare/puppeteer'
import { env } from 'devflare/runtime'

export async function fetch(): Promise<Response> {
	const browser = await puppeteer.launch(env.BROWSER as Parameters<typeof puppeteer.launch>[0])

	try {
		const page = await browser.newPage()
		await page.goto('https://example.com/', { waitUntil: 'load' })
		return Response.json({ title: await page.title() })
	} finally {
		await browser.close()
	}
}`
			},
			notes: [
				'Keep the first route tiny so launch, navigation, and cleanup are the only moving parts you have to trust.',
				'If the real feature is PDF generation, this same pattern is the foundation for that worker path.'
			],
			callout: {
				tone: 'accent',
				title: 'The Devflare value is the bridge-backed local lane',
				body: [
					'Browser work is still heavier than most bindings, but Devflare gives it a real local/dev story instead of forcing you to document only the production path. Keep the first route narrow enough that launch failures are easy to diagnose.'
				]
			}
		}
	},
	{
		slugBase: 'analytics-engine',
		label: 'Analytics Engine',
		categoryDescription:
			'Dataset bindings for writeDataPoint-style event recording with schema support and lighter local testing guidance.',
		configKey: 'bindings.analyticsEngine',
		authoringShape: 'Record<string, { dataset: string }>',
		localStory: 'Supported, but usually tested through integration or thin mocks',
		sourcePages: [
			'schema-bindings.ts',
			'compiler.ts',
			'generator.ts',
			'preview-resources.ts',
			'apps/testing/*'
		],
		overview: {
			readTime: '4 min read',
			title:
				'Use Analytics Engine when the worker should write structured event points, not improvise log transport',
			summary:
				'Analytics Engine is modeled cleanly in Devflare config and generated types, but the repo evidence points to a lighter local story than KV, D1, and R2.',
			description:
				'That usually means two good habits: keep the write path simple in the worker, and test the event-producing behavior through a thin boundary rather than by inventing a giant analytics simulation.',
			highlights: [
				'Each binding declares a dataset explicitly.',
				'Compile emits Wrangler `analytics_engine_datasets`.',
				'Type generation maps these bindings to `AnalyticsEngineDataset` in `env.d.ts`.',
				'Preview naming exists, but datasets are not provisioned or deleted by Devflare because they are created on first write.'
			],
			bestFor: 'Structured analytics or event logging inside worker code',
			authoringParagraphs: [
				'The Analytics Engine binding is conceptually simple: pick a dataset name and write data points to it from the worker path that owns the event.',
				'What matters more than the config shape is resisting the urge to build a fake analytics platform around it just to write the first tests.'
			],
			authoringSnippet: {
				title: 'Analytics Engine binding authoring',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'analytics-worker',
	bindings: {
		analyticsEngine: {
			APP_ANALYTICS: {
				dataset: 'app-analytics'
			}
		}
	}
})`
			},
			fitBullets: [
				'Use Analytics Engine when the worker should record structured event points as part of handling real traffic or jobs.',
				'Keep analytics writes narrow and explicit so they stay easy to review.',
				'If the data is really application state, it probably belongs in D1 or another durable store instead of analytics.'
			],
			caveatBullets: [
				'For app-level tests, `createMockAnalyticsEngine()` (or `createMockEnv({ analyticsEngine })` / `createOfflineEnv()`) is a write-only recording stub: it records every `writeDataPoint()` into `.writtenDataPoints` so you can assert what the worker emitted. Analytics Engine has no in-worker read API, so the stub records writes — it does not query.',
				'Preview-scoped dataset names can be materialized, but Devflare does not provision or delete datasets because Analytics Engine creates them on first write.',
				'Tests should focus on event-producing behavior rather than pretending you need a full local analytics backend.'
			],
			caveatCallout: {
				tone: 'info',
				title: 'This binding is about a write path',
				body: [
					'Document the write contract clearly and keep the testing story light. That is more useful than inventing an elaborate fake dataset universe.'
				]
			}
		},
		internals: {
			readTime: '3 min read',
			summary:
				'Analytics Engine has a straightforward compiler story, plus a preview note that matters because datasets are auto-created on first write instead of provisioned like buckets or databases.',
			description:
				'That is the core reason the docs should separate it from storage bindings: the worker env shape is familiar, but the resource lifecycle behaves differently.',
			highlights: [
				'Compile emits `analytics_engine_datasets`.',
				'Type generation maps the env binding to `AnalyticsEngineDataset`.',
				'Preview naming can materialize dataset names for scoped environments.',
				'Provision and cleanup are intentionally lighter because datasets are created by writing to them.'
			],
			normalizationFact:
				'The authored shape is a simple dataset mapping; the interesting behavior is lifecycle, not deep normalization',
			compileTarget: 'Wrangler `analytics_engine_datasets`',
			previewNote:
				'Preview names can change, but Devflare does not provision or delete Analytics Engine datasets for you',
			normalizationParagraphs: [
				'Analytics Engine bindings are a small schema surface: a binding name maps to a dataset name. That keeps authored config simple and predictable.',
				'The more important implementation detail is that datasets are not managed like KV namespaces or buckets. They come to life on write, so preview lifecycle support looks different.'
			],
			localRuntimeBullets: [
				'The repo smoke app and integration tests show `writeDataPoint()` being called through the binding, which is enough to describe the runtime contract.',
				'There is no dedicated analytics helper surface in the test harness — use thin worker tests or explicit mocks instead.',
				'Type generation still matters here because it keeps the env contract clear even when the test story is lighter.'
			],
			compileBullets: [
				'Compile emits dataset entries into Wrangler-facing output.',
				'Preview materialization can rewrite dataset names, but Devflare intentionally does not try to provision or delete those datasets for you.',
				'That lifecycle difference is the main caveat compared with storage or queue resources.'
			],
			callout: {
				tone: 'warning',
				title: 'Name changes do not imply resource management',
				body: [
					'Preview-scoped naming is useful, but it does not mean Devflare owns the full dataset lifecycle the way it can for KV, D1, or queues.'
				]
			}
		},
		testing: {
			readTime: '3 min read',
			summary:
				'Analytics Engine tests should stay thin: verify that the worker writes a data point, not that you can recreate Cloudflare analytics locally.',
			description:
				'The repo evidence supports that approach. There are examples and smoke checks, but not a big dedicated analytics test harness pretending to be the platform.',
			highlights: [
				'Test that the worker reaches `writeDataPoint()` when it should.',
				'Use a thin mock or smoke path when needed.',
				'Keep analytics assertions scoped to the event-producing behavior you care about.',
				'Escalate only if analytics delivery is business-critical enough to deserve a higher-level integration lane.'
			],
			bestFor: 'Event-write smoke tests and worker behavior that should emit analytics',
			defaultHarness: 'A thin worker test or explicit mock around `writeDataPoint()`',
			escalation: 'Analytics delivery itself is a release-critical guarantee',
			paragraphs: [
				'The best default is a small test proving the worker attempted the analytics write when the expected request or job happened.',
				'If you later need stronger end-to-end confidence, add a higher-level integration or smoke lane instead of bloating the ordinary unit path.'
			],
			mainSnippet: {
				title: 'A thin analytics smoke check',
				language: 'ts',
				code: String.raw`import { expect, test } from 'bun:test'
import { createMockAnalyticsEngine } from 'devflare/test'

test('records an analytics point', () => {
	const analytics = createMockAnalyticsEngine()

	analytics.writeDataPoint({ indexes: ['search'], blobs: ['devflare'] })

	expect(analytics.writtenDataPoints).toEqual([
		{ indexes: ['search'], blobs: ['devflare'] }
	])
})`
			},
			helperBullets: [
				'Keep analytics writes behind a small helper if that makes them easier to assert in application-level tests.',
				'Use worker smoke tests around the route or job that should emit the event when you want stronger evidence than a tiny mock.',
				'Do not confuse “we called writeDataPoint” with “the whole reporting stack is perfect” unless you added a real integration path for that.'
			],
			caveatBullets: [
				'The ordinary docs should not imply that Devflare ships a full local Analytics Engine simulator.',
				'If analytics delivery is business-critical, put it in a dedicated smoke or release lane instead of overfitting every local test.',
				'Preview dataset names may differ, so if that matters operationally, test the generated naming separately.'
			],
			callout: {
				tone: 'accent',
				title: 'Thin and explicit wins here too',
				body: [
					'Analytics bindings are easiest to trust when the worker writes a clearly reviewable point and the tests prove that narrow behavior directly.'
				]
			}
		},
		example: {
			readTime: '3 min read',
			summary:
				'This example writes one analytics event from one route, which is usually all you need to teach the binding shape clearly.',
			description:
				'It keeps the dataset name visible, the event payload small, and the worker boundary obvious.',
			highlights: [
				'One dataset binding is enough to show the pattern.',
				'The route is tiny because the interesting part is the event write.',
				'The event payload should be reviewable, not mysterious.',
				'This same pattern works for search, app, or audit analytics.'
			],
			configFocus: 'Explicit dataset naming',
			runtimeShape: 'Call `writeDataPoint()` during a request',
			bestUse: 'Search analytics, request logging, and event emission',
			configSnippet: {
				title: 'Minimal Analytics Engine config',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'analytics-example',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		analyticsEngine: {
			APP_ANALYTICS: {
				dataset: 'app-analytics'
			}
		}
	}
})`
			},
			usageSnippet: {
				title: 'Write one analytics point in the worker',
				language: 'ts',
				code: String.raw`import { env } from 'devflare/runtime'

export async function fetch(): Promise<Response> {
	env.APP_ANALYTICS.writeDataPoint({
		indexes: ['search'],
		blobs: ['devflare query']
	})

	return new Response('recorded')
}`
			},
			notes: [
				'Keep the event payload small and explicit so you can reason about what the worker is writing.',
				'If the real event shape grows richer later, this tiny route still teaches the binding contract.'
			],
			callout: {
				tone: 'info',
				title: 'A route can teach the whole binding',
				body: [
					'For Analytics Engine, one request that writes one point is already enough to teach the env shape and the operational habit.'
				]
			}
		}
	}
]
