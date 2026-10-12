import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { init as initModuleLexer, parse as parseModule } from 'es-module-lexer'
import { join } from 'pathe'
import { withGeneratedRoot } from '../../../src/utils/generated-dir'
import { writeGeneratedViteConfig } from '../../../src/vite/config-file'

const tempDirs: string[] = []

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true })
	}
})

describe('writeGeneratedViteConfig', () => {
	test('imports nothing by bare name, so the config loads from a directory outside every node_modules', async () => {
		// `DEVFLARE_DIR` can put the generated config anywhere. Node resolves a bare
		// import from the file's own directory, so `from 'vite'` there makes Vite
		// refuse the config with "Cannot find package 'vite'".
		const outside = mkdtempSync(join(tmpdir(), 'devflare-generated-vite-config-'))
		tempDirs.push(outside)

		const path = await withGeneratedRoot(outside, () =>
			writeGeneratedViteConfig({ cwd: join(outside, 'app') })
		)

		await initModuleLexer()
		const [imports] = parseModule(readFileSync(path, 'utf8'))
		const specifiers = imports.map((record) => String(record.specifier))
		expect(path.startsWith(outside)).toBe(true)
		// The generated config imports devflare's own Vite entry, so an empty list
		// means the parse failed rather than that nothing is imported.
		expect(specifiers.length).toBeGreaterThan(0)
		expect(specifiers.filter((specifier) => !specifier.startsWith('.'))).toStrictEqual([])
	})
})
