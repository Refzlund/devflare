// =============================================================================
// DO WebSocket-Hibernation Broadcast — `devflare dev` gateway
// =============================================================================
// Exercises the REAL dev-server gateway (getGatewayScript) end-to-end against a
// hibernation-API Durable Object (ctx.acceptWebSocket + runtime-dispatched
// webSocketMessage/webSocketClose), exactly as ui-dreamer's DocRoom does.
//
// Reproduces the reported bug: two tabs open the SAME document's /subscribe
// WebSocket (both env.DOC_ROOM.getByName(id)), and a BINARY presence frame from
// tab A never reached tab B even though the DO broadcasts to ctx.getWebSockets().
// Before the fix the gateway pumped the DO socket in-process, so the hibernation
// handlers never fired; now connect() opens a real /_devflare/do-ws pass-through
// so the runtime pumps a genuine inbound connection and the broadcast crosses.
//
// The `devflare/test` gateway is covered by the sibling
// do-websocket-hibernation-test-context.test.ts (split into its own file so each
// runs a single Miniflare instance — see _hibernation-do.ts).
// =============================================================================

import { getGatewayScript } from '../../../src/dev-server/gateway-script'
import { DOC_ROOM_BODY, DOC_ROOM_IMPORT, runHibernationSuite } from './_hibernation-do'

// Dev-server gateway (`devflare dev`): the DO class + the shared gateway runtime.
const devGatewayScript = `${DOC_ROOM_IMPORT}\n${DOC_ROOM_BODY}\n${getGatewayScript([])}`

runHibernationSuite('devflare dev gateway', devGatewayScript, 9799)
