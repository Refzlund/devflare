import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'pathe'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../')
const tempDirs: string[] = []

afterAll(async () => {
	for (const tempDir of tempDirs) {
		await rm(tempDir, { recursive: true, force: true })
	}
})

describe('createTestContext sendEmail bindings', () => {
	test('supports env.EMAIL.send() through the bridge-backed test context', async () => {
		const projectDir = await mkdtemp(join(tmpdir(), 'devflare-test-context-send-email-'))
		tempDirs.push(projectDir)

		await mkdir(join(projectDir, 'tests'), { recursive: true })
		await writeFile(join(projectDir, 'package.json'), JSON.stringify({
			name: 'test-context-send-email-project',
			private: true,
			type: 'module'
		}, null, 2))
		await writeFile(join(projectDir, 'devflare.config.ts'), `
export default {
	name: 'test-context-send-email-project',
	compatibilityDate: '2026-03-17',
	bindings: {
		sendEmail: {
			EMAIL: {
				destinationAddress: 'recipient@example.com',
				allowedSenderAddresses: ['sender@example.com']
			}
		}
	}
}
`.trim())

		const testModuleImportPath = pathToFileURL(join(repoRoot, 'src', 'test', 'index.ts')).href
		const envImportPath = pathToFileURL(join(repoRoot, 'src', 'index.ts')).href
		const scriptPath = join(projectDir, 'tests', 'send-email-script.ts')

		await writeFile(scriptPath, `
import { createTestContext } from '${testModuleImportPath}'
import { env } from '${envImportPath}'

await createTestContext()
await env.EMAIL.send({
	from: 'sender@example.com',
	to: 'recipient@example.com',
	subject: 'Bridge send email',
	text: 'Hello from the send email binding'
})
await env.dispose()
console.log('send-email-binding-ok')
`)

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
				'Expected createTestContext() send email script to succeed',
				stdout.trim(),
				stderr.trim()
			].filter(Boolean).join('\n\n'))
		}

		expect(stdout.trim()).toContain('send-email-binding-ok')
	})
})