import { afterEach, describe, expect, mock, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { runWorkerCommand } from '../../../src/cli/commands/worker'
import { jsonResponse } from '../../helpers/cloudflare-api'
import { createLogger } from '../../helpers/mock-logger'

const originalFetch = globalThis.fetch
const originalToken = process.env.CLOUDFLARE_API_TOKEN
const tempDirectories: string[] = []

afterEach(async () => {
	globalThis.fetch = originalFetch
	if (originalToken === undefined) {
		delete process.env.CLOUDFLARE_API_TOKEN
	} else {
		process.env.CLOUDFLARE_API_TOKEN = originalToken
	}

	for (const directory of tempDirectories.splice(0)) {
		await rm(directory, { recursive: true, force: true })
	}
})

async function createTempMonorepo(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), 'devflare-worker-rename-'))
	tempDirectories.push(directory)
	return directory
}

async function writeConfigFile(
	rootDir: string,
	relativePath: string,
	workerName: string
): Promise<string> {
	const configPath = join(rootDir, relativePath)
	await mkdir(dirname(configPath), { recursive: true })
	await writeFile(
		configPath,
		`export default {
	name: '${workerName}',
	compatibilityDate: '2026-04-08',
	accountId: 'acc_123'
}
`,
		'utf-8'
	)
	return configPath
}

function mockRenameWorkerApi(fromName: string, toName: string): void {
	globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input)
		const method = init?.method ?? 'GET'

		if (method === 'GET' && url.includes('/accounts/acc_123/workers/scripts?page=1&per_page=50')) {
			return jsonResponse([
				{
					id: 'worker_1',
					name: fromName,
					created_on: '2026-04-08T00:00:00.000Z',
					modified_on: '2026-04-08T00:00:00.000Z'
				}
			])
		}

		if (method === 'PATCH' && url.endsWith(`/accounts/acc_123/workers/workers/${fromName}`)) {
			return jsonResponse({
				id: 'worker_1',
				name: toName
			})
		}

		throw new Error(`Unexpected fetch request: ${method} ${url}`)
	}) as unknown as typeof fetch
}

async function runRenameWorker(
	rootDir: string,
	fromName: string,
	toName: string,
	logger: ReturnType<typeof createLogger>
) {
	return await runWorkerCommand(
		{
			command: 'worker',
			args: ['rename', fromName],
			options: {
				to: toName
			}
		},
		logger as any,
		{ cwd: rootDir }
	)
}

describe('worker command', () => {
	test('renames a remote Worker and updates the matching nested devflare config', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		const rootDir = await createTempMonorepo()
		const configPath = await writeConfigFile(
			rootDir,
			'apps/documentation/devflare.config.ts',
			'documentation'
		)

		mockRenameWorkerApi('documentation', 'devflare-documentation')

		const logger = createLogger()
		const result = await runRenameWorker(rootDir, 'documentation', 'devflare-documentation', logger)

		const updatedConfig = await readFile(configPath, 'utf-8')

		expect(result.exitCode).toBe(0)
		expect(updatedConfig).toContain("name: 'devflare-documentation'")
		expect(updatedConfig).not.toContain("name: 'documentation'")
		expect(
			logger.messages.some((message) =>
				message.args
					.join(' ')
					.includes('Renamed remote Worker documentation → devflare-documentation')
			)
		).toBe(true)
		expect(
			logger.messages.some((message) =>
				message.args.join(' ').includes('apps/documentation/devflare.config.ts')
			)
		).toBe(true)
	})

	test('renames the remote Worker when the matching nested config is already updated locally', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		const rootDir = await createTempMonorepo()
		const configPath = await writeConfigFile(
			rootDir,
			'apps/documentation/devflare.config.ts',
			'devflare-documentation'
		)

		mockRenameWorkerApi('documentation', 'devflare-documentation')

		const logger = createLogger()
		const result = await runRenameWorker(rootDir, 'documentation', 'devflare-documentation', logger)

		const updatedConfig = await readFile(configPath, 'utf-8')

		expect(result.exitCode).toBe(0)
		expect(updatedConfig).toContain("name: 'devflare-documentation'")
		expect(
			logger.messages.some((message) =>
				message.args
					.join(' ')
					.includes('Renamed remote Worker documentation → devflare-documentation')
			)
		).toBe(true)
		expect(
			logger.messages.some((message) => message.args.join(' ').includes('already updated locally'))
		).toBe(true)
	})

	test('fails clearly when multiple nested configs match the old worker name', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		const rootDir = await createTempMonorepo()
		await writeConfigFile(rootDir, 'apps/docs-a/devflare.config.ts', 'documentation')
		await writeConfigFile(rootDir, 'apps/docs-b/devflare.config.ts', 'documentation')

		const logger = createLogger()
		const result = await runWorkerCommand(
			{
				command: 'worker',
				args: ['rename', 'documentation'],
				options: {
					to: 'devflare-documentation'
				}
			},
			logger as any,
			{ cwd: rootDir }
		)

		expect(result.exitCode).toBe(1)
		expect(
			logger.messages.some((message) =>
				message.args.join(' ').includes('Multiple matching devflare configs were found')
			)
		).toBe(true)
	})
})
