import { afterEach, describe, expect, mock, test } from 'bun:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runD1Migrations } from '../../../src/dev-server/d1-migrations'
import { createTrackedTempDirectories } from '../../helpers/tracked-temp-directories'

const originalFetch = globalThis.fetch
const originalSetTimeout = globalThis.setTimeout
const temporaryDirectories = createTrackedTempDirectories()

function createProjectWithMigration(sql: string): string {
	const projectDir = temporaryDirectories.create('devflare-d1-migrations-')
	const migrationsDir = join(projectDir, 'migrations')
	mkdirSync(migrationsDir, { recursive: true })
	writeFileSync(join(migrationsDir, '001_init.sql'), sql, 'utf-8')
	return projectDir
}

function trackTimeouts(delays: number[]): void {
	globalThis.setTimeout = ((
		handler: Parameters<typeof setTimeout>[0],
		timeout?: number,
		...args: unknown[]
	) => {
		delays.push(Number(timeout ?? 0))
		return originalSetTimeout(handler as never, 0, ...(args as []))
	}) as typeof setTimeout
}

afterEach(() => {
	globalThis.fetch = originalFetch
	globalThis.setTimeout = originalSetTimeout
	temporaryDirectories.cleanup()
})

describe('runD1Migrations', () => {
	test('attempts the first migration request immediately before scheduling retries', async () => {
		const scheduledDelays: number[] = []
		const projectDir = createProjectWithMigration('CREATE TABLE demo (id INTEGER PRIMARY KEY);')
		trackTimeouts(scheduledDelays)

		globalThis.fetch = mock(async () => {
			return new Response(JSON.stringify({ success: true, results: [] }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		}) as unknown as typeof fetch

		await runD1Migrations({
			cwd: projectDir,
			config: {
				name: 'demo-worker',
				compatibilityDate: '2026-04-12',
				bindings: {
					d1: {
						DB: 'demo-db'
					}
				}
			} as never,
			miniflarePort: 8787
		})

		expect(globalThis.fetch).toHaveBeenCalledTimes(1)
		expect(scheduledDelays).toEqual([])
	})

	test('waits between retries only after a failed migration attempt', async () => {
		const scheduledDelays: number[] = []
		const projectDir = createProjectWithMigration('CREATE TABLE demo (id INTEGER PRIMARY KEY);')
		trackTimeouts(scheduledDelays)

		let attempt = 0
		globalThis.fetch = mock(async () => {
			attempt++
			if (attempt === 1) {
				throw new Error('gateway not ready')
			}

			return new Response(JSON.stringify({ success: true, results: [] }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		}) as unknown as typeof fetch

		await runD1Migrations({
			cwd: projectDir,
			config: {
				name: 'demo-worker',
				compatibilityDate: '2026-04-12',
				bindings: {
					d1: {
						DB: 'demo-db'
					}
				}
			} as never,
			miniflarePort: 8787
		})

		expect(attempt).toBe(2)
		expect(scheduledDelays).toEqual([500])
	})

	test('per-binding directory wins over shared fallback; empty per-binding dir skips', async () => {
		const projectDir = temporaryDirectories.create('devflare-d1-per-binding-')
		const migrationsDir = join(projectDir, 'migrations')
		mkdirSync(migrationsDir, { recursive: true })
		writeFileSync(join(migrationsDir, 'root.sql'), 'CREATE TABLE shared (id INTEGER);', 'utf-8')
		mkdirSync(join(migrationsDir, 'DB_A'), { recursive: true })
		writeFileSync(join(migrationsDir, 'DB_A', 'a.sql'), 'CREATE TABLE a (id INTEGER);', 'utf-8')
		mkdirSync(join(migrationsDir, 'DB_B'), { recursive: true })

		const calls: Array<{ bindingName: string; statements: string[] }> = []
		globalThis.fetch = mock(async (_input: unknown, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body ?? '{}'))
			calls.push(body)
			return new Response(JSON.stringify({ success: true, results: [] }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		}) as unknown as typeof fetch

		await runD1Migrations({
			cwd: projectDir,
			config: {
				name: 'demo-worker',
				compatibilityDate: '2026-04-12',
				bindings: {
					d1: {
						DB_A: 'db-a',
						DB_B: 'db-b',
						DB_C: 'db-c'
					}
				}
			} as never,
			miniflarePort: 8787
		})

		expect(calls).toHaveLength(2)
		const byBinding = new Map(calls.map((c) => [c.bindingName, c.statements]))
		expect(byBinding.get('DB_A')).toEqual(['CREATE TABLE a (id INTEGER)'])
		expect(byBinding.has('DB_B')).toBe(false)
		expect(byBinding.get('DB_C')).toEqual(['CREATE TABLE shared (id INTEGER)'])
	})

	test('shared fallback applies to all bindings when no per-binding dirs exist', async () => {
		const projectDir = temporaryDirectories.create('devflare-d1-shared-')
		const migrationsDir = join(projectDir, 'migrations')
		mkdirSync(migrationsDir, { recursive: true })
		writeFileSync(join(migrationsDir, 'shared.sql'), 'CREATE TABLE shared (id INTEGER);', 'utf-8')

		const calls: Array<{ bindingName: string; statements: string[] }> = []
		globalThis.fetch = mock(async (_input: unknown, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body ?? '{}'))
			calls.push(body)
			return new Response(JSON.stringify({ success: true, results: [] }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		}) as unknown as typeof fetch

		await runD1Migrations({
			cwd: projectDir,
			config: {
				name: 'demo-worker',
				compatibilityDate: '2026-04-12',
				bindings: {
					d1: {
						DB_ONE: 'db-one',
						DB_TWO: 'db-two'
					}
				}
			} as never,
			miniflarePort: 8787
		})

		expect(calls).toHaveLength(2)
		expect(calls[0]?.bindingName).toBe('DB_ONE')
		expect(calls[0]?.statements).toEqual(['CREATE TABLE shared (id INTEGER)'])
		expect(calls[1]?.bindingName).toBe('DB_TWO')
		expect(calls[1]?.statements).toEqual(['CREATE TABLE shared (id INTEGER)'])
	})

	test('returns without fetching when no migrations/ directory exists', async () => {
		const projectDir = temporaryDirectories.create('devflare-d1-nomig-')
		const fetchMock = mock(async () => new Response('{}', { status: 200 }))
		globalThis.fetch = fetchMock as unknown as typeof fetch

		await runD1Migrations({
			cwd: projectDir,
			config: {
				name: 'demo-worker',
				compatibilityDate: '2026-04-12',
				bindings: {
					d1: {
						DB: 'demo-db'
					}
				}
			} as never,
			miniflarePort: 8787
		})

		expect(fetchMock).toHaveBeenCalledTimes(0)
	})

	test('returns without fetching when config has no d1 bindings', async () => {
		const projectDir = createProjectWithMigration('CREATE TABLE demo (id INTEGER);')
		const fetchMock = mock(async () => new Response('{}', { status: 200 }))
		globalThis.fetch = fetchMock as unknown as typeof fetch

		await runD1Migrations({
			cwd: projectDir,
			config: {
				name: 'demo-worker',
				compatibilityDate: '2026-04-12',
				bindings: {}
			} as never,
			miniflarePort: 8787
		})

		expect(fetchMock).toHaveBeenCalledTimes(0)
	})

	test('orders SQL files alphabetically within a per-binding directory', async () => {
		const projectDir = temporaryDirectories.create('devflare-d1-order-')
		const migrationsDir = join(projectDir, 'migrations')
		const bindingDir = join(migrationsDir, 'DB')
		mkdirSync(bindingDir, { recursive: true })
		writeFileSync(join(bindingDir, '002_second.sql'), 'CREATE TABLE second (id INTEGER);', 'utf-8')
		writeFileSync(join(bindingDir, '001_first.sql'), 'CREATE TABLE first (id INTEGER);', 'utf-8')

		const calls: Array<{ bindingName: string; statements: string[] }> = []
		globalThis.fetch = mock(async (_input: unknown, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body ?? '{}'))
			calls.push(body)
			return new Response(JSON.stringify({ success: true, results: [] }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		}) as unknown as typeof fetch

		await runD1Migrations({
			cwd: projectDir,
			config: {
				name: 'demo-worker',
				compatibilityDate: '2026-04-12',
				bindings: {
					d1: {
						DB: 'demo-db'
					}
				}
			} as never,
			miniflarePort: 8787
		})

		expect(calls).toHaveLength(1)
		expect(calls[0]?.statements).toEqual([
			'CREATE TABLE first (id INTEGER)',
			'CREATE TABLE second (id INTEGER)'
		])
	})

	test('ledger first-run: sends files with sha256 and marks all as applied', async () => {
		const projectDir = createProjectWithMigration('CREATE TABLE demo (id INTEGER PRIMARY KEY);')

		const calls: Array<{
			bindingName: string
			files?: Array<{ filename: string; sha256: string; statements: string[] }>
		}> = []
		globalThis.fetch = mock(async (_input: unknown, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body ?? '{}'))
			calls.push(body)
			return new Response(
				JSON.stringify({
					success: true,
					applied: body.files?.map((f: { filename: string }) => f.filename) ?? [],
					skipped: [],
					warnings: []
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			)
		}) as unknown as typeof fetch

		await runD1Migrations({
			cwd: projectDir,
			config: {
				name: 'demo-worker',
				compatibilityDate: '2026-04-12',
				bindings: { d1: { DB: 'demo-db' } }
			} as never,
			miniflarePort: 8787
		})

		expect(calls).toHaveLength(1)
		expect(calls[0]?.files).toHaveLength(1)
		expect(calls[0]?.files?.[0]?.filename).toBe('001_init.sql')
		expect(typeof calls[0]?.files?.[0]?.sha256).toBe('string')
		expect((calls[0]?.files?.[0]?.sha256 ?? '').length).toBe(64)
		expect(calls[0]?.files?.[0]?.statements).toEqual(['CREATE TABLE demo (id INTEGER PRIMARY KEY)'])
	})

	test('ledger second-run with same content: gateway reports all skipped, no warnings', async () => {
		const projectDir = createProjectWithMigration('CREATE TABLE demo (id INTEGER PRIMARY KEY);')
		const warnSpy = mock(() => {})
		const originalWarn = console.warn
		console.warn = warnSpy as unknown as typeof console.warn

		try {
			globalThis.fetch = mock(async (_input: unknown, init?: RequestInit) => {
				const body = JSON.parse(String(init?.body ?? '{}'))
				return new Response(
					JSON.stringify({
						success: true,
						applied: [],
						skipped: body.files?.map((f: { filename: string }) => f.filename) ?? [],
						warnings: []
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				)
			}) as unknown as typeof fetch

			await runD1Migrations({
				cwd: projectDir,
				config: {
					name: 'demo-worker',
					compatibilityDate: '2026-04-12',
					bindings: { d1: { DB: 'demo-db' } }
				} as never,
				miniflarePort: 8787
			})

			expect(warnSpy).toHaveBeenCalledTimes(0)
		} finally {
			console.warn = originalWarn
		}
	})

	test('ledger second-run with changed content: emits console.warn and does not re-apply', async () => {
		const projectDir = createProjectWithMigration('CREATE TABLE demo (id INTEGER, added TEXT);')
		const warnSpy = mock(() => {})
		const originalWarn = console.warn
		console.warn = warnSpy as unknown as typeof console.warn

		try {
			globalThis.fetch = mock(async (_input: unknown, init?: RequestInit) => {
				const body = JSON.parse(String(init?.body ?? '{}'))
				const filenames = body.files?.map((f: { filename: string }) => f.filename) ?? []
				return new Response(
					JSON.stringify({
						success: true,
						applied: [],
						skipped: filenames,
						warnings: filenames.map((filename: string) => ({
							filename,
							message: 'sha256 drifted since last apply; skipped'
						}))
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				)
			}) as unknown as typeof fetch

			await runD1Migrations({
				cwd: projectDir,
				config: {
					name: 'demo-worker',
					compatibilityDate: '2026-04-12',
					bindings: { d1: { DB: 'demo-db' } }
				} as never,
				miniflarePort: 8787
			})

			expect(warnSpy).toHaveBeenCalledTimes(1)
			const warnArgs = (warnSpy as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]
			expect(String(warnArgs?.[0] ?? '')).toContain('001_init.sql')
			expect(String(warnArgs?.[0] ?? '')).toContain('changed')
		} finally {
			console.warn = originalWarn
		}
	})
})
