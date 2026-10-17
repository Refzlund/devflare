// =============================================================================
// A Rate Limiting binding boots, and enforces its limit
// =============================================================================
// The regression this pins: `bindings.rateLimits` used to reach Miniflare
// WITHOUT `namespace_id`. Miniflare has required that field since 4.20260730.0
// — counters are keyed by the namespace rather than by the binding name — so
// the omission did not degrade the limiter, it aborted the whole boot with
// "Unexpected options passed to new Miniflare() constructor" and took every
// other binding in the session down with it.
//
// Only the wrangler compiler emitted `namespace_id`; the three Miniflare-option
// builders dropped it. That asymmetry is why it shipped — the emitted wrangler
// config was verified, and nothing ever booted a local runtime with a rate
// limiter in it. This test is that missing boot.
// =============================================================================

import { afterAll, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { env } from '../../../src'
import { cf, createTestContext } from '../../../src/test'

const tempDirs: string[] = []

afterAll(async () => {
	for (const tempDir of tempDirs) {
		await rm(tempDir, { recursive: true, force: true })
	}
})

async function createRateLimitProject(): Promise<string> {
	const projectDir = await mkdtemp(join(tmpdir(), 'devflare-rate-limit-binding-'))
	tempDirs.push(projectDir)

	await mkdir(join(projectDir, 'src'), { recursive: true })
	await writeFile(
		join(projectDir, 'package.json'),
		JSON.stringify({ name: 'rate-limit-binding-project', private: true, type: 'module' }, null, 2)
	)

	// Two bindings, two namespaces — the shape the crash was reported against.
	// A tight limit/period keeps the enforcement assertion deterministic inside
	// a single request.
	await writeFile(
		join(projectDir, 'devflare.config.ts'),
		`
export default {
	name: 'rate-limit-binding-project',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		rateLimits: {
			AUTH_IP_LIMIT: {
				namespaceId: '1001',
				simple: { limit: 2, period: 10 }
			},
			AUTH_ADDRESS_LIMIT: {
				namespaceId: '1002',
				simple: { limit: 100, period: 60 }
			}
		}
	}
}
`.trim()
	)

	await writeFile(
		join(projectDir, 'src', 'fetch.ts'),
		`
export default {
	async fetch(_request, env, _ctx) {
		const key = 'client-' + crypto.randomUUID()
		const first = await env.AUTH_IP_LIMIT.limit({ key })
		const second = await env.AUTH_IP_LIMIT.limit({ key })
		const third = await env.AUTH_IP_LIMIT.limit({ key })

		// A separate namespace keeps its own counter — the key is deliberately
		// the same one the limiter above just exhausted.
		const other = await env.AUTH_ADDRESS_LIMIT.limit({ key })

		return Response.json({
			ipLimit: [first.success, second.success, third.success],
			addressLimit: other.success
		})
	}
}
`.trim()
	)

	return projectDir
}

describe('createTestContext Rate Limiting binding', () => {
	test('boots a worker declaring bindings.rateLimits and enforces the limit', async () => {
		const projectDir = await createRateLimitProject()
		const runtimeEnv = env as typeof env & {
			dispose(): Promise<void>
		}

		// Reaching this line at all is the regression assertion: before the fix
		// the constructor threw here, naming `namespace_id: undefined`.
		await createTestContext(join(projectDir, 'devflare.config.ts'))

		try {
			const response = await cf.worker.get('/limited')
			expect(response.status).toBe(200)

			const payload = (await response.json()) as {
				ipLimit: [boolean, boolean, boolean]
				addressLimit: boolean
			}

			expect(payload.ipLimit).toEqual([true, true, false])
			expect(payload.addressLimit).toBe(true)
		} finally {
			await runtimeEnv.dispose()
		}
	}, 30000)
})
