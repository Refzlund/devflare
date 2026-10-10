import { describe, expect, test } from 'bun:test'
import {
	COPIED_DOTENV_NAMES_ENV,
	encodeCopiedDotenvNames,
	readCopiedDotenvNames
} from '../../../src/config/copied-dotenv-names'

describe('readCopiedDotenvNames', () => {
	test('reads back what the coordinator encoded', () => {
		const names = ['API_ORIGIN', 'SESSION_SECRET']

		expect(
			readCopiedDotenvNames({ [COPIED_DOTENV_NAMES_ENV]: encodeCopiedDotenvNames(names) })
		).toEqual(names)
	})

	test('is empty in a process no devflare coordinator started', () => {
		expect(readCopiedDotenvNames({})).toEqual([])
		expect(readCopiedDotenvNames({ [COPIED_DOTENV_NAMES_ENV]: '' })).toEqual([])
	})

	test('refuses a value that is not JSON, naming the variable but not echoing it', () => {
		const raw = 'API_ORIGIN,SESSION_SECRET'
		let thrown: unknown
		try {
			readCopiedDotenvNames({ [COPIED_DOTENV_NAMES_ENV]: raw })
		} catch (error) {
			thrown = error
		}

		expect(thrown).toBeInstanceOf(Error)
		expect((thrown as Error).message).toContain(COPIED_DOTENV_NAMES_ENV)
		// A parse error quotes its input on Node, so it may not ride along as the cause.
		expect((thrown as Error).cause).toBeUndefined()
		expect(Bun.inspect(thrown)).not.toContain(raw)
	})

	test('refuses JSON that is not an array of strings', () => {
		for (const encoded of ['{"A":"x"}', '"A"', 'null', '["A",1]']) {
			expect(() => readCopiedDotenvNames({ [COPIED_DOTENV_NAMES_ENV]: encoded })).toThrow(
				COPIED_DOTENV_NAMES_ENV
			)
		}
	})
})
