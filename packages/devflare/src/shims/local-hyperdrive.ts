// =============================================================================
// Local Hyperdrive shim (shared)
// =============================================================================
//
// A Hyperdrive binding derived from a local database connection string. The
// connection fields (connectionString/host/port/user/password/database) are
// fully populated so a Node database driver can connect directly. The raw
// socket connect() is a documented limitation — see HYPERDRIVE_CONNECT_MESSAGE.

// The same precise, actionable message thrown by connect() everywhere this
// shim is used. Kept as a single exported constant so the test/SvelteKit copies
// stay byte-identical and a test can assert exact-string parity.
export const HYPERDRIVE_CONNECT_MESSAGE =
	'Local Hyperdrive does not implement the raw socket connect(). ' +
	'Use the populated connection fields (connectionString, or host/port/user/password/database) ' +
	'with your Node database driver, or run a createTestContext()/Miniflare-backed test ' +
	'(Miniflare establishes real Hyperdrive socket connections) for socket-level behavior.'

function defaultPortForDatabaseUrl(url: URL): number {
	if (url.port) {
		return Number(url.port)
	}

	return url.protocol === 'mysql:' ? 3306 : 5432
}

/**
 * Creates a Hyperdrive binding around a local database connection string.
 *
 * The connection fields are real and usable with any Node database client. The
 * Cloudflare `connect()` raw socket is intentionally not implemented — it would
 * require faithfully reproducing `cloudflare:sockets` semantics (TLS, startTls(),
 * half-open, SocketInfo) over node:net, which is exactly the kind of fake that
 * fails silently. It throws a clear, actionable error instead.
 */
export function createLocalHyperdrive(connectionString: string): Hyperdrive {
	const url = new URL(connectionString)

	return {
		connectionString,
		host: url.hostname,
		port: defaultPortForDatabaseUrl(url),
		user: decodeURIComponent(url.username),
		password: decodeURIComponent(url.password),
		database: decodeURIComponent(url.pathname.replace(/^\//, '')),
		connect(): Socket {
			throw new Error(HYPERDRIVE_CONNECT_MESSAGE)
		}
	} as Hyperdrive
}
