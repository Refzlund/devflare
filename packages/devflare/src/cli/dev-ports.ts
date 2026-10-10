// =============================================================================
// Dev Port & Host Resolution — CLI flags, env vars, config, defaults
// =============================================================================
// Both `devflare dev` and `devflare workspace dev` place local listeners (the
// Miniflare runtime, the Browser Rendering shim) on ports the user has to be
// able to move when another instance on the machine already owns the default.
//
// Kept out of the command modules so `workspace dev` can reuse the resolvers
// without importing the dev command — that module pulls in the whole dev-server
// graph, which the CLI otherwise only loads for `devflare dev`.
// =============================================================================

/**
 * Read an option that is only meaningful with a value.
 *
 * The argument parser records a valueless `--flag` as `true`, which is never a
 * usable port or host.
 *
 * @param value - The raw parsed option.
 * @returns The option text, or `undefined` when the flag carried no value.
 */
function readStringOption(value: string | boolean | undefined): string | undefined {
	return typeof value === 'string' ? value : undefined
}

/**
 * Parse a port, rejecting anything that cannot be bound.
 *
 * @param value - Raw flag or environment text.
 * @param source - What to name in the error message so the user knows which input to fix.
 * @returns The parsed port.
 * @throws When `value` is not an integer between 1 and 65535.
 */
function parsePort(value: string, source: string): number {
	const port = Number(value)
	if (!Number.isInteger(port) || port <= 0 || port > 65535) {
		throw new Error(`${source} must be an integer between 1 and 65535`)
	}
	return port
}

/**
 * Collapse the runtime/bridge port aliases from one source into a single value.
 *
 * @param runtimePort - The runtime-port text from that source, if any.
 * @param bridgePort - The bridge-port alias from that source, if any.
 * @param source - Label for both error messages (`CLI`, `environment`).
 * @returns The agreed port, or `undefined` when the source sets neither.
 * @throws When the source sets both aliases to different values.
 */
function resolveSinglePort(
	runtimePort: string | undefined,
	bridgePort: string | undefined,
	source: string
): number | undefined {
	if (runtimePort && bridgePort && runtimePort !== bridgePort) {
		throw new Error(
			`Conflicting Devflare runtime ports: ${source} runtime port is ${runtimePort}, but bridge port is ${bridgePort}. Use one value for both.`
		)
	}

	const value = runtimePort ?? bridgePort
	return value ? parsePort(value, source) : undefined
}

/**
 * Resolve the port the local Miniflare runtime instance binds to.
 *
 * Precedence: `--runtime-port`/`--bridge-port` CLI flags > `DEVFLARE_RUNTIME_PORT`/
 * `DEVFLARE_BRIDGE_PORT` env vars > `server.port` config value > `8787`.
 *
 * @param options - Parsed CLI options for the command.
 * @param env - Environment to read the fallback from.
 * @param configPort - The `server.port` value from the loaded config, if set.
 * @returns The resolved runtime port.
 * @throws When any source carries an unusable port, or sets the two aliases to different values.
 */
export function resolveDevRuntimePort(
	options: Record<string, string | boolean>,
	env: NodeJS.ProcessEnv = process.env,
	configPort?: number
): number {
	return (
		resolveSinglePort(
			readStringOption(options['runtime-port']),
			readStringOption(options['bridge-port']),
			'CLI'
		) ??
		resolveSinglePort(env.DEVFLARE_RUNTIME_PORT, env.DEVFLARE_BRIDGE_PORT, 'environment') ??
		configPort ??
		8787
	)
}

/**
 * Resolve the host the local Miniflare runtime instance binds to.
 *
 * Precedence: `--runtime-host` CLI flag > `DEVFLARE_RUNTIME_HOST` env var >
 * `server.host` config value > `127.0.0.1`.
 *
 * @param options - Parsed CLI options for the command.
 * @param env - Environment to read the fallback from.
 * @param configHost - The `server.host` value from the loaded config, if set.
 * @returns The resolved runtime host.
 */
export function resolveDevRuntimeHost(
	options: Record<string, string | boolean>,
	env: NodeJS.ProcessEnv = process.env,
	configHost?: string
): string {
	const envHost = env.DEVFLARE_RUNTIME_HOST?.trim()
	return (
		readStringOption(options['runtime-host']) ??
		(envHost ? envHost : undefined) ??
		configHost ??
		'127.0.0.1'
	)
}

/**
 * Resolve the port the local Browser Rendering shim listens on.
 *
 * The shim is a listener of its own, beside the Miniflare runtime, so two dev
 * servers that both declare a `browser` binding collide even when their runtime
 * ports differ.
 *
 * Precedence: `--browser-shim-port` CLI flag > `DEVFLARE_BROWSER_SHIM_PORT` env
 * var. Returns `undefined` when the user asks for neither, leaving each server
 * on its own default (8788 for `dev`; 9700 as the first of a per-app block for
 * `workspace dev`).
 *
 * @param options - Parsed CLI options for the command.
 * @param env - Environment to read the fallback from.
 * @returns The requested port, or `undefined` when nothing requested one.
 * @throws When either input is set to something unbindable — including a valueless `--browser-shim-port`.
 */
export function resolveDevBrowserShimPort(
	options: Record<string, string | boolean>,
	env: NodeJS.ProcessEnv = process.env
): number | undefined {
	const cliValue = options['browser-shim-port']
	if (cliValue !== undefined) {
		// A valueless `--browser-shim-port` parses as `true`. That is a mistyped
		// flag rather than a request for the default, so send it through the port
		// check and let it fail loudly.
		return parsePort(readStringOption(cliValue) ?? '', '--browser-shim-port')
	}

	const envPort = env.DEVFLARE_BROWSER_SHIM_PORT?.trim()
	return envPort ? parsePort(envPort, 'DEVFLARE_BROWSER_SHIM_PORT') : undefined
}
