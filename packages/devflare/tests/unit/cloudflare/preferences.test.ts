import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync
} from 'node:fs'
import { platform, tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFileAtomic } from '../../../src/cloudflare/preferences'

describe('writeFileAtomic', () => {
	let dir: string

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'devflare-prefs-'))
	})

	afterEach(() => {
		if (existsSync(dir)) {
			rmSync(dir, { recursive: true, force: true })
		}
	})

	test('writes the final file with exact given contents', () => {
		const target = join(dir, 'out.json')
		const contents = '{\n\t"hello": "world"\n}\n'

		writeFileAtomic(target, contents)

		expect(existsSync(target)).toBe(true)
		expect(readFileSync(target, 'utf-8')).toBe(contents)
	})

	test('does not leave a .tmp-* sibling after success', () => {
		const target = join(dir, 'out.json')
		writeFileAtomic(target, 'payload')

		const leftovers = readdirSync(dir).filter((name) => name.startsWith('out.json.tmp-'))
		expect(leftovers).toEqual([])
	})

	test('overwrites an existing file atomically', () => {
		const target = join(dir, 'out.json')
		writeFileAtomic(target, 'first')
		writeFileAtomic(target, 'second')

		expect(readFileSync(target, 'utf-8')).toBe('second')
		const leftovers = readdirSync(dir).filter((name) => name.startsWith('out.json.tmp-'))
		expect(leftovers).toEqual([])
	})

	test('throws through and cleans up temp when the target path is unwritable', () => {
		// Point the target at a path whose parent does not exist so writeFileSync throws.
		// This exercises the throw-through path without leaving temp files behind,
		// since the temp file is never created.
		const target = join(dir, 'nope', 'out.json')

		expect(() => writeFileAtomic(target, 'payload')).toThrow()

		const leftovers = readdirSync(dir).filter((name) => name.includes('.tmp-'))
		expect(leftovers).toEqual([])
	})

	// Skip on Windows where chmod-based read-only semantics do not apply cleanly.
	test.skipIf(platform() === 'win32')('cleans up temp file when rename fails', () => {
		const target = join(dir, 'readonly-subdir', 'out.json')
		mkdirSync(join(dir, 'readonly-subdir'))
		// Create target as a directory so renameSync onto it fails.
		mkdirSync(target)

		expect(() => writeFileAtomic(target, 'payload')).toThrow()

		const leftovers = readdirSync(join(dir, 'readonly-subdir')).filter((name) =>
			name.includes('.tmp-')
		)
		expect(leftovers).toEqual([])

		// cleanup
		chmodSync(join(dir, 'readonly-subdir'), 0o755)
	})
})
