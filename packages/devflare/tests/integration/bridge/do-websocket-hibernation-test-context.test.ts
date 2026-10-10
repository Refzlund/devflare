// =============================================================================
// DO WebSocket-Hibernation Broadcast — `devflare/test` gateway
// =============================================================================
// Same hibernation Durable Object + assertions as
// do-websocket-hibernation.test.ts, but against the `devflare/test`
// (createTestContext) gateway built by buildGatewayScript.
//
// Before the fix this gateway had NO DO WebSocket handler at all, so
// stub.connect() sent a ws.open frame the gateway ignored and the call HUNG
// forever (the exact symptom the ui-dreamer probe hit). It now serves the same
// /_devflare/do-ws pass-through as the dev gateway, so the hibernation broadcast
// works identically.
// =============================================================================

import { buildGatewayScript } from '../../../src/test/simple-context-gateway-script'
import { DOC_ROOM_BODY, DOC_ROOM_IMPORT, runHibernationSuite } from './_hibernation-do'

// Test-context gateway (`devflare/test`): the import is hoisted to the top, then
// the DO class is embedded as the "bundled code" of buildGatewayScript. DOC_ROOM
// is declared native-RPC so the wsCount() probe dispatches to stub.wsCount().
const testGatewayScript = `${DOC_ROOM_IMPORT}\n${buildGatewayScript(DOC_ROOM_BODY, '', ['DOC_ROOM'])}`

runHibernationSuite('devflare/test gateway', testGatewayScript, 9800)
