import type { ConsolaInstance } from 'consola'
import { resolve } from 'pathe'
import type { DevflareConfig } from '../config'

export interface RunD1MigrationsOptions {
	cwd: string
	config: DevflareConfig | null
	miniflarePort: number
	logger?: ConsolaInstance
}

const MIGRATION_RETRY_DELAYS_MS = [500, 1000, 1500, 2000] as const

function collectMigrationStatements(sql: string): string[] {
	const cleanedSql = sql
		.split('\n')
		.filter((line: string) => !line.trim().startsWith('--'))
		.join('\n')

	return cleanedSql
		.split(';')
		.map((statement: string) => statement.trim())
		.filter((statement: string) => statement.length > 0)
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

async function waitForRetry(delayMs: number): Promise<void> {
	await new Promise((resolvePromise) => setTimeout(resolvePromise, delayMs))
}

async function applyMigrationsToBinding(options: {
	bindingName: string
	statements: string[]
	miniflarePort: number
	logger?: ConsolaInstance
}): Promise<void> {
	const { bindingName, statements, miniflarePort, logger } = options
	let lastError: unknown

	for (let attempt = 0;attempt <= MIGRATION_RETRY_DELAYS_MS.length;attempt++) {
		if (attempt > 0) {
			await waitForRetry(MIGRATION_RETRY_DELAYS_MS[attempt - 1])
		}

		try {
			const response = await fetch(`http://127.0.0.1:${miniflarePort}/_devflare/migrate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ bindingName, statements })
			})

			if (!response.ok) {
				const text = await response.text()
				throw new Error(`HTTP ${response.status}: ${text}`)
			}

			const result = await response.json() as {
				success?: boolean
				error?: string
				results?: unknown[]
			}
			if (result.success) {
				logger?.success(`D1 migrations applied to ${bindingName}`)
				return
			}

			throw new Error(result.error || 'Unknown error')
		} catch (error) {
			lastError = error
		}
	}

	logger?.warn(`Failed to apply migrations to ${bindingName}: ${getErrorMessage(lastError)}`)
}

/**
 * Run D1 migrations from migrations/ directory.
 * Uses the gateway worker HTTP endpoint to run migrations inside workerd.
 */
export async function runD1Migrations(options: RunD1MigrationsOptions): Promise<void> {
	const { cwd, config, miniflarePort, logger } = options
	if (!config?.bindings?.d1) {
		return
	}

	const { existsSync, readdirSync, readFileSync } = await import('node:fs')
	const migrationsDir = resolve(cwd, 'migrations')

	if (!existsSync(migrationsDir)) {
		logger?.debug('No migrations/ directory found, skipping D1 migrations')
		return
	}

	const files = readdirSync(migrationsDir)
		.filter((file: string) => file.endsWith('.sql'))
		.sort()

	if (files.length === 0) {
		logger?.debug('No SQL migration files found')
		return
	}

	logger?.info(`Running ${files.length} D1 migration(s)...`)

	const allStatements: string[] = []
	for (const file of files) {
		const sql = readFileSync(resolve(migrationsDir, file), 'utf-8')
		const statements = collectMigrationStatements(sql)
		allStatements.push(...statements)
		logger?.debug(`File ${file}: ${statements.length} statement(s)`)
	}

	if (allStatements.length === 0) {
		logger?.debug('No executable D1 migration statements found')
		return
	}

	for (const [bindingName] of Object.entries(config.bindings.d1)) {
		await applyMigrationsToBinding({
			bindingName,
			statements: allStatements,
			miniflarePort,
			logger
		})
	}
}
