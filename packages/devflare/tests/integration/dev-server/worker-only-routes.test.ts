import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { type DevServer, createDevServer } from '../../../src/dev-server'
import {
	cleanupTempDirs,
	getAvailablePort,
	installBuiltDevflare,
	waitForResponseText
} from '../helpers/built-devflare.helpers'

const tempDirs: string[] = []
const DEV_SERVER_HOOK_TIMEOUT_MS = 20_000

afterAll(async () => {
	await cleanupTempDirs(tempDirs)
}, DEV_SERVER_HOOK_TIMEOUT_MS)

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

		await writeFile(
			join(projectDir, 'package.json'),
			JSON.stringify(
				{
					name: 'worker-only-routes-test',
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
`.trim()
		)
		await writeFile(
			join(projectDir, 'src', 'fetch.ts'),
			`
import { sequence } from 'devflare/runtime'

export const handle = sequence(async (event, resolve) => {
	const response = await resolve(event)
	const next = new Response(response.body, response)
	next.headers.set('x-route-id', event.params.id ?? 'none')
	return next
})
`.trim()
		)
		await writeFile(
			userRoutePath,
			`
export async function GET(event): Promise<Response> {
	return new Response(String(event.params.id))
}
`.trim()
		)

		devServer = createDevServer({
			cwd: projectDir,
			miniflarePort: port,
			enableVite: false,
			persist: false
		})

		await devServer.start()
		await waitForResponseText(`${workerUrl}/api/users/42`, '42')
	}, DEV_SERVER_HOOK_TIMEOUT_MS)

	afterAll(async () => {
		if (devServer) {
			await devServer.stop()
		}
	}, DEV_SERVER_HOOK_TIMEOUT_MS)

	test('dispatches route files and exposes params to outer fetch middleware', async () => {
		const response = await fetch(`${workerUrl}/api/users/42`)
		expect(response.status).toBe(200)
		expect(await response.text()).toBe('42')
		expect(response.headers.get('x-route-id')).toBe('42')
	})

	test('reloads route files in worker-only mode', async () => {
		await writeFile(
			userRoutePath,
			`
export async function GET(event): Promise<Response> {
	return new Response(String(event.params.id) + '-updated')
}
`.trim()
		)

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

		await writeFile(
			join(projectDir, 'package.json'),
			JSON.stringify(
				{
					name: 'worker-only-late-routes-test',
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
	name: 'worker-only-late-routes-test',
	compatibilityDate: '2026-03-17'
}
`.trim()
		)

		devServer = createDevServer({
			cwd: projectDir,
			miniflarePort: port,
			enableVite: false,
			persist: false
		})

		await devServer.start()
		expect(await waitForResponseText(workerUrl, 'Devflare Bridge Gateway')).toBe(
			'Devflare Bridge Gateway'
		)
	}, DEV_SERVER_HOOK_TIMEOUT_MS)

	afterAll(async () => {
		if (devServer) {
			await devServer.stop()
		}
	}, DEV_SERVER_HOOK_TIMEOUT_MS)

	test('reloads when a default src/routes/index.ts file is created after startup', async () => {
		await mkdir(join(projectDir, 'src', 'routes'), { recursive: true })
		await writeFile(
			routePath,
			`
export async function GET(): Promise<Response> {
	return new Response('late-route')
}
`.trim()
		)

		expect(await waitForResponseText(workerUrl, 'late-route')).toBe('late-route')
	}, 10000)
})
