// =============================================================================
// Mock Rate Limit
// =============================================================================

export interface MockRateLimitOptions {
	limit?: number
	period?: 10 | 60
}

/**
 * Creates a local fixed-window RateLimit binding for testing.
 */
export function createMockRateLimit(options: MockRateLimitOptions = {}): RateLimit {
	const limit = options.limit ?? Number.MAX_SAFE_INTEGER
	const periodMs = (options.period ?? 60) * 1000
	const windows = new Map<string, { count: number; resetAt: number }>()

	return {
		async limit({ key }: RateLimitOptions): Promise<RateLimitOutcome> {
			const now = Date.now()
			const existing = windows.get(key)
			if (!existing || existing.resetAt <= now) {
				windows.set(key, { count: 1, resetAt: now + periodMs })
				return { success: limit >= 1 }
			}

			existing.count += 1
			return { success: existing.count <= limit }
		}
	} as RateLimit
}

// =============================================================================
// Mock Version Metadata
// =============================================================================

export function createMockVersionMetadata(
	metadata: Partial<WorkerVersionMetadata> = {}
): WorkerVersionMetadata {
	return {
		id: metadata.id ?? 'devflare-local-version',
		tag: metadata.tag ?? 'local',
		timestamp: metadata.timestamp ?? '1970-01-01T00:00:00.000Z'
	}
}

// =============================================================================
// Mock Secrets Store Secret
// =============================================================================

/**
 * Creates a Secrets Store binding whose get() method returns a fixed value.
 */
export function createMockSecretsStoreSecret(value: string): SecretsStoreSecret {
	return {
		async get(): Promise<string> {
			return value
		}
	} as SecretsStoreSecret
}

// =============================================================================
// Mock Worker Loader
// =============================================================================

export interface MockWorkerLoaderOptions {
	stub?: WorkerStub
}

function createDefaultWorkerStub(): WorkerStub {
	return {
		getEntrypoint() {
			throw new Error(
				'Mock WorkerLoader stub has no entrypoint. Pass createMockWorkerLoader({ stub }) for behavior.'
			)
		},
		getDurableObjectClass() {
			throw new Error(
				'Mock WorkerLoader stub has no Durable Object class. Pass createMockWorkerLoader({ stub }) for behavior.'
			)
		}
	} as unknown as WorkerStub
}

/**
 * Creates a Worker Loader binding for pure unit tests.
 */
export function createMockWorkerLoader(options: MockWorkerLoaderOptions = {}): WorkerLoader {
	const stub = options.stub ?? createDefaultWorkerStub()

	return {
		get(
			_name: string | null,
			_getCode: () => WorkerLoaderWorkerCode | Promise<WorkerLoaderWorkerCode>
		): WorkerStub {
			return stub
		},
		load(_code: WorkerLoaderWorkerCode): WorkerStub {
			return stub
		}
	} as WorkerLoader
}

// =============================================================================
// Mock mTLS Certificate
// =============================================================================

export type MockFetchInput = string | Request | URL

export type MockFetcherHandler = (
	input: MockFetchInput,
	init?: RequestInit
) => Response | Promise<Response>

function defaultMTLSCertificateHandler(): never {
	throw new Error(
		'Mock mTLS Certificate Fetcher has no handler. Pass createMockMTLSCertificate(handler) for behavior.'
	)
}

/**
 * Creates an mTLS certificate binding fetcher for pure unit tests.
 */
export function createMockMTLSCertificate(
	handler: MockFetcherHandler = defaultMTLSCertificateHandler
): Fetcher {
	return {
		async fetch(input: MockFetchInput, init?: RequestInit): Promise<Response> {
			return handler(input, init)
		}
	} as unknown as Fetcher
}

// =============================================================================
// Mock Dispatch Namespace
// =============================================================================

export interface MockDispatchNamespaceOptions {
	workers?: Record<string, MockFetcherHandler | Fetcher>
}

/**
 * Creates a Dispatch Namespace binding for pure unit tests.
 */
export function createMockDispatchNamespace(
	options: MockDispatchNamespaceOptions = {}
): DispatchNamespace {
	return {
		get(name: string): Fetcher {
			const worker = options.workers?.[name]
			if (!worker) {
				throw new Error(`Mock DispatchNamespace has no worker named "${name}".`)
			}

			return typeof worker === 'function' ? createMockMTLSCertificate(worker) : worker
		}
	} as DispatchNamespace
}
