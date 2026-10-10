import { describe, expect, test } from 'bun:test'
import {
	encodeInjectedVars,
	INJECTED_VARS_ENV,
	readInjectedVars
} from '../../../src/config/injected-vars'

describe('readInjectedVars', () => {
	test('reads back what the coordinator encoded', () => {
		const vars = { DOC_API_ORIGIN: 'http://127.0.0.1:6281', 'WITH SPACE': 'a "quoted" value' }

		expect(readInjectedVars({ [INJECTED_VARS_ENV]: encodeInjectedVars(vars) })).toEqual(vars)
	})

	test('is empty in a process the coordinator did not start for a workspace app', () => {
		expect(readInjectedVars({})).toEqual({})
		expect(readInjectedVars({ [INJECTED_VARS_ENV]: '' })).toEqual({})
	})

	test('refuses a value that is not JSON, naming the variable but not echoing it', () => {
		const raw = 'secret-token=abc'
		let thrown: unknown
		try {
			readInjectedVars({ [INJECTED_VARS_ENV]: raw })
		} catch (error) {
			thrown = error
		}

		expect(thrown).toBeInstanceOf(Error)
		expect((thrown as Error).message).toContain(INJECTED_VARS_ENV)
		// A parse error quotes its input on Node, so it may not ride along as the cause.
		expect((thrown as Error).cause).toBeUndefined()
		// What a logger prints: the error with its whole cause chain.
		expect(Bun.inspect(thrown)).not.toContain(raw)
	})

	test('refuses JSON that is not an object of strings', () => {
		for (const encoded of ['["A"]', '"A"', 'null', '{"PORT":8788}']) {
			expect(() => readInjectedVars({ [INJECTED_VARS_ENV]: encoded })).toThrow(INJECTED_VARS_ENV)
		}
	})
})
