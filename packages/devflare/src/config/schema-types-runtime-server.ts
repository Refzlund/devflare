// =============================================================================
// Authoring input types — dev-server + streaming-tail runtime config
// =============================================================================
// Split out of schema-types-runtime.ts to keep that file under the reviewable
// size ceiling. Re-exported from schema-types-runtime.ts so existing import
// paths stay stable (backward compatible).
// =============================================================================

/**
 * Dev server configuration for `devflare dev`.
 *
 * Controls the host and port the local Miniflare runtime instance binds to.
 * Development-only; never emitted to compiled Wrangler output. CLI flags
 * (`--runtime-port`, `--runtime-host`) and environment variables
 * (`DEVFLARE_RUNTIME_PORT`, `DEVFLARE_RUNTIME_HOST`) take precedence.
 */
export interface ServerConfigInput {
	/**
	 * Host the local dev runtime binds to.
	 *
	 * @default `'127.0.0.1'`
	 *
	 * @example
	 * ```ts
	 * server: { host: '0.0.0.0' }
	 * ```
	 */
	host?: string

	/**
	 * Port the local dev runtime binds to.
	 *
	 * @default `8787`
	 *
	 * @example
	 * ```ts
	 * server: { port: 3000 }
	 * ```
	 */
	port?: number

	/**
	 * Serve the local dev runtime over HTTPS. Miniflare self-signs a
	 * certificate unless `httpsKeyPath`/`httpsCertPath` are provided.
	 *
	 * @default `false`
	 *
	 * @example
	 * ```ts
	 * server: { https: true }
	 * ```
	 */
	https?: boolean

	/**
	 * Path to a TLS private key (PEM) used when `https` is enabled. Maps to
	 * Miniflare's `httpsKeyPath`.
	 *
	 * @default Miniflare self-signed key.
	 *
	 * @example
	 * ```ts
	 * server: { https: true, httpsKeyPath: './certs/key.pem' }
	 * ```
	 */
	httpsKeyPath?: string

	/**
	 * Path to a TLS certificate chain (PEM) used when `https` is enabled. Maps
	 * to Miniflare's `httpsCertPath`.
	 *
	 * @default Miniflare self-signed certificate.
	 *
	 * @example
	 * ```ts
	 * server: { https: true, httpsCertPath: './certs/cert.pem' }
	 * ```
	 */
	httpsCertPath?: string

	/**
	 * Port the V8 inspector (DevTools) binds to. Maps to Miniflare's
	 * `inspectorPort`.
	 *
	 * @default No inspector.
	 *
	 * @example
	 * ```ts
	 * server: { inspectorPort: 9229 }
	 * ```
	 */
	inspectorPort?: number

	/**
	 * Origin to proxy unmatched requests to and to base the request URL on.
	 * Maps to Miniflare's `upstream`.
	 *
	 * @default No upstream.
	 *
	 * @example
	 * ```ts
	 * server: { upstream: 'https://example.com' }
	 * ```
	 */
	upstream?: string

	/**
	 * Inject Miniflare's in-browser live-reload script into HTML responses so the
	 * page auto-refreshes when the local dev runtime reloads. Maps to Miniflare's
	 * `liveReload`. Local-dev only; complements Devflare's own source watcher.
	 *
	 * @default `false`
	 *
	 * @example
	 * ```ts
	 * server: { liveReload: true }
	 * ```
	 */
	liveReload?: boolean

	/**
	 * Override the `request.cf` object (`IncomingRequestCfProperties`) the local
	 * dev runtime serves to your Worker. `false` omits it, a string is a path to
	 * a JSON file, and an object injects custom cf metadata (colo, country, TLS,
	 * bot management, …). Maps to Miniflare's `cf`. Local-dev only — no deploy
	 * effect.
	 *
	 * @default Miniflare's default `cf` values.
	 *
	 * @example
	 * ```ts
	 * server: { cf: { colo: 'SFO', country: 'US' } }
	 * ```
	 */
	cf?: boolean | string | Record<string, unknown>
}

/**
 * Streaming Tail Worker consumer configuration.
 */
export type StreamingTailConsumerConfigInput = string | StreamingTailConsumerObjectConfigInput

/**
 * Streaming Tail Worker consumer object form.
 */
export interface StreamingTailConsumerObjectConfigInput {
	/**
	 * Streaming Tail Worker service name.
	 *
	 * @example
	 * ```ts
	 * service: 'stream-worker'
	 * ```
	 */
	service: string

	/**
	 * Optional Streaming Tail Worker environment.
	 *
	 * @default Target worker default environment.
	 *
	 * @example
	 * ```ts
	 * environment: 'production'
	 * ```
	 */
	environment?: string
}
