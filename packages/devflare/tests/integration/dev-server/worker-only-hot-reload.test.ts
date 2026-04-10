import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cp, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'pathe'
import { createDevServer, type DevServer } from '../../../src/dev-server'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../')
let buildPromise: Promise<void> | null = null

async function ensurePackageBuilt(): Promise<void> {
	if (!buildPromise) {
		buildPromise = (async () => {
			const build = Bun.spawn(['bun', 'run', 'build'], {
				cwd: packageRoot,
				stdout: 'pipe',
				stderr: 'pipe'
			})

			const [stdout, stderr, exitCode] = await Promise.all([
				new Response(build.stdout).text(),
				new Response(build.stderr).text(),
				build.exited
			])

			if (exitCode !== 0) {
				throw new Error([
					'Package build failed',
					stdout.trim(),
					stderr.trim()
				].filter(Boolean).join('\n\n'))
			}
		})()
	}

	await buildPromise
}

async function installBuiltDevflare(projectDir: string): Promise<void> {
	await ensurePackageBuilt()

	const packagedDevflareDir = join(projectDir, 'node_modules', 'devflare')
	await mkdir(packagedDevflareDir, { recursive: true })
	await cp(join(packageRoot, 'package.json'), join(packagedDevflareDir, 'package.json'))
	await cp(join(packageRoot, 'dist'), join(packagedDevflareDir, 'dist'), { recursive: true })
}

async function getAvailablePort(): Promise<number> {
	return await new Promise((resolvePromise, rejectPromise) => {
		const server = createServer()

		server.on('error', rejectPromise)
		server.listen(0, '127.0.0.1', () => {
			const address = server.address()
			if (!address || typeof address === 'string') {
				server.close(() => rejectPromise(new Error('Could not determine an available port')))
				return
			}

			const { port } = address
			server.close((error) => {
				if (error) {
					rejectPromise(error)
					return
				}

				resolvePromise(port)
			})
		})
	})
}

async function waitForResponseText(url: string, expectedText: string, timeoutMs = 8000): Promise<string> {
	const deadline = Date.now() + timeoutMs
	let lastError: unknown = null

	while (Date.now() < deadline) {
		try {
			const response = await fetch(url)
			const text = await response.text()
			if (text === expectedText) {
				return text
			}
			lastError = new Error(`Expected "${expectedText}", received "${text}"`)
		} catch (error) {
			lastError = error
		}

		await new Promise((resolvePromise) => setTimeout(resolvePromise, 200))
	}

	throw lastError instanceof Error
		? lastError
		: new Error(`Timed out waiting for response text "${expectedText}"`)
}

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

export default {
	async fetch(request, env) {
		const url = new URL(request.url)

		if (url.pathname === '/config') {
			return new Response(String(env.MESSAGE))
		}

		return new Response(message)
	}
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
	})

	test('reloads devflare.config.ts changes in worker-only mode', async () => {
		await writeFile(configPath, getConfigFileContent('after-config'))
		expect(await waitForResponseText(`${workerUrl}config`, 'after-config')).toBe('after-config')
	})
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
