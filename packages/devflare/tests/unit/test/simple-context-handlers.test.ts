import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { configSchema } from '../../../src/config/schema'
import { resolveHandlerPaths } from '../../../src/test/simple-context-handlers'

const tempDirs: string[] = []

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function createTempProject(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'devflare-tail-handlers-'))
	tempDirs.push(dir)
	await mkdir(join(dir, 'src'), { recursive: true })
	return dir
}

describe('resolveHandlerPaths', () => {
	test('honors explicit files.tail', async () => {
		const dir = await createTempProject()
		await writeFile(join(dir, 'src', 'observability-tail.ts'), 'export async function tail() {}')

		const config = configSchema.parse({
			name: 'tail-test',
			compatibilityDate: '2026-04-26',
			files: {
				tail: 'src/observability-tail.ts'
			}
		})

		const paths = await resolveHandlerPaths(dir, config)

		expect(paths.tail).toBe('src/observability-tail.ts')
	})

	test('allows files.tail to opt out of default src/tail.ts discovery', async () => {
		const dir = await createTempProject()
		await writeFile(join(dir, 'src', 'tail.ts'), 'export async function tail() {}')

		const config = configSchema.parse({
			name: 'tail-test',
			compatibilityDate: '2026-04-26',
			files: {
				tail: false
			}
		})

		const paths = await resolveHandlerPaths(dir, config)

		expect(paths.tail).toBeNull()
	})
})
