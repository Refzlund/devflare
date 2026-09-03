// =============================================================================
// Cron Expression Validation — Cloudflare Workers 5-field cron grammar
// =============================================================================
// Cloudflare cron triggers use the standard 5-field crontab grammar:
//
//   ┌───────────── minute        (0-59)
//   │ ┌───────────── hour        (0-23)
//   │ │ ┌───────────── day-of-month (1-31)
//   │ │ │ ┌───────────── month     (1-12 or JAN-DEC)
//   │ │ │ │ ┌───────────── day-of-week (0-7 or SUN-SAT; 0 and 7 = Sunday)
//   │ │ │ │ │
//   * * * * *
//
// There are no seconds and no year field. Each field accepts `*`, a number, a
// range `a-b`, a list `a,b,c`, and a step `*/n` or `a-b/n` (or `a/n`). Month and
// day-of-week additionally accept the 3-letter names.
// =============================================================================

interface CronFieldSpec {
	readonly name: string
	readonly min: number
	readonly max: number
	/** Optional 3-letter names mapped to their numeric value (uppercased keys). */
	readonly names?: Readonly<Record<string, number>>
}

const MONTH_NAMES: Readonly<Record<string, number>> = {
	JAN: 1,
	FEB: 2,
	MAR: 3,
	APR: 4,
	MAY: 5,
	JUN: 6,
	JUL: 7,
	AUG: 8,
	SEP: 9,
	OCT: 10,
	NOV: 11,
	DEC: 12
}

const WEEKDAY_NAMES: Readonly<Record<string, number>> = {
	SUN: 0,
	MON: 1,
	TUE: 2,
	WED: 3,
	THU: 4,
	FRI: 5,
	SAT: 6
}

const CRON_FIELDS: readonly CronFieldSpec[] = [
	{ name: 'minute', min: 0, max: 59 },
	{ name: 'hour', min: 0, max: 23 },
	{ name: 'day-of-month', min: 1, max: 31 },
	{ name: 'month', min: 1, max: 12, names: MONTH_NAMES },
	// day-of-week allows 0-7 where both 0 and 7 mean Sunday.
	{ name: 'day-of-week', min: 0, max: 7, names: WEEKDAY_NAMES }
]

/** Resolve a single value token (number or 3-letter name) for a field. */
function resolveFieldValue(token: string, field: CronFieldSpec): number | null {
	if (/^\d+$/.test(token)) {
		const value = Number.parseInt(token, 10)
		if (value < field.min || value > field.max) {
			return null
		}
		return value
	}

	if (field.names) {
		const named = field.names[token.toUpperCase()]
		if (named !== undefined) {
			return named
		}
	}

	return null
}

/** Validate a single non-`*` element (a number, range, or stepped form). */
function isValidFieldElement(element: string, field: CronFieldSpec): boolean {
	// Split an optional step suffix: `<base>/<step>`.
	let base = element
	let step: string | null = null
	const slashIndex = element.indexOf('/')
	if (slashIndex !== -1) {
		base = element.slice(0, slashIndex)
		step = element.slice(slashIndex + 1)
		// Step must be a positive integer (`*/0` and `*/abc` are invalid).
		if (!/^\d+$/.test(step) || Number.parseInt(step, 10) < 1) {
			return false
		}
	}

	// `*` (optionally stepped: `*/n`).
	if (base === '*') {
		return true
	}

	// Range `a-b` (optionally stepped: `a-b/n`).
	const dashIndex = base.indexOf('-')
	if (dashIndex !== -1) {
		const startToken = base.slice(0, dashIndex)
		const endToken = base.slice(dashIndex + 1)
		const start = resolveFieldValue(startToken, field)
		const end = resolveFieldValue(endToken, field)
		if (start === null || end === null) {
			return false
		}
		// A valid range must not run backwards.
		return start <= end
	}

	// A bare value with a step (`a/n`) is allowed; so is a plain value.
	return resolveFieldValue(base, field) !== null
}

/** Validate a single cron field (which may be a comma-separated list). */
function isValidCronField(value: string, field: CronFieldSpec): boolean {
	if (value.length === 0) {
		return false
	}

	const elements = value.split(',')
	for (const element of elements) {
		if (element.length === 0 || !isValidFieldElement(element, field)) {
			return false
		}
	}

	return true
}

/**
 * Returns true when `expression` is a valid Cloudflare 5-field cron expression.
 *
 * Accepts `*`, numbers, ranges (`1-5`), lists (`1,3,5`), steps (`*\/5`,
 * `1-30/5`, `5/15`) and the 3-letter month (`JAN`-`DEC`) / weekday
 * (`SUN`-`SAT`) names, with the correct per-field numeric ranges. Cloudflare
 * cron has no seconds and no year field, so anything other than 5 fields is
 * rejected.
 */
export function isValidCronExpression(expression: string): boolean {
	if (typeof expression !== 'string') {
		return false
	}

	const fields = expression.trim().split(/\s+/)
	if (fields.length !== CRON_FIELDS.length) {
		return false
	}

	for (let index = 0; index < CRON_FIELDS.length; index++) {
		if (!isValidCronField(fields[index]!, CRON_FIELDS[index]!)) {
			return false
		}
	}

	return true
}

/**
 * Human-readable message for an invalid cron expression, naming the bad value.
 */
export function formatInvalidCronMessage(expression: string): string {
	return (
		`Invalid cron expression "${expression}". ` +
		'Cloudflare cron triggers use 5 fields: ' +
		'minute (0-59) hour (0-23) day-of-month (1-31) month (1-12 or JAN-DEC) ' +
		'day-of-week (0-7 or SUN-SAT). ' +
		'Each field accepts *, numbers, ranges (1-5), lists (1,3,5) and steps (*/5).'
	)
}

/**
 * Throw a descriptive error when `expression` is not a valid cron expression.
 */
export function assertValidCronExpression(expression: string): void {
	if (!isValidCronExpression(expression)) {
		throw new Error(formatInvalidCronMessage(expression))
	}
}
