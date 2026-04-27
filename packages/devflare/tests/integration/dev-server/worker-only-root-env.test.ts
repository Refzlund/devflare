import { afterAll, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { createDevServer, type DevServer } from '../../../src/dev-server'
import {
	cleanupTempDirs,
	getAvailablePort,
	installBuiltDevflare
} from '../helpers/built-devflare.helpers'

const tempDirs: string[] = []
const DEV_SERVER_HOOK_TIMEOUT_MS = 20_000

afterAll(async () => {
	await cleanupTempDirs(tempDirs)
}, DEV_SERVER_HOOK_TIMEOUT_MS)

describe('worker-only dev server root env imports', () => {
	test('starts successfully when the fetch worker imports env from the root package', async () => {
		const projectDir = await mkdtemp(join(tmpdir(), 'devflare-root-env-worker-'))
		tempDirs.push(projectDir)

		await installBuiltDevflare(projectDir)

		const port = await getAvailablePort()
		const workerUrl = `http://127.0.0.1:${port}/`

		await mkdir(join(projectDir, 'src'), { recursive: true })
		await writeFile(
			join(projectDir, 'package.json'),
			JSON.stringify(
				{
					name: 'worker-root-env-test',
					private: true,
					type: 'module'
				},
				null,
				2
			)
		)
		await writeFile(
			join(projectDir, 'tsconfig.json'),
			JSON.stringify(
				{
					compilerOptions: {
						target: 'ESNext',
						module: 'ESNext',
						moduleResolution: 'Bundler'
					}
				},
				null,
				2
			)
		)

		await writeFile(
			join(projectDir, 'devflare.config.ts'),
			`
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
`.trim()
		)

		await writeFile(
			join(projectDir, 'src', 'fetch.ts'),
			`
import { env } from 'devflare'

export default {
	async fetch() {
		return new Response(String(env.MESSAGE))
	}
}
`.trim()
		)

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
		await writeFile(
			join(projectDir, 'package.json'),
			JSON.stringify(
				{
					name: 'worker-root-env-send-email-test',
					private: true,
					type: 'module'
				},
				null,
				2
			)
		)
		await writeFile(
			join(projectDir, 'tsconfig.json'),
			JSON.stringify(
				{
					compilerOptions: {
						target: 'ESNext',
						module: 'ESNext',
						moduleResolution: 'Bundler'
					}
				},
				null,
				2
			)
		)

		await writeFile(
			join(projectDir, 'devflare.config.ts'),
			`
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
`.trim()
		)

		await writeFile(
			join(projectDir, 'src', 'fetch.ts'),
			`
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
`.trim()
		)

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
		await writeFile(
			join(projectDir, 'package.json'),
			JSON.stringify(
				{
					name: 'worker-root-env-svelte-test',
					private: true,
					type: 'module'
				},
				null,
				2
			)
		)
		await writeFile(
			join(projectDir, 'node_modules', 'svelte', 'package.json'),
			JSON.stringify(
				{
					name: 'svelte',
					type: 'module'
				},
				null,
				2
			)
		)
		await writeFile(
			join(projectDir, 'tsconfig.json'),
			JSON.stringify(
				{
					compilerOptions: {
						target: 'ESNext',
						module: 'ESNext',
						moduleResolution: 'Bundler'
					}
				},
				null,
				2
			)
		)

		await writeFile(
			join(projectDir, 'devflare.config.ts'),
			`
export default {
	name: 'worker-root-env-svelte-test',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	}
}
`.trim()
		)

		await writeFile(
			join(projectDir, 'node_modules', 'svelte', 'src', 'internal', 'server', 'render-context.js'),
			`
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
`.trim()
		)
		await writeFile(
			join(projectDir, 'node_modules', 'svelte', 'src', 'internal', 'server', 'crypto.js'),
			`
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
`.trim()
		)

		await writeFile(
			join(projectDir, 'src', 'fetch.ts'),
			`
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
`.trim()
		)

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
			expect((await response.json()) as Record<string, unknown>).toEqual({
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
