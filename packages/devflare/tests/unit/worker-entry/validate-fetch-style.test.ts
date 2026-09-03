// =============================================================================
// Build/dev-time fetch handler style validation tests
// =============================================================================

import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { validateFetchHandlerStyle } from '../../../src/worker-entry/validate-fetch-style'

const tempDirs: string[] = []

function writeFetchModule(source: string): string {
	const dir = mkdtempSync(join(tmpdir(), 'devflare-fetch-style-'))
	tempDirs.push(dir)
	const filePath = join(dir, `fetch-${Math.random().toString(36).slice(2)}.ts`)
	writeFileSync(filePath, source)
	return filePath
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true })
	}
})

describe('validateFetchHandlerStyle — fires', () => {
	test('throws for an unmarked 2-arg fetch export at build/dev time', async () => {
		const filePath = writeFetchModule(
			`export const fetch = (request: any, env: any) => new Response('ok')\n`
		)

		await expect(validateFetchHandlerStyle(filePath)).rejects.toThrow(
			/Ambiguous 2-argument fetch handler/
		)
	})

	test('throws for an unmarked 2-arg default fetch export', async () => {
		const filePath = writeFetchModule(
			`const handler = (request: any, env: any) => new Response('ok')\nexport default handler\n`
		)

		await expect(validateFetchHandlerStyle(filePath)).rejects.toThrow(
			/Ambiguous 2-argument fetch handler/
		)
	})

	test('throws for a 2-arg fetch inside a default worker object (parity with runtime)', async () => {
		// A `fetch(request, env)` with only 2 args is ambiguous in devflare's
		// model, so the runtime rejects it today; the build check fires earlier
		// for the exact same case. (A 3-arg worker object is the idiomatic form
		// and is accepted — see the no-false-positive suite below.)
		const filePath = writeFetchModule(
			`export default { fetch: (request: any, env: any) => new Response('ok') }\n`
		)

		await expect(validateFetchHandlerStyle(filePath)).rejects.toThrow(
			/Ambiguous 2-argument fetch handler/
		)
	})
})

describe('validateFetchHandlerStyle — no false positives', () => {
	test('passes for a 1-arg fetch handler', async () => {
		const filePath = writeFetchModule(`export const fetch = (event: any) => new Response('ok')\n`)

		await expect(validateFetchHandlerStyle(filePath)).resolves.toBeUndefined()
	})

	test('passes for a 3-arg worker-style fetch handler', async () => {
		const filePath = writeFetchModule(
			`export const fetch = (request: any, env: any, ctx: any) => new Response('ok')\n`
		)

		await expect(validateFetchHandlerStyle(filePath)).resolves.toBeUndefined()
	})

	test('passes for a 2-arg handler marked via defineFetchHandler({ style: worker })', async () => {
		const filePath = writeFetchModule(
			`import { defineFetchHandler } from '${runtimeImportSpecifier()}'\n` +
				`export const fetch = defineFetchHandler((request: any, env: any) => new Response('ok'), { style: 'worker' })\n`
		)

		await expect(validateFetchHandlerStyle(filePath)).resolves.toBeUndefined()
	})

	test('passes for a 2-arg handler marked via defineFetchHandler({ style: resolve })', async () => {
		const filePath = writeFetchModule(
			`import { defineFetchHandler } from '${runtimeImportSpecifier()}'\n` +
				`export const handle = defineFetchHandler((event: any, resolve: any) => resolve(event), { style: 'resolve' })\n`
		)

		await expect(validateFetchHandlerStyle(filePath)).resolves.toBeUndefined()
	})

	test('passes for a sequence(...) composition', async () => {
		const filePath = writeFetchModule(
			`import { sequence } from '${runtimeImportSpecifier()}'\n` +
				`export const handle = sequence(\n` +
				`  async (event: any, resolve: any) => resolve(event),\n` +
				`  async (event: any) => new Response('ok')\n` +
				`)\n`
		)

		await expect(validateFetchHandlerStyle(filePath)).resolves.toBeUndefined()
	})

	test('passes for an idiomatic 3-arg export default { fetch } worker object', async () => {
		const filePath = writeFetchModule(
			`export default { fetch: (request: any, env: any, ctx: any) => new Response('ok') }\n`
		)

		await expect(validateFetchHandlerStyle(filePath)).resolves.toBeUndefined()
	})

	test('is a no-op when there is no fetch surface path', async () => {
		await expect(validateFetchHandlerStyle(null)).resolves.toBeUndefined()
	})

	test('skips framework build-artifact paths without importing them', async () => {
		// A path under a known build-output prefix is never inspected, even if a
		// (here non-existent) file would otherwise be an unmarked 2-arg handler.
		await expect(validateFetchHandlerStyle('dist/_worker.js')).resolves.toBeUndefined()
	})

	test('is a no-op for a module with no fetch export', async () => {
		const filePath = writeFetchModule(`export const unrelated = 1\n`)

		await expect(validateFetchHandlerStyle(filePath)).resolves.toBeUndefined()
	})
})

/**
 * Resolve a runtime import specifier usable from a temp file outside the
 * package tree (an absolute path to the runtime barrel source).
 */
function runtimeImportSpecifier(): string {
	const runtimeIndex = join(import.meta.dir, '..', '..', '..', 'src', 'runtime', 'index.ts')
	return runtimeIndex.replace(/\\/g, '/')
}
