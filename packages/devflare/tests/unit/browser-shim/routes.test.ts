import { describe, expect, test } from 'bun:test'
import {
	isAcquirePath,
	isDevtoolsPath,
	matchShimRoute,
	normalizeKeepAlive,
	readAcquireOptions,
	readDevtoolsSessionId
} from '../../../src/browser-shim/routes'

const SESSION_ID = '0134a3b4-2f1c-4b9a-9a0e-1f2d3c4b5a60'

function query(search: string): URLSearchParams {
	return new URLSearchParams(search)
}

describe('browser-shim acquire routes', () => {
	// @cloudflare/puppeteer 1.1.0 moved acquire from GET /v1/acquire to
	// POST /v1/devtools/browser. Both are served so neither client generation
	// is locked out.
	test('accepts the path @cloudflare/puppeteer >= 1.1.0 posts to', () => {
		expect(isAcquirePath('/v1/devtools/browser')).toBe(true)
		expect(matchShimRoute('/v1/devtools/browser', 'POST')).toEqual({ kind: 'acquire' })
	})

	test('still accepts the path @cloudflare/puppeteer <= 1.0.7 gets', () => {
		expect(isAcquirePath('/v1/acquire')).toBe(true)
		expect(matchShimRoute('/v1/acquire', 'GET')).toEqual({ kind: 'acquire' })
	})

	test('takes either method on either path', () => {
		expect(matchShimRoute('/v1/acquire', 'POST')).toEqual({ kind: 'acquire' })
		expect(matchShimRoute('/v1/devtools/browser', 'GET')).toEqual({ kind: 'acquire' })
	})

	test('does not acquire on other methods', () => {
		expect(matchShimRoute('/v1/devtools/browser', 'DELETE')).toEqual({ kind: 'not-found' })
	})

	test('a session path is not an acquire path', () => {
		expect(isAcquirePath(`/v1/devtools/browser/${SESSION_ID}`)).toBe(false)
		expect(matchShimRoute(`/v1/devtools/browser/${SESSION_ID}`, 'POST')).toEqual({
			kind: 'devtools'
		})
	})
})

describe('browser-shim devtools routes', () => {
	test('reads the session id from the path, as >= 1.1.0 sends it', () => {
		const path = `/v1/devtools/browser/${SESSION_ID}`
		expect(isDevtoolsPath(path)).toBe(true)
		expect(readDevtoolsSessionId(path, query(''))).toBe(SESSION_ID)
	})

	test('reads the session id from the query, as <= 1.0.7 sends it', () => {
		expect(isDevtoolsPath('/v1/connectDevtools')).toBe(true)
		expect(
			readDevtoolsSessionId('/v1/connectDevtools', query(`browser_session=${SESSION_ID}`))
		).toBe(SESSION_ID)
	})

	test('the legacy path without its parameter names no session', () => {
		expect(readDevtoolsSessionId('/v1/connectDevtools', query(''))).toBeNull()
	})

	test('the current path without a trailing segment names no session', () => {
		expect(isDevtoolsPath('/v1/devtools/browser/')).toBe(true)
		expect(readDevtoolsSessionId('/v1/devtools/browser/', query(''))).toBeNull()
	})

	test('a deeper path is not a session id containing a slash', () => {
		expect(readDevtoolsSessionId(`/v1/devtools/browser/${SESSION_ID}/pages`, query(''))).toBeNull()
	})

	test('an unrelated path names no session', () => {
		expect(isDevtoolsPath('/v1/sessions')).toBe(false)
		expect(readDevtoolsSessionId('/v1/sessions', query(`browser_session=${SESSION_ID}`))).toBeNull()
	})

	test('a devtools path reached over plain HTTP asks for an upgrade', () => {
		expect(matchShimRoute('/v1/connectDevtools', 'GET')).toEqual({ kind: 'devtools' })
		expect(matchShimRoute(`/v1/devtools/browser/${SESSION_ID}`, 'GET')).toEqual({
			kind: 'devtools'
		})
	})
})

describe('browser-shim unmoved routes', () => {
	test('sessions, history and limits answer GET', () => {
		expect(matchShimRoute('/v1/sessions', 'GET')).toEqual({ kind: 'sessions' })
		expect(matchShimRoute('/v1/history', 'GET')).toEqual({ kind: 'history' })
		expect(matchShimRoute('/v1/limits', 'GET')).toEqual({ kind: 'limits' })
	})

	test('session lookup carries the id it was asked for', () => {
		expect(matchShimRoute(`/v1/session/${SESSION_ID}`, 'GET')).toEqual({
			kind: 'session',
			sessionId: SESSION_ID
		})
	})

	test('health answers any method', () => {
		expect(matchShimRoute('/_devflare/browser/health', 'GET')).toEqual({ kind: 'health' })
		expect(matchShimRoute('/_devflare/browser/health', 'POST')).toEqual({ kind: 'health' })
	})

	test('anything else is not found', () => {
		expect(matchShimRoute('/v1/nope', 'GET')).toEqual({ kind: 'not-found' })
		expect(matchShimRoute('/v1/sessions', 'POST')).toEqual({ kind: 'not-found' })
	})
})

describe('browser-shim acquire options', () => {
	test('reads keep_alive from the query string both generations use', () => {
		expect(readAcquireOptions(query('keep_alive=30000'))).toEqual({ keep_alive: 30000 })
	})

	test('ignores the options the local shim cannot honour', () => {
		expect(readAcquireOptions(query('location=weur&recording=true&lab=true'))).toEqual({})
	})

	test('a non-numeric keep_alive falls back instead of reaching the timer as NaN', () => {
		expect(normalizeKeepAlive('later')).toBeUndefined()
		expect(readAcquireOptions(query('keep_alive=later'))).toEqual({})
	})

	test('a negative keep_alive falls back', () => {
		expect(normalizeKeepAlive(-1)).toBeUndefined()
	})

	test('zero is kept — it disables the idle timer deliberately', () => {
		expect(normalizeKeepAlive(0)).toBe(0)
		expect(readAcquireOptions(query('keep_alive=0'))).toEqual({ keep_alive: 0 })
	})

	test('a missing keep_alive leaves the shim default in force', () => {
		expect(normalizeKeepAlive(null)).toBeUndefined()
		expect(normalizeKeepAlive(undefined)).toBeUndefined()
		expect(readAcquireOptions(query(''))).toEqual({})
	})
})
