// =============================================================================
// Copied `.env` names — which inherited values a parent devflare copied from a file
// =============================================================================
// `loadConfig` copies each config's `.env` into `process.env`, and the coordinator
// remembers which values it copied: `resolveConfigEnvVars` ranks them below the
// resolving config's own `.env`. A process the coordinator spawns (a workspace
// app's Vite child) inherits those values as plain environment, which it would
// rank above that file. So the coordinator names them in one variable devflare
// owns, and the SvelteKit handle records them as copies before it resolves the
// config.
//
// → NAMES only. Every value already reaches the child under its own name, and a
//   second copy of a credential in another variable buys nothing.
// =============================================================================

/** The variable that names the values a parent devflare process copied from a `.env` file. */
export const COPIED_DOTENV_NAMES_ENV = 'DEVFLARE_COPIED_DOTENV_NAMES'

/**
 * @description Encodes the copied names for {@link COPIED_DOTENV_NAMES_ENV}.
 * @param names - the names of values the parent copied, and the child inherits unchanged
 * @returns the value to set in the child's environment
 */
export function encodeCopiedDotenvNames(names: readonly string[]): string {
	return JSON.stringify(names)
}

/**
 * @description Reads the names a parent devflare process copied from a `.env` file, if any.
 * @param environment - the process environment to read {@link COPIED_DOTENV_NAMES_ENV} from
 * @returns the names; empty when no devflare coordinator started this process
 * @throws {Error} When the variable is set but is not a JSON array of strings. Only devflare
 *   writes it (the `DEVFLARE_` prefix is reserved in a manifest), so a malformed value is a
 *   defect, not input.
 */
export function readCopiedDotenvNames(environment: Record<string, string | undefined>): string[] {
	const encoded = environment[COPIED_DOTENV_NAMES_ENV]
	if (encoded === undefined || encoded === '') {
		return []
	}

	// The value is not echoed, as `readInjectedVars` does not echo its own: what is malformed
	// here is not known to be a list of names.
	const malformed = `[devflare] ${COPIED_DOTENV_NAMES_ENV} must be a JSON array of strings.`
	let parsed: unknown
	try {
		parsed = JSON.parse(encoded)
	} catch {
		// → GOTCHA: the parse error is deliberately NOT kept as `cause`. Node's message quotes
		//   the input, and the SvelteKit handle logs the whole error with its cause.
		throw new Error(malformed)
	}

	if (!Array.isArray(parsed) || !parsed.every((name) => typeof name === 'string')) {
		throw new Error(malformed)
	}

	return parsed
}
