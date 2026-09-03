import type { Pipeline } from 'cloudflare:pipelines'
import type { LocalSendEmailBindingConfig } from '../../utils/send-email'
import { createMockAnalyticsEngine } from './analytics-engine'
import { type MockArtifactsOptions, createMockArtifacts, isArtifactsBinding } from './artifacts'
import { createMockD1 } from './d1'
import { createMockKV } from './kv'
import { createMockImagesBinding, createMockMediaBinding } from './media'
import {
	type MockDispatchNamespaceOptions,
	type MockFetcherHandler,
	type MockRateLimitOptions,
	type MockWorkerLoaderOptions,
	createMockDispatchNamespace,
	createMockHyperdrive,
	createMockMTLSCertificate,
	createMockRateLimit,
	createMockSecretsStoreSecret,
	createMockVersionMetadata,
	createMockWorkerLoader
} from './platform'
import { createMockQueue } from './queue'
import { createMockR2 } from './r2'
import { createMockSendEmail } from './send-email'
import { type MockVectorizeOptions, createMockVectorize } from './vectorize'
import { type MockWorkflowOptions, createMockPipeline, createMockWorkflow } from './workflows'

export interface MockEnvOptions {
	kv?: string[]
	d1?: string[]
	r2?: string[]
	queues?: string[]
	rateLimits?: Record<string, MockRateLimitOptions>
	versionMetadata?: string
	hyperdrive?: Record<string, string | Hyperdrive>
	workerLoaders?: string[] | Record<string, MockWorkerLoaderOptions>
	mtlsCertificates?: string[] | Record<string, MockFetcherHandler>
	dispatchNamespaces?: string[] | Record<string, MockDispatchNamespaceOptions>
	workflows?: string[] | Record<string, MockWorkflowOptions | Workflow>
	pipelines?: string[] | Record<string, Pipeline>
	images?: string | ImagesBinding
	media?: string | MediaBinding
	artifacts?: string[] | Record<string, MockArtifactsOptions | Artifacts>
	vectorize?: string[] | Record<string, MockVectorizeOptions | VectorizeIndex>
	analyticsEngine?: string[]
	sendEmail?: string[] | Record<string, SendEmail | LocalSendEmailBindingConfig>
	secretsStore?: Record<string, string>
	durableObjects?: string[]
	vars?: Record<string, string>
	secrets?: Record<string, string>
	custom?: Record<string, unknown>
}

function isVectorizeBinding(value: MockVectorizeOptions | VectorizeIndex): value is VectorizeIndex {
	return typeof (value as { query?: unknown }).query === 'function'
}

function addVectorizeMockBindings(
	env: Record<string, unknown>,
	vectorize: MockEnvOptions['vectorize']
): void {
	if (Array.isArray(vectorize)) {
		for (const name of vectorize) {
			env[name] = createMockVectorize()
		}
		return
	}
	if (vectorize) {
		for (const [name, value] of Object.entries(vectorize)) {
			env[name] = isVectorizeBinding(value) ? value : createMockVectorize(value)
		}
	}
}

function addAnalyticsEngineMockBindings(
	env: Record<string, unknown>,
	analyticsEngine: MockEnvOptions['analyticsEngine']
): void {
	for (const name of analyticsEngine ?? []) {
		env[name] = createMockAnalyticsEngine()
	}
}

function isSendEmailBinding(value: SendEmail | LocalSendEmailBindingConfig): value is SendEmail {
	return typeof (value as { send?: unknown }).send === 'function'
}

function addSendEmailMockBindings(
	env: Record<string, unknown>,
	sendEmail: MockEnvOptions['sendEmail']
): void {
	if (Array.isArray(sendEmail)) {
		for (const name of sendEmail) {
			env[name] = createMockSendEmail()
		}
		return
	}
	if (sendEmail) {
		for (const [name, value] of Object.entries(sendEmail)) {
			env[name] = isSendEmailBinding(value) ? value : createMockSendEmail(value)
		}
	}
}

// =============================================================================
// Mock Env Factory
// =============================================================================

/**
 * Creates a complete mock environment with specified bindings
 *
 * @example
 * ```ts
 * const env = createMockEnv({
 *   kv: ['CACHE'],
 *   d1: ['DB'],
 *   vars: { API_KEY: 'secret' }
 * })
 * ```
 */
export function createMockEnv(options: MockEnvOptions = {}): Record<string, unknown> {
	const env: Record<string, unknown> = {}

	// Add KV bindings
	if (options.kv) {
		for (const name of options.kv) {
			env[name] = createMockKV()
		}
	}

	// Add D1 bindings
	if (options.d1) {
		for (const name of options.d1) {
			env[name] = createMockD1()
		}
	}

	// Add R2 bindings
	if (options.r2) {
		for (const name of options.r2) {
			env[name] = createMockR2()
		}
	}

	// Add Queue bindings
	if (options.queues) {
		for (const name of options.queues) {
			env[name] = createMockQueue()
		}
	}

	// Add Rate Limiting bindings
	if (options.rateLimits) {
		for (const [name, rateLimitOptions] of Object.entries(options.rateLimits)) {
			env[name] = createMockRateLimit(rateLimitOptions)
		}
	}

	// Add Version Metadata binding
	if (options.versionMetadata) {
		env[options.versionMetadata] = createMockVersionMetadata()
	}

	// Add Hyperdrive bindings
	if (options.hyperdrive) {
		for (const [name, binding] of Object.entries(options.hyperdrive)) {
			env[name] = typeof binding === 'string' ? createMockHyperdrive(binding) : binding
		}
	}

	// Add Worker Loader bindings
	if (Array.isArray(options.workerLoaders)) {
		for (const name of options.workerLoaders) {
			env[name] = createMockWorkerLoader()
		}
	} else if (options.workerLoaders) {
		for (const [name, workerLoaderOptions] of Object.entries(options.workerLoaders)) {
			env[name] = createMockWorkerLoader(workerLoaderOptions)
		}
	}

	// Add mTLS Certificate bindings
	if (Array.isArray(options.mtlsCertificates)) {
		for (const name of options.mtlsCertificates) {
			env[name] = createMockMTLSCertificate()
		}
	} else if (options.mtlsCertificates) {
		for (const [name, handler] of Object.entries(options.mtlsCertificates)) {
			env[name] = createMockMTLSCertificate(handler)
		}
	}

	// Add Dispatch Namespace bindings
	if (Array.isArray(options.dispatchNamespaces)) {
		for (const name of options.dispatchNamespaces) {
			env[name] = createMockDispatchNamespace()
		}
	} else if (options.dispatchNamespaces) {
		for (const [name, dispatchNamespaceOptions] of Object.entries(options.dispatchNamespaces)) {
			env[name] = createMockDispatchNamespace(dispatchNamespaceOptions)
		}
	}

	// Add Workflow bindings
	if (Array.isArray(options.workflows)) {
		for (const name of options.workflows) {
			env[name] = createMockWorkflow()
		}
	} else if (options.workflows) {
		for (const [name, workflowOptions] of Object.entries(options.workflows)) {
			env[name] =
				'create' in workflowOptions ? workflowOptions : createMockWorkflow(workflowOptions)
		}
	}

	// Add Pipeline bindings
	if (Array.isArray(options.pipelines)) {
		for (const name of options.pipelines) {
			env[name] = createMockPipeline()
		}
	} else if (options.pipelines) {
		for (const [name, pipeline] of Object.entries(options.pipelines)) {
			env[name] = pipeline
		}
	}

	// Add Images binding
	if (typeof options.images === 'string') {
		env[options.images] = createMockImagesBinding()
	} else if (options.images) {
		env.IMAGES = options.images
	}

	// Add Media Transformations binding
	if (typeof options.media === 'string') {
		env[options.media] = createMockMediaBinding()
	} else if (options.media) {
		env.MEDIA = options.media
	}

	// Add Artifacts bindings
	if (Array.isArray(options.artifacts)) {
		for (const name of options.artifacts) {
			env[name] = createMockArtifacts()
		}
	} else if (options.artifacts) {
		for (const [name, artifactsOptions] of Object.entries(options.artifacts)) {
			env[name] = isArtifactsBinding(artifactsOptions)
				? artifactsOptions
				: createMockArtifacts(artifactsOptions)
		}
	}

	// Add Vectorize bindings
	addVectorizeMockBindings(env, options.vectorize)

	// Add Analytics Engine bindings (write-only recording stubs)
	addAnalyticsEngineMockBindings(env, options.analyticsEngine)

	// Add SendEmail bindings (record dispatched mail for assertions)
	addSendEmailMockBindings(env, options.sendEmail)

	// Add Secrets Store bindings
	if (options.secretsStore) {
		for (const [name, value] of Object.entries(options.secretsStore)) {
			env[name] = createMockSecretsStoreSecret(value)
		}
	}

	// Add vars
	if (options.vars) {
		Object.assign(env, options.vars)
	}

	// Add secrets (same as vars for testing)
	if (options.secrets) {
		Object.assign(env, options.secrets)
	}

	// Add custom bindings
	if (options.custom) {
		Object.assign(env, options.custom)
	}

	return env
}
