import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'pathe'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../')
const devflareTestImportPath = pathToFileURL(join(repoRoot, 'src', 'test', 'index.ts')).href
const devflareImportPath = pathToFileURL(join(repoRoot, 'src', 'index.ts')).href
const tempDirs: string[] = []

interface TransportResult {
	value: number | null
	double: number | null
	hasDouble: boolean
	isDoubleableNumber: boolean
}

afterAll(async () => {
	for (const tempDir of tempDirs) {
		await rm(tempDir, { recursive: true, force: true })
	}
})

async function writeProjectFiles(projectDir: string, files: Record<string, string>): Promise<void> {
	for (const [relativePath, content] of Object.entries(files)) {
		const absolutePath = join(projectDir, relativePath)
		await mkdir(dirname(absolutePath), { recursive: true })
		await writeFile(absolutePath, content)
	}
}

async function runProjectScript(projectDir: string, scriptRelativePath: string, scriptContents: string): Promise<string> {
	const scriptPath = join(projectDir, scriptRelativePath)
	await writeProjectFiles(projectDir, {
		[scriptRelativePath]: scriptContents
	})

	const process = Bun.spawn(['bun', scriptPath], {
		cwd: projectDir,
		stdout: 'pipe',
		stderr: 'pipe'
	})

	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(process.stdout).text(),
		new Response(process.stderr).text(),
		process.exited
	])

	if (exitCode !== 0) {
		throw new Error([
			'Expected createTestContext() project script to succeed',
			stdout.trim(),
			stderr.trim()
		].filter(Boolean).join('\n\n'))
	}

	return stdout
}

function extractResult<T>(stdout: string): T {
	const lines = stdout
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)

	for (let index = lines.length - 1; index >= 0; index -= 1) {
		const line = lines[index]
		if (line.startsWith('RESULT:')) {
			return JSON.parse(line.slice('RESULT:'.length)) as T
		}
	}

	throw new Error(`Expected RESULT line in stdout:\n${stdout}`)
}

async function createTransportProject(projectDir: string, transportMode: 'auto' | 'disabled'): Promise<void> {
	const transportConfig = transportMode === 'disabled'
		? `files: {
	transport: null
},`
		: ''

	await writeProjectFiles(projectDir, {
		'package.json': JSON.stringify({
			name: `transport-${transportMode}-project`,
			private: true,
			type: 'module'
		}, null, 2),
		'devflare.config.ts': `
export default {
	name: 'transport-${transportMode}-project',
	compatibilityDate: '2026-03-17',
	${transportConfig}
	bindings: {
		durableObjects: {
			COUNTER: { className: 'Counter', scriptName: 'do.counter.ts' }
		}
	}
}
`.trim(),
		'src/DoubleableNumber.ts': `
export class DoubleableNumber {
	value: number

	constructor(n: number) {
		this.value = n
	}

	get double() {
		return this.value * 2
	}
}
`.trim(),
		'src/transport.ts': `
import { DoubleableNumber } from './DoubleableNumber'

export const transport = {
	DoubleableNumber: {
		encode: (value: unknown) => value instanceof DoubleableNumber && value.value,
		decode: (value: number) => new DoubleableNumber(value)
	}
}
`.trim(),
		'src/do.counter.ts': `
import { DoubleableNumber } from './DoubleableNumber'

export class Counter {
	private count = 0

	increment(n: number = 1): DoubleableNumber {
		this.count += n
		return new DoubleableNumber(this.count)
	}
}
`.trim()
	})
}

describe('createTestContext config autodiscovery', () => {
	test('auto-discovers devflare.config.mts when no explicit config path is provided', async () => {
		const projectDir = await mkdtemp(join(tmpdir(), 'devflare-test-context-mts-'))
		tempDirs.push(projectDir)

		await writeProjectFiles(projectDir, {
			'package.json': JSON.stringify({
				name: 'test-context-mts-project',
				private: true,
				type: 'module'
			}, null, 2),
			'devflare.config.mts': `
export default {
	name: 'test-context-mts-project',
	compatibilityDate: '2026-03-17'
}
`.trim()
		})

		const stdout = await runProjectScript(projectDir, 'tests/autodiscovery-script.mjs', `
import { createTestContext } from '${devflareTestImportPath}'
import { env } from '${devflareImportPath}'

await createTestContext()
await env.dispose()
console.log('auto-discovered-mts-config')
`)

		expect(stdout.trim()).toContain('auto-discovered-mts-config')
	})

	test('auto-discovers src/transport.ts when files.transport is omitted', async () => {
		const projectDir = await mkdtemp(join(tmpdir(), 'devflare-test-context-transport-auto-'))
		tempDirs.push(projectDir)

		await createTransportProject(projectDir, 'auto')

		const stdout = await runProjectScript(projectDir, 'tests/transport-autodiscovery-script.mjs', `
import { createTestContext } from '${devflareTestImportPath}'
import { env } from '${devflareImportPath}'
import { DoubleableNumber } from '../src/DoubleableNumber'

await createTestContext()

let summary

try {
	const result = await env.COUNTER.getByName('main').increment(2)
	summary = {
		value: result?.value ?? null,
		double: result && typeof result === 'object' && 'double' in result ? result.double : null,
		hasDouble: Boolean(result && typeof result === 'object' && 'double' in result),
		isDoubleableNumber: result instanceof DoubleableNumber
	}
} finally {
	await env.dispose()
}

console.log('RESULT:' + JSON.stringify(summary))
`)

		const result = extractResult<TransportResult>(stdout)
		expect(result.value).toBe(2)
		expect(result.double).toBe(4)
		expect(result.hasDouble).toBe(true)
		expect(result.isDoubleableNumber).toBe(true)
	})

	test('disables conventional transport autodiscovery when files.transport is null', async () => {
		const projectDir = await mkdtemp(join(tmpdir(), 'devflare-test-context-transport-null-'))
		tempDirs.push(projectDir)

		await createTransportProject(projectDir, 'disabled')

		const stdout = await runProjectScript(projectDir, 'tests/transport-disabled-script.mjs', `
import { createTestContext } from '${devflareTestImportPath}'
import { env } from '${devflareImportPath}'
import { DoubleableNumber } from '../src/DoubleableNumber'

await createTestContext()

let summary

try {
	const result = await env.COUNTER.getByName('main').increment(2)
	summary = {
		value: result?.value ?? null,
		double: result && typeof result === 'object' && 'double' in result ? result.double : null,
		hasDouble: Boolean(result && typeof result === 'object' && 'double' in result),
		isDoubleableNumber: result instanceof DoubleableNumber
	}
} finally {
	await env.dispose()
}

console.log('RESULT:' + JSON.stringify(summary))
`)

		const result = extractResult<TransportResult>(stdout)
		expect(result.value).toBe(2)
		expect(result.double).toBeNull()
		expect(result.hasDouble).toBe(false)
		expect(result.isDoubleableNumber).toBe(false)
	})
})