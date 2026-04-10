import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cp, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'pathe'
import { createDevServer, type DevServer } from '../../../src/dev-server'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../')
const tempDirs: string[] = []
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

afterAll(async () => {
	for (const tempDir of tempDirs) {
		await rm(tempDir, { recursive: true, force: true })
	}
})

describe('worker-only dev server file routes', () => {
	let projectDir = ''
	let devServer: DevServer | null = null
	let port = 0
	let workerUrl = ''
	let userRoutePath = ''

	beforeAll(async () => {
		projectDir = await mkdtemp(join(tmpdir(), 'devflare-worker-only-routes-'))
		tempDirs.push(projectDir)
		port = await getAvailablePort()
		workerUrl = `http://127.0.0.1:${port}`
		userRoutePath = join(projectDir, 'src', 'routes', 'users', '[id].ts')

		await mkdir(join(projectDir, 'src', 'routes', 'users'), { recursive: true })
		await installBuiltDevflare(projectDir)

		await writeFile(join(projectDir, 'package.json'), JSON.stringify({
			name: 'worker-only-routes-test',
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
export default {
	name: 'worker-only-routes-test',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts',
		routes: {
			dir: 'src/routes',
			prefix: '/api'
		}
	}
}
`.trim())
		await writeFile(join(projectDir, 'src', 'fetch.ts'), `
import { sequence } from 'devflare/runtime'

export const handle = sequence(async (event, resolve) => {
	const response = await resolve(event)
	const next = new Response(response.body, response)
	next.headers.set('x-route-id', event.params.id ?? 'none')
	return next
})
`.trim())
		await writeFile(userRoutePath, `
export async function GET(event): Promise<Response> {
	return new Response(String(event.params.id))
}
`.trim())

		devServer = createDevServer({
			cwd: projectDir,
			miniflarePort: port,
			enableVite: false,
			persist: false
		})

		await devServer.start()
		await waitForResponseText(`${workerUrl}/api/users/42`, '42')
	})

	afterAll(async () => {
		if (devServer) {
			await devServer.stop()
		}
	})

	test('dispatches route files and exposes params to outer fetch middleware', async () => {
		const response = await fetch(`${workerUrl}/api/users/42`)
		expect(response.status).toBe(200)
		expect(await response.text()).toBe('42')
		expect(response.headers.get('x-route-id')).toBe('42')
	})

	test('reloads route files in worker-only mode', async () => {
		await writeFile(userRoutePath, `
export async function GET(event): Promise<Response> {
	return new Response(String(event.params.id) + '-updated')
}
`.trim())

		expect(await waitForResponseText(`${workerUrl}/api/users/42`, '42-updated')).toBe('42-updated')
	})
})

describe('worker-only dev server late route discovery', () => {
	let projectDir = ''
	let devServer: DevServer | null = null
	let port = 0
	let workerUrl = ''
	let routePath = ''

	beforeAll(async () => {
		projectDir = await mkdtemp(join(tmpdir(), 'devflare-worker-only-late-routes-'))
		tempDirs.push(projectDir)
		port = await getAvailablePort()
		workerUrl = `http://127.0.0.1:${port}/`
		routePath = join(projectDir, 'src', 'routes', 'index.ts')

		await mkdir(join(projectDir, 'src'), { recursive: true })
		await installBuiltDevflare(projectDir)

		await writeFile(join(projectDir, 'package.json'), JSON.stringify({
			name: 'worker-only-late-routes-test',
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
export default {
	name: 'worker-only-late-routes-test',
	compatibilityDate: '2026-03-17'
}
`.trim())

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
	})

	test('reloads when a default src/routes/index.ts file is created after startup', async () => {
		await mkdir(join(projectDir, 'src', 'routes'), { recursive: true })
		await writeFile(routePath, `
export async function GET(): Promise<Response> {
	return new Response('late-route')
}
`.trim())

		expect(await waitForResponseText(workerUrl, 'late-route')).toBe('late-route')
	}, 10000)
})
