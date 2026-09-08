# Batch 0 evidence: Dual-era MCP SDK spike

**Issue:** [#12](https://github.com/tower1229/Refined-X/issues/12)  
**Date:** 2026-09-08  
**Result:** **PASS** — pin `@modelcontextprotocol/server@2.0.0` and proceed to batches A/B.

## Pinned packages (Worker package only)

| Package | Role | Version | Lockfile integrity |
|---|---|---|---|
| `@modelcontextprotocol/server` | runtime | `2.0.0` | `sha512-YhHWdHfpFMQfd0prsEnxKeS3Qz3ytIGmsS0sth4KDjnacIT7hxk6hXHkJ9KysxlkvTM+WZAtQbbcUhdoP4Hvtw==` |
| `@modelcontextprotocol/core` | transitive of server | `2.0.0` | from Worker lockfile |
| `zod` | peer of server (`^4.2.0`) | resolved via server | from Worker lockfile |
| `@modelcontextprotocol/client` | **devDependency** (test client only) | `2.0.0` | from Worker lockfile |
| Schema validator | `@modelcontextprotocol/server/validators/cf-worker` → `CfWorkerJsonSchemaValidator` + `fromJsonSchema` | exercised under workerd | |

Site / root `package.json` does **not** depend on the Worker SDK. Shared Astro install is unaffected (no Worker `node_modules` required).

## Reusable offline commands

```sh
cd examples/public-ask-worker
npm ci
npm run test:mcp-sdk-spike
npm run bundle:mcp-sdk-spike
```

`test:mcp-sdk-spike` boots the synthetic Worker via Wrangler `unstable_dev` (workerd local HTTP). No production routes, D1, AI Search, or model calls.

## Findings for batch B

1. **Published `2.0.0` has no `maxRequestBodySize` option** in installed `CreateMcpHandlerOptions` (online API docs mention it; package DTS/runtime do not). Spike enforces **16 KiB** by reading the body first, returning **413**, then passing `parsedBody` into `handler.fetch`.
2. **Auth/quota HTTP remapping** works for modern JSON and legacy SSE when the outer layer buffers the SDK final response and applies a per-request outcome (`AsyncLocalStorage`). Concurrent 401/403/429 do not cross-contaminate. Spike covers both synthetic `auth` tool args and `Authorization: Bearer …` / anonymous summarize→403 mapping; real Key/`runPreAuthChecks` stay for batch B.
3. **Modern requests** require matching `MCP-Protocol-Version`, `Mcp-Method`, and (for `tools/call`) `Mcp-Name`; mismatch → `-32020` without entering ask.
4. **Legacy unsupported initialize** counter-offers `2025-11-25`; `notifications/initialized` → **202** empty body.
5. **Cancel:** client abort is verified not to hang; tool entry may or may not occur depending on race — recorded as bounded behavior, not as production cancel semantics.
6. One alternate candidate was **not** required; primary pin passed.

## Acceptance matrix

| Criterion | Status |
|---|---|
| Exact server version + lockfile integrity on Worker package | PASS |
| Schema validator real I/O under workerd HTTP | PASS (`fromJsonSchema` + CfWorker input/output) |
| One factory, one ask; modern discover/list/call | PASS |
| Legacy 2025-11-25 / 2025-06-18 / 2025-03-26 + notification | PASS |
| Unsupported version + header/body mismatch skip ask | PASS |
| Entry defaults / Unicode trim / mode / extension reject | PASS (spike subset; full shared contract in batch A) |
| Auth/quota status mapping (synthetic), concurrency, CORS, 16 KiB, 128 KiB response, cancel, legacy SSE | PASS |
| Protocol probes ask=0; successful tool call ask=+1 | PASS |
| Evidence + reusable CI command | PASS |
| On failure stop A/B | N/A (passed) |

## Gaps deferred to batch A/B (not blockers)

- Full §7.1 matrix on shared contract (null prefer, wrong meta.version, non-empty context) after shared extraction.
- Real API Key / preAuth / Turnstile paths on production `/mcp`.
- Content-Length spoof / chunked oversize matrix beyond whole-body 413.
- Stronger cancel/timeout resource-cleanup assertions once production handler wiring exists.

## Test log (representative)

```text
npm run test:mcp-sdk-spike
ℹ pass … (see CI / local run)
ℹ fail 0
```
