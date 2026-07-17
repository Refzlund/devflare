import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import {
	WorkspaceManifestNotFoundError,
	WorkspaceManifestValidationError,
	assertSharedBindingIds,
	defineWorkspace,
	loadWorkspaceManifest,
	resolveAppDirectSocketPort
} from '../../../src/config/workspace'

describe('defineWorkspace', () => {
	test('returns the manifest unchanged (type-only helper)', () => {
		const manifest = { apps: [{ config: './apps/api/devflare.config.ts', port: 8789 }] }
		expect(defineWorkspace(manifest)).toBe(manifest)
	})
})

describe('resolveAppDirectSocketPort', () => {
	test('pure worker uses `port`', () => {
		expect(resolveAppDirectSocketPort({ config: 'x', port: 8789 }, 'api')).toBe(8789)
	})

	test('vite app uses `bridgePort`', () => {
		expect(
			resolveAppDirectSocketPort(
				{ config: 'x', vite: true, vitePort: 5173, bridgePort: 8788 },
				'web'
			)
		).toBe(8788)
	})

	test('vite app without bridgePort throws', () => {
		expect(() => resolveAppDirectSocketPort({ config: 'x', vite: true }, 'web')).toThrow(
			/missing "bridgePort"/
		)
	})

	test('worker app without port throws', () => {
		expect(() => resolveAppDirectSocketPort({ config: 'x' }, 'api')).toThrow(/missing "port"/)
	})
})

describe('assertSharedBindingIds', () => {
	const apps = [
		{
			appLabel: 'api',
			d1: { PLATFORM_DB: 'uidini-platform' },
			r2: { MEDIA: 'uidini-media' },
			kv: {}
		},
		{
			appLabel: 'web',
			d1: { PLATFORM_DB: 'uidini-platform' },
			r2: { MEDIA: 'uidini-media' },
			kv: {}
		}
	]

	test('passes when shared ids align across apps', () => {
		expect(() => assertSharedBindingIds({ d1: ['PLATFORM_DB'], r2: ['MEDIA'] }, apps)).not.toThrow()
	})

	test('throws when a shared binding resolves to different ids', () => {
		const mismatched = [
			{ appLabel: 'api', d1: { PLATFORM_DB: 'uidini-platform' }, r2: {}, kv: {} },
			{ appLabel: 'web', d1: { PLATFORM_DB: 'other-db' }, r2: {}, kv: {} }
		]
		expect(() => assertSharedBindingIds({ d1: ['PLATFORM_DB'] }, mismatched)).toThrow(
			/different ids across apps/
		)
	})

	test('throws when no app declares the asserted binding', () => {
		expect(() => assertSharedBindingIds({ d1: ['MISSING'] }, apps)).toThrow(
			/no app declares that D1 binding/
		)
	})
})

describe('loadWorkspaceManifest', () => {
	test('loads and validates a real TypeScript manifest', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'devflare-manifest-'))
		try {
			// A plain object export (defineWorkspace is a passthrough); this proves
			// the c12 TS-loading + zod-validation path without import resolution.
			await writeFile(
				join(dir, 'devflare.workspace.ts'),
				`
const port = 8789
export default {
	apps: [
		{ config: './apps/api/devflare.config.ts', port },
		{ config: './apps/web/devflare.config.ts', vite: true, vitePort: 5173, bridgePort: 8788 }
	],
	shared: { d1: ['PLATFORM_DB'] }
}
`.trim()
			)

			const loaded = await loadWorkspaceManifest({ cwd: dir })
			expect(loaded.manifest.apps).toHaveLength(2)
			expect(loaded.manifest.apps[0].port).toBe(8789)
			expect(loaded.manifest.apps[1].bridgePort).toBe(8788)
			expect(loaded.manifest.shared?.d1).toEqual(['PLATFORM_DB'])
			expect(loaded.manifestDir).toBe(dir)
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	test('throws WorkspaceManifestNotFoundError when no manifest exists', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'devflare-manifest-none-'))
		try {
			await expect(loadWorkspaceManifest({ cwd: dir })).rejects.toBeInstanceOf(
				WorkspaceManifestNotFoundError
			)
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	test('throws WorkspaceManifestValidationError on an invalid manifest', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'devflare-manifest-bad-'))
		try {
			// `apps` must be a non-empty array.
			await writeFile(join(dir, 'devflare.workspace.ts'), 'export default { apps: [] }')
			await expect(loadWorkspaceManifest({ cwd: dir })).rejects.toBeInstanceOf(
				WorkspaceManifestValidationError
			)
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})
})
