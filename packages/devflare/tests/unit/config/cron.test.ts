// =============================================================================
// Cron Expression Validation Tests
// =============================================================================

import { describe, expect, test } from 'bun:test'

import {
	assertValidCronExpression,
	formatInvalidCronMessage,
	isValidCronExpression
} from '../../../src/config/cron'
import { configSchema } from '../../../src/config/schema'

// Expressions that MUST be accepted — covers `*`, numbers, ranges, lists,
// steps, range-steps, named months/weekdays, and combinations.
const VALID_CRONS: readonly string[] = [
	'* * * * *',
	'0 * * * *',
	'0 0 * * *',
	'0 */6 * * *',
	'*/15 * * * *',
	'*/5 * * * *',
	'0 0 1 * *',
	'0 9 * * MON-FRI',
	'5,35 * * * *',
	'1-30/5 * * * *',
	'5/15 * * * *',
	'1-5 * * * *',
	'1,3,5 * * * *',
	'0 0,6,12,18 * * *',
	'0 0 * * 1',
	'0 0 * * 0',
	'0 0 * * 7',
	'0 0 * * SUN',
	'0 0 * JAN *',
	'0 0 * jan *',
	'0 0 * * sun',
	'0 0 1 JAN-DEC *',
	'59 23 31 12 6',
	'0 12 1,15 * *',
	'0 0 * * 1-5',
	'  0 0 * * *  ',
	'0\t0\t*\t*\t*'
]

// Expressions that MUST be rejected.
const INVALID_CRONS: readonly string[] = [
	'* * * *', // too few fields
	'* * * * * *', // too many fields (no seconds/year)
	'60 * * * *', // minute out of range
	'* 24 * * *', // hour out of range
	'* * 0 * *', // day-of-month below 1
	'* * 32 * *', // day-of-month above 31
	'* * * 0 *', // month below 1
	'* * * 13 *', // month above 12
	'* * * * 8', // day-of-week above 7
	'*/0 * * * *', // zero step
	'* * * */0 *', // zero step on month
	'abc', // not a cron at all
	'abc def ghi jkl mno', // garbage tokens
	'0 9 * * FUNDAY', // invalid weekday name
	'0 9 * FOO *', // invalid month name
	'5- * * * *', // dangling range
	'-5 * * * *', // leading dash
	'5,,7 * * * *', // empty list element
	'5-1 * * * *', // backwards range
	'*/ * * * *', // empty step
	'* * * * */abc', // non-numeric step
	'', // empty string
	'   ' // whitespace only
]

describe('isValidCronExpression', () => {
	for (const cron of VALID_CRONS) {
		test(`accepts ${JSON.stringify(cron)}`, () => {
			expect(isValidCronExpression(cron)).toBe(true)
		})
	}

	for (const cron of INVALID_CRONS) {
		test(`rejects ${JSON.stringify(cron)}`, () => {
			expect(isValidCronExpression(cron)).toBe(false)
		})
	}
})

describe('assertValidCronExpression', () => {
	test('does not throw on a valid expression', () => {
		expect(() => assertValidCronExpression('*/15 * * * *')).not.toThrow()
	})

	test('throws a message naming the bad expression', () => {
		expect(() => assertValidCronExpression('60 * * * *')).toThrow(
			/Invalid cron expression "60 \* \* \* \*"/
		)
	})
})

describe('formatInvalidCronMessage', () => {
	test('includes the offending expression and field guidance', () => {
		const message = formatInvalidCronMessage('0 9 * * FUNDAY')
		expect(message).toContain('0 9 * * FUNDAY')
		expect(message).toContain('day-of-week')
	})
})

describe('triggers.crons schema validation', () => {
	test('accepts the historically-valid cron fixtures', () => {
		const result = configSchema.safeParse({
			name: 'my-worker',
			compatibilityDate: '2025-01-07',
			triggers: {
				crons: ['0 * * * *', '0 0 * * *', '0 */6 * * *']
			}
		})

		expect(result.success).toBe(true)
	})

	test('rejects a typo cron and names it in the error', () => {
		const result = configSchema.safeParse({
			name: 'my-worker',
			compatibilityDate: '2025-01-07',
			triggers: {
				crons: ['not a cron']
			}
		})

		expect(result.success).toBe(false)
		if (!result.success) {
			const issue = result.error.issues.find((candidate) =>
				candidate.message.includes('not a cron')
			)
			expect(issue).toBeDefined()
			expect(issue?.path).toEqual(['triggers', 'crons', 0])
		}
	})

	test('reports the index of each invalid cron in a mixed array', () => {
		const result = configSchema.safeParse({
			name: 'my-worker',
			compatibilityDate: '2025-01-07',
			triggers: {
				crons: ['0 * * * *', '60 * * * *', '*/15 * * * *', 'abc']
			}
		})

		expect(result.success).toBe(false)
		if (!result.success) {
			const indices = result.error.issues
				.filter((issue) => issue.path[0] === 'triggers' && issue.path[1] === 'crons')
				.map((issue) => issue.path[2])
				.sort()
			expect(indices).toEqual([1, 3])
		}
	})

	test('accepts an absent triggers block', () => {
		const result = configSchema.safeParse({
			name: 'my-worker',
			compatibilityDate: '2025-01-07'
		})

		expect(result.success).toBe(true)
	})
})
