import { afterAll, describe, expect, test } from 'bun:test'
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'pathe'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../')
const tempDirs: string[] = []
let buildPromise: Promise<void> | null = null

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

async function ensurePackageBuilt(): Promise<void> {
	if (!buildPromise) {
		buildPromise = (async () => {
			const build = bun.spawn(['bun', 'run', 'build'], {
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

async function createBundleResult(importSource: string, importedNames: string): Promise<BuildResult> {
	await ensurePackageBuilt()

	const tempDir = await mkdtemp(join(tmpdir(), 'devflare-worker-bundle-'))
	tempDirs.push(tempDir)

	const packagedDevflareDir = join(tempDir, 'node_modules', 'devflare')
	await mkdir(packagedDevflareDir, { recursive: true })
	await cp(join(packageRoot, 'package.json'), join(packagedDevflareDir, 'package.json'))
	await cp(join(packageRoot, 'dist'), join(packagedDevflareDir, 'dist'), { recursive: true })

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
	for (const tempDir of tempDirs) {
		await rm(tempDir, { recursive: true, force: true })
	}
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
