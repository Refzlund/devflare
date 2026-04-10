import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { runConfigCommand } from '../../../src/cli/commands/config'

interface TestLogger {
	info: ReturnType<typeof mock>
	warn: ReturnType<typeof mock>
	error: ReturnType<typeof mock>
	success: ReturnType<typeof mock>
	debug: ReturnType<typeof mock>
	messages: Array<{ level: string; args: unknown[] }>
}

function createLogger(): TestLogger {
	const messages: Array<{ level: string; args: unknown[] }> = []
	const createMethod = (level: string) => mock((...args: unknown[]) => {
		messages.push({ level, args })
	})

	return {
		info: createMethod('info'),
		warn: createMethod('warn'),
		error: createMethod('error'),
		success: createMethod('success'),
		debug: createMethod('debug'),
		messages
	}
}

describe('runConfigCommand', () => {
	let projectDir: string

	beforeEach(async () => {
		projectDir = await mkdtemp(join(tmpdir(), 'devflare-config-command-'))
		await mkdir(join(projectDir, 'src'), { recursive: true })
		await writeFile(join(projectDir, 'devflare.config.ts'), `
export default {
	name: 'config-command-worker',
	compatibilityDate: '2025-01-07',
	bindings: {
		d1: {
			DB: { id: 'existing-d1-id' }
		},
		r2: {
			ASSETS: 'assets-bucket'
		}
	}
}
		`.trim())
	})

	afterEach(async () => {
		await rm(projectDir, { recursive: true, force: true })
	})

	test('prints resolved devflare config JSON', async () => {
		const logger = createLogger()
		const result = await runConfigCommand(
			{ command: 'config', args: ['print'], options: { json: true } },
			logger as any,
			{ cwd: projectDir, silent: true }
		)

		expect(result.exitCode).toBe(0)
		expect(result.output).toContain('config-command-worker')
		expect(result.output).toContain('assets-bucket')
		expect(result.output).toContain('existing-d1-id')
	})

	test('prints resolved wrangler config JSON', async () => {
		const logger = createLogger()
		const result = await runConfigCommand(
			{ command: 'config', args: ['print'], options: { format: 'wrangler', json: true } },
			logger as any,
			{ cwd: projectDir, silent: true }
		)

		expect(result.exitCode).toBe(0)
		expect(result.output).toContain('d1_databases')
		expect(result.output).toContain('r2_buckets')
		expect(result.output).toContain('existing-d1-id')
	})
})