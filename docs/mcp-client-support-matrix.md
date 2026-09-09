# MCP client support matrix

**Issue:** [#16](https://github.com/tower1229/Refined-X/issues/16)  
**Machine-readable source:** [`examples/public-ask-worker/test/product-clients/support-matrix.json`](../examples/public-ask-worker/test/product-clients/support-matrix.json)

This matrix separates **offline dual-era integration** (CI) from **product-client acceptance**. A capability is marketing-eligible only when the corresponding record marks the core gates `passed` and `marketingClaimAllowed` is true. Rows marked `not_run` must not be described as verified support.

## Offline integration (CI)

| Check | Status | Command / job |
| --- | --- | --- |
| Dual-era workerd HTTP integration (no remote AI Search / production credentials) | **passed** | `npm run test:mcp-protocol` in `examples/public-ask-worker` — CI job `worker` / step “MCP protocol integration” |
| Acceptance record schema | **passed** | `npm run test:product-client-records` |

Clean checkout reproduction: root `npm ci` (site job) + Worker `npm ci` (worker job). Both lockfiles are exercised on every PR / `main` push.

## Core product-client gates

| Client | Path | Record | toolDiscovery | anonymousList | authenticatedSummarize | errorHandling |
| --- | --- | --- | --- | --- | --- | --- |
| Claude Code `2.1.228` | modern (`MCP_SDK_GENERATION=v2`, `MCP_PROTOCOL_NEGOTIATION=auto`) → observed `2026-07-28` | [claude-code-modern.json](../examples/public-ask-worker/test/product-clients/records/claude-code-modern.json) | passed | passed | passed | passed |
| Codex CLI `0.153.4` | legacy (`features.mcp_2026_07_28=false`) → observed `2025-06-18` | [codex-legacy.json](../examples/public-ask-worker/test/product-clients/records/codex-legacy.json) | passed | passed | passed | passed |

Evidence directories (synthetic mock Worker backend — empty retrieval / no-reference summarize; **not** production model acceptance):

- `examples/public-ask-worker/test/product-clients/evidence/claude-code-modern/`
- `examples/public-ask-worker/test/product-clients/evidence/codex-legacy/`

Re-run (requires local Claude Code + Codex CLIs and auth for their agent models):

```sh
cd examples/public-ask-worker
npm run serve:product-clients   # terminal A
npm run test:product-clients    # terminal B
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
- Product marketing may cite Claude Code modern and Codex CLI legacy only as recorded above, with the synthetic-mock backend label.
- Staging / production model smoke remains a separate controlled item; absence of that run must not be rewritten as `passed`.
- Set `ask.protocolProfile: "dual-era"` on an instance only after that instance’s Worker + static docs combo is accepted.
