import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { DEFAULT_ROUTE_DIR, discoverRoutes } from '../../../src/worker-entry/routes'

const tempDirs: string[] = []

afterAll(async () => {
	for (const tempDir of tempDirs) {
		await rm(tempDir, { recursive: true, force: true })
	}
})

async function createTempProject(): Promise<string> {
	const projectDir = await mkdtemp(join(tmpdir(), 'devflare-routes-discovery-'))
	tempDirs.push(projectDir)
	return projectDir
}

describe('discoverRoutes', () => {
	test('discovers the default src/routes directory and ignores private helper files', async () => {
		const projectDir = await createTempProject()
		const routesDir = join(projectDir, DEFAULT_ROUTE_DIR)

		await mkdir(join(routesDir, 'users'), { recursive: true })
		await mkdir(join(routesDir, '_internal'), { recursive: true })
		await writeFile(join(routesDir, 'index.ts'), 'export async function GET() { return new Response("root") }')
		await writeFile(join(routesDir, 'users', 'index.ts'), 'export async function GET() { return new Response("users") }')
		await writeFile(join(routesDir, 'users', '[id].ts'), 'export async function GET() { return new Response("user") }')
		await writeFile(join(routesDir, 'users', '[...slug].ts'), 'export async function GET() { return new Response("slug") }')
		await writeFile(join(routesDir, '_internal', 'helper.ts'), 'export const helper = true')

		const routes = await discoverRoutes(projectDir, {
			name: 'route-discovery-test'
		} as any)

		expect(routes?.dir).toBe('src/routes')
		const routePaths = routes?.routes.map((route) => route.routePath) ?? []
		expect(routePaths).toEqual(expect.arrayContaining([
			'/',
			'/users',
			'/users/[id]',
			'/users/[...slug]'
		]))
		expect(routePaths.indexOf('/users/[id]')).toBeLessThan(routePaths.indexOf('/users/[...slug]'))
		expect(routes?.routes.some((route) => route.filePath.includes('_internal'))).toBe(false)
	})

	test('applies files.routes prefix to discovered route paths', async () => {
		const projectDir = await createTempProject()
		const routesDir = join(projectDir, 'app-routes')

		await mkdir(join(routesDir, 'users'), { recursive: true })
		await writeFile(join(routesDir, 'users', '[id].ts'), 'export async function GET() { return new Response("user") }')

		const routes = await discoverRoutes(projectDir, {
			name: 'route-discovery-prefix-test',
			files: {
				routes: {
					dir: 'app-routes',
					prefix: '/api'
				}
			}
		} as any)

		expect(routes?.prefix).toBe('/api')
		expect(routes?.routes.map((route) => route.routePath)).toEqual(['/api/users/[id]'])
	})

	test('rejects conflicting route files that normalize to the same pattern', async () => {
		const projectDir = await createTempProject()
		const routesDir = join(projectDir, DEFAULT_ROUTE_DIR, 'users')

		await mkdir(routesDir, { recursive: true })
		await writeFile(join(routesDir, '[id].ts'), 'export async function GET() { return new Response("id") }')
		await writeFile(join(routesDir, '[slug].ts'), 'export async function GET() { return new Response("slug") }')

		await expect(discoverRoutes(projectDir, {
			name: 'route-conflict-test'
		} as any)).rejects.toThrow('Conflicting file routes detected')
	})
})
