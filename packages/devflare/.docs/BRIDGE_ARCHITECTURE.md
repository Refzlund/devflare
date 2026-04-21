# Devflare Bridge Architecture

> **TODO(B3):** finalize bare-verb vs namespaced RPC naming convention. The examples below currently show binding-prefixed RPC method names (e.g. `MY_KV.get`, `MY_DO.idFromName`); the on-the-wire convention is still being unified — see `INCONSISTENCIES.md → B3` and `bridge/server.ts` for the actual dispatch table.

> **Source layout (current).** The bridge lives under `src/bridge/`:
> - `bridge/v2/` — wire-protocol layer: `wire.ts` (RPC envelope, control plane, binary frame header, ID counters, `HTTP_TRANSFER_THRESHOLD`), `frames.ts` (binary frame encode/decode), `codec.ts` (handshake + body-stream registry on top of `wire.ts`), `transport.ts` (per-payload inline-vs-HTTP transport selection), `body-streams.ts` (pull-based stream registry), `value-codec.ts` / `value-serialization.ts` (POJO + StreamRef serialization), `control-messages.ts`, `ws-relay.ts` (WS pass-through plumbing), `serialization.ts`, `index.ts`.
> - `bridge/client.ts` — Node/Bun-side client (used by the public `env` proxy).
> - `bridge/server.ts` — in-worker dispatcher.
> - `bridge/proxy.ts` — the `env` Proxy implementation that translates property access into RPC calls.
> - `bridge/gateway-runtime.ts` — worker-side gateway that runs inside Miniflare.
> - `bridge/miniflare.ts` — Miniflare lifecycle integration.
>
> The legacy `protocol.ts` / `serialization.ts` split referenced by older docs no longer exists — wire-level concerns now live in `bridge/v2/wire.ts` (control vocabulary) and `bridge/v2/value-codec.ts` (+ `value-serialization.ts`) for value shaping.

## Core Principle

**Vite/SvelteKit/Node.js runs OUTSIDE workerd. Miniflare runs INSIDE workerd. The bridge connects them.**

```
┌─────────────────────────────────────┐     ┌──────────────────────────────┐
│  Your Application (Node.js)         │     │  Miniflare (workerd process) │
│                                     │     │                              │
│  import { env } from 'devflare'   │     │  ┌─────────────────────────┐ │
│                                     │     │  │ DurableObjects          │ │
│  env.CHAT_ROOM.get(id).fetch(req)   │ WS  │  │ KV Namespaces           │ │
│  env.MY_KV.get('key')               │ ══> │  │ R2 Buckets              │ │
│  env.D1_DB.prepare(...).run()       │ <══ │  │ D1 Databases            │ │
│  env.AI.run(...)                    │     │  │ Queues, AI, Browser...  │ │
│                                     │     │  └─────────────────────────┘ │
└─────────────────────────────────────┘     └──────────────────────────────┘
        ↑                                              ↑
        │                                              │
   YOUR CODE                                    CLOUDFLARE EMULATION
   (runs in Node/Bun/Deno)                     (runs in workerd)
```

## What This Is NOT

❌ Running SvelteKit SSR inside workerd  
❌ Merging two workerd runtimes  
❌ Using `getPlatformProxy` which spawns isolated workerd  

## What This IS

✅ Single Miniflare process with ALL Cloudflare bindings  
✅ WebSocket-based RPC bridge from Node.js to Miniflare  
✅ `env` Proxy that transparently communicates with Miniflare  
✅ Works in ANY JavaScript runtime (Node, Bun, Deno, browser tests)  

---

## Cloudflare Constraints

| Constraint | Value | Implication |
|------------|-------|-------------|
| WS message size limit | 1 MiB | Must chunk large data |
| Practical chunk size | 64-256 KiB | Balance throughput vs memory |

---

## Transport Strategy: Hybrid (WS + HTTP)

| Data Size | Transport | Rationale |
|-----------|-----------|-----------|
| < 10 MB | WebSocket | Low latency, unified channel |
| ≥ 10 MB | HTTP streaming | Better throughput, no chunk overhead |
| DO WebSocket | WebSocket proxy | Must use WS for real-time |
| AI responses | WebSocket stream | Progressive delivery |

**Large file flow (HTTP fallback)**:
```
1. RPC: { t: 'rpc.call', method: 'MY_BUCKET.put', params: ['big.zip', { httpUpload: true }] }
2. Response: { t: 'rpc.ok', result: { uploadUrl: 'http://localhost:PORT/upload/xyz' } }
3. Client streams file to uploadUrl via HTTP PUT
4. Gateway streams to R2 binding
```

---

## Protocol Design

The bridge multiplexes 4 "planes" over ONE WebSocket:

1. **RPC calls**: Node → Worker ("invoke binding method"), Worker → Node (result/error)
2. **Events**: Worker → Node (DO broadcasts, queue messages, logs)
3. **Byte streams**: Pull-based streaming with credit flow control
4. **WS proxy**: Browser WS ↔ DO WS, proxied through the bridge

### Control Plane (JSON text frames)

```typescript
type JsonMsg =
  // RPC
  | { t: 'rpc.call'; id: string; method: string; params: unknown[] }
  | { t: 'rpc.ok'; id: string; result: unknown }
  | { t: 'rpc.err'; id: string; error: { code: string; message: string } }
  
  // Events
  | { t: 'event'; topic: string; data: unknown }
  
  // Stream control (pull-based backpressure)
  | { t: 'stream.open'; sid: number; meta?: { contentType?: string; length?: number } }
  | { t: 'stream.pull'; sid: number; creditBytes: number }
  | { t: 'stream.end'; sid: number }
  | { t: 'stream.abort'; sid: number; error?: string }
  
  // WebSocket proxy control
  | { t: 'ws.open'; wid: number; target: { binding: string; id: string; url: string } }
  | { t: 'ws.opened'; wid: number }
  | { t: 'ws.close'; wid: number; code?: number; reason?: string }
```

### Data Plane (Binary frames)

Binary frames carry stream chunks or proxied WS payloads:

```
┌────────┬────────┬────────┬────────┬─────────────────┐
│ kind   │ id     │ seq    │ flags  │ payload...      │
│ u8     │ u32    │ u32    │ u8     │ bytes           │
└────────┴────────┴────────┴────────┴─────────────────┘

kind:
  1 = stream chunk (id = sid)
  2 = ws data (id = wid)

flags:
  bit0 = FIN (last chunk/frame)
  bit1 = TEXT vs BINARY (for ws data)
```

---

## Serialization Strategy

### Principle: Never stringify real Request/Response

Convert to POJOs + StreamRef for bodies.

```typescript
// SerializedRequest
interface SerializedRequest {
  url: string
  method: string
  headers: [string, string][]
  body?: { sid: number } | { bytes: Uint8Array } | null
}

// SerializedResponse  
interface SerializedResponse {
  status: number
  statusText?: string
  headers: [string, string][]
  body?: { sid: number } | { bytes: Uint8Array } | null
  webSocket?: { wid: number }  // For WS upgrades
}
```

### Streams as References

Large bodies become `{ sid: number }` references:
- Binary frames deliver the bytes
- Consumer drives flow with `stream.pull` credits

---

## Pull-Based Streaming (Backpressure)

**Why pull-based?** Prevents memory blowup when streaming 3GB files.

```
Receiver: stream.pull { sid: 1, creditBytes: 262144 }  // Request 256KB
Sender:   [binary frame: sid=1, 64KB chunk]
Sender:   [binary frame: sid=1, 64KB chunk]
Sender:   [binary frame: sid=1, 64KB chunk]
Sender:   [binary frame: sid=1, 64KB chunk]
Receiver: stream.pull { sid: 1, creditBytes: 262144 }  // Request more
...
Sender:   stream.end { sid: 1 }  // Done
```

---

## DO WebSocket Pass-through

Browser connects to SvelteKit (not directly to Miniflare):

```
┌─────────┐    WS     ┌────────────┐   Bridge   ┌────────────┐   DO WS   ┌────────┐
│ Browser │ ───────── │ SvelteKit  │ ─────────── │ Miniflare  │ ───────── │   DO   │
│         │           │ (Node.js)  │             │ (workerd)  │           │        │
└─────────┘           └────────────┘             └────────────┘           └────────┘
     ↑                      ↑                          ↑                      ↑
  /chat/123         Accept upgrade,             ws.open { wid,             Accept WS,
                    allocate wid,               binding, id }              relay frames
                    relay frames
```

**Why this way?**
- Same-origin (no CORS issues)
- Cookies/auth work normally
- Dev/prod parity
- SvelteKit routing works

---

## The internal `bridgeEnv` proxy

```typescript
// Internal proxy that:
// 1. Lazily connects to Miniflare on first access
// 2. Translates method calls to RPC messages
// 3. Returns Promises that resolve when Miniflare responds

await bridgeEnv.MY_KV.get('key')
// → RPC: { t: 'rpc.call', id: '1', method: 'MY_KV.get', params: ['key'] }
// ← Response: { t: 'rpc.ok', id: '1', result: 'stored-value' }

const stub = bridgeEnv.CHAT_ROOM.get(id)
await stub.fetch(request)
// → RPC: { t: 'rpc.call', id: '2', method: 'CHAT_ROOM.idFromName', params: [id] }
// → RPC: { t: 'rpc.call', id: '3', method: 'CHAT_ROOM.fetch', params: [stubRef, serializedReq] }
```

> **Note**: `bridgeEnv` is an internal bridge-layer primitive, not part of the stable root package contract.
> Public application code should usually use `import { env } from 'devflare'` inside request/test flows, or lower-level bridge helpers such as `createEnvProxy()` / `initEnv()` for advanced bridge work.

---

## Initialization

```typescript
// Lazy init (primary internal pattern)
await bridgeEnv.MY_KV.get('key') // Auto-connects

// Explicit init
await getClient().connect()
await bridgeEnv.MY_KV.get('key')
```

---

## CLI

```bash
bunx --bun devflare dev              # Unified local dev server
bunx --bun devflare remote status    # Show remote test mode
bunx --bun devflare remote enable 30 # Enable remote-only tests for 30 minutes
```

---

## File Structure

```
packages/devflare/src/bridge/
├── v2/
│   ├── wire.ts             # RPC envelope, control vocab, binary frame header, ID counters
│   ├── frames.ts           # Binary frame encode/decode
│   ├── codec.ts            # Hello/welcome handshake + body-stream registry on top of wire.ts
│   ├── transport.ts        # Per-payload inline-vs-HTTP transport selection (HTTP_TRANSFER_THRESHOLD)
│   ├── body-streams.ts     # Pull-based stream registry
│   ├── value-codec.ts      # Request/Response/StreamRef value shaping
│   ├── value-serialization.ts
│   ├── control-messages.ts
│   ├── ws-relay.ts         # WS pass-through plumbing
│   ├── serialization.ts
│   └── index.ts
├── client.ts               # Node/Bun WebSocket client
├── server.ts               # Gateway dispatcher (in-worker)
├── proxy.ts                # `env` Proxy
├── gateway-runtime.ts      # Worker-side gateway running inside Miniflare
└── miniflare.ts            # Miniflare lifecycle integration
```
