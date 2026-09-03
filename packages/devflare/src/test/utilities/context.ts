import { type RequestContext, runWithContext } from '../../runtime/context'

// =============================================================================
// Types
// =============================================================================

export interface TestContextOptions<TEnv = Record<string, unknown>> {
	env?: TEnv
	request?: Request | null
	type?: 'fetch' | 'scheduled' | 'queue' | 'email' | 'tail'
}

export interface TestContext<TEnv = Record<string, unknown>> {
	env: TEnv
	ctx: ExecutionContext
	request: Request | null
	waitUntilPromises: Promise<unknown>[]
}

// =============================================================================
// Test Context
// =============================================================================

/**
 * Creates a test context with mock ExecutionContext
 *
 * @example
 * ```ts
 * const ctx = createTestContext({
 *   env: { API_KEY: 'test' },
 *   request: new Request('https://test.com')
 * })
 * ```
 */
export function createMockTestContext<TEnv = Record<string, unknown>>(
	options: TestContextOptions<TEnv> = {}
): TestContext<TEnv> {
	const waitUntilPromises: Promise<unknown>[] = []

	const ctx = {
		waitUntil(promise: Promise<unknown>) {
			waitUntilPromises.push(promise)
		},
		passThroughOnException() {
			// No-op in tests
		},
		props: {}
	} as ExecutionContext

	return {
		env: (options.env ?? {}) as TEnv,
		ctx,
		request: options.request ?? null,
		waitUntilPromises
	}
}

/**
 * Runs a function within a test context
 *
 * @example
 * ```ts
 * const response = await withTestContext(
 *   { env: { DB: mockD1 } },
 *   async () => {
 *     // env, ctx, locals all work here
 *     return handler.fetch(new Request('https://test.com'))
 *   }
 * )
 * ```
 */
export async function withTestContext<T, TEnv = Record<string, unknown>>(
	options: TestContextOptions<TEnv>,
	handler: () => Promise<T>
): Promise<T> {
	const testCtx = createMockTestContext(options)

	return runWithContext(
		testCtx.env as Record<string, unknown>,
		testCtx.ctx,
		options.request ?? null,
		handler,
		options.type ?? 'fetch'
	)
}
