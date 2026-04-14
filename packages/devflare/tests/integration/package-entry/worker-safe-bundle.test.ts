import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { cleanupTempDirs, installBuiltDevflare } from '../helpers/built-devflare.helpers'

const tempDirs: string[] = []

interface BuildResult {
	success: boolean
	logs: Array<{ message?: string }>
	outputs: Array<{ path: string }>
}

const bun = (globalThis as typeof globalThis & {
	Bun: {
		spawn(args: string[], options: Record<string, unknown>): {
			stdout: ReadableStream<Uint8Array> | null
			stderr: ReadableStream<Uint8Array> | null
			exited: Promise<number>
		}
		build(options: Record<string, unknown>): Promise<BuildResult>
	}
}).Bun

function formatBuildLogs(logs: Array<{ message?: string }>): string {
	return logs.map((log) => log.message ?? String(log)).join('\n')
}

async function createBundleResult(importSource: string, importedNames: string): Promise<BuildResult> {
	const tempDir = await mkdtemp(join(tmpdir(), 'devflare-worker-bundle-'))
	tempDirs.push(tempDir)

	await installBuiltDevflare(tempDir)

	await writeFile(
		join(tempDir, 'entry.ts'),
		`import { ${importedNames} } from '${importSource}'\n` +
		`export async function fetch() {\n` +
		`\t\treturn new Response(String(Boolean(${importedNames.split(',')[0].trim()})))\n` +
		`}\n`
	)

	return await bun.build({
		entrypoints: [join(tempDir, 'entry.ts')],
		outdir: join(tempDir, 'out'),
		target: 'browser',
		conditions: ['browser'],
		format: 'esm'
	})
}

afterAll(async () => {
	await cleanupTempDirs(tempDirs)
})

describe('worker-safe package entrypoints', () => {
	test('main package env import bundles for worker/browser targets', async () => {
		const result = await createBundleResult('devflare', 'env')
		expect(result.success).toBe(true)
		expect(formatBuildLogs(result.logs)).toBe('')
	})

	test('runtime entry exports worker-safe context helpers', async () => {
		const result = await createBundleResult('devflare/runtime', 'env, ctx, event, locals, runWithContext, runWithEventContext, getFetchEvent, getQueueEvent, getScheduledEvent, getEmailEvent')
		expect(result.success).toBe(true)
		expect(formatBuildLogs(result.logs)).toBe('')
	})

	test('runtime entry exports handle() and resolve() for routing helpers', async () => {
		const result = await createBundleResult('devflare/runtime', 'handle, resolve, sequence, pipe')
		expect(result.success).toBe(true)
		expect(formatBuildLogs(result.logs)).toBe('')
	})
})
