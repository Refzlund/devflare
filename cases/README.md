# Case Example Catalog

The `cases/case*` packages are runnable examples and regression fixtures. Use
them after the docs recipe works and you want a complete package to inspect.

Run one case from its package root:

```bash
cd cases/case1
bun test
```

Run all case packages from the workspace root:

```bash
bun test --filter "case*"
```

## Quick Reference

| Case | Name | Primary proof | Docs | Support status |
| --- | --- | --- | --- | --- |
| 1 | [Basic Worker](#case-1-basic-worker) | Worker routes, env, generated types | `/docs/first-worker`, `/docs/first-route-tree` | Full local |
| 3 | [Durable Objects](#case-3-durable-objects) | DO config, RPC, WebSockets | `/docs/bindings/durable-objects` | Full local |
| 5 | [Multi-Worker](#case-5-multi-worker) | Service bindings and `ref()` | `/docs/bindings/services`, `/docs/multi-workers` | Full local |
| 6 | [Queues & Crons](#case-6-queues--crons) | Queue and scheduled triggers | `/docs/bindings/queues` | Full local |
| 7 | [Edge Cases](#case-7-edge-cases) | Runtime edge coverage | `/docs/docs-release-gates` | Internal regression |
| 8 | [Route Modules](#case-8-route-modules) | Route file dispatch | `/docs/first-route-tree`, `/docs/http-routing` | Full local |
| 9 | [Monorepo](#case-9-monorepo) | Workspace package boundaries | `/docs/monorepo-turborepo` | Full local |
| 10 | [Path Aliases](#case-10-path-aliases) | TS path alias handling | `/docs/project-architecture` | Full local |
| 11 | [Cross-Package DO](#case-11-cross-package-do) | DO binding across packages | `/docs/bindings/durable-objects` | Full local |
| 12 | [Email Handlers](#case-12-email-handlers) | `cf.email.send()` and handler tests | `/docs/bindings/send-email` | Full helper coverage with ingress caveat |
| 13 | [Tail Workers](#case-13-tail-workers) | `cf.tail.trigger()` | `/docs/create-test-context` | Full helper coverage |
| 14 | [Hyperdrive](#case-14-hyperdrive) | Hyperdrive local connection string and binding surface | `/docs/bindings/hyperdrive` | Full local with local DB connection string; hosted pooling caveat |
| 15 | [Vectorize & AI](#case-15-vectorize--ai) | Remote-gated AI and Vectorize | `/docs/bindings/ai`, `/docs/bindings/vectorize` | Remote-gated |
| 16 | [Workflows](#case-16-workflows) | Workflow classes and transport | `/docs/bindings/workflows` | Full local workflow class coverage; hosted lifecycle caveat |
| 17 | [Plugin Namespace Example](#case-17-plugin-namespace-example) | Rolldown plugin namespace behavior | `/docs/project-architecture` | Internal regression |
| 18 | [SvelteKit DO](#case-18-sveltekit-do) | SvelteKit platform plus DO binding | `/docs/sveltekit-with-devflare` | Full local |
| 19 | [Transport & DO RPC](#case-19-transport--do-rpc) | Custom class transport over DO RPC | `/docs/transport-file`, `/docs/bindings/durable-objects` | Full local |

## Shared Shape

Most cases follow this package shape:

```text
caseN/
  devflare.config.ts
  package.json
  tsconfig.json
  env.d.ts
  src/
  tests/
```

Generated Devflare and Wrangler outputs belong under `.devflare/` and
`.wrangler/`. Case roots should not keep generated Wrangler files as source.

## Case Details

### Case 1: Basic Worker

- Purpose: smallest Worker package with route modules and generated env types.
- File map: `devflare.config.ts`, `src/fetch.ts`, `src/routes/**`, `tests/**`.
- Run command: `cd cases/case1 && bun test`.
- What it proves: the first Worker shape can run locally with routes and typed env.
- Docs links: `/docs/first-worker`, `/docs/first-route-tree`, `/docs/test-helper-reference`.
- Support status: full local example.

### Case 3: Durable Objects

- Purpose: Durable Object authoring, migration config, RPC-style calls, and WebSocket paths.
- File map: root worker files plus `do-service/do.*.ts` and generated types.
- Run command: `cd cases/case3 && bun test`.
- What it proves: DO bindings can be configured, generated, and exercised locally.
- Docs links: `/docs/bindings/durable-objects`, `/docs/transport-file`.
- Support status: full local example.

### Case 5: Multi-Worker

- Purpose: service bindings between a gateway Worker and a referenced math Worker.
- File map: `devflare.config.ts`, `src/fetch.ts`, `math-service/devflare.config.ts`, `math-service/worker.ts`, `math-service/ep.admin.ts`, `tests/**`.
- Run command: `cd cases/case5 && bun test`.
- What it proves: `ref()` and service binding RPC work through the local harness.
- Docs links: `/docs/bindings/services`, `/docs/multi-workers`.
- Support status: full local example; still inspect generated Wrangler output for deployment-critical entrypoint names.

### Case 6: Queues & Crons

- Purpose: queue consumer and scheduled handler coverage in one package.
- File map: `src/fetch.ts`, `src/queue.ts`, `src/scheduled.ts`, `src/lib/**`, `tests/queues.test.ts`.
- Run command: `cd cases/case6 && bun test`.
- What it proves: `cf.queue.trigger()` and `cf.scheduled.trigger()` can drive local handler behavior.
- Docs links: `/docs/bindings/queues`, `/docs/create-test-context`.
- Support status: full local example; production retry timing still belongs to Cloudflare.

### Case 7: Edge Cases

- Purpose: regression coverage for less common runtime and config behavior.
- File map: `src/fetch.ts`, `tests/edge-cases.test.ts`.
- Run command: `cd cases/case7 && bun test`.
- What it proves: selected edge behavior stays covered while public docs stay recipe-first.
- Docs links: `/docs/docs-release-gates`.
- Support status: internal regression case.

### Case 8: Route Modules

- Purpose: route tree dispatch with static, dynamic, and catch-all paths.
- File map: `src/fetch.ts`, `src/routes/index.ts`, `src/routes/users/[id].ts`, `src/routes/api/[...path].ts`, `tests/routing.test.ts`.
- Run command: `cd cases/case8 && bun test`.
- What it proves: route modules and manual dispatch patterns work locally.
- Docs links: `/docs/first-route-tree`, `/docs/http-routing`.
- Support status: full local example.

### Case 9: Monorepo

- Purpose: package-boundary behavior in a workspace with shared code.
- File map: `case9/src/**`, `case9/tests/**`, plus `case9-shared/src/index.ts`.
- Run command: `cd cases/case9 && bun test`.
- What it proves: a case package can consume workspace-local shared code without hiding the deployable Worker boundary.
- Docs links: `/docs/monorepo-turborepo`, `/docs/project-architecture`.
- Support status: full local example.

### Case 10: Path Aliases

- Purpose: TypeScript path alias behavior in Worker builds and tests.
- File map: `src/lib/**`, `src/types/**`, `src/utils/**`, `tests/path-aliases.test.ts`.
- Run command: `cd cases/case10 && bun test`.
- What it proves: aliases stay visible to the Worker build and the Bun test lane.
- Docs links: `/docs/project-architecture`, `/docs/testing-overview`.
- Support status: full local example.

### Case 11: Cross-Package DO

- Purpose: a Worker package binds to a Durable Object class from another package.
- File map: `case11/src/fetch.ts`, `case11/tests/cross-package-do.test.ts`, `case11-do-shared/src/do.session.ts`.
- Run command: `cd cases/case11 && bun test`.
- What it proves: cross-package Durable Object references can be resolved locally.
- Docs links: `/docs/bindings/durable-objects`, `/docs/multi-workers`.
- Support status: full local example.

### Case 12: Email Handlers

- Purpose: inbound email handler testing through the public helper surface.
- File map: `src/email.ts`, `tests/email.test.ts`.
- Run command: `cd cases/case12 && bun test`.
- What it proves: `createTestContext()` can discover the email handler and `cf.email.send()` can invoke it in tests.
- Docs links: `/docs/bindings/send-email`, `/docs/create-test-context`.
- Support status: full helper coverage with Email Routing ingress-fidelity caveat.

### Case 13: Tail Workers

- Purpose: Tail Worker handler testing.
- File map: `src/tail.ts`, `tests/tail.test.ts`.
- Run command: `cd cases/case13 && bun test`.
- What it proves: `cf.tail.trigger()` can invoke a local tail handler and wait for `waitUntil()` work.
- Docs links: `/docs/create-test-context`, `/docs/test-helper-reference`.
- Support status: full helper coverage; live Tail Worker routing is Cloudflare-owned.

### Case 14: Hyperdrive

- Purpose: Hyperdrive binding shape, local connection-string wiring, and conservative local smoke coverage.
- File map: `src/fetch.ts`, `tests/hyperdrive.test.ts`.
- Run command: `cd cases/case14 && bun test`.
- What it proves: the binding is wired, exposes expected connection metadata, and can run against an explicit local database connection string.
- Docs links: `/docs/bindings/hyperdrive`, `/docs/feature-index`.
- Support status: full local when a binding has a local database connection string; hosted pooling, placement, credentials, and production routing stay Cloudflare-owned.

### Case 15: Vectorize & AI

- Purpose: remote-boundary testing for AI and Vectorize.
- File map: `src/fetch.ts`, `tests/ai-vectorize.test.ts`.
- Run command: `cd cases/case15 && bun test`.
- What it proves: remote-gated tests can make missing Cloudflare prerequisites explicit instead of failing opaquely.
- Docs links: `/docs/bindings/ai`, `/docs/bindings/vectorize`, `/docs/test-helper-reference`.
- Support status: remote-gated; requires Cloudflare auth and remote-mode prerequisites.

### Case 16: Workflows

- Purpose: Workflow classes, workflow binding config, and transport behavior.
- File map: `src/wf.data-pipeline.ts`, `src/wf.order-processor.ts`, `src/models.ts`, `src/transport.ts`, `tests/workflow.test.ts`.
- Run command: `cd cases/case16 && bun test`.
- What it proves: Workflow-shaped local examples can exercise class shape and transport logic.
- Docs links: `/docs/bindings/workflows`, `/docs/transport-file`.
- Support status: full local workflow class and trigger coverage; deployed durability, retries, scheduling, and instance history stay Cloudflare-owned.

### Case 17: Plugin Namespace Example

- Purpose: regression coverage for Rolldown plugin namespace behavior.
- File map: `src/fetch.ts`, `tests/rolldown-plugin.test.ts`.
- Run command: `cd cases/case17 && bun test`.
- What it proves: plugin namespace handling keeps working in the Worker build path.
- Docs links: `/docs/project-architecture`.
- Support status: internal regression case.

### Case 18: SvelteKit DO

- Purpose: SvelteKit with Devflare platform glue and a Durable Object binding.
- File map: `svelte.config.js`, `vite.config.ts`, `src/routes/**`, `src/lib/server/**`, `src/do/counter.ts`, `src/hooks.server.ts`, `tests/**`.
- Run command: `cd cases/case18 && bun test`.
- What it proves: framework output can use Devflare-managed local platform bindings.
- Docs links: `/docs/sveltekit-with-devflare`, `/docs/bindings/durable-objects`.
- Support status: full local example.

### Case 19: Transport & DO RPC

- Purpose: custom class round trips through Durable Object RPC-style local calls.
- File map: `src/do.counter.ts`, `src/DoubleableNumber.ts`, `src/transport.ts`, `tests/counter.test.ts`.
- Run command: `cd cases/case19 && bun test`.
- What it proves: `src/transport.ts` can preserve custom classes across local DO method calls.
- Docs links: `/docs/transport-file`, `/docs/bindings/durable-objects`.
- Support status: full local example.
