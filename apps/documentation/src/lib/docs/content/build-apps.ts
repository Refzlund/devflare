import type { DocPage } from '../types'

const docsLink = (slug: string): string => `/docs/${slug}`

const r2WorkerDeliveryCode = String.raw`import type { FetchEvent } from 'devflare/runtime'

export async function GET({ env, params }: FetchEvent<DevflareEnv>): Promise<Response> {
	const object = await env.FILES.get(params.key)
	if (!object) {
		return new Response('Not Found', { status: 404 })
	}

	return new Response(object.body, {
		headers: {
			'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
			'Cache-Control': 'private, max-age=0'
		}
	})
}`

export const buildAppsDocs: DocPage[] = [
	{
		slug: 'storage-bindings',
		group: 'Guides',
		navTitle: 'Storage strategy',
		readTime: '6 min read',
		eyebrow: 'Binding strategy',
		title: 'Choose the right storage binding first, then let the binding guides own the mechanics',
		summary:
			'Use this page to choose between KV, D1, R2, and Hyperdrive. Once the shape is clear, open the binding-specific guide for authoring, testing, and examples instead of reading several smaller pages that all repeat the same decision badly.',
		description:
			'This is the storage chooser, not a second binding reference shelf. Use it when the question is “which storage shape fits this worker?” Then jump into the guide that owns the actual runtime, compile, testing, and preview details for that storage binding.',
		highlights: [
			'KV fits keyed lookups and cache-like state; D1 fits query-shaped data; R2 fits object storage; Hyperdrive fits existing remote Postgres paths.',
			'Stable names in config are still the safest default for name-based storage bindings.',
			'R2 file delivery is an app-architecture decision, not just a binding checkbox.',
			'The binding guides own the mechanics; this page owns the decision rules.'
		],
		facts: [
			{
				label: 'Best for',
				value: 'Choosing between KV, D1, R2, and Hyperdrive before you dive into one binding guide'
			},
			{
				label: 'Main question',
				value:
					'Is the data keyed, query-shaped, object-shaped, or an existing remote database connection?'
			},
			{
				label: 'Safest default',
				value: 'Prefer stable names in config when the binding supports them'
			},
			{ label: 'Open next', value: 'The specific binding guide once the storage shape is clear' }
		],
		sourcePages: [
			'packages/devflare/src/config/schema-bindings.ts',
			'packages/devflare/src/config/schema.ts',
			'schema-bindings.ts',
			'schema-normalization.ts',
			'resource-resolution.ts'
		],
		sections: [
			{
				id: 'choose-the-shape',
				title: 'Choose the storage shape before you choose the syntax',
				paragraphs: [
					'The weirdest storage mistakes usually come from choosing by familiarity instead of by data shape. Devflare already has strong per-binding guides for authoring and testing, so this page should stay at the decision boundary instead of pretending to be four shorter reference pages glued together.',
					'Once the storage shape is obvious, the binding guide should take over. That keeps the library cleaner and makes the per-binding pages easier to trust.'
				],
				table: {
					headers: ['Binding', 'Reach for it when', 'Usually the wrong fit'],
					rows: [
						[
							'`KV`',
							'You need keyed lookups, cache-like state, feature flags, or lightweight session markers.',
							'You need relational queries, joins, or object delivery.'
						],
						[
							'`D1`',
							'You need SQL, relations, filters, or schema-shaped data.',
							'You only need key lookup or one blob of file data.'
						],
						[
							'`R2`',
							'You need objects, uploads, generated files, or browser-facing file delivery through a Worker.',
							'You need query semantics or tiny cache records.'
						],
						[
							'`Hyperdrive`',
							'You already have a remote PostgreSQL system and the worker should reach it through Cloudflare acceleration.',
							'A local-first or greenfield schema could live in D1 instead.'
						]
					]
				},
				callouts: [
					{
						tone: 'info',
						title: 'The page boundary is deliberate',
						body: [
							'This page should help you pick the binding. The actual binding guides should explain how to author it, test it, preview it, and ship it.'
						]
					}
				]
			},
			{
				id: 'stable-names',
				title: 'Stable names are still the calmest authoring default',
				paragraphs: [
					'Name-based storage bindings stay readable in source review and let Devflare resolve the noisy ids later when build, deploy, or config-print flows actually need them.',
					'That rule does not mean every binding works the same way, but it does keep the source-of-truth shape calmer for KV, D1, and Hyperdrive while R2 keeps its already-readable bucket names.'
				],
				snippets: [
					{
						title: 'Stable-name storage authoring',
						language: 'ts',
						code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'storage-worker',
	bindings: {
		kv: {
			CACHE: { name: 'cache-kv' }
		},
		d1: {
			DB: { name: 'app-db' },
			AUDIT: { id: 'existing-d1-id' }
		},
		hyperdrive: {
			POSTGRES: 'app-postgres'
		},
		r2: {
			ASSETS: 'app-assets'
		}
	}
})`
					}
				]
			},
			{
				id: 'r2-delivery-boundary',
				title: 'R2 still needs an explicit browser-delivery boundary',
				cards: [
					{
						title: 'Public assets',
						body: 'Use a public bucket on a custom domain when anonymous reads are the product, not an accident.'
					},
					{
						title: 'Private assets',
						body: 'Keep the bucket private and serve through a Worker that owns auth, headers, and cache policy.'
					},
					{
						title: 'Direct uploads',
						body: 'Mint short-lived upload URLs from the backend and store object keys instead of pretending permanent raw URLs are the whole product.'
					},
					{
						href: docsLink('r2-uploads-and-delivery'),
						label: 'Guide',
						meta: 'R2 architecture',
						title: 'R2 uploads & delivery',
						body: 'Open this when the real question is presigned uploads, public versus private delivery, Access protection, signed custom-domain media links, or the right dev-versus-production posture.'
					}
				],
				paragraphs: [
					'Devflare gives you real R2 bindings in worker code and tests, but it does not promise a stable browser-facing local bucket URL contract. If the browser needs the file in local dev, route through the app instead of assuming the bucket origin is the interface.'
				],
				snippets: [
					{
						title: 'Worker-gated file serving keeps the app boundary visible',
						language: 'ts',
						code: String.raw`import type { FetchEvent } from 'devflare/runtime'

export async function GET({ env, params }: FetchEvent<DevflareEnv>): Promise<Response> {
	const object = await env.FILES.get(params.key)
	if (!object) {
		return new Response('Not Found', { status: 404 })
	}

	return new Response(object.body, {
		headers: {
			'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
			'Cache-Control': 'private, max-age=0'
		}
	})
}`
					}
				]
			},
			{
				id: 'open-the-guide',
				title: 'Open the binding guide that owns the mechanics',
				cards: [
					{
						href: docsLink('bindings/kv'),
						label: 'Binding guide',
						meta: 'KV',
						title: 'KV',
						body: 'Open the KV guide when the storage shape is keyed lookup, cache-like state, or namespace lifecycle.'
					},
					{
						href: docsLink('bindings/d1'),
						label: 'Binding guide',
						meta: 'D1',
						title: 'D1',
						body: 'Open the D1 guide when the storage shape is query-driven and you need the actual SQL-shaped runtime contract.'
					},
					{
						href: docsLink('bindings/r2'),
						label: 'Binding guide',
						meta: 'R2',
						title: 'R2',
						body: 'Open the R2 guide when the real question is bucket usage, testing, preview naming, or file delivery details.'
					},
					{
						href: docsLink('bindings/hyperdrive'),
						label: 'Binding guide',
						meta: 'Hyperdrive',
						title: 'Hyperdrive',
						body: 'Open the Hyperdrive guide when the worker is reaching an existing PostgreSQL system and the operational caveats matter more than the storage taxonomy.'
					}
				]
			}
		]
	},
	{
		slug: 'r2-uploads-and-delivery',
		group: 'Guides',
		navTitle: 'R2 uploads & delivery',
		readTime: '7 min read',
		eyebrow: 'Guide',
		title:
			'Handle R2 uploads and file delivery explicitly instead of treating bucket URLs as the product',
		summary:
			'Use presigned `PUT` URLs for direct uploads, public buckets on custom domains for truly public assets, and private buckets plus Worker auth for protected files. Keep `r2.dev` out of production, and when a preview or environment needs its own bucket, scope it intentionally instead of borrowing production storage.',
		description:
			'R2 itself is easy to bind. The hard part is the product boundary: should the browser upload directly, should reads stay behind your Worker, should teammates authenticate through Access, or should expiring custom-domain links be validated by a Worker or WAF rule? This page is the architecture guide for those choices.',
		highlights: [
			'Use short-lived presigned `PUT` URLs for direct browser uploads instead of proxying large files through your app server or Worker.',
			'Use a public bucket on a custom domain only when the files are truly public; otherwise keep the bucket private and let a Worker own auth, headers, and cache policy.',
			'Presigned `GET` URLs work on the R2 S3 endpoint and behave like bearer tokens, but they do not work on custom domains.',
			'If a custom-domain bucket should be teammate-only, put it behind Cloudflare Access; if it needs expiring public links on that custom domain, use a Worker or WAF HMAC validation instead.',
			'Devflare gives you real local R2 bindings in runtime and tests, but it does not promise a stable browser-facing local bucket URL contract, so local browser flows should usually go through your Worker routes.'
		],
		facts: [
			{
				label: 'Safest upload default',
				value:
					'Presigned `PUT` URL plus browser-direct upload plus object key stored in your app database'
			},
			{ label: 'Safest private delivery default', value: 'Private bucket plus Worker-gated reads' },
			{ label: 'Do not ship this as prod delivery', value: '`r2.dev`' },
			{ label: 'Team-only fit', value: 'Custom domain plus Cloudflare Access' }
		],
		sourcePages: [
			'README.md',
			'schema-bindings.ts',
			'src/test/simple-context.ts',
			'src/bridge/proxy.ts',
			'packages/devflare/src/test/simple-context.ts',
			'apps/testing/*'
		],
		sections: [
			{
				id: 'quick-rules',
				title: 'The fast rule set',
				bullets: [
					'Use presigned `PUT` URLs for direct user uploads to R2.',
					'Use a public bucket on a custom domain for truly public assets.',
					'Use a private bucket plus Worker authorization for authenticated or tenant-scoped files.',
					'Use Cloudflare Access when the bucket should be visible only to teammates or your organization.',
					'Use a Worker-signed URL flow or WAF HMAC validation for expiring custom-domain media links.',
					'Do not use `r2.dev` for production delivery, and disable `r2.dev` if you protect a custom-domain bucket with Access or WAF so the bucket is not still public there.'
				],
				callouts: [
					{
						tone: 'accent',
						title: 'R2 binding mechanics are not the hard part',
						body: [
							'The architectural decision is whether the browser should talk to a signed upload URL, a public custom domain, or your own Worker route. That choice matters more than the one-line `bindings.r2` config.'
						]
					}
				]
			},
			{
				id: 'uploads',
				title: 'The usual safe upload flow is direct upload with a presigned `PUT` URL',
				steps: [
					'The frontend asks your app for upload permission.',
					'Your Worker or backend authenticates the user and validates file type, size, and the target object key.',
					'Your backend returns a short-lived presigned `PUT` URL.',
					'The browser uploads directly to R2.',
					'Your app stores the object key and metadata, not the presigned URL.'
				],
				paragraphs: [
					'This is the usual safe default because large files do not have to stream through your app server or Worker just to end up in object storage anyway.',
					"Cloudflare's UGC guidance says the same thing: let the Worker control auth and upload intent, then let the client stream directly to R2. If you need post-upload workflows, R2 event notifications can push object-create events into Queues for moderation, metadata writes, or follow-up processing."
				],
				bullets: [
					'Generate object keys server-side, for example `users/<userId>/<uuid>.jpg`.',
					'Restrict `Content-Type` when signing uploads so mismatched uploads fail signature validation.',
					'Keep upload URLs short-lived and treat them as bearer tokens while they remain valid.',
					'Configure bucket CORS when the browser uploads directly.',
					'If uploads arrive from many regions, Local Uploads can improve cross-region write performance without changing the overall architecture.'
				],
				cards: [
					{
						href: 'https://developers.cloudflare.com/r2/api/s3/presigned-urls/',
						label: 'Cloudflare docs',
						meta: 'Uploads',
						title: 'Presigned URLs',
						body: 'Covers supported operations, security considerations, and the custom-domain limitation for presigned URLs.'
					},
					{
						href: 'https://developers.cloudflare.com/r2/buckets/cors/',
						label: 'Cloudflare docs',
						meta: 'Browser uploads',
						title: 'Configure CORS',
						body: 'Use this when browser uploads or downloads cross origins and you need the exact allowed origins, methods, and headers model.'
					},
					{
						href: 'https://developers.cloudflare.com/r2/buckets/event-notifications/',
						label: 'Cloudflare docs',
						meta: 'Post-upload workflows',
						title: 'R2 event notifications',
						body: 'Use this when uploads should trigger queue-driven moderation, indexing, metadata writes, or other follow-up work.'
					}
				],
				callouts: [
					{
						tone: 'success',
						title: 'Store object keys, not presigned URLs',
						body: [
							'Presigned URLs are temporary access tokens. The durable thing your app should remember is the object key plus the metadata you care about.'
						]
					}
				]
			},
			{
				id: 'delivery-patterns',
				title: 'Choose the file-delivery pattern by who should be able to read the object',
				table: {
					headers: ['Pattern', 'Use it when', 'Main caveat'],
					rows: [
						[
							'Public bucket on a custom domain',
							'Images, assets, or media should be public and cacheable for anyone.',
							'Use a custom domain for real delivery; `r2.dev` is not the production path.'
						],
						[
							'Private bucket plus Worker-gated reads',
							'Access depends on the current user, tenant, payment state, or other app authorization.',
							'Your Worker becomes the delivery boundary, so own the auth, cache headers, and response metadata deliberately.'
						],
						[
							'Presigned `GET` URL on the S3 endpoint',
							'A download should be directly accessible for a short time without a custom delivery layer.',
							'Presigned URLs are bearer tokens and do not work with custom domains.'
						],
						[
							'Custom domain plus Cloudflare Access',
							'Only teammates or organization users should reach the bucket.',
							'Disable `r2.dev` so the bucket is not still reachable through the public development URL.'
						],
						[
							'Custom domain plus Worker token auth or WAF HMAC validation',
							'You want expiring direct links on `cdn.example.com` without exposing the whole bucket.',
							'This is not the same feature as presigned R2 URLs; you are building or validating the access layer at the custom domain boundary.'
						]
					]
				},
				paragraphs: [
					"Cloudflare's public bucket docs are clear about this split: custom domains are the right place for cache, WAF, Access, and other edge controls, while `r2.dev` is a development-oriented public URL and should not be treated as the polished product surface.",
					'When the content is private or app-controlled, the safest default is still a private bucket with a Worker route in front of it. That keeps auth and response headers under your control instead of forcing the bucket URL to become your application boundary.'
				],
				cards: [
					{
						href: 'https://developers.cloudflare.com/r2/buckets/public-buckets/',
						label: 'Cloudflare docs',
						meta: 'Public delivery',
						title: 'Public buckets',
						body: 'Covers custom domains, caching, access control, and the `r2.dev` production warning.'
					},
					{
						href: 'https://developers.cloudflare.com/r2/tutorials/cloudflare-access/',
						label: 'Cloudflare docs',
						meta: 'Team-only access',
						title: 'Protect an R2 bucket with Access',
						body: 'Best when the audience is your own organization rather than anonymous or app-authenticated users.'
					},
					{
						href: 'https://developers.cloudflare.com/waf/custom-rules/use-cases/configure-token-authentication/',
						label: 'Cloudflare docs',
						meta: 'Expiring links',
						title: 'Configure token authentication',
						body: 'Use this when expiring custom-domain media links should be validated with WAF HMAC rules instead of R2 presigned URLs.'
					}
				]
			},
			{
				id: 'dev-and-prod',
				title: 'Keep development and production boundaries honest',
				paragraphs: [
					"Cloudflare's development guidance says local Worker development uses local simulated bindings by default, and Devflare follows the same practical posture: local R2 bindings are available to your worker code, tests, and bridge helpers without requiring a real remote bucket just to iterate.",
					'Browser-visible local file flows should go through your Worker routes or app routes. Devflare does not promise a stable browser-facing local bucket origin, and depending on one would make local behavior more brittle than the product boundary probably needs to be.'
				],
				snippets: [
					{
						title: 'Serve a private object through the Worker in local dev and production',
						language: 'ts',
						code: r2WorkerDeliveryCode
					}
				],
				bullets: [
					'Only connect local development to a real remote bucket when you intentionally need integration testing.',
					'Use separate development, staging, or preview buckets instead of production buckets when remote R2 access becomes necessary.',
					'Remote bindings touch real data, incur real costs, and add real latency.',
					'In production, use a custom domain, choose public versus private delivery intentionally, configure CORS deliberately, and consider Local Uploads when uploaders are globally distributed.'
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Remote dev is not a harmless toggle',
						body: [
							'If your local Worker talks to a remote bucket, it is touching real data and real billing surfaces. Prefer separate dev or preview buckets, and avoid pointing local workflows at production uploads unless the test truly requires it.'
						]
					}
				]
			},
			{
				id: 'recommended-defaults',
				title: 'A sane default architecture',
				bullets: [
					'Public assets → public bucket plus custom domain.',
					'User uploads → presigned `PUT` upload plus object key stored in D1 or another app database.',
					'Private assets → private bucket plus Worker-gated reads.',
					'Internal assets → custom domain plus Cloudflare Access.',
					'Custom-domain expiring links → Worker token auth or WAF HMAC validation.',
					'Preview-owned buckets → pair the R2 binding with `preview.scope()` so preview cleanup can remove the preview bucket without touching production storage.'
				],
				cards: [
					{
						href: docsLink('bindings/r2'),
						label: 'Binding guide',
						meta: 'R2 mechanics',
						title: 'R2 binding guide',
						body: 'Open this once the architecture choice is done and the next question is the exact binding shape, local runtime behavior, or testing posture.'
					},
					{
						href: docsLink('config-previews'),
						label: 'Configuration',
						meta: 'Preview-owned resources',
						title: 'Preview-scoped bindings',
						body: 'Open this when preview deployments should own separate buckets or other disposable infrastructure that can be cleaned up by scope later.'
					},
					{
						href: docsLink('create-test-context'),
						label: 'Testing',
						meta: 'Local harness',
						title: 'createTestContext()',
						body: 'Open this when the next question is how the local worker-shaped test harness exposes real R2 bindings and helper surfaces.'
					}
				],
				callouts: [
					{
						tone: 'info',
						title: 'If you only remember one rule',
						body: [
							'Use presigned URLs for short-lived direct R2 access, but use a Worker or custom-domain auth layer for polished private media delivery.'
						]
					}
				]
			}
		]
	},
	{
		slug: 'durable-objects-and-queues',
		group: 'Guides',
		navTitle: 'State & async patterns',
		readTime: '6 min read',
		eyebrow: 'Binding strategy',
		title:
			'Choose Durable Objects for single-identity state, queues for deferred work, and the binding guides for the mechanics',
		summary:
			'Use Durable Objects when one identity should own state or coordination. Use queues when work should happen later, in batches, or with retries. Then open the specific binding guide once the pattern is clear.',
		description:
			'This page is the pattern chooser for stateful or deferred work. It should help you decide when a Durable Object, a queue, or a mix of both fits the job without turning into a duplicate reference page for either binding.',
		highlights: [
			'Durable Objects own state and coordination behind one object identity.',
			'Queues own deferred work, batching, retries, and dead-letter behavior.',
			'Some systems use both: the request path or object owns the immediate state, then a queue owns the slower follow-up work.',
			'Preview and testing questions usually belong on the binding guides once the basic pattern choice is done.'
		],
		facts: [
			{
				label: 'Best for',
				value: 'Choosing between stateful identities, background work, or a mix of both'
			},
			{ label: 'Choose by', value: 'State ownership vs deferred work ownership' },
			{
				label: 'Best local proof',
				value: 'One real object call or one real queue trigger through the default harness'
			},
			{
				label: 'Preview warning',
				value:
					'Durable Object-heavy previews and queue-owned resources have different release questions'
			}
		],
		sourcePages: [
			'packages/devflare/src/config/schema-bindings.ts',
			'README.md',
			'schema-bindings.ts',
			'do-bundler.ts',
			'queue.ts',
			'packages/devflare/src/cli/commands/deploy.ts'
		],
		sections: [
			{
				id: 'choose-the-pattern',
				title: 'Choose the primitive by ownership, not by vibes',
				paragraphs: [
					'The decision is easier when you ask who owns the work. If one stateful identity should serialize and own it, that points toward Durable Objects. If the request can accept the work and let something else finish it later, that points toward queues.',
					'Once that choice is made, the specific binding guide should take over so this page does not try to restate every authoring and testing rule for both bindings.'
				],
				table: {
					headers: ['Pattern', 'Reach for it when', 'Usually the wrong fit'],
					rows: [
						[
							'`Durable Objects`',
							'One identity should own state, coordination, ordering, alarms, or WebSocket-adjacent behavior.',
							'The work is fire-and-forget, batchable, or mainly about retries.'
						],
						[
							'`Queues`',
							'The request can enqueue work and return while a consumer handles retries, batching, or slow follow-up tasks.',
							'The user needs the state transition to finish synchronously in the request path.'
						],
						[
							'`Use both`',
							'A request or Durable Object owns the immediate state, then enqueues slower side work such as email, indexing, or downstream writes.',
							'One primitive already tells the whole story and the second one would only add ceremony.'
						]
					]
				},
				callouts: [
					{
						tone: 'info',
						title: 'The point is pattern fit, not duplicate reference docs',
						body: [
							'If you already know you need a Durable Object or a queue, the binding guide is the next page. This page is here for the choice, not the full mechanics.'
						]
					}
				]
			},
			{
				id: 'keep-the-shapes-explicit',
				title: 'Keep the config shapes explicit once you know the pattern',
				paragraphs: [
					'Both patterns work better when the binding contract is visible in config. Durable Objects should name the object classes or refs clearly, and queues should keep producers, consumers, and dead-letter rules in one authored shape instead of hiding them in deployment-only conventions.'
				],
				snippets: [
					{
						title: 'Durable Object binding authoring should stay boring and explicit',
						language: 'ts',
						code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'stateful-worker',
	files: {
		durableObjects: 'src/do/**/*.ts'
	},
	bindings: {
		durableObjects: {
			LOGGER: {
				className: 'Logger'
			}
		}
	}
})`
					},
					{
						title: 'Queue config should keep producer and consumer ownership visible',
						language: 'ts',
						code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'queue-worker',
	bindings: {
		queues: {
			producers: {
				TASK_QUEUE: 'task-queue'
			},
			consumers: [
				{
					queue: 'task-queue',
					deadLetterQueue: 'task-queue-dlq'
				}
			]
		}
	}
})`
					}
				]
			},
			{
				id: 'testing-and-preview-boundaries',
				title: 'Testing and preview questions are different for the two patterns',
				bullets: [
					'Durable Object tests are best at local object behavior, identity lookup, and stateful coordination. They do not replace migration or preview-topology checks.',
					'Queue tests are best at direct consumer behavior, retries, batching, and side effects through `cf.queue.trigger()`. They do not replace preview resource lifecycle checks.',
					'Durable Object-heavy preview flows deserve extra care because same-worker preview URLs and migrations have real platform caveats.',
					'If the real question is no longer “which primitive fits?” switch to the binding guide or the preview docs before this page starts repeating them badly.'
				],
				cards: [
					{
						href: docsLink('preview-strategies'),
						label: 'Ship & operate',
						meta: 'Preview caveats',
						title: 'Preview strategies',
						body: 'Open this when the real question is how Durable Objects or preview-scoped queue resources change the preview model.'
					},
					{
						href: docsLink('testing-overview'),
						label: 'Testing',
						meta: 'Map',
						title: 'Testing overview',
						body: 'Use the testing map when the next question is about the right harness or which docs own the testing guidance.'
					}
				]
			},
			{
				id: 'open-the-guides',
				title: 'Open the binding guide once the pattern is obvious',
				cards: [
					{
						href: docsLink('bindings/durable-objects'),
						label: 'Binding guide',
						meta: 'Durable Objects',
						title: 'Durable Objects',
						body: 'Open the Durable Objects guide for the real binding shape, local tests, migrations, and preview caveats.'
					},
					{
						href: docsLink('bindings/queues'),
						label: 'Binding guide',
						meta: 'Queues',
						title: 'Queues',
						body: 'Open the Queues guide for producer and consumer authoring, queue tests, and preview resource lifecycle details.'
					}
				]
			}
		]
	},
	{
		slug: 'multi-workers',
		group: 'Guides',
		navTitle: 'Worker composition',
		readTime: '6 min read',
		eyebrow: 'Composition',
		title: 'Compose worker families with service bindings when another worker is a real dependency',
		summary:
			'Use this page for the architecture question: when a separate worker boundary is justified, how `ref()` and service bindings keep it explicit, and where local tests and release checks should prove the wiring.',
		description:
			'The Services guide can explain the mechanics. This page exists for the composition question: when should another worker exist at all, how do you keep the boundary explicit, and which docs own the deeper service details once you commit to it?',
		highlights: [
			'Reach for another worker when the runtime boundary is real, not just because one file feels crowded.',
			'Use `ref()` and service bindings so worker relationships stay explicit in config, tests, and generated output.',
			'One real local service call is the shortest honest proof of the wiring.',
			'Preview isolation depends on resolved worker names, so naming validation still matters after the local test passes.'
		],
		facts: [
			{
				label: 'Best for',
				value:
					'Service bindings, worker families, and deciding when another worker boundary is actually real'
			},
			{ label: 'Core tools', value: '`ref()`, service bindings, and generated env types' },
			{
				label: 'Best local proof',
				value: '`createTestContext()` plus one real service call through `env.MY_SERVICE`'
			},
			{ label: 'Main release risk', value: 'Resolved worker naming and preview topology drift' }
		],
		sourcePages: [
			'packages/devflare/src/config/schema-bindings.ts',
			'README.md',
			'schema-bindings.ts',
			'ref.ts',
			'resolve-service-bindings.ts',
			'generator.ts',
			'case5/*'
		],
		sections: [
			{
				id: 'choose-the-boundary',
				title: 'Choose another worker only when the boundary is real',
				paragraphs: [
					'The goal is not to split one worker just because the file count went up. The goal is to give a real runtime boundary a real worker boundary, then let service bindings make that relationship explicit enough for tooling and review.',
					'That means this page should answer the architecture choice first. The Services guide can take over once the answer is already “yes, another worker should exist.”'
				],
				table: {
					headers: ['If the real thing is...', 'Prefer...', 'Why'],
					rows: [
						[
							'A separate runtime capability or internal API',
							'`Service bindings` and another worker',
							'The boundary is a real worker-to-worker relationship, not just shared state.'
						],
						[
							'One stateful identity or serialized mutation lane',
							'`Durable Objects`',
							'The core need is state ownership, not another general-purpose service boundary.'
						],
						[
							'Shared data, files, or a background job handoff',
							'`KV`, `D1`, `R2`, or `Queues`',
							'The problem is data or deferred work, not a second worker API.'
						]
					]
				},
				callouts: [
					{
						tone: 'info',
						title: 'A good review question',
						body: [
							'Ask “what does this second worker own that a binding or Durable Object would not?” before you celebrate the split.'
						]
					}
				]
			},
			{
				id: 'model-the-relationship',
				title: 'Model the relationship with `ref()` so the worker family stays explicit',
				paragraphs: [
					'If another worker is real, the relationship belongs in config instead of in copied worker names or half-remembered script references. `ref()` gives Devflare enough structure to follow the dependency into local runtime, generated env types, and compiled output.',
					'Keep the architecture example simple: one referenced worker and one explicit service binding are enough to show the boundary. Named entrypoints are real too, but the Services and generated-types pages own that deeper contract once the worker boundary itself is already justified.'
				],
				snippets: [
					{
						title: 'Model the worker family with `ref()` and one explicit service binding',
						language: 'ts',
						code: String.raw`import { defineConfig, ref } from 'devflare/config'

const mathWorker = ref(() => import('../math-service/devflare.config'))

export default defineConfig({
	name: 'gateway',
	bindings: {
		services: {
			MATH_SERVICE: mathWorker.worker
		}
	}
})`
					}
				]
			},
			{
				id: 'prove-the-wiring',
				title: 'Prove the wiring locally, then validate the names before release',
				paragraphs: [
					'The shortest truthful proof is one real service call through the generated env binding. That already shows the config relationship, the local multi-worker setup, and the callable surface the gateway worker will actually use.',
					'But the release question is still different: local tests prove the call path, not that preview or production worker names resolve the way you intended.'
				],
				snippets: [
					{
						title: 'One real service call through the default harness',
						language: 'ts',
						code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, env } from 'devflare/test'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('service binding calls the default worker export', async () => {
	expect(await env.MATH_SERVICE.add(5, 3)).toBe(8)
})`
					}
				],
				bullets: [
					'Use the bound env service directly when the worker relationship is the thing you want to prove.',
					'Refresh generated types when the service contract changes, and open the generated types page when named entrypoints become part of that contract.',
					'Preview isolation follows resolved worker names, not just which branch variable existed in CI.',
					'Validate compiled or preview naming when the worker family is business-critical.'
				]
			},
			{
				id: 'open-the-service-lane',
				title: 'Open the service-specific pages once the architecture choice is done',
				cards: [
					{
						href: docsLink('bindings/services'),
						label: 'Binding guide',
						meta: 'Services',
						title: 'Services guide',
						body: 'Open the service guide for the exact binding shape, env typing, and compiler behavior once another worker is definitely the right boundary.'
					},
					{
						href: docsLink('bindings/services/testing'),
						label: 'Testing',
						meta: 'Services',
						title: 'Testing Services',
						body: 'Open the service testing guide when the next question is the right default harness or how to test named entrypoints accurately.'
					},
					{
						href: docsLink('generated-types'),
						label: 'Configuration',
						meta: 'Typed contracts',
						title: 'Generated types',
						body: 'Open this page when `ref()` relationships, named entrypoints, or `defineConfig<Entrypoints>()` typing becomes the real question.'
					},
					{
						href: docsLink('preview-strategies'),
						label: 'Ship & operate',
						meta: 'Preview topology',
						title: 'Preview strategies',
						body: 'Open the preview page when the worker family needs real isolation and the naming model is the release question now.'
					},
					{
						href: docsLink('testing-overview'),
						label: 'Testing',
						meta: 'Map',
						title: 'Testing overview',
						body: 'Use the testing map when the next question is broader than service bindings alone.'
					}
				]
			}
		]
	}
]
