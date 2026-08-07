import type { DocPage } from '../../types'
import {
	customDomainRouteCode,
	docsLink,
	environmentOverlayCode,
	fullConfigExampleCode,
	generatedTypesOutputCode,
	previewBindingsConfigCode,
	previewBindingsLifecycleCode,
	projectShapeConfigCode,
	runtimeDeploySettingsCode,
	workerSurfacesConfigCode,
	workersDevRouteCode,
	workersRouteCode,
	zoneResourcesCode
} from './shared'

export const configurationDocsPart3: DocPage[] = [
	{
		slug: 'runtime-deploy-settings',
		group: 'Devflare',
		navTitle: 'Runtime & deploy settings',
		readTime: '7 min read',
		eyebrow: 'Configuration',
		title:
			'Keep runtime posture and deployment shape in authored config instead of scattered deploy conventions',
		summary:
			'Use config for account context, compatibility posture, assets, deployment routes, WebSocket proxy rules, migrations, observability, limits, and preview cron behavior instead of rediscovering those settings in scripts later.',
		description:
			'Devflare exposes several config lanes that are not about file discovery at all. These keys shape runtime identity, Cloudflare compatibility, deployment routing, assets, release behavior, and operational posture, so they belong in authored config where the team can review them accurately.',
		highlights: [
			'`accountId` matters when remote bindings, name-based resource resolution, or account-aware operations should target one Cloudflare account explicitly.',
			'`compatibilityDate` defaults to the current date, and Devflare always includes `nodejs_compat` plus `nodejs_als` in compatibility flags.',
			'`assets`, `routes`, and `wsRoutes` shape delivery and dev behavior; they are not the same thing as app routing under `files.routes`.',
			'`limits`, `observability`, `migrations`, and `previews.includeCrons` are source-controlled runtime and release knobs; in practice `previews.includeCrons` decides whether branch-scoped preview deploys keep cron triggers.'
		],
		facts: [
			{
				label: 'Best for',
				value:
					'Projects that need explicit runtime posture and delivery shape beyond the basic file surfaces'
			},
			{ label: 'Forced compatibility flags', value: '`nodejs_compat` and `nodejs_als`' },
			{
				label: 'Routing split',
				value:
					'`files.routes` is app routing, while top-level `routes` is Cloudflare deployment routing'
			},
			{ label: 'Preview cron default', value: '`previews.includeCrons` defaults to `false`' }
		],
		sourcePages: [
			'src/config/schema.ts',
			'src/config/schema-runtime.ts',
			'src/config/schema-env.ts',
			'src/dev-server/server.ts',
			'src/vite/plugin.ts',
			'https://developers.cloudflare.com/workers/configuration/routing/',
			'https://developers.cloudflare.com/workers/configuration/routing/custom-domains/',
			'https://developers.cloudflare.com/workers/configuration/routing/routes/',
			'https://developers.cloudflare.com/workers/configuration/routing/workers-dev/',
			'https://developers.cloudflare.com/workers/wrangler/configuration/#types-of-routes'
		],
		sections: [
			{
				id: 'identity-and-compat',
				title: 'Set runtime identity and compatibility posture explicitly',
				paragraphs: [
					'Not every package needs the full advanced runtime section on day one, but once remote bindings, compatibility drift, or account-aware operations matter, these settings should move into config instead of living in loose scripts and remembered defaults.',
					'The important habit is that runtime posture should be reviewable in source control. If a package relies on a specific compatibility date or a specific Cloudflare account, that fact should be obvious before the deploy step runs.'
				],
				table: {
					headers: ['Key', 'Use it when', 'Important behavior'],
					rows: [
						[
							'`accountId`',
							'Remote bindings, name-based resource lookup, or account-aware commands should target one Cloudflare account explicitly.',
							'Remote AI and Vectorize flows need a clear account, and config-level `accountId` becomes one resolution lane for account-aware operations and config-driven resource resolution.'
						],
						[
							'`compatibilityDate`',
							'The package should pin runtime behavior instead of inheriting date drift.',
							'Devflare defaults it to the current date when you omit it, so explicit pinning is the safer choice once the package is real.'
						],
						[
							'`compatibilityFlags`',
							'You need extra Workers compatibility flags beyond the default posture.',
							'Devflare always includes `nodejs_compat` and `nodejs_als`, so custom flags should be deliberate additions instead of copy-by-habit repetition.'
						]
					]
				},
				callouts: [
					{
						tone: 'info',
						title: 'Do not restate the forced flags unless you are making a point',
						body: [
							'Devflare already includes `nodejs_compat` and `nodejs_als`. Keep `compatibilityFlags` focused on the extra posture your package actually needs.'
						]
					}
				]
			},
			{
				id: 'cloudflare-routing-models',
				title: 'Choose the Cloudflare endpoint model first',
				paragraphs: [
					'Cloudflare documents three inbound endpoint models for Workers: Custom Domains, normal Workers routes, and the automatic `workers.dev` route. They are not interchangeable, and Devflare keeps that distinction in the top-level `routes` config instead of inventing a second routing vocabulary.',
					'Use a Custom Domain when the Worker is the origin for a whole hostname. Use a normal Workers route when a Worker should sit in front of an existing proxied hostname, match a wildcard host, or match a path prefix. Use `workers.dev` for getting started or preview-style reachability, and disable it when production should only be reachable through your own domain.'
				],
				table: {
					headers: ['Goal', 'Devflare config shape', 'Cloudflare behavior'],
					rows: [
						[
							'Worker owns every path on one hostname',
							'`routes: [{ pattern: "app.example.com", custom_domain: true }]`',
							'Custom Domains match the exact hostname; paths and query strings do not participate in the match.'
						],
						[
							'Worker intercepts a path or wildcard host in a Cloudflare zone',
							'`routes: [{ pattern: "app.example.com/api/*", zone_name: "example.com" }]`',
							'Normal routes use route patterns, may include `*`, and the most specific matching route wins.'
						],
						[
							'Worker remains reachable on the account subdomain',
							'Default generated Wrangler config keeps `workers_dev: true`.',
							'Cloudflare assigns `<worker>.<account>.workers.dev`; Cloudflare recommends routes or custom domains for production.'
						]
					]
				},
				snippets: [
					{
						title: 'Custom Domain for a Worker-owned hostname',
						language: 'ts',
						code: customDomainRouteCode
					},
					{
						title: 'Workers route for path or wildcard matching',
						language: 'ts',
						code: workersRouteCode
					},
					{
						title: 'Disable workers.dev when only custom endpoints should serve production',
						language: 'ts',
						code: workersDevRouteCode
					}
				],
				callouts: [
					{
						tone: 'info',
						title: 'Routes can sit in front of Custom Domains',
						body: [
							'Cloudflare treats a Worker on a Custom Domain as an origin. A more specific normal route on the same hostname can run first, then call `fetch(request)` to invoke the Custom Domain Worker behind it.'
						]
					},
					{
						tone: 'warning',
						title: 'Same-zone fetch is different for routes and Custom Domains',
						body: [
							'Cloudflare documents that Custom Domains can be invoked by same-zone `fetch()`, while normal routes cannot be the target of same-zone `fetch()` and should use service bindings for Worker-to-Worker calls.'
						]
					}
				]
			},
			{
				id: 'deploy-shape',
				title: 'Keep deployment shape in config, not in app routing or shell scripts',
				paragraphs: [
					'Several config keys answer deployment questions rather than application-routing questions. Keeping those lanes separate is what stops app URLs, Cloudflare routes, and dev-only WebSocket proxy behavior from collapsing into one blurry story.',
					'If the package serves static assets, mounts a custom domain, or proxies Durable Object WebSockets in development, that shape should live in config beside the rest of the deployment contract.',
					'Custom Domains are host-only: use `custom_domain: true` with a bare hostname such as `docs.example.com`. For wildcard or path matching such as `docs.example.com/*` or `docs.example.com/api/*`, use a normal Workers route with `zone_name` or `zone_id` instead.'
				],
				table: {
					headers: ['Key', 'What it controls', 'Common use'],
					rows: [
						[
							'`assets`',
							'Static asset directory plus optional binding name',
							'Point Devflare at one static directory and keep asset delivery visible in source.'
						],
						[
							'`routes`',
							'Cloudflare deployment route patterns',
							'Attach the Worker to host or zone patterns at deploy time.'
						],
						[
							'`wsRoutes`',
							'Dev-mode Durable Object WebSocket proxy patterns',
							'Forward development WebSocket paths into Durable Object namespaces explicitly.'
						]
					]
				},
				snippets: [
					{
						title: 'One place for runtime posture and deployment-facing settings',
						language: 'ts',
						code: runtimeDeploySettingsCode
					}
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Top-level `routes` is not the same thing as `files.routes`',
						body: [
							'`files.routes` controls your app route tree. Top-level `routes` controls Cloudflare deployment routing. Keep those ideas separate so the package stays reviewable.'
						]
					},
					{
						tone: 'warning',
						title: 'Custom Domains are not wildcard routes',
						body: [
							'Cloudflare Custom Domains match the hostname exactly and ignore paths. Do not add `/*` when `custom_domain: true`; a request to any path on that hostname will already invoke the Worker.'
						]
					}
				]
			},
			{
				id: 'zone-resources',
				title: 'Declare zone-scoped resources instead of clicking them into the dashboard',
				paragraphs: [
					'Everything else Devflare provisions is account-scoped. Email Routing rules and DNS records are not: they belong to a zone, which is a different identifier reached by a different lookup and gated by a different token scope. The `zones` key is where they are declared, and a deploy reconciles them.',
					'The key is a domain rather than a zone id, because a domain is what an author knows. Devflare walks the domain labels up to the apex to find the zone, so `mail.example.com` is configured under its own name and its records land in the `example.com` zone. A relative record name resolves against the domain it was declared under, not the zone apex — for a subdomain those differ, and the apex would be the wrong place.',
					'Rules reconcile on the address they claim and records on their type and name, so deploying twice is a no-op rather than a pile of duplicates. Nothing is ever deleted: a zone almost always carries rules and records this config never mentioned.'
				],
				table: {
					headers: ['Declared', 'What a deploy does', 'What it will not do'],
					rows: [
						[
							'`emailRouting.rules`',
							'Creates any rule whose address is not already claimed.',
							'Rewrite one that exists and points elsewhere — it reports the difference instead.'
						],
						[
							'`emailRouting.catchAll`',
							'Sets it, but only when it differs from what is live.',
							'Touch it at all when the key is omitted.'
						],
						[
							'`emailRouting.enable`',
							'Turns Email Routing on for the zone.',
							'Turn it on without this — a zone with routing off fails the deploy instead.'
						],
						[
							'`dns`',
							'Creates a missing record, and rewrites one that drifted in content, TTL or MX priority.',
							'Guess which record it owns when several already share that type and name.'
						]
					]
				},
				snippets: [
					{
						title: 'Email routing and DNS as authored config',
						language: 'ts',
						code: zoneResourcesCode
					}
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Declaring a DNS record means owning it',
						body: [
							'A declared record that drifted in content, TTL or MX priority is rewritten to match, because that is what declarative means — and it is what turns a staged DMARC rollout into a config edit rather than a dashboard visit. The consequence is that you must not declare a record another system writes.',
							'Cloudflare writes and LOCKS its own records when a domain is onboarded to Email Routing or Email Sending: the `MX` and SPF `TXT` on `cf-bounce.<domain>`, the DKIM key at `cf-bounce._domainkey.<domain>`, and a DMARC policy at `_dmarc.<domain>`. Check what is already there before declaring anything in that set — a DMARC record in particular may already exist and belong to Cloudflare.'
						]
					},
					{
						tone: 'warning',
						title: 'A type and name pair is a record SET, not one record',
						body: [
							'An apex `TXT` routinely holds an SPF record AND a vendor verification string; `MX` and `A` hold several by design. So when more than one record already exists for a declared type and name, Devflare refuses rather than picking one: rewriting the wrong one destroys an unrelated record, and for SPF it also leaves the domain with two SPF records, which is a permanent error for the whole domain under RFC 7208.',
							'It resolves the ambiguity only when it can do so safely — exactly one record carrying its own `Managed by Devflare` comment, or exactly one whose content already matches. Otherwise it names the count and stops, and you either remove the extras or mark the one it should own with that comment.'
						]
					},
					{
						tone: 'warning',
						title: 'Enabling Email Routing rewrites the zone MX records',
						body: [
							'That changes where all mail for the domain is delivered, which is too large a side effect to follow from someone adding a forwarding rule. So it is never inferred: `enable: true` is the authorization, and without it a zone with routing off fails the deploy and says what to do. Existing mail flow for a domain is not something a deploy should be able to redirect by accident.'
						]
					},
					{
						tone: 'info',
						title: '`--dry-run` reads the live zone but changes nothing in it',
						body: [
							'Every zone mutation is substituted in describe-only mode, enabling included, while the reads still happen for real — so the plan reflects the actual mix of what exists and what does not, without a single write. Preview-scoped deploys have no zone resources at all: a rule or a record is shared by the whole domain and would outlive the branch that created it.'
						]
					}
				]
			},
			{
				id: 'release-controls',
				title: 'Put release and operational controls in source control too',
				table: {
					headers: ['Key', 'Why it exists'],
					rows: [
						[
							'`previews.includeCrons`',
							'Choose whether branch-scoped preview deploys keep cron triggers instead of omitting them to avoid shared-schedule conflicts.'
						],
						[
							'`limits.cpu_ms`',
							'Declare CPU expectations in config rather than treating them as after-the-fact deploy tuning.'
						],
						[
							'`observability.enabled` / `head_sampling_rate`',
							'Keep tracing or sampling posture explicit for the environments that need it.'
						],
						[
							'`migrations`',
							'Track Durable Object class lifecycle in the same source-controlled package that owns those classes.'
						]
					]
				},
				paragraphs: [
					'Once a package has Durable Object history, production traffic expectations, or explicit preview behavior, the runtime contract is no longer just “what files exist?” It also includes how that package should be migrated, sampled, and limited at runtime.',
					'These settings belong in the same config as the Worker surfaces. They are part of the deployable contract, not just garnish around it.'
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Durable Object migrations still deserve explicit release thinking',
						body: [
							'Keep migrations authored in config and remember that plain preview uploads do not apply Durable Object migrations. If the preview must exercise real Durable Object lifecycle changes, use the preview strategy that matches that reality.'
						]
					}
				]
			},
			{
				id: 'related-pages',
				title: 'Open the neighboring page when the setting changes the larger deployment story',
				cards: [
					{
						label: 'Configuration',
						title: 'Need environment overlays?',
						body: 'Use the environments page when these settings differ by preview, production, or another named lane.',
						href: docsLink('config-environments')
					},
					{
						label: 'Configuration',
						title: 'Need preview-scoped bindings?',
						body: 'Open the previews config page when preview deployments should own separate databases, buckets, or queues that can be cleaned up by scope later.',
						href: docsLink('config-previews')
					},
					{
						label: 'Ship & operate',
						title: 'Need the production story?',
						body: 'The production deploy page covers explicit deploy targets and the inspection tools that belong beside them.',
						href: docsLink('production-deploys')
					},
					{
						label: 'Ship & operate',
						title: 'Need preview behavior?',
						body: 'Preview strategy docs cover named preview scopes, same-worker uploads, and the Durable Object caveats around them.',
						href: docsLink('preview-strategies')
					},
					{
						label: 'Routing',
						title: 'Need app-route shape?',
						body: 'Open the routing page when the question is your route tree or request middleware, not Cloudflare deployment routes.',
						href: docsLink('http-routing')
					}
				]
			}
		]
	}
]
