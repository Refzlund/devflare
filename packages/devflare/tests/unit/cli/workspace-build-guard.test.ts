import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import {
	getLocalWorkspaceBuildGuardMessage,
	getLocalWorkspaceBuildStatus
} from '../../../src/cli/workspace-build-guard'

async function writeFixture(path: string, content: string, modifiedAt: Date): Promise<void> {
	await mkdir(join(path, '..'), { recursive: true })
	await writeFile(path, content)
	await utimes(path, modifiedAt, modifiedAt)
}

describe('workspace build guard', () => {
	test('reports missing dist exports for a local devflare workspace', async () => {
		const packageRoot = await mkdtemp(join(tmpdir(), 'devflare-build-guard-missing-'))

		try {
			await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
				name: 'devflare'
			}, null, 2))
			await writeFixture(join(packageRoot, 'src', 'runtime.ts'), 'export const runtime = true', new Date('2026-04-16T10:00:00.000Z'))

			const status = await getLocalWorkspaceBuildStatus({ packageRoot })
			expect(status.state).toBe('missing-dist')
			const message = await getLocalWorkspaceBuildGuardMessage('deploy', {
				packageRoot,
				env: {}
			})
			expect(message).toContain('workspace exports are missing')
		} finally {
			await rm(packageRoot, { recursive: true, force: true })
		}
	})

	test('detects when source files are newer than dist exports', async () => {
		const packageRoot = await mkdtemp(join(tmpdir(), 'devflare-build-guard-stale-'))

		try {
			await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
				name: 'devflare'
			}, null, 2))
			await writeFixture(join(packageRoot, 'src', 'runtime.ts'), 'export const runtime = true', new Date('2026-04-16T12:00:00.000Z'))
			await writeFixture(join(packageRoot, 'dist', 'src', 'runtime.js'), 'export const runtime = true', new Date('2026-04-16T11:00:00.000Z'))

			const status = await getLocalWorkspaceBuildStatus({ packageRoot })
			expect(status.state).toBe('stale')
			expect(status.sourceNewestAt?.toISOString()).toBe('2026-04-16T12:00:00.000Z')
			expect(status.distNewestAt?.toISOString()).toBe('2026-04-16T11:00:00.000Z')

			const message = await getLocalWorkspaceBuildGuardMessage('types', {
				packageRoot,
				env: {}
			})
			expect(message).toContain('workspace exports are stale')
		} finally {
			await rm(packageRoot, { recursive: true, force: true })
		}
	})

	test('treats a workspace as fresh when dist exports are newer than source', async () => {
		const packageRoot = await mkdtemp(join(tmpdir(), 'devflare-build-guard-fresh-'))

		try {
			await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
				name: 'devflare'
			}, null, 2))
			await writeFixture(join(packageRoot, 'src', 'runtime.ts'), 'export const runtime = true', new Date('2026-04-16T11:00:00.000Z'))
			await writeFixture(join(packageRoot, 'dist', 'src', 'runtime.js'), 'export const runtime = true', new Date('2026-04-16T12:00:00.000Z'))

			const status = await getLocalWorkspaceBuildStatus({ packageRoot })
			expect(status.state).toBe('fresh')
		} finally {
			await rm(packageRoot, { recursive: true, force: true })
		}
	})
})