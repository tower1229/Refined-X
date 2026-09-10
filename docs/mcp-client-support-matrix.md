# MCP client support matrix

**Issue:** [#16](https://github.com/tower1229/Refined-X/issues/16)  
**Machine-readable source:** [`examples/public-ask-worker/test/product-clients/support-matrix.json`](../examples/public-ask-worker/test/product-clients/support-matrix.json)

This matrix separates **offline dual-era integration** (CI) from **product-client acceptance**. A capability is marketing-eligible only when the corresponding record marks the core gates `passed` and `marketingClaimAllowed` is true. Rows marked `not_run` must not be described as verified support.

## Harness reliability (2026-09-10)

Acceptance gates now require:

- Successful `tools/call` with HTTP 200 **and** `toolIsError === false` (business failures are not “passed”)
- Error handling: HTTP 401/403 on an authorized request **and** no retrieval (`searchCalls === 0`); CLI text alone never passes
- `observedProtocolVersion` from successful business `tools/call` only (probe/discover is not enough)
- `offlineIntegration.status` from an actual `npm run test:mcp-protocol` run in the acceptance script, with `gitSha`
- Non-zero process exit when any core gate or offline integration fails
- Summarize gate does **not** assert answer text — only auth + successful tool result on the synthetic mock

**Credential safety:** `run-acceptance.mjs` does **not** default `ANTHROPIC_BASE_URL` to a third-party host. Use your normal Anthropic/Claude auth, or set `ANTHROPIC_BASE_URL` + matching token/model env vars **explicitly** if you intentionally use another Anthropic-compatible endpoint. Temporary MCP/config dirs use mode `0700` / files `0600` and are removed in `finally`.

Do not run `npm run test:product-clients` with production secrets until you have reviewed the script env behavior above.

## Offline integration (CI)

| Check | Status | Command / job |
| --- | --- | --- |
| Dual-era workerd HTTP integration (no remote AI Search / production credentials) | see `support-matrix.json` → `offlineIntegration` | `npm run test:mcp-protocol` in `examples/public-ask-worker` — CI job `worker` / step “MCP protocol integration” |
| Acceptance record schema + gate predicates | **passed** (unit) | `npm run test:product-client-records` |

Clean checkout reproduction: root `npm ci` (site job) + Worker `npm ci` (worker job). Both lockfiles are exercised on every PR / `main` push.

**Status layers (do not conflate):**

1. Harness hardened (predicate unit tests + credential defaults)
2. Synthetic product-client records re-run under hardened gates — see core table / `gitSha` on records (`837ba03…` as of 2026-09-10 re-run)
3. Staging / production model smoke — still separate; never rewrite absence as `passed`

## Core product-client gates

| Client | Path | Record | toolDiscovery | anonymousList | authenticatedSummarize | errorHandling |
| --- | --- | --- | --- | --- | --- | --- |
| Claude Code `2.1.228` | modern (`MCP_SDK_GENERATION=v2`, `MCP_PROTOCOL_NEGOTIATION=auto`) → observed `2026-07-28` | [claude-code-modern.json](../examples/public-ask-worker/test/product-clients/records/claude-code-modern.json) | passed | passed | passed | passed |
| Codex CLI `0.153.4` | legacy (`features.mcp_2026_07_28=false`) → observed `2025-06-18` | [codex-legacy.json](../examples/public-ask-worker/test/product-clients/records/codex-legacy.json) | passed | passed | passed | passed |

Core records re-validated **2026-09-10** on `gitSha` `837ba03fe965958c451c5dbde22559d23bfae851` under hardened gates. Synthetic mock Worker backend — empty retrieval / no-reference summarize; **not** production model acceptance. The Claude Code agent loop in checked-in evidence used `deepseek-v4-pro` via local Claude settings; that does **not** change the MCP server-trace gates and must not be marketed as Anthropic first-party model verification.

- `examples/public-ask-worker/test/product-clients/evidence/claude-code-modern/` — per-phase `01/02/03-server-trace.json` plus stream transcripts
- `examples/public-ask-worker/test/product-clients/evidence/codex-legacy/` — per-phase `04/05/06-server-trace.json` plus CLI transcripts

Do not treat a single merged `server-trace.json` as the current layout. Records include `gitSha` binding the tree under test.

Re-run (requires local Claude Code + Codex CLIs and auth for their agent models):

```sh
cd examples/public-ask-worker
npm run serve:product-clients   # terminal A
npm run test:product-clients    # terminal B (also re-runs test:mcp-protocol and writes gitSha)
```

Optional third-party Anthropic-compatible endpoint (explicit only):

```sh
export ANTHROPIC_BASE_URL=https://example-compatible.example/anthropic
export ANTHROPIC_AUTH_TOKEN=...   # or ANTHROPIC_API_KEY
export ANTHROPIC_MODEL=...        # and optional ANTHROPIC_DEFAULT_*_MODEL
npm run test:product-clients
```

## Extended matrix (`not_run` — do not market as verified)

| Client / environment | Record |
| --- | --- |
| Gemini CLI | [gemini-legacy.json](../examples/public-ask-worker/test/product-clients/records/gemini-legacy.json) |
| Cursor | [cursor.json](../examples/public-ask-worker/test/product-clients/records/cursor.json) |
| OpenAI Responses API remote MCP | [openai-responses-api.json](../examples/public-ask-worker/test/product-clients/records/openai-responses-api.json) |
| Claude Code platform exceptions (Bedrock / Foundry / etc.) | [claude-platform-exceptions.json](../examples/public-ask-worker/test/product-clients/records/claude-platform-exceptions.json) |

## Claims policy

- Worker dual-era `/mcp` behavior is proven by offline CI integration.
- Product marketing may cite Claude Code modern and Codex CLI legacy only as recorded above, with the synthetic-mock backend label and matching `gitSha`.
- Do not claim Anthropic first-party agent-model verification from a run whose evidence shows another model (e.g. DeepSeek).
- Staging / production model smoke remains a separate controlled item; absence of that run must not be rewritten as `passed`.
- Set `ask.protocolProfile: "dual-era"` on an instance only after that instance’s Worker + static docs combo is accepted.
