import type { DocSection } from '../../types'
import { supportCoverageTooltips } from '../start-here/shared'
import type { BindingGuideDefinition } from './shared'

export type BindingSupportLevel = 'Full' | 'Remote' | 'Limited'

const bindingSupportLevelsBySlugBase: Record<string, BindingSupportLevel> = {
	kv: 'Full',
	d1: 'Full',
	r2: 'Full',
	'durable-object': 'Full',
	queue: 'Full',
	service: 'Full',
	ai: 'Remote',
	vectorize: 'Remote',
	hyperdrive: 'Remote',
	browser: 'Remote',
	'analytics-engine': 'Remote',
	'send-email': 'Full',
	'rate-limiting': 'Full',
	'version-metadata': 'Full',
	'worker-loaders': 'Limited',
	'secrets-store': 'Remote',
	'ai-search': 'Remote',
	'mtls-certificates': 'Remote',
	'dispatch-namespaces': 'Remote',
	workflows: 'Remote',
	pipelines: 'Remote',
	images: 'Remote',
	'media-transformations': 'Remote',
	artifacts: 'Remote',
	containers: 'Full'
}

export function getBindingSupportLevel(
	guide: Pick<BindingGuideDefinition, 'slugBase'>
): BindingSupportLevel {
	return bindingSupportLevelsBySlugBase[guide.slugBase] ?? 'Remote'
}

function getBindingSupportSummary(
	level: BindingSupportLevel,
	guide: BindingGuideDefinition
): string {
	switch (level) {
		case 'Full':
			return `Full local support means Devflare can run useful ${guide.label} application behavior locally for ordinary development and tests. Cloudflare still owns production limits, quotas, billing, and deployed account behavior.`

		case 'Remote':
			return 'Remote support means Devflare supports the config, generated env shape, docs, and local application-flow work, but full fidelity requires Cloudflare remote infrastructure. Use local shims or fixtures for code your app owns, then connect to Cloudflare when the product behavior is the assertion.'

		case 'Limited':
			return `Limited support means Devflare has a real lane for ${guide.label}, but the local contract is intentionally narrower than Cloudflare's hosted product. The docs call out the supported local path and the remote boundary separately.`
	}
}

function getBindingLocalSupportBody(
	level: BindingSupportLevel,
	guide: BindingGuideDefinition
): string {
	if (guide.slugBase === 'browser') {
		return 'Local support is the Devflare browser-rendering shim: the dev server starts a loopback-only browser bridge and binding worker that browser libraries can call during local development. Treat it as a practical local/dev path, then use Cloudflare for hosted Browser Rendering limits, session behavior, and product fidelity.'
	}

	if (guide.slugBase === 'containers') {
		return 'Containers have full local support when Docker or Podman is reachable and the image can be built or inspected without Cloudflare. Devflare builds Dockerfile paths offline-first, runs the container on loopback, and exposes fetch, logs, state, stop, and destroy helpers. Cloudflare still owns deployed rollout, registry availability, SSH, scaling, and hosted platform behavior.'
	}

	if (level === 'Full') {
		return `${guide.localStory}. Start locally with ${guide.testing.defaultHarness}; that lane should cover the normal ${guide.label} application flow without requiring a Cloudflare connection.`
	}

	if (level === 'Remote') {
		return `${guide.localStory}. Keep local coverage focused on deterministic application flow through fixtures, mocks, shims, or Miniflare-backed wiring instead of pretending to reproduce Cloudflare-hosted product behavior.`
	}

	return `${guide.localStory}. Use the documented local lane only for the behavior Devflare explicitly models, and keep the narrower boundary visible in code review.`
}

function getBindingRemoteSupportBody(
	level: BindingSupportLevel,
	guide: BindingGuideDefinition
): string {
	if (level === 'Full') {
		return `Use Cloudflare when the assertion depends on deployed limits, account state, lifecycle behavior, billing, or other production-only ${guide.label} details.`
	}

	return `Use Cloudflare when ${guide.testing.escalation.toLowerCase()}. This is the lane for full ${guide.label} product fidelity, remote state, lifecycle behavior, and platform-specific limits.`
}

export function createBindingSupportSection(guide: BindingGuideDefinition): DocSection {
	const supportLevel = getBindingSupportLevel(guide)

	return {
		id: 'local-and-remote-support',
		title: 'Local and Remote Support',
		paragraphs: [
			`Support level: \`${supportLevel}\`. ${getBindingSupportSummary(supportLevel, guide)}`,
			`${guide.localStory}.`
		],
		cards: [
			{
				label: supportLevel,
				labelTooltip: supportCoverageTooltips[supportLevel],
				meta: 'Support level',
				title: `${supportLevel} support`,
				body: getBindingSupportSummary(supportLevel, guide)
			},
			{
				label: 'Local',
				meta: 'Local lane',
				title: 'What works without Cloudflare',
				body: getBindingLocalSupportBody(supportLevel, guide)
			},
			{
				label: 'Remote',
				meta: 'Cloudflare lane',
				title: 'When to connect to Cloudflare',
				body: getBindingRemoteSupportBody(supportLevel, guide)
			}
		]
	}
}
