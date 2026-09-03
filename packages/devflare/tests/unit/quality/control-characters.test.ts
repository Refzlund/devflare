import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/*
	No source file may contain a literal control character.

	→ WHY: one shipped. `join('\0')` was written with the actual U+0000 byte rather than the escape,
	  in the module that reconciles Email Routing rules and DNS records. Runtime behaviour was
	  correct, every test passed, biome exited 0 — and git classified the file as BINARY, so the one
	  file in the repository that can rewrite a domain's MX records could not be diffed, blamed,
	  grepped or three-way merged. Nothing else would ever have noticed, which is exactly why it
	  needs a gate rather than care.
	→ NOTE: tab, newline and carriage return are the only ones allowed, because they are the ones
	  that mean something to every tool that reads the file. Everything else — NUL, ESC, the C0 range,
	  DEL — is invisible in an editor and survives review by being unreadable.
	→ GOTCHA: this file builds its own probe bytes with `String.fromCharCode`, never a literal. A gate
	  against control characters that contains one is the joke that writes itself, and it would fail
	  against ITSELF the moment the exclusion below were removed.
*/

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const SCANNED_ROOTS = ['src', 'scripts', 'tests'] as const
const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json'])

/** Whether a byte is a control character no source file has any business containing. */
function isForbiddenControlByte(byte: number): boolean {
	const TAB = 0x09
	const LINE_FEED = 0x0a
	const CARRIAGE_RETURN = 0x0d
	const FIRST_PRINTABLE = 0x20
	const DELETE = 0x7f

	if (byte === TAB || byte === LINE_FEED || byte === CARRIAGE_RETURN) return false
	return byte < FIRST_PRINTABLE || byte === DELETE
}

/** Every scannable file under one directory, recursively. */
function collectSourceFiles(directory: string): string[] {
	const found: string[] = []

	for (const entry of readdirSync(directory)) {
		if (entry === 'node_modules' || entry.startsWith('.')) continue

		const path = join(directory, entry)
		if (statSync(path).isDirectory()) {
			found.push(...collectSourceFiles(path))
			continue
		}

		if (SCANNED_EXTENSIONS.has(extname(entry))) found.push(path)
	}

	return found
}

/** Where a forbidden byte was found, as `path:line` plus the code, for a message worth reading. */
function findControlCharacters(path: string): string[] {
	const bytes = readFileSync(path)
	const offences: string[] = []
	let line = 1

	for (const byte of bytes) {
		if (byte === 0x0a) {
			line += 1
			continue
		}
		if (isForbiddenControlByte(byte)) {
			offences.push(
				`${relative(packageRoot, path)}:${line} contains U+${byte.toString(16).padStart(4, '0').toUpperCase()}`
			)
		}
	}

	return offences
}

describe('no source file contains a literal control character', () => {
	const files = SCANNED_ROOTS.flatMap((root) => collectSourceFiles(resolve(packageRoot, root)))

	test('the scan actually reaches the source tree', () => {
		// The positive control. Every other assertion here passes when the answer is "clean" AND when
		// the answer is "looked at nothing", and those are the same empty array.
		expect(files.length).toBeGreaterThan(200)
		expect(files.some((path) => path.endsWith('deploy-zones.ts'))).toBe(true)
	})

	test('the scan detects one when there is one', () => {
		// The other control: prove the detector fires, without writing a control character into any
		// file. A gate whose failing state has never been produced is a gate nobody has tested.
		const NUL = String.fromCharCode(0)
		const ESC = String.fromCharCode(27)

		expect(isForbiddenControlByte(NUL.charCodeAt(0))).toBe(true)
		expect(isForbiddenControlByte(ESC.charCodeAt(0))).toBe(true)
		expect(isForbiddenControlByte('\t'.charCodeAt(0))).toBe(false)
		expect(isForbiddenControlByte('\n'.charCodeAt(0))).toBe(false)
		expect(isForbiddenControlByte('a'.charCodeAt(0))).toBe(false)
	})

	test('and there are none', () => {
		expect(files.flatMap(findControlCharacters)).toEqual([])
	})
})
