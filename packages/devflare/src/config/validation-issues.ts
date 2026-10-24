// =============================================================================
// Config validation issues — the shape devflare's validation errors expose
// =============================================================================
// zod 4 types an issue's path as `PropertyKey[]`, symbols included. devflare's
// error classes have always exposed `(string | number)[]`, and a symbol in a
// path would make `path.join('.')` throw while the error message is being
// built. So issues are normalised once, here, before either error class uses
// them.
// =============================================================================

/** One schema problem as a validator reports it: where, and what. */
export interface SchemaIssue {
	/** Keys from the root of the validated value down to the offending field. */
	readonly path: ReadonlyArray<PropertyKey>
	/** Human-readable description of the problem. */
	readonly message: string
}

/** One schema problem as devflare's validation errors expose it. */
export interface ValidationIssue {
	/** Keys from the root of the validated value down to the offending field; a symbol key appears as its description string. */
	path: (string | number)[]
	/** Human-readable description of the problem. */
	message: string
}

/**
 * @description Converts validator issues to the shape devflare's validation
 * errors expose, turning any symbol path key into its `Symbol(description)`
 * string so the path can always be joined.
 * @param issues - the issues the validator reported
 * @returns one {@link ValidationIssue} per input issue, in the same order
 */
export function normalizeSchemaIssues(issues: ReadonlyArray<SchemaIssue>): ValidationIssue[] {
	return issues.map((issue) => ({
		path: issue.path.map((key) => (typeof key === 'symbol' ? key.toString() : key)),
		message: issue.message
	}))
}
