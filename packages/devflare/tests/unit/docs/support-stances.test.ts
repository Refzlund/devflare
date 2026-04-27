import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function readPackageReadme(): string {
	return readFileSync(join(import.meta.dir, '..', '..', '..', 'README.md'), 'utf8')
}

describe('documented Cloudflare product stances', () => {
	test('documents AutoRAG as the legacy name for AI Search bindings', () => {
		const readme = readPackageReadme()

		expect(readme).toContain('### AutoRAG migration stance')
		expect(readme).toContain('previous `env.AI.autorag()` binding')
		expect(readme).toContain('Use `bindings.aiSearchNamespaces` or `bindings.aiSearch`')
	})

	test('documents AI Gateway as an AI binding method surface', () => {
		const readme = readPackageReadme()

		expect(readme).toContain('### AI Gateway binding methods')
		expect(readme).toContain('AI Gateway does not use a separate Wrangler binding')
		expect(readme).toContain(
			'`env.AI.gateway(id)` exposes `patchLog()`, `getLog()`, `getUrl()`, and `run()`'
		)
	})

	test('documents Browser Run as the current Browser Rendering product name', () => {
		const readme = readPackageReadme()

		expect(readme).toContain('### Browser Run product boundary')
		expect(readme).toContain('Browser Run is the current product name for Browser Rendering')
		expect(readme).toContain('Devflare does not manage Live View URLs, Human in the Loop handoff')
	})

	test('documents native offline-first Containers testing support', () => {
		const readme = readPackageReadme()

		expect(readme).toContain('### Containers local testing')
		expect(readme).toContain('Devflare supports native top-level `containers` config')
		expect(readme).toContain('Devflare container tests are offline-first by default')
		expect(readme).toContain('Set `DEVFLARE_CONTAINER_TESTS=1`')
		expect(readme).toContain(
			'Containers have full local support when Docker or Podman is available'
		)
		expect(readme).toContain('Cloudflare still owns the deployed Containers control plane')
	})

	test('documents Cloudflare Builds as CI/CD orchestration', () => {
		const readme = readPackageReadme()

		expect(readme).toContain('### Cloudflare Builds stance')
		expect(readme).toContain(
			'Cloudflare Builds is CI/CD orchestration, not a Worker runtime binding'
		)
		expect(readme).toContain('Devflare does not connect Git repositories, manage build hooks')
	})

	test('documents Workers for Platforms lifecycle boundaries', () => {
		const readme = readPackageReadme()

		expect(readme).toContain('### Workers for Platforms lifecycle stance')
		expect(readme).toContain(
			'Devflare supports dispatch namespace bindings, not the tenant Worker control plane'
		)
		expect(readme).toContain('Devflare does not upload user Workers, manage Worker metadata')
	})

	test('documents Workflows local simulation boundaries', () => {
		const readme = readPackageReadme()

		expect(readme).toContain('### Workflows local simulation stance')
		expect(readme).toContain('Workflows have full local support through Miniflare wiring')
		expect(readme).toContain(
			'Use deployed or Wrangler-backed tests for production Workflow lifecycle behavior'
		)
	})

	test('documents Pipelines source and sink lifecycle boundaries', () => {
		const readme = readPackageReadme()

		expect(readme).toContain('### Pipelines source and sink lifecycle stance')
		expect(readme).toContain('Pipelines local tests are useful for producer-code assertions')
		expect(readme).toContain(
			'Devflare does not create streams, pipelines, SQL transformations, sinks, or R2 buckets'
		)
	})

	test('documents Images transformation and testability boundaries', () => {
		const readme = readPackageReadme()

		expect(readme).toContain('### Images transformation testability stance')
		expect(readme).toContain('Images have full local support for Worker transformation flows')
		expect(readme).toContain(
			'Devflare does not provision hosted Images storage, variants, signed URLs, or custom delivery rules'
		)
	})

	test('documents Media Transformations local shim boundaries', () => {
		const readme = readPackageReadme()

		expect(readme).toContain('### Media Transformations local shim stance')
		expect(readme).toContain('Media Transformations have full local support for Worker call chains')
		expect(readme).toContain(
			'Devflare does not configure zone-level transformation enablement, source origins, signed URL policy, cache behavior, or billing controls'
		)
	})

	test('documents Artifacts persistence and deployment boundaries', () => {
		const readme = readPackageReadme()

		expect(readme).toContain('### Artifacts persistence and deployment stance')
		expect(readme).toContain('Artifacts pure mocks are in-memory and process-local')
		expect(readme).toContain(
			'Devflare does not create Artifacts namespaces, persist local Git repositories, or emulate Git-over-HTTPS remotes'
		)
	})

	test('documents preview resource lifecycle policy for newer bindings', () => {
		const readme = readPackageReadme()

		expect(readme).toContain('### Preview resource lifecycle policy')
		expect(readme).toContain(
			'Devflare preview provisioning is intentionally limited to KV, D1, R2, Queues, Vectorize, and the documented Hyperdrive reuse/resolve paths'
		)
		expect(readme).toContain(
			'Preview cleanup does not delete Workflows, Pipelines, Images, Media Transformations, Artifacts, AI Search, AI Gateway, Browser Run, Containers, Secrets Store, mTLS certificates, or dispatch namespace resources'
		)
	})

	test('documents cross-feature implementation decisions', () => {
		const readme = readPackageReadme()

		expect(readme).toContain('### Cross-feature implementation decisions')
		expect(readme).toContain('Remote mode decisions are per feature, not global')
		expect(readme).toContain('Generated types are emitted only for native binding keys')
		expect(readme).toContain(
			'Test helpers exist when Devflare provides a deterministic local mock or useful pure assertion surface'
		)
		expect(readme).toContain(
			'Every native binding documented above includes a minimal config and Env usage example'
		)
		expect(readme).toContain(
			'Move from `wrangler.passthrough` to native config when a binding appears in the native list'
		)
		expect(readme).toContain(
			'Cloudflare dependency CI targets the pinned current Wrangler, Miniflare, and workers-types majors documented in Cloudflare toolchain support'
		)
	})

	test('documents offline-first testing matrix and config-derived env helpers', () => {
		const readme = readPackageReadme()

		expect(readme).toContain('### Offline-first testing support matrix')
		expect(readme).toContain(
			'`createOfflineEnv(config, fixtures)` derives a deterministic pure-test `env` from Devflare config'
		)
		expect(readme).toContain(
			'Offline-native means Devflare or Miniflare can run a useful local simulator'
		)
		expect(readme).toContain(
			'Offline-fixture means Devflare provides an explicit in-memory or handler-backed mock'
		)
		expect(readme).toContain('Remote-boundary means meaningful behavior lives in Cloudflare')
		expect(readme).toContain(
			'`shouldSkip.aiSearch`, `shouldSkip.aiGateway`, `shouldSkip.mtlsCertificates`, `shouldSkip.artifacts`, and `shouldSkip.builds`'
		)
		expect(readme).toContain(
			'real Workers AI inference, Vectorize search semantics, AI Search indexing/ranking/crawling, final Media Transformations codec fidelity, mTLS certificate presentation, Artifacts Git remotes, Browser Run live/HITL/recordings, Cloudflare Builds, or the deployed Containers control plane'
		)
	})
})
