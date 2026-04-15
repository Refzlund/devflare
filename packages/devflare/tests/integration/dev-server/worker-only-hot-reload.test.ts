import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'pathe'
import { createDevServer, type DevServer } from '../../../src/dev-server'
import {
	getAvailablePort,
	installBuiltDevflare,
	waitForResponseText
} from '../helpers/built-devflare.helpers'

describe('worker-only dev server hot reload', () => {
	let projectDir = ''
	let devServer: DevServer | null = null
	let port = 0
	let workerUrl = ''
	let configPath = ''
	let messagePath = ''
	let localDefineConfigImportPath = ''

	const getConfigFileContent = (message: string) => `
import { defineConfig } from '${localDefineConfigImportPath}'

export default defineConfig({
	name: 'worker-only-hot-reload-test',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	},
	vars: {
		MESSAGE: '${message}'
	}
})
`

	beforeAll(async () => {
		projectDir = await mkdtemp(join(tmpdir(), 'devflare-worker-only-'))
		port = await getAvailablePort()
		workerUrl = `http://127.0.0.1:${port}/`
		configPath = join(projectDir, 'devflare.config.ts')
		messagePath = join(projectDir, 'src', 'lib', 'message.ts')
		localDefineConfigImportPath = join(dirname(fileURLToPath(import.meta.url)), '../../../src/index.ts')
			.replace(/\\/g, '/')

		await mkdir(join(projectDir, 'src', 'lib'), { recursive: true })
		await installBuiltDevflare(projectDir)

		await writeFile(join(projectDir, 'package.json'), JSON.stringify({
			name: 'worker-only-hot-reload-test',
			private: true,
			type: 'module'
		}, null, 2))

		await writeFile(join(projectDir, 'tsconfig.json'), JSON.stringify({
			compilerOptions: {
				target: 'ESNext',
				module: 'ESNext',
				moduleResolution: 'Bundler'
			}
		}, null, 2))

		await writeFile(configPath, getConfigFileContent('before-config'))

		await writeFile(messagePath, `export const message = 'before'\n`)
		await writeFile(join(projectDir, 'src', 'fetch.ts'), `
import { message } from './lib/message'

export default async function fetch(event) {
	const url = event.url

	if (url.pathname === '/config') {
		return new Response(String(event.env.MESSAGE))
	}

	return new Response(message)
}
`)

		devServer = createDevServer({
			cwd: projectDir,
			miniflarePort: port,
			enableVite: false,
			persist: false
		})

		await devServer.start()
		await waitForResponseText(workerUrl, 'before')
	})

	afterAll(async () => {
		if (devServer) {
			await devServer.stop()
		}

		if (projectDir) {
			await rm(projectDir, { recursive: true, force: true })
		}
	})

	test('serves the configured fetch worker when Vite is disabled', async () => {
		const response = await fetch(workerUrl)
		expect(response.status).toBe(200)
		expect(await response.text()).toBe('before')
	})

	test('reloads imported worker modules without starting Vite', async () => {
		await writeFile(messagePath, `export const message = 'after'\n`)
		expect(await waitForResponseText(workerUrl, 'after')).toBe('after')
	}, 15000)

	test('reloads devflare.config.ts changes in worker-only mode', async () => {
		await writeFile(configPath, getConfigFileContent('after-config'))
		expect(await waitForResponseText(`${workerUrl}config`, 'after-config')).toBe('after-config')
	}, 15000)
})

describe('worker-only dev server late worker discovery', () => {
	let projectDir = ''
	let devServer: DevServer | null = null
	let port = 0
	let workerUrl = ''
	let fetchPath = ''
	let localDefineConfigImportPath = ''

	beforeAll(async () => {
		projectDir = await mkdtemp(join(tmpdir(), 'devflare-worker-only-late-fetch-'))
		port = await getAvailablePort()
		workerUrl = `http://127.0.0.1:${port}/`
		fetchPath = join(projectDir, 'src', 'fetch.ts')
		localDefineConfigImportPath = join(dirname(fileURLToPath(import.meta.url)), '../../../src/index.ts')
			.replace(/\\/g, '/')

		await mkdir(join(projectDir, 'src'), { recursive: true })
		await installBuiltDevflare(projectDir)

		await writeFile(join(projectDir, 'package.json'), JSON.stringify({
			name: 'worker-only-late-fetch-test',
			private: true,
			type: 'module'
		}, null, 2))

		await writeFile(join(projectDir, 'tsconfig.json'), JSON.stringify({
			compilerOptions: {
				target: 'ESNext',
				module: 'ESNext',
				moduleResolution: 'Bundler'
			}
		}, null, 2))

		await writeFile(join(projectDir, 'devflare.config.ts'), `
import { defineConfig } from '${localDefineConfigImportPath}'

export default defineConfig({
	name: 'worker-only-late-fetch-test',
	compatibilityDate: '2026-03-17'
})
`)

		devServer = createDevServer({
			cwd: projectDir,
			miniflarePort: port,
			enableVite: false,
			persist: false
		})

		await devServer.start()
		expect(await waitForResponseText(workerUrl, 'Devflare Bridge Gateway')).toBe('Devflare Bridge Gateway')
	})

	afterAll(async () => {
		if (devServer) {
			await devServer.stop()
		}

		if (projectDir) {
			await rm(projectDir, { recursive: true, force: true })
		}
	})

	test('reloads when a default src/fetch.ts file is created after startup', async () => {
		await writeFile(fetchPath, `
export default {
	async fetch() {
		return new Response('late-fetch')
	}
}
`)

		expect(await waitForResponseText(workerUrl, 'late-fetch')).toBe('late-fetch')
	}, 10000)
})
