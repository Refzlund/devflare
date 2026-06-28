// =============================================================================
// Offline-First Test Binding Helpers
// =============================================================================
// Config-derived pure-test bindings plus an explicit support matrix. This keeps
// offline tests deterministic and names remote-only product boundaries clearly.
// =============================================================================

import type { Pipeline } from 'cloudflare:pipelines'
import { type DevflareConfig, normalizeHyperdriveBinding } from '../config'
import { resolveLocalSecretValuesForBindings } from '../secrets/local-secrets'
import {
	type MockAISearchInstanceOptions,
	type MockAISearchNamespaceOptions,
	createMockAISearchInstance,
	createMockAISearchNamespace
} from './ai-search'
import {
	type MockArtifactsOptions,
	type MockDispatchNamespaceOptions,
	type MockFetcherHandler,
	type MockImagesBindingOptions,
	type MockMediaBindingOptions,
	type MockWorkerLoaderOptions,
	type MockWorkflowOptions,
	createMockArtifacts,
	createMockDispatchNamespace,
	createMockHyperdrive,
	createMockImagesBinding,
	createMockMTLSCertificate,
	createMockMediaBinding,
	createMockPipeline,
	createMockRateLimit,
	createMockSecretsStoreSecret,
	createMockVersionMetadata,
	createMockWorkerLoader,
	createMockWorkflow
} from './utilities'

export type OfflineSupportTier = 'offline-native' | 'offline-fixture' | 'remote-boundary'

export interface OfflineSupportEntry {
	service: string
	tier: OfflineSupportTier
	reason: string
	recommendation: string
}

export interface OfflineRemoteBoundary {
	service: string
	binding?: string
	reason: string
	recommendation: string
}

export interface OfflineMissingFixture {
	service: string
	binding: string
	reason: string
}

export interface OfflineBindingFixtures {
	secretsStore?: Record<string, string>
	workerLoaders?: Record<string, MockWorkerLoaderOptions>
	mtlsCertificates?: Record<string, MockFetcherHandler>
	dispatchNamespaces?: Record<string, MockDispatchNamespaceOptions>
	workflows?: Record<string, MockWorkflowOptions | Workflow>
	pipelines?: Record<string, Pipeline>
	images?: Record<string, MockImagesBindingOptions | ImagesBinding>
	media?: Record<string, MockMediaBindingOptions | MediaBinding>
	artifacts?: Record<string, MockArtifactsOptions | Artifacts>
	aiSearch?: Record<string, MockAISearchInstanceOptions | AiSearchInstance>
	aiSearchNamespaces?: Record<string, MockAISearchNamespaceOptions | AiSearchNamespace>
	custom?: Record<string, unknown>
	hyperdrive?: Record<string, string | Hyperdrive>
}

export interface OfflineBindingsResult {
	env: Record<string, unknown>
	support: Record<string, OfflineSupportEntry>
	remoteBoundaries: OfflineRemoteBoundary[]
	missingFixtures: OfflineMissingFixture[]
}

export interface OfflineBindingOptions {
	/** Project root containing `.devflare/secrets.local.json`. */
	cwd?: string
	/** Read `.devflare/secrets.local.json` when `cwd` is supplied. */
	useLocalSecrets?: boolean
}

type OfflineConfig = Partial<DevflareConfig> & {
	vars?: Record<string, unknown>
	bindings?: DevflareConfig['bindings']
}

const SUPPORT_MATRIX: Record<string, OfflineSupportEntry> = {
	rateLimits: {
		service: 'rateLimits',
		tier: 'offline-native',
		reason: 'Miniflare and devflare/test can simulate fixed-window RateLimit bindings locally.',
		recommendation:
			'Use createOfflineEnv() or createMockRateLimit() for pure tests; use createTestContext() for Miniflare-backed tests.'
	},
	versionMetadata: {
		service: 'versionMetadata',
		tier: 'offline-native',
		reason: 'Version metadata can be deterministic in tests without Cloudflare state.',
		recommendation:
			'Use createOfflineEnv() or createMockVersionMetadata() when asserting version-aware code.'
	},
	secretsStore: {
		service: 'secretsStore',
		tier: 'offline-native',
		reason:
			'Secrets Store binding shape is local-testable with local secret-store values or fixed fixtures.',
		recommendation:
			'Use devflare secrets --local for dev/test values, or pass fixtures.secretsStore values for pure tests.'
	},
	hyperdrive: {
		service: 'hyperdrive',
		tier: 'offline-native',
		reason:
			'Hyperdrive can run locally through Miniflare when Devflare has a local connection string or test fixture for the target database.',
		recommendation:
			'Use bindings.hyperdrive.*.localConnectionString, CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING>, or fixtures.hyperdrive for offline tests.'
	},
	workerLoaders: {
		service: 'workerLoaders',
		tier: 'offline-native',
		reason:
			'Worker Loader bindings run locally through Miniflare and can use explicit Worker stubs for pure tests.',
		recommendation:
			'Use createTestContext() for local WorkerLoader execution; pass fixtures.workerLoaders with a WorkerStub for pure tests.'
	},
	mtlsCertificates: {
		service: 'mtlsCertificates',
		tier: 'offline-fixture',
		reason:
			'Fetcher call paths can be tested locally, but real certificate presentation is Cloudflare/Wrangler remote behavior.',
		recommendation:
			'Pass fixtures.mtlsCertificates handlers for unit tests; use remote/deployed tests for certificate presentation.'
	},
	dispatchNamespaces: {
		service: 'dispatchNamespaces',
		tier: 'offline-fixture',
		reason:
			'Tenant dispatch can be backed by explicit test fetchers, but namespace uploads and lifecycle are Cloudflare-managed.',
		recommendation:
			'Pass fixtures.dispatchNamespaces workers for deterministic tenant routing tests.'
	},
	workflows: {
		service: 'workflows',
		tier: 'offline-native',
		reason:
			'Workflow binding calls can run through Miniflare or a deterministic local Workflow mock for app-level tests.',
		recommendation:
			'Use createOfflineEnv() for pure tests and createTestContext() when Miniflare execution semantics matter.'
	},
	pipelines: {
		service: 'pipelines',
		tier: 'offline-native',
		reason:
			'Pipeline sends can be recorded locally; Cloudflare owns production batching and sinks.',
		recommendation:
			'Use createOfflineEnv() or createMockPipeline() to assert records sent by application code.'
	},
	images: {
		service: 'images',
		tier: 'offline-native',
		reason:
			'Images has local development support and Devflare provides a low-fidelity deterministic pure mock.',
		recommendation:
			'Use createOfflineEnv() for chain-shape tests; use Cloudflare for hosted image APIs and transform fidelity.'
	},
	media: {
		service: 'media',
		tier: 'offline-native',
		reason:
			'Media Transformations can run through Miniflare wiring locally, and Devflare provides a deterministic pure mock for app-level chain tests.',
		recommendation:
			'Use createTestContext() for local Worker binding tests and createMockMediaBinding() for pure tests; use Cloudflare for codec/output fidelity.'
	},
	artifacts: {
		service: 'artifacts',
		tier: 'offline-fixture',
		reason:
			'Artifacts repo metadata and token flows can be modeled in memory; real Git remotes are Cloudflare-managed.',
		recommendation:
			'Use createMockArtifacts() for unit tests; use Cloudflare for Git protocol and namespace access.'
	},
	aiSearch: {
		service: 'aiSearch',
		tier: 'offline-fixture',
		reason:
			'AI Search application flows can use deterministic in-memory instances and namespaces, but indexing/ranking/crawling are hosted Cloudflare behavior.',
		recommendation:
			'Use createMockAISearchInstance(), createMockAISearchNamespace(), or createOfflineEnv(); use remote tests for real relevance behavior.'
	},
	aiSearchNamespaces: {
		service: 'aiSearchNamespaces',
		tier: 'offline-fixture',
		reason:
			'AI Search namespace management can be backed by an explicit in-memory instance registry for tests.',
		recommendation:
			'Use fixtures.aiSearchNamespaces to model tenant instances and multi-instance searches.'
	},
	containers: {
		service: 'containers',
		tier: 'offline-native',
		reason:
			'Devflare can launch local Docker/Podman containers in explicit tests when an engine and cached images are available.',
		recommendation:
			'Use devflare/test containers helpers and shouldSkip.containers; keep ordinary unit tests engine-free.'
	},
	browser: {
		service: 'browser',
		tier: 'offline-native',
		reason:
			'Cloudflare lists Browser Run as locally simulatable, while live view, HITL, recordings, and external CDP remain hosted features.',
		recommendation:
			'Use Cloudflare/Wrangler Browser local development for browser execution and remote/deployed tests for hosted-only features.'
	},
	ai: {
		service: 'ai',
		tier: 'remote-boundary',
		reason: 'Workers AI inference has no local simulation in Cloudflare local development.',
		recommendation:
			'Use DEVFLARE_REMOTE=1/devflare remote enable for real calls, or inject a custom fake for pure tests.'
	},
	aiGateway: {
		service: 'aiGateway',
		tier: 'remote-boundary',
		reason:
			'AI Gateway routing and logs are Cloudflare account resources reached through the Workers AI binding.',
		recommendation:
			'Use remote-mode AI Gateway helpers for integration tests and custom fakes for offline unit tests.'
	},
	vectorize: {
		service: 'vectorize',
		tier: 'remote-boundary',
		reason: 'Cloudflare lists Vectorize with no local simulation.',
		recommendation:
			'Use DEVFLARE_REMOTE=1/devflare remote enable for real indexes, or inject a fake Vectorize binding for pure tests.'
	},
	builds: {
		service: 'builds',
		tier: 'remote-boundary',
		reason:
			'Cloudflare Builds/Git-connected Workers are CI/CD orchestration, not a Worker runtime binding.',
		recommendation:
			'Run Devflare commands inside your CI; validate Cloudflare build integration with Cloudflare/Wrangler tests.'
	}
}

function copySupport(entry: OfflineSupportEntry): OfflineSupportEntry {
	return { ...entry }
}

export function getOfflineSupportMatrix(): Record<string, OfflineSupportEntry> {
	return Object.fromEntries(
		Object.entries(SUPPORT_MATRIX).map(([service, entry]) => [service, copySupport(entry)])
	)
}

export function describeOfflineSupport(service: string): OfflineSupportEntry {
	const entry = SUPPORT_MATRIX[service]
	if (entry) {
		return copySupport(entry)
	}

	return {
		service,
		tier: 'remote-boundary',
		reason: `No offline support classification exists for "${service}".`,
		recommendation:
			'Treat this as a remote Cloudflare boundary until Devflare documents a local simulator or fixture.'
	}
}

function createMissingSecret(binding: string): SecretsStoreSecret {
	return {
		async get(): Promise<string> {
			throw new Error(
				`Offline Secrets Store binding "${binding}" has no value. Pass fixtures.secretsStore.${binding} or write a local secret with devflare secrets --local.`
			)
		}
	} as SecretsStoreSecret
}

function isWorkflowBinding(value: MockWorkflowOptions | Workflow): value is Workflow {
	return typeof (value as { create?: unknown }).create === 'function'
}

function isPipelineBinding(value: Pipeline | undefined): value is Pipeline {
	return typeof (value as { send?: unknown } | undefined)?.send === 'function'
}

function isImagesBinding(
	value: MockImagesBindingOptions | ImagesBinding | undefined
): value is ImagesBinding {
	return typeof (value as { input?: unknown } | undefined)?.input === 'function'
}

function isHyperdriveBinding(value: string | Hyperdrive | undefined): value is Hyperdrive {
	return typeof (value as { connectionString?: unknown } | undefined)?.connectionString === 'string'
}

function isMediaBinding(
	value: MockMediaBindingOptions | MediaBinding | undefined
): value is MediaBinding {
	return typeof (value as { input?: unknown } | undefined)?.input === 'function'
}

function isArtifactsBinding(
	value: MockArtifactsOptions | Artifacts | undefined
): value is Artifacts {
	return typeof (value as { create?: unknown } | undefined)?.create === 'function'
}

function isAISearchInstance(
	value: MockAISearchInstanceOptions | AiSearchInstance | undefined
): value is AiSearchInstance {
	return typeof (value as { search?: unknown } | undefined)?.search === 'function'
}

function isAISearchNamespace(
	value: MockAISearchNamespaceOptions | AiSearchNamespace | undefined
): value is AiSearchNamespace {
	return typeof (value as { get?: unknown } | undefined)?.get === 'function'
}

function addBoundary(
	remoteBoundaries: OfflineRemoteBoundary[],
	service: string,
	binding: string | undefined,
	reason: string
) {
	remoteBoundaries.push({
		service,
		binding,
		reason,
		recommendation: describeOfflineSupport(service).recommendation
	})
}

function addStaticBindings(env: Record<string, unknown>, config: OfflineConfig) {
	if (config.vars) {
		Object.assign(env, config.vars)
	}
}

function addRateLimitBindings(env: Record<string, unknown>, bindings: OfflineConfig['bindings']) {
	for (const [name, binding] of Object.entries(bindings?.rateLimits ?? {})) {
		env[name] = createMockRateLimit(binding.simple)
	}
}

function addVersionMetadataBinding(
	env: Record<string, unknown>,
	bindings: OfflineConfig['bindings']
) {
	if (bindings?.versionMetadata) {
		env[bindings.versionMetadata.binding] = createMockVersionMetadata()
	}
}

function getHyperdriveConnectionString(
	name: string,
	binding: NonNullable<NonNullable<OfflineConfig['bindings']>['hyperdrive']>[string],
	fixture: string | Hyperdrive | undefined
): string | undefined {
	if (typeof fixture === 'string') {
		return fixture
	}

	const envValue =
		process.env[`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_${name}`] ??
		process.env[`WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_${name}`]
	if (envValue?.trim()) {
		return envValue
	}

	return normalizeHyperdriveBinding(binding).localConnectionString
}

function addHyperdriveBindings(
	env: Record<string, unknown>,
	bindings: OfflineConfig['bindings'],
	fixtures: OfflineBindingFixtures,
	missingFixtures: OfflineMissingFixture[]
) {
	for (const [name, binding] of Object.entries(bindings?.hyperdrive ?? {})) {
		const fixture = fixtures.hyperdrive?.[name]
		if (isHyperdriveBinding(fixture)) {
			env[name] = fixture
			continue
		}

		const connectionString = getHyperdriveConnectionString(name, binding, fixture)
		if (connectionString) {
			env[name] = createMockHyperdrive(connectionString)
			continue
		}

		missingFixtures.push({
			service: 'hyperdrive',
			binding: name,
			reason: `Hyperdrive binding "${name}" has no local connection string. Configure bindings.hyperdrive.${name}.localConnectionString or pass fixtures.hyperdrive.${name}.`
		})
	}
}

function addWorkerLoaderBindings(
	env: Record<string, unknown>,
	bindings: OfflineConfig['bindings'],
	fixtures: OfflineBindingFixtures
) {
	for (const name of Object.keys(bindings?.workerLoaders ?? {})) {
		env[name] = createMockWorkerLoader(fixtures.workerLoaders?.[name])
	}
}

function addMTLSCertificateBindings(
	env: Record<string, unknown>,
	bindings: OfflineConfig['bindings'],
	fixtures: OfflineBindingFixtures
) {
	for (const name of Object.keys(bindings?.mtlsCertificates ?? {})) {
		env[name] = createMockMTLSCertificate(fixtures.mtlsCertificates?.[name])
	}
}

function addDispatchNamespaceBindings(
	env: Record<string, unknown>,
	bindings: OfflineConfig['bindings'],
	fixtures: OfflineBindingFixtures
) {
	for (const name of Object.keys(bindings?.dispatchNamespaces ?? {})) {
		env[name] = createMockDispatchNamespace(fixtures.dispatchNamespaces?.[name])
	}
}

function addWorkflowBindings(
	env: Record<string, unknown>,
	bindings: OfflineConfig['bindings'],
	fixtures: OfflineBindingFixtures
) {
	for (const name of Object.keys(bindings?.workflows ?? {})) {
		const fixture = fixtures.workflows?.[name]
		env[name] = fixture && isWorkflowBinding(fixture) ? fixture : createMockWorkflow(fixture)
	}
}

function addPipelineBindings(
	env: Record<string, unknown>,
	bindings: OfflineConfig['bindings'],
	fixtures: OfflineBindingFixtures
) {
	for (const name of Object.keys(bindings?.pipelines ?? {})) {
		const fixture = fixtures.pipelines?.[name]
		env[name] = isPipelineBinding(fixture) ? fixture : createMockPipeline()
	}
}

function addImagesBindings(
	env: Record<string, unknown>,
	bindings: OfflineConfig['bindings'],
	fixtures: OfflineBindingFixtures
) {
	for (const name of Object.keys(bindings?.images ?? {})) {
		const fixture = fixtures.images?.[name]
		env[name] = isImagesBinding(fixture) ? fixture : createMockImagesBinding(fixture)
	}
}

function addMediaBindings(
	env: Record<string, unknown>,
	bindings: OfflineConfig['bindings'],
	fixtures: OfflineBindingFixtures
) {
	for (const name of Object.keys(bindings?.media ?? {})) {
		const fixture = fixtures.media?.[name]
		env[name] = isMediaBinding(fixture) ? fixture : createMockMediaBinding(fixture)
	}
}

function addArtifactsBindings(
	env: Record<string, unknown>,
	bindings: OfflineConfig['bindings'],
	fixtures: OfflineBindingFixtures
) {
	for (const name of Object.keys(bindings?.artifacts ?? {})) {
		const fixture = fixtures.artifacts?.[name]
		env[name] = isArtifactsBinding(fixture) ? fixture : createMockArtifacts(fixture)
	}
}

function addSecretsStoreBindings(
	env: Record<string, unknown>,
	bindings: OfflineConfig['bindings'],
	fixtures: OfflineBindingFixtures,
	localSecretValues: Record<string, string>,
	missingFixtures: OfflineMissingFixture[]
) {
	for (const name of Object.keys(bindings?.secretsStore ?? {})) {
		const value = fixtures.secretsStore?.[name] ?? localSecretValues[name]
		if (value === undefined) {
			missingFixtures.push({
				service: 'secretsStore',
				binding: name,
				reason: `Secrets Store values are not present in fixtures or the local secret store; pass fixtures.secretsStore.${name} or run devflare secrets --local.`
			})
			env[name] = createMissingSecret(name)
		} else {
			env[name] = createMockSecretsStoreSecret(value)
		}
	}
}

function addAISearchBindings(
	env: Record<string, unknown>,
	bindings: OfflineConfig['bindings'],
	fixtures: OfflineBindingFixtures
) {
	for (const [name, binding] of Object.entries(bindings?.aiSearch ?? {})) {
		const fixture = fixtures.aiSearch?.[name]
		env[name] = isAISearchInstance(fixture)
			? fixture
			: createMockAISearchInstance({
					id: binding.instanceName,
					...fixture
				})
	}
}

function addAISearchNamespaceBindings(
	env: Record<string, unknown>,
	bindings: OfflineConfig['bindings'],
	fixtures: OfflineBindingFixtures
) {
	for (const [name, binding] of Object.entries(bindings?.aiSearchNamespaces ?? {})) {
		const fixture = fixtures.aiSearchNamespaces?.[name]
		env[name] = isAISearchNamespace(fixture)
			? fixture
			: createMockAISearchNamespace({
					namespace: binding.namespace,
					...fixture
				})
	}
}

/**
 * Core storage and wiring bindings (kv/d1/r2/queues/durableObjects/services)
 * have no pure-offline fixture: they need a real Miniflare runtime, which only
 * `createTestContext()` provides. `createOfflineBindings()` therefore cannot
 * populate them, and leaving them silently absent from `env` is a surprise.
 * Surface each one in `missingFixtures` (with `env` left unset rather than a fake)
 * so callers see exactly which bindings require `createTestContext()` /
 * `createMock*()` instead of getting an `undefined` lookup at use time.
 */
const OFFLINE_UNAVAILABLE_STORAGE_BINDINGS = [
	'kv',
	'd1',
	'r2',
	'durableObjects',
	'services'
] as const

function addUnsupportedStorageBindings(
	bindings: OfflineConfig['bindings'],
	missingFixtures: OfflineMissingFixture[]
) {
	for (const service of OFFLINE_UNAVAILABLE_STORAGE_BINDINGS) {
		const group = bindings?.[service]
		for (const name of Object.keys(group ?? {})) {
			missingFixtures.push({
				service,
				binding: name,
				reason: `${service} binding "${name}" needs a real Miniflare runtime and is not created by createOfflineBindings(); it will be undefined. Use createTestContext() (Miniflare-backed) or a createMock* helper for this binding.`
			})
		}
	}

	const queues = bindings?.queues
	const queueProducers = queues?.producers ?? {}
	for (const name of Object.keys(queueProducers)) {
		missingFixtures.push({
			service: 'queues',
			binding: name,
			reason: `queues producer binding "${name}" needs a real Miniflare runtime and is not created by createOfflineBindings(); it will be undefined. Use createTestContext() or createMockQueue() for this binding.`
		})
	}
}

function addRemoteBoundaries(
	remoteBoundaries: OfflineRemoteBoundary[],
	bindings: OfflineConfig['bindings']
) {
	if (bindings?.ai) {
		addBoundary(
			remoteBoundaries,
			'ai',
			bindings.ai.binding || 'AI',
			'Workers AI inference is not available in offline local simulations.'
		)
	}

	for (const name of Object.keys(bindings?.vectorize ?? {})) {
		addBoundary(
			remoteBoundaries,
			'vectorize',
			name,
			'Vectorize has no offline local simulation in Cloudflare local development.'
		)
	}
}

/**
 * Builds a deterministic, pure-test env object from Devflare config.
 *
 * Covers the bindings that have a pure-offline simulator or fixture (rate
 * limits, version metadata, hyperdrive, worker loaders, mTLS, dispatch
 * namespaces, workflows, pipelines, images, media, artifacts, secrets store,
 * AI Search). It does **not** create the core storage/wiring bindings
 * (`kv`, `d1`, `r2`, `queues`, `durableObjects`, `services`) — those require a
 * real Miniflare runtime, which only `createTestContext()` provides. When such a
 * binding is present in config it is reported in the returned `missingFixtures`
 * (its `env` entry is left unset rather than silently faked); use
 * `createTestContext()` or a `createMock*()` helper for those bindings.
 */
export function createOfflineBindings(
	config: OfflineConfig,
	fixtures: OfflineBindingFixtures = {},
	options: OfflineBindingOptions = {}
): OfflineBindingsResult {
	const env: Record<string, unknown> = {}
	const remoteBoundaries: OfflineRemoteBoundary[] = []
	const missingFixtures: OfflineMissingFixture[] = []
	const bindings = config.bindings
	const localSecretValues =
		options.cwd && options.useLocalSecrets !== false
			? resolveLocalSecretValuesForBindings(config, options.cwd)
			: {}

	addStaticBindings(env, config)
	addRateLimitBindings(env, bindings)
	addVersionMetadataBinding(env, bindings)
	addHyperdriveBindings(env, bindings, fixtures, missingFixtures)
	addWorkerLoaderBindings(env, bindings, fixtures)
	addMTLSCertificateBindings(env, bindings, fixtures)
	addDispatchNamespaceBindings(env, bindings, fixtures)
	addWorkflowBindings(env, bindings, fixtures)
	addPipelineBindings(env, bindings, fixtures)
	addImagesBindings(env, bindings, fixtures)
	addMediaBindings(env, bindings, fixtures)
	addArtifactsBindings(env, bindings, fixtures)
	addSecretsStoreBindings(env, bindings, fixtures, localSecretValues, missingFixtures)
	addAISearchBindings(env, bindings, fixtures)
	addAISearchNamespaceBindings(env, bindings, fixtures)
	addUnsupportedStorageBindings(bindings, missingFixtures)
	addRemoteBoundaries(remoteBoundaries, bindings)

	if (fixtures.custom) {
		Object.assign(env, fixtures.custom)
	}

	return {
		env,
		support: getOfflineSupportMatrix(),
		remoteBoundaries,
		missingFixtures
	}
}

/**
 * Convenience wrapper for callers that only need the derived env object.
 *
 * Note: the core storage/wiring bindings (`kv`, `d1`, `r2`, `queues`,
 * `durableObjects`, `services`) are **not** created here and will be
 * `undefined` in the returned env — they need a real Miniflare runtime. Use
 * `createTestContext()` or a `createMock*()` helper for them, or call
 * `createOfflineBindings()` to inspect `missingFixtures` for the exact list.
 */
export function createOfflineEnv(
	config: OfflineConfig,
	fixtures: OfflineBindingFixtures = {},
	options: OfflineBindingOptions = {}
): Record<string, unknown> {
	return createOfflineBindings(config, fixtures, options).env
}
