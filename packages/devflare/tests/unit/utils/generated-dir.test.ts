import { describe, expect, test } from 'bun:test'
import { resolve } from 'pathe'
import {
	DEFAULT_GENERATED_DIR,
	GENERATED_DIR_ENV,
	generatedDir,
	generatedDirName
} from '../../../src/utils/generated-dir'

describe('generatedDirName', () => {
	test('defaults to .devflare when nothing overrides it', () => {
		expect(generatedDirName({})).toBe(DEFAULT_GENERATED_DIR)
	})

	test('uses the override when set', () => {
		expect(generatedDirName({ [GENERATED_DIR_ENV]: '.devflare-e2e' })).toBe('.devflare-e2e')
	})

	test('trims surrounding whitespace', () => {
		expect(generatedDirName({ [GENERATED_DIR_ENV]: '  .devflare-e2e  ' })).toBe('.devflare-e2e')
	})

	// A variable that is present but empty is how a shell exports "unset" by
	// accident (`DEVFLARE_DIR=`). Resolving that to the cwd itself would scatter
	// generated files across the app and, worse, hand `.gitignore` containing `*`
	// to the project root.
	test.each(['', '   '])('falls back when the override is blank (%p)', (blank) => {
		expect(generatedDirName({ [GENERATED_DIR_ENV]: blank })).toBe(DEFAULT_GENERATED_DIR)
	})
})

describe('generatedDir', () => {
	test('resolves segments below the generated root', () => {
		expect(generatedDir('/app', 'worker-entrypoints', 'main.js')).toBe(
			resolve('/app', DEFAULT_GENERATED_DIR, 'worker-entrypoints', 'main.js')
		)
	})

	test('two instances with different roots never share a path', () => {
		const previous = process.env[GENERATED_DIR_ENV]
		try {
			process.env[GENERATED_DIR_ENV] = '.devflare-e2e'
			const suite = generatedDir('/app', 'vite.config.mjs')
			delete process.env[GENERATED_DIR_ENV]
			const dev = generatedDir('/app', 'vite.config.mjs')

			expect(suite).not.toBe(dev)
			expect(dev).toBe(resolve('/app', DEFAULT_GENERATED_DIR, 'vite.config.mjs'))
		} finally {
			if (previous === undefined) delete process.env[GENERATED_DIR_ENV]
			else process.env[GENERATED_DIR_ENV] = previous
		}
	})
})
