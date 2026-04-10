import { afterAll, describe, expect, test } from 'bun:test'
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'pathe'
import { createDevServer, type DevServer } from '../../../src/dev-server'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../')
const tempDirs: string[] = []
let buildPromise: Promise<void> | null = null

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

afterAll(async () => {
	for (const tempDir of tempDirs) {
		await rm(tempDir, { recursive: true, force: true })
	}
})

describe('worker-only dev server root env imports', () => {
	test('starts successfully when the fetch worker imports env from the root package', async () => {
		const projectDir = await mkdtemp(join(tmpdir(), 'devflare-root-env-worker-'))
		tempDirs.push(projectDir)

		await installBuiltDevflare(projectDir)

		const port = await getAvailablePort()
		const workerUrl = `http://127.0.0.1:${port}/`

		await mkdir(join(projectDir, 'src'), { recursive: true })
		await writeFile(join(projectDir, 'package.json'), JSON.stringify({
			name: 'worker-root-env-test',
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
	name: 'worker-root-env-test',
	compatibilityDate: '2026-03-17',
	compatibilityFlags: ['nodejs_compat', 'nodejs_als'],
	files: {
		fetch: 'src/fetch.ts'
	},
	vars: {
		MESSAGE: 'ok'
	}
}
`.trim())

		await writeFile(join(projectDir, 'src', 'fetch.ts'), `
import { env } from 'devflare'

export default {
	async fetch() {
		return new Response(String(env.MESSAGE))
	}
}
`.trim())

		let devServer: DevServer | null = null

		try {
			devServer = createDevServer({
				cwd: projectDir,
				miniflarePort: port,
				enableVite: false,
				persist: false
			})

			await devServer.start()

			const response = await fetch(workerUrl)
			expect(response.status).toBe(200)
			expect(await response.text()).toBe('ok')
		} finally {
			if (devServer) {
				await devServer.stop()
			}
		}
	})

	test('supports sendEmail bindings when the fetch worker imports env from the root package', async () => {
		const projectDir = await mkdtemp(join(tmpdir(), 'devflare-root-env-send-email-worker-'))
		tempDirs.push(projectDir)

		await installBuiltDevflare(projectDir)

		const port = await getAvailablePort()
		const workerUrl = `http://127.0.0.1:${port}/`

		await mkdir(join(projectDir, 'src'), { recursive: true })
		await writeFile(join(projectDir, 'package.json'), JSON.stringify({
			name: 'worker-root-env-send-email-test',
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
	name: 'worker-root-env-send-email-test',
	compatibilityDate: '2026-03-17',
	compatibilityFlags: ['nodejs_compat', 'nodejs_als'],
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		sendEmail: {
			EMAIL: {
				destinationAddress: 'recipient@example.com',
				allowedSenderAddresses: ['sender@example.com']
			}
		}
	}
}
`.trim())

		await writeFile(join(projectDir, 'src', 'fetch.ts'), `
import { env } from 'devflare'

export default {
	async fetch() {
		await env.EMAIL.send({
			from: 'sender@example.com',
			to: 'recipient@example.com',
			subject: 'Hello from worker',
			text: 'Sent from worker-only dev server'
		})
		return new Response('sent')
	}
}
`.trim())

		let devServer: DevServer | null = null

		try {
			devServer = createDevServer({
				cwd: projectDir,
				miniflarePort: port,
				enableVite: false,
				persist: false
			})

			await devServer.start()

			const response = await fetch(workerUrl)
			expect(response.status).toBe(200)
			expect(await response.text()).toBe('sent')
		} finally {
			if (devServer) {
				await devServer.stop()
			}
		}
	})

	test('starts successfully when worker code pulls in Svelte-style server helpers with dynamic import fallbacks', async () => {
		const projectDir = await mkdtemp(join(tmpdir(), 'devflare-root-env-svelte-worker-'))
		tempDirs.push(projectDir)

		await installBuiltDevflare(projectDir)

		const port = await getAvailablePort()
		const workerUrl = `http://127.0.0.1:${port}/`

		await mkdir(join(projectDir, 'src'), { recursive: true })
		await mkdir(join(projectDir, 'node_modules', 'svelte', 'src', 'internal', 'server'), {
			recursive: true
		})
		await writeFile(join(projectDir, 'package.json'), JSON.stringify({
			name: 'worker-root-env-svelte-test',
			private: true,
			type: 'module'
		}, null, 2))
		await writeFile(join(projectDir, 'node_modules', 'svelte', 'package.json'), JSON.stringify({
			name: 'svelte',
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
	name: 'worker-root-env-svelte-test',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	}
}
`.trim())

		await writeFile(join(projectDir, 'node_modules', 'svelte', 'src', 'internal', 'server', 'render-context.js'), `
let als = null
let als_import = null
const noop = () => {}

export function hasAls() {
	return Boolean(als)
}

export async function init_render_context() {
	als_import ??= import('node:async_hooks').then((hooks) => {
		als = new hooks.AsyncLocalStorage()
	}).then(noop, noop)
	return als_import
}
`.trim())
		await writeFile(join(projectDir, 'node_modules', 'svelte', 'src', 'internal', 'server', 'crypto.js'), `
let cryptoValue
const obfuscated_import = (module_name) => import(
	/* @vite-ignore */
	module_name
)

export async function cryptoMode() {
	cryptoValue ??= globalThis.crypto?.subtle?.digest
		? globalThis.crypto
		: (await obfuscated_import('node:crypto')).webcrypto

	return cryptoValue ? 'crypto-ready' : 'crypto-missing'
}
`.trim())

		await writeFile(join(projectDir, 'src', 'fetch.ts'), `
import { cryptoMode } from 'svelte/src/internal/server/crypto.js'
import { hasAls, init_render_context } from 'svelte/src/internal/server/render-context.js'

export default {
	async fetch() {
		await init_render_context()
		return Response.json({
			als: hasAls(),
			crypto: await cryptoMode()
		})
	}
}
`.trim())

		let devServer: DevServer | null = null

		try {
			devServer = createDevServer({
				cwd: projectDir,
				miniflarePort: port,
				enableVite: false,
				persist: false
			})

			await devServer.start()

			const response = await fetch(workerUrl)
			expect(response.status).toBe(200)
			expect(await response.json()).toEqual({
				als: true,
				crypto: 'crypto-ready'
			})
		} finally {
			if (devServer) {
				await devServer.stop()
			}
		}
	}, 15000)
})