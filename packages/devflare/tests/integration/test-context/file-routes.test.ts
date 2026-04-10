import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { env } from '../../../src'
import { cf, createTestContext } from '../../../src/test'

const tempDirs: string[] = []

afterAll(async () => {
	for (const tempDir of tempDirs) {
		await rm(tempDir, { recursive: true, force: true })
	}
})

describe('createTestContext file routes', () => {
	test('dispatches default src/routes modules and populates params', async () => {
		const projectDir = await mkdtemp(join(tmpdir(), 'devflare-file-routes-test-context-'))
		tempDirs.push(projectDir)

		await mkdir(join(projectDir, 'src', 'routes', 'users'), { recursive: true })
		await mkdir(join(projectDir, 'src', 'routes', 'blog'), { recursive: true })
		await writeFile(join(projectDir, 'package.json'), JSON.stringify({
			name: 'file-routes-test-context',
			private: true,
			type: 'module'
		}, null, 2))
		await writeFile(join(projectDir, 'devflare.config.ts'), `
export default {
	name: 'file-routes-test-context',
	compatibilityDate: '2026-03-17'
}
`.trim())
		await writeFile(join(projectDir, 'src', 'routes', 'index.ts'), `
export async function GET(): Promise<Response> {
	return new Response('root')
}
`.trim())
		await writeFile(join(projectDir, 'src', 'routes', 'users', '[id].ts'), `
export async function GET(event): Promise<Response> {
	return new Response(String(event.params.id))
}
`.trim())
		await writeFile(join(projectDir, 'src', 'routes', 'blog', '[...slug].ts'), `
export async function GET(event): Promise<Response> {
	return new Response(String(event.params.slug))
}
`.trim())

		await createTestContext(join(projectDir, 'devflare.config.ts'))

		try {
			const rootResponse = await cf.worker.get('/')
			expect(rootResponse.status).toBe(200)
			expect(await rootResponse.text()).toBe('root')

			const userResponse = await cf.worker.get('/users/42')
			expect(userResponse.status).toBe(200)
			expect(await userResponse.text()).toBe('42')

			const blogResponse = await cf.worker.get('/blog/a/b')
			expect(blogResponse.status).toBe(200)
			expect(await blogResponse.text()).toBe('a/b')
		} finally {
			await env.dispose()
		}
	})
})
