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
	globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
		delays.push(Number(timeout ?? 0))
		return originalSetTimeout(handler, 0, ...(args as []))
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
})
