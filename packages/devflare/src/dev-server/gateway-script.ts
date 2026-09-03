import { GATEWAY_RUNTIME_JS } from '../bridge/gateway-runtime'
import { R2_PRESIGN_RUNTIME_JS } from '../bridge/r2-presign-runtime'
import type { WsRouteConfig } from '../config'

/**
 * Generates the dev-server gateway worker script inline.
 *
 * All in-sandbox RPC behavior (method dispatch, error envelope, serialization,
 * WebSocket bridge, HTTP transfer) lives in `GATEWAY_RUNTIME_JS` and is shared
 * with `src/bridge/miniflare.ts`. The canonical TypeScript equivalent lives in
 * `src/bridge/server.ts`. The local presigned-R2 endpoint handler is shared
 * via `R2_PRESIGN_RUNTIME_JS` (`src/bridge/r2-presign-runtime.ts`).
 *
 * This file only owns the pieces that are genuinely dev-server-specific:
 *   - WebSocket route matching & DO WebSocket forwarding (`WS_ROUTES`)
 *   - D1 migration endpoint
 *   - Inbound email ingestion endpoint
 *   - Service-binding fallthrough to the app worker
 *
 * @param wsRoutes - WebSocket routes for DO proxying
 * @param debug - Enable debug logging in gateway
 * @param appServiceBindingName - Service binding name for the app worker (if any)
 */
export function getGatewayScript(
	wsRoutes: WsRouteConfig[] = [],
	debug = false,
	appServiceBindingName: string | null = null
): string {
	const wsRoutesJson = JSON.stringify(wsRoutes)
	const appServiceBindingJson = JSON.stringify(appServiceBindingName)

	return `
${GATEWAY_RUNTIME_JS}

${R2_PRESIGN_RUNTIME_JS}

// Bridge Gateway Worker — Dev Server
// Dev-server-specific overlay on top of the shared GATEWAY_RUNTIME_JS:
// WS route DO forwarding, D1 migration, email ingest, app-worker fallthrough.

const DEBUG = ${debug}
const log = (...args) => DEBUG && console.log('[Gateway]', ...args)

const WS_ROUTES = ${wsRoutesJson}
const APP_SERVICE_BINDING = ${appServiceBindingJson}

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url)
		const isWebSocket = request.headers.get('Upgrade') === 'websocket'

		if (isWebSocket) {
			// Bridge DO connect(): a real pass-through upgrade to a Durable Object
			// (hibernation-correct), distinct from the bridge RPC/relay socket.
			if (url.pathname === '/_devflare/do-ws') {
				return handleBridgeDoWebSocket(request, env, url)
			}
			const matchedRoute = matchWsRoute(url.pathname)
			if (matchedRoute) {
				return handleDoWebSocket(request, env, url, matchedRoute)
			}
			// Worker mode: the app worker (SvelteKit etc.) owns EVERY unmatched app
			// WebSocket route, and whatever it answers is what the browser gets. A
			// handler like GET /api/doc/:id/subscribe that does
			// \`return stub.fetch(clientUpgradeRequest)\` must reach the app worker so
			// its returned 101 (with the DO's client socket) flows back to the
			// browser and the DO's hibernation handlers fire.
			//
			// → GOTCHA: there is no bridge fallback here, and adding one back is the
			// bug. The gateway used to discard any answer that was not 101 and
			// upgrade the browser into the in-worker bridge RPC socket instead — so
			// a route that REFUSED the upgrade (401/403/404/500) still answered 101,
			// the browser believed it had reached its own route, sent its own
			// protocol's first frame, and the bridge dispatcher logged
			// "… is not valid JSON" on every liveness probe while the real refusal
			// never arrived. The bridge socket belongs to the Node-side bridge
			// client, which cannot coexist with an app worker: APP_SERVICE_BINDING
			// is non-null only when shouldRunMainWorker is true, which requires
			// !enableVite (dev-server/miniflare-dev-config.ts), while that client IS
			// the Vite/SvelteKit dev handle dialing ws://localhost:<bridgePort>
			// (sveltekit/platform.ts, config/workspace.ts). Worker mode therefore
			// has no bridge client to serve, and an app that serves its own WS at
			// any path — '/' included — keeps it.
			if (APP_SERVICE_BINDING) {
				return forwardWebSocketToApp(request, env)
			}
			return handleBridgeWebSocket(request, env, ctx)
		}

		if (url.pathname.startsWith('/_devflare/transfer/')) {
			return handleHttpTransfer(request, env, url)
		}

		const presignResponse = await __devflareR2PresignHandle(request, env, url)
		if (presignResponse) {
			return presignResponse
		}

		if (url.pathname === '/_devflare/migrate' && request.method === 'POST') {
			return handleMigration(request, env)
		}

		if (url.pathname === '/cdn-cgi/handler/email' && request.method === 'POST') {
			return handleEmailIncoming(request, env, ctx, url)
		}

		if (url.pathname === '/_devflare/health') {
			return new Response(JSON.stringify({
				ok: true,
				bindings: Object.keys(env),
				wsRoutes: WS_ROUTES
			}), { headers: { 'Content-Type': 'application/json' } })
		}

		if (APP_SERVICE_BINDING) {
			const appWorker = env[APP_SERVICE_BINDING]
			if (appWorker && typeof appWorker.fetch === 'function') {
				return appWorker.fetch(request)
			}
		}

		return new Response('Devflare Bridge Gateway', { status: 200 })
	}
}

async function handleMigration(request, env) {
	try {
		const { bindingName, statements, files } = await request.json()
		log('Migration request for binding:', bindingName, 'statements count:', statements?.length, 'files:', files?.length, 'bindings:', Object.keys(env))
		const db = env[bindingName]
		if (!db) {
			return Response.json({ error: 'Binding not found: ' + bindingName }, { status: 404 })
		}

		// Ledger-aware path: when the client sends per-file metadata, we track
		// applied migrations in a \`_devflare_migrations\` table and skip files
		// whose filename+sha256 is already recorded. Files with a drifting hash
		// are reported as warnings and skipped — we refuse to re-apply to avoid
		// stomping on user data.
		if (Array.isArray(files) && files.length > 0) {
			try {
				await db.prepare(
					'CREATE TABLE IF NOT EXISTS _devflare_migrations (filename TEXT PRIMARY KEY, applied_at TEXT NOT NULL, sha256 TEXT NOT NULL)'
				).run()
			} catch (error) {
				const msg = error?.message || String(error)
				log('Failed to ensure migration ledger:', msg)
				return Response.json({ error: 'Failed to ensure migration ledger: ' + msg }, { status: 500 })
			}

			let ledgerRows = []
			try {
				const ledger = await db.prepare('SELECT filename, sha256 FROM _devflare_migrations').all()
				ledgerRows = ledger?.results || []
			} catch (error) {
				log('Failed to read migration ledger:', error?.message || String(error))
			}
			const ledgerByFilename = new Map()
			for (const row of ledgerRows) {
				ledgerByFilename.set(row.filename, row.sha256)
			}

			const applied = []
			const skipped = []
			const warnings = []
			const results = []

			for (const file of files) {
				const existingHash = ledgerByFilename.get(file.filename)
				if (existingHash === file.sha256) {
					skipped.push(file.filename)
					continue
				}
				if (existingHash && existingHash !== file.sha256) {
					warnings.push({
						filename: file.filename,
						message: 'sha256 drifted since last apply; skipped'
					})
					skipped.push(file.filename)
					continue
				}

				let fileFailed = false
				for (const sql of file.statements || []) {
					try {
						log('Running migration SQL:', sql.slice(0, 80))
						await db.prepare(sql).run()
						results.push({ sql: sql.slice(0, 50), success: true })
					} catch (error) {
						const msg = error?.message || String(error)
						log('Migration SQL error:', msg)
						if (msg.includes('already exists')) {
							results.push({ sql: sql.slice(0, 50), success: true, skipped: true })
						} else {
							results.push({ sql: sql.slice(0, 50), success: false, error: msg })
							fileFailed = true
						}
					}
				}

				if (!fileFailed) {
					try {
						await db.prepare(
							'INSERT OR REPLACE INTO _devflare_migrations (filename, applied_at, sha256) VALUES (?, ?, ?)'
						).bind(file.filename, new Date().toISOString(), file.sha256).run()
						applied.push(file.filename)
					} catch (error) {
						log('Failed to record migration in ledger:', error?.message || String(error))
					}
				}
			}

			return Response.json({ success: true, results, applied, skipped, warnings })
		}

		// Legacy path: flat statement list, no ledger tracking.
		const results = []
		for (const sql of statements) {
			try {
				log('Running migration SQL:', sql.slice(0, 80))
				await db.prepare(sql).run()
				results.push({ sql: sql.slice(0, 50), success: true })
				log('Migration SQL succeeded')
			} catch (error) {
				const msg = error?.message || String(error)
				log('Migration SQL error:', msg)
				if (msg.includes('already exists')) {
					results.push({ sql: sql.slice(0, 50), success: true, skipped: true })
				} else {
					results.push({ sql: sql.slice(0, 50), success: false, error: msg })
				}
			}
		}

		try {
			const tables = await db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all()
			log('Tables after migration:', JSON.stringify(tables))
		} catch (e) {
			log('Error listing tables:', e.message)
		}

		return Response.json({ success: true, results })
	} catch (error) {
		return Response.json({ error: error?.message || String(error) }, { status: 500 })
	}
}

async function handleEmailIncoming(request, env, ctx, url) {
	try {
		const from = url.searchParams.get('from') || 'unknown@example.com'
		const to = url.searchParams.get('to') || 'worker@example.com'
		const rawBody = await request.text()

		log('Email incoming:', { from, to, bodyLength: rawBody.length })

		if (APP_SERVICE_BINDING) {
			const appWorker = env[APP_SERVICE_BINDING]
			if (appWorker && typeof appWorker.fetch === 'function') {
				const response = await appWorker.fetch(new Request('http://devflare.internal/_devflare/internal/email', {
					method: 'POST',
					headers: {
						'x-devflare-event': 'email',
						'x-devflare-email-from': from,
						'x-devflare-email-to': to,
						'content-type': request.headers.get('content-type') || 'text/plain'
					},
					body: rawBody
				}))

				if (!response.ok) {
					return response
				}
			}
		}

		return new Response(JSON.stringify({ ok: true, from, to }), {
			headers: { 'Content-Type': 'application/json' }
		})
	} catch (error) {
		console.error('[Gateway] Email handler error:', error)
		return Response.json({ error: error?.message || String(error) }, { status: 500 })
	}
}

function matchWsRoute(pathname) {
	for (const route of WS_ROUTES) {
		if (pathname === route.pattern || pathname.startsWith(route.pattern + '?')) {
			return route
		}
	}
	return null
}

// Hand a WebSocket upgrade to the app worker (worker mode) and answer with its
// response VERBATIM, whatever the status. An app route that upgrades answers 101
// with the DO's client socket, which is what lets \`return stub.fetch(clientUpgradeRequest)\`
// reach the DO and stream that socket back to the browser (hibernation handlers
// then fire, and two tabs share one DO instance). An app route that REFUSES —
// an auth check answering 401, a route that does not exist answering 404 — owns
// that answer just as much, and the browser has to receive it: a refusal the
// gateway rewrites into a successful handshake is a client connected to nothing
// it asked for. A GET upgrade has no body, so forwarding the same request is safe.
async function forwardWebSocketToApp(request, env) {
	const appWorker = env[APP_SERVICE_BINDING]
	if (!appWorker || typeof appWorker.fetch !== 'function') {
		// Only reachable if the gateway was built with an app service binding name
		// that miniflare did not bind — a devflare bug, not an app one. Say so;
		// upgrading the browser into the bridge socket instead would hide it.
		console.error('[Gateway] App service binding is not bound:', APP_SERVICE_BINDING)
		return new Response('App service binding is not bound: ' + APP_SERVICE_BINDING, { status: 500 })
	}
	return appWorker.fetch(request)
}

async function handleDoWebSocket(request, env, url, route) {
	try {
		const namespace = env[route.doNamespace]
		if (!namespace) {
			console.error('[Gateway] DO namespace not found:', route.doNamespace)
			return new Response('DO namespace not found: ' + route.doNamespace, { status: 500 })
		}

		const idValue = url.searchParams.get(route.idParam) || 'default'
		const doId = namespace.idFromName(idValue)
		const stub = namespace.get(doId)

		const forwardUrl = new URL(route.forwardPath, url.origin)
		url.searchParams.forEach((v, k) => forwardUrl.searchParams.set(k, v))

		log('Forwarding WebSocket to DO:', route.doNamespace, 'id:', idValue, 'path:', forwardUrl.pathname)

		return stub.fetch(forwardUrl.toString(), {
			method: request.method,
			headers: request.headers
		})
	} catch (error) {
		console.error('[Gateway] Error forwarding to DO:', error)
		return new Response('Error forwarding to DO: ' + error.message, { status: 500 })
	}
}
`
}
