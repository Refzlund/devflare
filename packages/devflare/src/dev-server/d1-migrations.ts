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
 *
 * Resolution per D1 binding (in order):
 *   1. `<cwd>/migrations/<BINDING_NAME>/*.sql` — per-binding directory.
 *      NOTE: if the per-binding directory EXISTS but contains no .sql files,
 *      the binding is skipped — the shared fallback is NOT used.
 *   2. `<cwd>/migrations/*.sql` — shared fallback, used ONLY when the
 *      per-binding directory does not exist.
 *   3. Otherwise, skip the binding with a debug log.
 *
 * Uses the gateway worker HTTP endpoint to run migrations inside workerd.
 */
export async function runD1Migrations(options: RunD1MigrationsOptions): Promise<void> {
	const { cwd, config, miniflarePort, logger } = options
	if (!config?.bindings?.d1) {
		return
	}

	const { existsSync, readdirSync, readFileSync, statSync } = await import('node:fs')
	const migrationsDir = resolve(cwd, 'migrations')

	if (!existsSync(migrationsDir)) {
		logger?.debug('No migrations/ directory found, skipping D1 migrations')
		return
	}

	const sharedFiles = readdirSync(migrationsDir)
		.filter((file: string) => file.endsWith('.sql'))
		.sort()

	let sharedStatements: string[] | null = null
	if (sharedFiles.length > 0) {
		sharedStatements = []
		for (const file of sharedFiles) {
			const sql = readFileSync(resolve(migrationsDir, file), 'utf-8')
			const fileStatements = collectMigrationStatements(sql)
			sharedStatements.push(...fileStatements)
			logger?.debug(`Shared file ${file}: ${fileStatements.length} statement(s)`)
		}
	}

	for (const [bindingName] of Object.entries(config.bindings.d1)) {
		const perBindingDir = resolve(migrationsDir, bindingName)
		const hasPerBindingDir = existsSync(perBindingDir) && statSync(perBindingDir).isDirectory()

		let statements: string[] = []
		let fileCount = 0
		let sourceLabel = ''

		if (hasPerBindingDir) {
			const perBindingFiles = readdirSync(perBindingDir)
				.filter((file: string) => file.endsWith('.sql'))
				.sort()

			// An empty per-binding directory intentionally skips the binding
			// — the shared fallback is NOT used when an explicit directory exists.
			if (perBindingFiles.length === 0) {
				logger?.debug(`No SQL migration files in migrations/${bindingName}/, skipping ${bindingName}`)
				continue
			}

			for (const file of perBindingFiles) {
				const sql = readFileSync(resolve(perBindingDir, file), 'utf-8')
				const fileStatements = collectMigrationStatements(sql)
				statements.push(...fileStatements)
				logger?.debug(`File ${bindingName}/${file}: ${fileStatements.length} statement(s)`)
			}
			fileCount = perBindingFiles.length
			sourceLabel = `migrations/${bindingName}/`
		} else if (sharedStatements !== null) {
			statements = sharedStatements
			fileCount = sharedFiles.length
			sourceLabel = 'migrations/ [shared fallback]'
		} else {
			logger?.debug(`No migrations found for ${bindingName}, skipping`)
			continue
		}

		logger?.info(`Running ${fileCount} D1 migration(s) for ${bindingName} (from ${sourceLabel})`)

		if (statements.length === 0) {
			logger?.debug(`No executable D1 migration statements for ${bindingName}`)
			continue
		}

		await applyMigrationsToBinding({
			bindingName,
			statements,
			miniflarePort,
			logger
		})
	}
}
