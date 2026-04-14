# Case Examples

This directory contains the example projects that currently exist in this repo,
demonstrating devflare patterns.

## Quick Reference

| Case | Name | Local Dev | Docs | Status |
|------|------|-----------|------|--------|
| 1 | [Basic Worker](#case-1-basic-worker) | ✅ Full | [Workers](https://developers.cloudflare.com/workers/) | ✅ Complete |
| 3 | [Durable Objects](#case-3-durable-objects) | ✅ Full | [Durable Objects](https://developers.cloudflare.com/durable-objects/) | ✅ Complete |
| 5 | [Multi-Worker](#case-5-multi-worker) | ✅ Full | [Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/) | ✅ Complete |
| 6 | [Queues & Crons](#case-6-queues--crons) | ✅ Full | [Queues](https://developers.cloudflare.com/queues/) | ✅ Complete |
| 7 | [Edge Cases](#case-7-edge-cases) | ✅ Full | — | ✅ Complete |
| 8 | [Route Modules (Manual Dispatch)](#case-8-route-modules-manual-dispatch) | ✅ Full | — | ✅ Complete |
| 9 | [Monorepo](#case-9-monorepo) | ✅ Full | — | ✅ Complete |
| 10 | [Path Aliases](#case-10-path-aliases) | ✅ Full | — | ✅ Complete |
| 11 | [Cross-Package DO](#case-11-cross-package-do) | ✅ Full | — | ✅ Complete |
| 12 | [Email Handlers](#case-12-email-handlers) | ⚠ Partial helper coverage | [Email Routing](https://developers.cloudflare.com/email-routing/email-workers/) | ⚠ Partial |
| 13 | [Tail Workers](#case-13-tail-workers) | ⚠ Direct `tail()` invoke + helper gaps | [Tail Workers](https://developers.cloudflare.com/workers/observability/logs/tail-workers/) | ⚠ Partial |
| 14 | [Hyperdrive](#case-14-hyperdrive) | ✅ Full (Bun SQLite) | [Hyperdrive](https://developers.cloudflare.com/hyperdrive/) | ✅ Complete |
| 15 | [Vectorize & AI](#case-15-vectorize--ai) | 🌐 Remote mode | [Workers AI](https://developers.cloudflare.com/workers-ai/) / [Vectorize](https://developers.cloudflare.com/vectorize/) | ✅ Complete |
| 16 | [Workflows](#case-16-workflows) | ✅ Full | [Workflows](https://developers.cloudflare.com/workflows/) | ✅ Complete |
| 17 | [Plugin Namespace Example](#case-17-plugin-namespace-example) | ✅ Full | — | ✅ Complete |
| 18 | [SvelteKit DO Integration](#case-18-sveltekit-do) | ✅ Full | — | ✅ Complete |
| 19 | [Transport & DO RPC](#case-19-transport--do-rpc) | ✅ Full | — | ✅ Complete |

### Legend
- ✅ Full = Full local simulation, no external dependencies
- ✅ Full (Puppeteer) = Full local simulation via Puppeteer shim
- 🔌 Needs DB = Requires external PostgreSQL/MySQL for meaningful testing
- 🌐 Remote mode = Requires linked Cloudflare account plus `devflare remote enable` (or equivalent env setup)

---

## Running Cases

Each case is a standalone bun workspace package:

```bash
# Run tests for a specific case
cd cases/case1
bun test

# Run all case tests from root
bun test --filter "case*"
```

## Structure

Each case follows this structure:

```
case{N}/
├── src/               # Source code (separate files per handler)
├── tests/             # Bun tests using devflare/test
├── package.json       # Uses "devflare": "workspace:*"
├── devflare.config.ts
├── tsconfig.json
└── env.d.ts           # Generated types
```

Generated Devflare and Wrangler outputs belong under `.devflare/` and `.wrangler/`.
Case roots should not keep a generated `wrangler.jsonc` / `wrangler.json` file as source.

---

## Case Details

### Case 1: Basic Worker
**Description**: Minimal Cloudflare Worker, no framework  
**Local Dev**: ✅ Full local simulation  
**Bindings**: None  
**Status**: ✅ Complete

---

### Case 3: Durable Objects
**Description**: DO patterns with RPC and WebSockets  
**Local Dev**: ✅ Full local simulation  
**Bindings**: Durable Objects  
**File Convention**: `src/do.*.ts` (e.g., `do.counter.ts`, `do.rate-limiter.ts`)  
**Status**: ✅ Complete

---

### Case 5: Multi-Worker
**Description**: Service bindings between workers with RPC (WorkerEntrypoint)  
**Local Dev**: ✅ Full local simulation via Miniflare workers array  
**Bindings**: Service Bindings (RPC)  
**Docs**: [Service Bindings RPC](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/)

**Important Note**: This case is excellent for local/dev typing and behavior, but if named `WorkerEntrypoint` service bindings are deployment-critical, still validate the generated Wrangler output in your real app.

**File Naming Conventions**:
| Pattern | Purpose | Example |
|---------|---------|---------|
| `worker.ts` | Default worker export (transforms to WorkerEntrypoint) | `math-service/worker.ts` |
| `ep.*.ts` | Named entrypoints (classes extending WorkerEntrypoint) | `math-service/ep.admin.ts` |
| `do.*.ts` | Durable Objects (classes extending DurableObject) | `src/do.counter.ts` |
| `wf.*.ts` | Workflows (classes extending Workflow) | `src/wf.order.ts` |

**File Structure**:
```
case5/
├── src/
│   ├── fetch.ts               # Gateway fetch entry (calls other workers)
│   └── math-service.types.ts  # RPC interface contracts
├── math-service/              # Separate worker directory
│   ├── devflare.config.ts   # Standalone config (referenced via ref())
│   ├── worker.ts              # Default export (transforms to WorkerEntrypoint)
│   └── ep.admin.ts            # Named entrypoint (AdminEntrypoint class)
├── tests/
│   └── gateway.test.ts        # Tests with REAL Miniflare bindings
├── devflare.config.ts       # Uses ref() for cross-config binding
└── env.d.ts
```

**New Patterns**:

#### 1. `ref()` — Cross-Config Referencing
Reference another worker's config for type-safe service bindings:
```ts
// devflare.config.ts (gateway)
import { defineConfig, ref } from 'devflare/config'

// Returns a lazy proxy — no await needed at config level
const mathWorker = ref(() => import('./math-service/devflare.config'))

export default defineConfig({
  bindings: {
    services: {
      // Default worker.ts export (no entrypoint specified)
      MATH_SERVICE: mathWorker.worker,

      // Named entrypoint from ep.admin.ts
      ADMIN: mathWorker.worker('AdminEntrypoint')
    }
  }
})

// With name override (optional):
// const mathWorker = ref('custom-name', () => import('./math-service/devflare.config'))
```

#### 2. `worker.ts` Pattern — Function Exports Transform to WorkerEntrypoint
Export functions directly instead of writing a class:
```ts
// math-service/worker.ts
export function add(a: number, b: number): number {
  return a + b
}

export function multiply(a: number, b: number): number {
  return a * b
}
```

devflare transforms this into:
```ts
import { WorkerEntrypoint } from 'cloudflare:workers'

export class Worker extends WorkerEntrypoint {
  add(a: number, b: number) { return a + b }
  multiply(a: number, b: number) { return a * b }
}
export default Worker
```

#### 3. `ep.*.ts` Pattern — Named WorkerEntrypoint Classes
For additional entrypoints beyond the default worker.ts:
```ts
// math-service/ep.admin.ts
import { WorkerEntrypoint } from 'cloudflare:workers'

export class AdminEntrypoint extends WorkerEntrypoint {
  async resetStats() {
    return { success: true, timestamp: Date.now() }
  }

  async getHealth() {
    return { status: 'healthy', version: '1.0.0' }
  }
}
```

Config (entrypoints are auto-discovered from `ep.*.ts` files):
```ts
// math-service/devflare.config.ts
import { defineConfig } from 'devflare/config'
import type { Entrypoints } from './env'

// Use defineConfig<Entrypoints>() for type-safe entrypoint references
// Run `devflare types` to generate the Entrypoints type in env.d.ts
export default defineConfig<Entrypoints>({
  name: 'math-worker',
  files: { fetch: 'worker.ts' }
  // Note: entrypoints are auto-discovered from ep.*.ts files
})
```

**Type Hints for Entrypoints**:
After running `devflare types`, the `env.d.ts` file will include:
```ts
// Generated by devflare - DO NOT EDIT
export type Entrypoints = 'AdminEntrypoint'
```

The `worker()` method provides type hints based on the referenced config's `Entrypoints` type:
```ts
// TypeScript infers: mathWorker.worker('AdminEntrypoint')
// Invalid: mathWorker.worker('InvalidName') // Type error!
```

> **Workflow**: After adding/renaming `ep.*.ts` files, run `devflare types` in the worker
> directory to regenerate the `Entrypoints` type for autocomplete support.

**RPC Pattern**:
```ts
// Default worker (MATH_SERVICE)
const result = await env.MATH_SERVICE.add(1, 2)

// Named entrypoint (ADMIN)
const health = await env.ADMIN.getHealth()
```

**WorkerEntrypoint Pattern** (`math-service/worker.ts`):
```ts
import { WorkerEntrypoint } from 'cloudflare:workers'

export class MathService extends WorkerEntrypoint {
  add(a: number, b: number): number { return a + b }
  multiply(a: number, b: number): number { return a * b }
  fibonacci(n: number): number { /* ... */ }
  calculateStats(numbers: number[]): StatsResult { /* ... */ }
}
```

**Testing Strategy**:
Tests use the standard `createTestContext()` + `env` pattern. devflare automatically:
1. Detects service bindings with `ref()` metadata
2. Bundles referenced worker scripts with transforms applied
3. Sets up Miniflare with multi-worker configuration
4. Exposes service bindings via `env` proxy

```ts
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { createTestContext } from 'devflare/test'
import { env } from 'devflare'

// Types are generated by `devflare types` in env.d.ts
// The generated types include:
//   MATH_SERVICE: MathServiceInterface
//   ADMIN: AdminEntrypointInterface

describe('Case 5: Multi-Worker RPC', () => {
  beforeAll(async () => {
    await createTestContext()  // Auto-detects config and sets up multi-worker
  })

  afterAll(async () => {
    await env.dispose()
  })

  test('direct RPC call', async () => {
    const result = await env.MATH_SERVICE.add(5, 3)
    expect(result).toBe(8)
  })

  test('complex RPC', async () => {
    const stats = await env.MATH_SERVICE.calculateStats([1, 2, 3, 4, 5])
    expect(stats.mean).toBe(3)
  })
})
```

**Status**: ✅ Complete (16 tests passing)

---

### Case 6: Queues & Crons
**Description**: Queue handlers and scheduled triggers  
**Local Dev**: ✅ Full local simulation  
**Bindings**: Queues, Cron Triggers  
**Status**: ✅ Complete

---

### Case 7: Edge Cases
**Description**: Advanced patterns and edge cases  
**Local Dev**: ✅ Full local simulation  
**Status**: ✅ Complete

---

### Case 8: Route Modules (Manual Dispatch)
**Description**: Organize route modules under `src/routes/**` and dispatch them manually from `src/fetch.ts`  
**Local Dev**: ✅ Full local simulation  
**Status**: ✅ Complete

---

### Case 9: Monorepo
**Description**: Multi-package workspace example  
**Local Dev**: ✅ Full local simulation  
**Status**: ✅ Complete

---

### Case 10: Path Aliases
**Description**: TypeScript path aliases  
**Local Dev**: ✅ Full local simulation  
**Status**: ✅ Complete

---

### Case 11: Cross-Package DO
**Description**: DO references across packages  
**Local Dev**: ✅ Full local simulation  
**Status**: ✅ Complete

---

### Case 12: Email Handlers
**Description**: Email routing and handling  
**Local Dev**: ⚠ Incoming/email-helper coverage is partial in `createTestContext()`  
**Bindings**: KV (EMAIL_LOG), schema-level `sendEmail` example  
**Docs**: [Email Routing Workers](https://developers.cloudflare.com/email-routing/email-workers/)

**Test Helper**:
```ts
import { createTestContext, email } from 'devflare/test'

beforeAll(() => createTestContext())

test('email handler', async () => {
  await email.send({
    from: 'sender@example.com',
    to: 'recipient@example.com',
    subject: 'Test',
    body: 'Hello!'
  })
})
```

**Important Note**: `email.send()` posts to the local email endpoint, but the standard `createTestContext()` path does not currently guarantee end-to-end `src/email.ts` delivery. Treat this case as an API/example reference, not a full helper-contract proof.

**Status**: ⚠ Partial helper coverage

---

### Case 13: Tail Workers
**Description**: Log processing and analytics via tail() handler  
**Local Dev**: ⚠ Direct handler invocation with real bindings; no automatic tail wiring  
**Bindings**: KV (LOG_STORE)  
**Docs**: [Tail Workers](https://developers.cloudflare.com/workers/observability/logs/tail-workers/)

**File Structure**:
```
case13/
├── src/
│   └── tail.ts          # Tail handler with LogEntry type
├── tests/
│   └── tail.test.ts     # Direct tail() tests with real KV bindings
├── devflare.config.ts
└── env.d.ts
```

**API Shape**:
```ts
import { env } from 'devflare'
import type { TailEvent } from 'devflare/runtime'

export async function tail(events: TailEvent): Promise<void> {
  for (const event of events) {
    const filtered = filterLogs(event.logs, env.MIN_LOG_LEVEL)

    const entry: LogEntry = {
      id: `${event.scriptName}-${event.eventTimestamp}`,
      scriptName: event.scriptName,
      outcome: event.outcome,
      logs: filtered,
      exceptions: event.exceptions,
      request: extractRequestInfo(event)
    }

    await env.LOG_STORE.put(`tail:${entry.id}`, JSON.stringify(entry))
  }
}
```

**Important Note**: this case invokes `src/tail.ts` directly in tests while still using real bindings from `createTestContext()`. There is not yet a polished public automatic tail-wiring workflow, so treat it as a direct-handler example rather than a helper-contract proof.

**Status**: ⚠ Partial (direct handler invocation, 10 tests passing)

---

### Case 14: Hyperdrive
**Description**: Minimal Hyperdrive binding example using `env.DB.connectionString`  
**Local Dev**: ✅ Local binding-shape coverage; use remote/deployed runs for real Hyperdrive behavior  
**Bindings**: Hyperdrive (`DB`)  
**Docs**: [Hyperdrive](https://developers.cloudflare.com/hyperdrive/)

**File Structure**:
```
case14/
├── src/
│   └── fetch.ts         # Health + connection-info routes using env.DB
├── tests/
│   └── hyperdrive.test.ts  # Binding presence and basic route checks
├── devflare.config.ts      # Named Hyperdrive binding (`devflare-testing`)
└── env.d.ts
```

**Local Dev Strategy**:
Use the local test/runtime binding shape to verify that the worker can see the
Hyperdrive binding and its connection string:

```ts
import postgres from 'postgres'
import { env } from 'devflare'

const sql = postgres(env.DB.connectionString)
```

For end-to-end verification against a real PostgreSQL origin, create a real
Hyperdrive config in Cloudflare (for example `devflare-testing`) and run the
case remotely or deployed.

**Tested Patterns**:
- Hyperdrive binding presence in `env`
- Hyperdrive `connectionString` availability
- Health route behavior
- Connection-info route behavior

**Production Note**: Prefer a stable Hyperdrive config name in `devflare.config.ts`:
```ts
export default defineConfig({
  bindings: {
    hyperdrive: {
      DB: 'devflare-testing'
    }
  }
})
```

**Status**: ✅ Minimal Hyperdrive example

---

### Case 15: Vectorize & AI
**Description**: Vector search and AI model inference  
**Local Dev**: 🌐 **Requires Devflare remote mode** — No local simulation available  
**Bindings**: AI, Vectorize  
**Docs**: [Workers AI](https://developers.cloudflare.com/workers-ai/) | [Vectorize](https://developers.cloudflare.com/vectorize/)

**File Structure**:
```
case15/
├── src/
│   └── fetch.ts         # Handler with AI/Vectorize utilities
├── tests/
│   └── ai-vectorize.test.ts  # Uses describe.skipIf for remote tests
├── devflare.config.ts      # Binding config; enable remote mode outside the file
└── env.d.ts
```

**API Shape**:
```ts
// Utility functions
export async function generateEmbedding(ai, text, model) { ... }
export async function generateText(ai, prompt, model, options?) { ... }
export async function searchSimilar(vectorize, vector, topK?) { ... }
export async function insertVector(vectorize, id, values, metadata?) { ... }

export async function fetch({ env }: FetchEvent<DevflareEnv>): Promise<Response> {
  const embedding = await generateEmbedding(env.AI, 'Hello', '@cf/baai/bge-base-en-v1.5')
  const matches = await searchSimilar(env.VECTORIZE, embedding)
  return Response.json({ matches })
}
```

**Testing Strategy**:
- Integration tests use `describe.skipIf(!hasCloudflareAccount)`
- Tests require `CLOUDFLARE_ACCOUNT_ID` environment variable
- Smoke tests for module exports always run

**Why remote mode is required**:
- **AI**: Models run on Cloudflare's GPU infrastructure — no local simulation exists
- **Vectorize**: Vector database is a managed service — no local simulation exists

**Configuration**:
```ts
// devflare.config.ts
export default defineConfig({
  bindings: {
    ai: { binding: 'AI' },
    vectorize: {
      VECTORIZE: { indexName: 'my-index' }
    }
  }
})
```

Enable remote mode through the CLI or environment, for example with `devflare remote enable`.

**Status**: ✅ Complete (7 passing, 4 skipped as expected)

---

### Case 16: Workflows
**Description**: Durable multi-step workflow execution  
**Local Dev**: ✅ Full local simulation  
**Bindings**: KV (WORKFLOW_STATE, RESULTS)  
**Docs**: [Workflows](https://developers.cloudflare.com/workflows/)

**File Structure**:
```
case16/
├── src/
│   ├── models.ts        # Order, StepResult, WorkflowInstance classes
│   ├── transport.ts     # Encode/decode for class instances
│   ├── wf.order-processor.ts   # Order processing workflow
│   ├── wf.data-pipeline.ts     # Data ETL workflow
│   └── fetch.ts         # HTTP handler to trigger workflows
├── tests/
│   └── workflow.test.ts # 22 tests (models, transport, workflow logic)
├── devflare.config.ts
└── env.d.ts
```

**Workflow Pattern**:
```ts
// wf.order-processor.ts
export class OrderProcessingWorkflow {
  protected env: DevflareEnv

  constructor(env: DevflareEnv) {
    this.env = env
  }

  async run(event: WorkflowEvent<OrderProcessingInput>, step: WorkflowStep) {
    // Step 1: Validate
    const validation = await step.do('validate-order', async () => { ... })
    
    // Step 2: Reserve inventory
    await step.do('reserve-inventory', async () => { ... })
    
    // Step 3: Process payment
    await step.do('process-payment', async () => { ... })
    
    // Step 4: Shipping
    await step.do('generate-shipping-label', async () => { ... })
    
    // Small delay
    await step.sleep('confirmation-delay', '100ms')
    
    // Step 5: Confirmation
    await step.do('send-confirmation', async () => { ... })
    
    // Persist state
    await this.env.WORKFLOW_STATE.put(`workflow:${id}`, JSON.stringify(state))
  }
}
```

**Transport Pattern**:
```ts
// transport.ts — encode/decode class instances for serialization
export const transport = {
  Order: {
    encode: (v: unknown) => v instanceof Order ? v.toData() : false,
    decode: (data: OrderData) => new Order(data)
  },
  StepResult: { ... },
  WorkflowInstance: { ... }
}
```

**Tested**:
- Model classes (Order, StepResult, WorkflowInstance)
- Transport encode/decode roundtrips
- OrderProcessingWorkflow logic (success, failure, persistence)
- DataPipelineWorkflow logic (ETL transformations)

**Status**: ✅ Complete (22 tests passing)

---

### Case 17: Plugin Namespace Example
**Description**: Legacy case name aside, this example currently demonstrates custom plugin-shaped metadata and virtual-module patterns around the `vite` namespace; it is **not** an end-to-end proof that the main worker pipeline accepts arbitrary Rolldown plugins.  
**Local Dev**: ✅ Full local simulation  
**Status**: ✅ Complete

---

### Case 18: SvelteKit DO Integration  
**Description**: SvelteKit with Durable Objects integration  
**Local Dev**: ✅ Full local simulation  
**Status**: ✅ Complete

---

### Case 19: Transport & DO RPC
**Description**: Custom type transport with Durable Object RPC  
**Local Dev**: ✅ Full local simulation  
**Bindings**: Durable Objects with transport  
**Docs**: See §9 Transport System in FEATURES.md

**File Structure**:
```
case19/
├── src/
│   ├── do.counter.ts         # DO with getValue() returning custom type
│   ├── DoubleableNumber.ts   # Custom class with .double getter
│   └── transport.ts          # Encode/decode for DoubleableNumber
├── tests/
│   └── counter.test.ts       # Verifies transport roundtrip
├── devflare.config.ts
└── env.d.ts
```

**Transport Pattern**:
```ts
// src/DoubleableNumber.ts
export class DoubleableNumber {
  constructor(public value: number) {}
  get double() { return this.value * 2 }
}

// src/transport.ts
export const transport = {
  DoubleableNumber: {
    encode: (v) => v instanceof DoubleableNumber && v.value,
    decode: (v) => new DoubleableNumber(v)
  }
}
```

**Status**: ✅ Complete

---

## Implementation Priority

### ✅ Completed
- **Case 1-12**: All foundational cases complete
- **Case 13 (Tail Workers)** — Tail handler with log filtering, 10 tests
- **Case 14 (Hyperdrive)** — Bun SQLite local dev, 15 tests
- **Case 15 (AI/Vectorize)** — Mock tests + skipped integration, 7+4 tests
- **Case 16 (Workflows)** — Models, transport, 2 workflows, 22 tests
- **Case 17-19**: Complete

---

## Contributing

To add a new case:

1. Create `cases/case{N}/` directory
2. Add `package.json` with `"devflare": "workspace:*"`
3. Add `devflare.config.ts` with appropriate bindings
4. Add source files in `src/` (**separate file per handler!**)
5. Add tests in `tests/` using `createTestContext` + devflare helpers
6. Update this README with full case documentation
