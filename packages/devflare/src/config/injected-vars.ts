// =============================================================================
// Injected vars — a workspace app's manifest `env`, carried into its Vite child
// =============================================================================
// The workspace coordinator layers an app's manifest `env` over the config's
// `vars` on every worker it builds. A Vite app's `platform.env` is not served
// by those workers: the Vite child reads the config itself and builds the env
// in-process. So the coordinator hands the child the same map, JSON-encoded in
// one variable devflare owns, and the child layers it the same way.
//
// → The values also arrive in the child's `process.env` one by one, but that
//   cannot say WHICH keys came from the manifest; the child would have to
//   guess, and any inherited shell variable would read as a var.
// =============================================================================

/** The variable that carries a Vite app's manifest `env` into its child process. */
export const INJECTED_VARS_ENV = 'DEVFLARE_INJECTED_VARS'

/**
 * @description Encodes a manifest `env` for {@link INJECTED_VARS_ENV}.
 * @param vars - the app's manifest `env`
 * @returns the value to set in the Vite child's environment
 */
export function encodeInjectedVars(vars: Record<string, string>): string {
	return JSON.stringify(vars)
}

/**
 * @description Reads the manifest `env` the workspace coordinator handed this
 * process, if any.
 * @param environment - the process environment to read {@link INJECTED_VARS_ENV} from
 * @returns the injected vars; empty when this process was not started for a workspace Vite app
 * @throws {Error} When the variable is set but is not a JSON object of strings. Only devflare
 *   writes it (the name is reserved in a manifest), so a malformed value is a defect, not input.
 */
export function readInjectedVars(
	environment: Record<string, string | undefined>
): Record<string, string> {
	const encoded = environment[INJECTED_VARS_ENV]
	if (encoded === undefined || encoded === '') {
		return {}
	}

	// The value is never echoed: it carries the app's vars, which may be credentials.
	const malformed = `[devflare] ${INJECTED_VARS_ENV} must be a JSON object of strings.`
	let parsed: unknown
	try {
		parsed = JSON.parse(encoded)
	} catch {
		// → GOTCHA: the parse error is deliberately NOT kept as `cause`. Node's
		//   message quotes the input (`"…" is not valid JSON`), the Vite child runs
		//   on Node, and the SvelteKit handle logs the whole error with its cause.
		throw new Error(malformed)
	}

	const isStringRecord =
		typeof parsed === 'object' &&
		parsed !== null &&
		!Array.isArray(parsed) &&
		Object.values(parsed).every((value) => typeof value === 'string')
	if (!isStringRecord) {
		throw new Error(malformed)
	}

	return parsed as Record<string, string>
}
