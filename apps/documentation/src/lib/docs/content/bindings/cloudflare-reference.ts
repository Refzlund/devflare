import type { DocHeaderCloudflareDocs } from '../../types'
import type { BindingGuideDefinition } from './shared'

export function getCloudflareBindingReference(guide: BindingGuideDefinition): {
	title: string
	href: string
	description: string
	citation: string
} {
	switch (guide.slugBase) {
		case 'kv':
			return {
				title: 'Cloudflare Workers KV docs',
				href: 'https://developers.cloudflare.com/kv/',
				description:
					'Platform reference for KV namespaces, binding APIs, limits, and Wrangler-facing setup.',
				citation: 'Cloudflare Docs'
			}

		case 'd1':
			return {
				title: 'Cloudflare D1 docs',
				href: 'https://developers.cloudflare.com/d1/',
				description:
					'Platform reference for D1 databases, Worker APIs, migrations, and database limits.',
				citation: 'Cloudflare Docs'
			}

		case 'r2':
			return {
				title: 'Cloudflare R2 docs',
				href: 'https://developers.cloudflare.com/r2/',
				description:
					'Platform reference for buckets, object APIs, public-versus-private delivery, and account features.',
				citation: 'Cloudflare Docs'
			}

		case 'durable-object':
			return {
				title: 'Cloudflare Durable Objects docs',
				href: 'https://developers.cloudflare.com/durable-objects/',
				description:
					'Platform reference for object identity, storage, alarms, migrations, and deployment caveats.',
				citation: 'Cloudflare Docs'
			}

		case 'queue':
			return {
				title: 'Cloudflare Queues docs',
				href: 'https://developers.cloudflare.com/queues/',
				description:
					'Platform reference for queue producers, consumers, delivery guarantees, retries, batching, and DLQs.',
				citation: 'Cloudflare Docs'
			}

		case 'service':
			return {
				title: 'Cloudflare Service bindings docs',
				href: 'https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/',
				description:
					'Platform reference for worker-to-worker bindings, service entrypoints, and the underlying runtime contract.',
				citation: 'Cloudflare Docs'
			}

		case 'ai':
			return {
				title: 'Cloudflare Workers AI docs',
				href: 'https://developers.cloudflare.com/workers-ai/configuration/bindings/',
				description:
					'Platform reference for model access, remote inference behavior, pricing, and account prerequisites.',
				citation: 'Cloudflare Docs'
			}

		case 'vectorize':
			return {
				title: 'Cloudflare Vectorize docs',
				href: 'https://developers.cloudflare.com/vectorize/',
				description:
					'Platform reference for indexes, embeddings, remote querying, and preview-aware index lifecycle.',
				citation: 'Cloudflare Docs'
			}

		case 'hyperdrive':
			return {
				title: 'Cloudflare Hyperdrive docs',
				href: 'https://developers.cloudflare.com/hyperdrive/',
				description:
					'Platform reference for database acceleration, connection strings, limits, and supported databases.',
				citation: 'Cloudflare Docs'
			}

		case 'browser':
			return {
				title: 'Cloudflare Browser Rendering docs',
				href: 'https://developers.cloudflare.com/browser-rendering/workers-bindings/',
				description:
					'Platform reference for browser sessions, quick actions, automation limits, and integration methods.',
				citation: 'Cloudflare Docs'
			}

		case 'analytics-engine':
			return {
				title: 'Cloudflare Workers Analytics Engine docs',
				href: 'https://developers.cloudflare.com/analytics/analytics-engine/',
				description:
					'Platform reference for write APIs, SQL querying, analytics ingestion patterns, and product limits.',
				citation: 'Cloudflare Docs'
			}

		case 'send-email':
			return {
				title: 'Cloudflare send_email binding docs',
				href: 'https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/',
				description:
					'Platform reference for send_email binding restrictions, verified destinations, and Email Workers setup.',
				citation: 'Cloudflare Docs'
			}

		case 'rate-limiting':
			return {
				title: 'Cloudflare Rate Limiting docs',
				href: 'https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/',
				description:
					'Platform reference for rate limiting binding configuration, `limit()` calls, locality, and limits.',
				citation: 'Cloudflare Docs'
			}

		case 'version-metadata':
			return {
				title: 'Cloudflare Version Metadata docs',
				href: 'https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata/',
				description:
					'Platform reference for Worker version id, version tag, and version timestamp bindings.',
				citation: 'Cloudflare Docs'
			}

		case 'worker-loaders':
			return {
				title: 'Cloudflare Dynamic Worker Loaders docs',
				href: 'https://developers.cloudflare.com/workers/runtime-apis/bindings/worker-loader/',
				description:
					'Platform reference for loading dynamic Workers and arbitrary Worker code at runtime.',
				citation: 'Cloudflare Docs'
			}

		case 'secrets-store':
			return {
				title: 'Cloudflare Secrets Store docs',
				href: 'https://developers.cloudflare.com/workers/configuration/secrets/',
				description:
					'Platform reference for secrets, account-level Secrets Store bindings, and secure Worker access.',
				citation: 'Cloudflare Docs'
			}

		case 'ai-search':
			return {
				title: 'Cloudflare AI Search docs',
				href: 'https://developers.cloudflare.com/ai-search/api/search/workers-binding/',
				description:
					'Platform reference for AI Search instance and namespace bindings from Workers.',
				citation: 'Cloudflare Docs'
			}

		case 'mtls-certificates':
			return {
				title: 'Cloudflare mTLS docs',
				href: 'https://developers.cloudflare.com/workers/runtime-apis/bindings/mtls/',
				description:
					'Platform reference for mTLS certificate bindings and certificate-backed outbound fetches.',
				citation: 'Cloudflare Docs'
			}

		case 'dispatch-namespaces':
			return {
				title: 'Cloudflare Workers for Platforms docs',
				href: 'https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/configuration/dynamic-dispatch/',
				description:
					'Platform reference for dispatch namespaces, dynamic dispatch Workers, and tenant Worker routing.',
				citation: 'Cloudflare Docs'
			}

		case 'workflows':
			return {
				title: 'Cloudflare Workflows docs',
				href: 'https://developers.cloudflare.com/workflows/build/trigger-workflows/',
				description:
					'Platform reference for creating Workflow bindings and triggering Workflow instances from Workers.',
				citation: 'Cloudflare Docs'
			}

		case 'pipelines':
			return {
				title: 'Cloudflare Pipelines docs',
				href: 'https://developers.cloudflare.com/pipelines/build-with-pipelines/sources/workers-apis/',
				description:
					'Platform reference for sending records from Workers into Cloudflare Pipelines.',
				citation: 'Cloudflare Docs'
			}

		case 'images':
			return {
				title: 'Cloudflare Images docs',
				href: 'https://developers.cloudflare.com/images/transform-images/bindings/',
				description:
					'Platform reference for Images bindings, transformations, billing, and Workers API setup.',
				citation: 'Cloudflare Docs'
			}

		case 'media-transformations':
			return {
				title: 'Cloudflare Media Transformations docs',
				href: 'https://developers.cloudflare.com/stream/transform-videos/bindings/',
				description:
					'Platform reference for Media Transformations bindings, beta limits, and Workers API setup.',
				citation: 'Cloudflare Docs'
			}

		case 'artifacts':
			return {
				title: 'Cloudflare Artifacts docs',
				href: 'https://developers.cloudflare.com/artifacts/api/workers-binding/',
				description:
					'Platform reference for Artifacts Workers bindings, repos, tokens, and namespace methods.',
				citation: 'Cloudflare Docs'
			}

		case 'containers':
			return {
				title: 'Cloudflare Containers docs',
				href: 'https://developers.cloudflare.com/containers/container-class/',
				description:
					'Platform reference for the Container class, container instances, and Worker interaction helpers.',
				citation: 'Cloudflare Docs'
			}

		default:
			return {
				title: 'Cloudflare Workers bindings docs',
				href: 'https://developers.cloudflare.com/workers/runtime-apis/bindings/',
				description:
					'Platform reference for the underlying binding contract on Cloudflare Workers.',
				citation: 'Cloudflare Docs'
			}
	}
}

export function getCloudflareBindingIntro(guide: BindingGuideDefinition): string {
	switch (guide.slugBase) {
		case 'kv':
			return 'Workers KV is a global key-value store for low-latency reads and lightweight shared data.'

		case 'd1':
			return 'D1 is Cloudflare’s serverless SQL database for applications that run on Workers.'

		case 'r2':
			return 'R2 is Cloudflare object storage for files, uploads, generated assets, and private objects.'

		case 'durable-object':
			return 'Durable Objects give Workers a named place for stateful coordination, storage, and alarms.'

		case 'queue':
			return 'Queues let Workers send messages to background consumers with retries, batching, and dead-letter handling.'

		case 'service':
			return 'Service bindings let one Worker call another Worker without routing through a public URL.'

		case 'ai':
			return 'Workers AI lets Workers run Cloudflare-hosted machine-learning models through an env binding.'

		case 'vectorize':
			return 'Vectorize stores embeddings in Cloudflare-managed indexes for similarity search from Workers.'

		case 'hyperdrive':
			return 'Hyperdrive gives Workers a pooled, Cloudflare-managed connection path to existing PostgreSQL databases.'

		case 'browser':
			return 'Browser Rendering lets Workers drive a headless browser for screenshots, PDFs, and page automation.'

		case 'analytics-engine':
			return 'Analytics Engine lets Workers write structured data points for later querying and operational analysis.'

		case 'send-email':
			return 'The send_email binding lets Workers send outbound email through Cloudflare Email Routing.'

		case 'rate-limiting':
			return 'Rate Limiting bindings let Workers enforce fixed-window limits from inside application code.'

		case 'version-metadata':
			return 'Version Metadata exposes a Worker version id, version tag, and timestamp to code running in that version.'

		case 'worker-loaders':
			return 'Worker Loader bindings let a Worker load additional dynamic Workers at runtime.'

		case 'secrets-store':
			return 'Secrets Store bindings let Workers read account-level secrets without storing secret values in code.'

		case 'ai-search':
			return 'AI Search bindings let Workers search and chat with indexed content from Cloudflare AI Search instances.'

		case 'mtls-certificates':
			return 'mTLS certificate bindings let a Worker make outbound fetches with a client certificate.'

		case 'dispatch-namespaces':
			return 'Dispatch namespace bindings let Workers for Platforms route requests to tenant Workers by name.'

		case 'workflows':
			return 'Workflows bindings let Workers start and inspect durable multi-step workflow instances.'

		case 'pipelines':
			return 'Pipelines bindings let Workers send event records into Cloudflare-managed ingestion pipelines.'

		case 'images':
			return 'Images bindings let Workers transform, resize, and encode images without public image URLs.'

		case 'media-transformations':
			return 'Media Transformations bindings let Workers transform video or audio from protected sources.'

		case 'artifacts':
			return 'Artifacts bindings let Workers create and manage Git-compatible repos and repo tokens.'

		case 'containers':
			return 'Containers let a Worker hand requests to stateful code running from a container image.'

		default:
			return guide.categoryDescription
	}
}

export function createBindingHeaderCloudflareDocs(
	guide: BindingGuideDefinition
): DocHeaderCloudflareDocs {
	const reference = getCloudflareBindingReference(guide)

	return {
		label: 'Cloudflare Documentation',
		title: reference.title,
		href: reference.href,
		summary: getCloudflareBindingIntro(guide)
	}
}

export function getCloudflareRuntimeComparison(guide: BindingGuideDefinition): string {
	if (guide.localStory.toLowerCase().startsWith('remote-oriented')) {
		return 'Cloudflare’s docs focus on the real remote product behavior, account requirements, and runtime constraints on the platform.'
	}

	return 'Cloudflare’s docs focus on the raw binding API, product semantics, and platform limits for the binding itself.'
}
