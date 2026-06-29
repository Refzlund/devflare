import type { DocCard } from '../../types'
import { docsLink, supportCoverageTooltips } from './shared'

function supportCard(card: Omit<DocCard, 'labelTooltip'>): DocCard {
	const label = card.label as keyof typeof supportCoverageTooltips

	return {
		...card,
		labelTooltip: supportCoverageTooltips[label]
	}
}

export const cloudflarePlatformSupportCards: DocCard[] = [
	supportCard({
		label: 'Full',
		meta: 'Storage',
		title: 'KV',
		body: 'Named config, generated types, local runtime behavior, and `createTestContext()` or `createOfflineEnv()` tests for lookup state and lightweight shared data.',
		href: docsLink('bindings/kv')
	}),
	supportCard({
		label: 'Full',
		meta: 'Storage',
		title: 'D1',
		body: 'SQLite-style local behavior, id or name-based config, generated env typing, and realistic query tests through the same binding shape used in Workers.',
		href: docsLink('bindings/d1')
	}),
	supportCard({
		label: 'Full',
		meta: 'Storage',
		title: 'R2',
		body: 'Object storage config, local bucket behavior, generated env typing, and runtime-shaped tests. The caveat is Cloudflare object delivery URLs, not the binding itself.',
		href: docsLink('bindings/r2')
	}),
	supportCard({
		label: 'Full',
		meta: 'State',
		title: 'Durable Objects',
		body: 'Stateful object wiring, discovery, generated config, local namespaces, and test access, including cross-worker references. Preview lifecycle still follows Cloudflare limits.',
		href: docsLink('bindings/durable-objects')
	}),
	supportCard({
		label: 'Full',
		meta: 'Async',
		title: 'Queues',
		body: 'Producer and consumer config, local queue-trigger tests, generated env typing, and worker-surface composition for background work.',
		href: docsLink('bindings/queues')
	}),
	supportCard({
		label: 'Full',
		meta: 'Multi-worker',
		title: 'Services',
		body: '`ref()` service bindings, typed worker-to-worker env contracts, local multi-worker runtime, and tests that call the same service binding the app uses.',
		href: docsLink('bindings/services')
	}),
	supportCard({
		label: 'Remote',
		meta: 'Remote AI',
		title: 'AI',
		body: 'Native config, generated types, deploy support, and AI Gateway method coverage are present. Real inference, model behavior, billing, and most meaningful tests remain Cloudflare remote behavior.',
		href: docsLink('bindings/ai')
	}),
	supportCard({
		label: 'Remote',
		meta: 'Remote vector search',
		title: 'Vectorize',
		body: 'Native config, generated types, preview-aware resource naming, and remote-mode tests are supported. Real index semantics and similarity results require Cloudflare.',
		href: docsLink('bindings/vectorize')
	}),
	supportCard({
		label: 'Limited',
		meta: 'Database path',
		title: 'Hyperdrive',
		body: 'Config, name resolution, local connection strings, and Miniflare-backed Hyperdrive bindings support ordinary app queries through the populated connection fields. The raw socket `connect()` is the one named gap — the local shim throws there, and Miniflare establishes real Hyperdrive sockets only inside a `createTestContext()` run. Hosted pooling, placement, credentials, and production routing remain Cloudflare behavior.',
		href: docsLink('bindings/hyperdrive')
	}),
	supportCard({
		label: 'Limited',
		meta: 'Browser runtime',
		title: 'Browser Rendering',
		body: 'Native config, generated typing, route examples, and bridge-backed dev-server support through the local browser-rendering shim. Live view, human-in-the-loop, recordings, and external CDP stay hosted, so the local contract is intentionally narrower than the deployed product.',
		href: docsLink('bindings/browser-rendering')
	}),
	supportCard({
		label: 'Limited',
		meta: 'Analytics',
		title: 'Analytics Engine',
		body: 'Dataset bindings are configured in Devflare and compiled for deploy. Local delivery is not yet wired into the dev/test Miniflare config; Miniflare ships a native Analytics Engine plugin whose `writeDataPoint()` is a write-shape-only no-op (it records nothing), so it is not an inherent remote boundary — production ingestion and query behavior remain hosted.',
		href: docsLink('bindings/analytics-engine')
	}),
	supportCard({
		label: 'Full',
		meta: 'Email',
		title: 'Send Email',
		body: 'Outbound email bindings have native config, local support, and test access through the env binding. Inbound email handlers are a separate Worker surface.',
		href: docsLink('bindings/send-email')
	}),
	supportCard({
		label: 'Full',
		meta: 'Rate limits',
		title: 'Rate Limiting',
		body: 'Native fixed-window config, Miniflare-backed local behavior, generated typing, and pure mocks support deterministic application-level rate-limit tests.',
		href: docsLink('bindings/rate-limiting')
	}),
	supportCard({
		label: 'Full',
		meta: 'Deployment metadata',
		title: 'Version Metadata',
		body: 'Native config, deterministic local metadata, and test helpers support version-aware responses and diagnostics without requiring Cloudflare state.',
		href: docsLink('bindings/version-metadata')
	}),
	supportCard({
		label: 'Limited',
		meta: 'Dynamic workers',
		title: 'Worker Loaders',
		body: 'Devflare wires Worker Loader `fetch` entrypoints through Miniflare and pure test stubs, so local apps can load explicit Worker payloads without Cloudflare. The named gap is `getDurableObjectClass()`: the local shim throws because that opaque facet-spawning reference only exists inside the runtime. Upload, discovery, and hosted lifecycle stay on the platform.',
		href: docsLink('bindings/worker-loaders')
	}),
	supportCard({
		label: 'Full',
		meta: 'Secrets',
		title: 'Secrets Store',
		body: 'Native config, Miniflare wiring, and explicit local fixtures cover app code that reads Secrets Store values. Devflare still does not read, provision, or sync account secret values.',
		href: docsLink('bindings/secrets-store')
	}),
	supportCard({
		label: 'Remote',
		meta: 'Hosted search',
		title: 'AI Search',
		body: 'Native instance and namespace config plus deterministic fixtures can test application flow. Crawling, indexing, ranking, and hosted model behavior stay in Cloudflare.',
		href: docsLink('bindings/ai-search')
	}),
	supportCard({
		label: 'Remote',
		meta: 'Outbound TLS',
		title: 'mTLS Certificates',
		body: 'Native config and Fetcher-shaped local fixtures are supported. Real client-certificate presentation and certificate lifecycle remain Wrangler and Cloudflare remote behavior.',
		href: docsLink('bindings/mtls-certificates')
	}),
	supportCard({
		label: 'Remote',
		meta: 'Workers for Platforms',
		title: 'Dispatch Namespaces',
		body: 'Native dispatch namespace bindings and tenant Fetcher fixtures are supported. Devflare does not upload tenant Workers or emulate the Workers for Platforms control plane.',
		href: docsLink('bindings/dispatch-namespaces')
	}),
	supportCard({
		label: 'Full',
		meta: 'Long-running work',
		title: 'Workflows',
		body: 'Native config, Miniflare workflow bindings, deterministic mocks, and real WorkflowEntrypoint examples cover the local app loop. Production lifecycle, durability, retries, and scheduling remain Cloudflare-owned.',
		href: docsLink('bindings/workflows')
	}),
	supportCard({
		label: 'Remote',
		meta: 'Event ingestion',
		title: 'Pipelines',
		body: 'Native config and local send-recording tests are supported for producer code. Pipeline creation, batching, transformations, sinks, and delivery are Cloudflare-managed.',
		href: docsLink('bindings/pipelines')
	}),
	supportCard({
		label: 'Limited',
		meta: 'Image processing',
		title: 'Images',
		body: 'Native singleton config, Miniflare image bindings, and a low-fidelity deterministic pure mock cover Worker `info()`/transform chain shapes. The named gap is the hosted storage API (`hosted.image()` / `.upload()` / `.list()`), which throws locally. Hosted storage, variants, delivery rules, billing, and final transform fidelity remain remote.',
		href: docsLink('bindings/images')
	}),
	supportCard({
		label: 'Limited',
		meta: 'Media processing',
		title: 'Media Transformations',
		body: 'Native config, Miniflare media bindings, and a deterministic passthrough pure mock cover Worker media transform chain shapes locally. Real codecs, output fidelity, duration handling, cache behavior, and billing remain hosted Cloudflare behavior, so the local contract is narrower than the deployed product.',
		href: docsLink('bindings/media-transformations')
	}),
	supportCard({
		label: 'Remote',
		meta: 'Git-like artifacts',
		title: 'Artifacts',
		body: 'Native config and in-memory repo or token fixtures are supported for app flow. Durable storage, Git-over-HTTPS remotes, namespace creation, and permissions are Cloudflare-owned.',
		href: docsLink('bindings/artifacts')
	}),
	supportCard({
		label: 'Limited',
		meta: 'Video streaming',
		title: 'Stream',
		body: 'Native singleton config, a Miniflare-backed local Stream simulator, and a deterministic pure mock cover the binding shape (video listing and per-video metadata access). Real video upload, transcode, delivery, signed tokens, and billing remain hosted Cloudflare behavior, so the local contract is narrower than the deployed product.',
		href: docsLink('bindings/stream')
	}),
	supportCard({
		label: 'Remote',
		meta: 'Private networking',
		title: 'VPC Services',
		body: 'Native config and deploy emission to `vpc_services` are supported. There is no local simulation: Miniflare wires VPC services only as a remote proxy client, so the private connectivity service and its upstream are Cloudflare-owned. Inject a fake binding for pure tests or use remote mode.',
		href: docsLink('bindings/vpc-services')
	}),
	supportCard({
		label: 'Remote',
		meta: 'Private networking',
		title: 'VPC Networks',
		body: 'Native config (Tunnel ID or network ID) and deploy emission to `vpc_networks` are supported. There is no local simulation: Miniflare wires VPC networks only as a remote proxy client, so the Tunnel and private network path are Cloudflare-owned. Inject a fake binding for pure tests or use remote mode.',
		href: docsLink('bindings/vpc-networks')
	}),
	supportCard({
		label: 'Limited',
		meta: 'Feature flags',
		title: 'Flagship',
		body: "Native config, deploy emission to `flagship`, and a deterministic pure mock (`createMockFlagshipBinding({ flags })`) cover the local app loop for reading feature flags. Miniflare's Flagship plugin returns each call's default value and ignores the flag key, so it does not evaluate flag rules locally; real targeting-rule evaluation, flag management, and remote flag state remain Cloudflare-owned.",
		href: docsLink('bindings/flagship')
	}),
	supportCard({
		label: 'Full',
		meta: 'Containers',
		title: 'Containers',
		body: 'Native top-level container config has full local support through Docker or Podman: Devflare can build Dockerfile paths offline-first, run prebuilt image tags, and interact with launched instances. Deployed rollout, registry availability, SSH, scaling, and hosted platform behavior remain Cloudflare-owned.',
		href: docsLink('bindings/containers')
	})
]
