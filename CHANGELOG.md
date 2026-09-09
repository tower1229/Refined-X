# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed

- Legacy draft MCP discovery paths `/.well-known/mcp.json`, `/.well-known/mcp/catalog.json`, and `/.well-known/mcp/server-card.json` (builders, fixtures, verify must-exist rules, and llms/about pointers) — **breaking** for clients that still probed those URLs ([#18](https://github.com/tower1229/Refined-X/issues/18); time-boxed early-retirement exception recorded on the issue)
- Site config keys used only by those shapes: `mcp.serverName`, `mcp.packageIdentifier`, `mcp.airIdentifier`, `mcp.discoveryMetaKey` (and the whole `mcp` config object). Static identity for remaining surfaces is `title` / brand only

### Migration

- Prefer configured `ask.mcpUrl` (primary), `/openapi.json`, and `/.well-known/about.json`
- Last **tagged** release that still emitted the legacy discovery files: **1.1.0**
- #14 marked them `legacy-draft-compatibility` on Unreleased/dev only (never tagged); this change removes them under the time-boxed exception on [#18](https://github.com/tower1229/Refined-X/issues/18)
- No `/.well-known/ai-catalog.json` / SEP-2127 path is added in this change
- Core dual-era Worker `POST /mcp` and NLWeb `POST /ask` are unchanged

### Added

- Build-time `public-capabilities` model and `ask.protocolProfile` (`undeclared` default; opt-in `dual-era` after deployment acceptance)
- Capability-aware OpenAPI (conditional Ask/MCP POSTs, full URL reconstruction including path prefixes) and verify helpers (including AWP must-not-exist checks and retired legacy MCP must-not-exist checks)
- Dual-era MCP adapter on Public Ask Worker `POST /mcp` via pinned `@modelcontextprotocol/server@2.0.0` (modern + legacy on one handler / one `ask` tool)
- Worker `PUBLIC_MCP_ORIGIN` Host allowlist for `/mcp`, offline workerd protocol integration (`npm run test:mcp-protocol`)
- MCP request body stream-capped at 16 KiB; final HTTP body bound with cancel/timeout and §6.2/§7.1 protocol coverage in unit + workerd tests
- Product-client support matrix and acceptance records ([#16](https://github.com/tower1229/Refined-X/issues/16)): Claude Code modern + Codex CLI legacy on synthetic mock; extended clients stay `not_run`
- Optional AWP discovery experiment ([#17](https://github.com/tower1229/Refined-X/issues/17)): `discovery.awp` (default off) builds byte-identical `/agent.json` and `/.well-known/agent.json` from shared capabilities (static read actions only; MCP via `protocols.mcp` when dual-era profile is set)

### Changed

- AWP #17 follow-up: plan/README sync for `discovery.awp`, shared phase-1 action allowlist, drop unused `search_index` entity, and tighten static-API output-key fixture contract
- Instance overlays that still set retired `mcp` keys are ignored with a console warning (#18 follow-up)
- Verify forbids `/.well-known/ai-catalog.json` in dist alongside retired legacy MCP discovery paths
- `/.well-known/about.json` no longer exposes retired catalog/server-card/`mcp.json` URL fields
- Illegal `ask.*` URLs, unknown `protocolProfile`, and Ask/MCP pathnames that collide with static OpenAPI paths fail during site config load
- Hand-rolled MCP initialize/tools dispatcher removed; domain auth/quota codes live in tool error content with HTTP status remapping (no string JSON-RPC business codes)
- README ZH/EN and deploy docs distinguish CI-verified dual-era MCP from product-client matrix statuses (`passed` vs `not_run`)

## [1.1.0] - 2026-09-01

### Added

- Optional giscus comments on article pages through four public instance configuration fields
- Stable per-article discussion mapping, locale-aware copy, lazy loading, and synchronized light/dark themes
- Build-time validation for partial comment configuration and generated-surface verification

### Changed

- Article footers now reserve a restrained editorial discussion area when comments are configured

## [1.0.0] - 2026-07-31

First stable release of Refined-X as an agent-ready personal publishing starter.

### Added

- Editorial static site from Markdown/YAML (`content/`) with articles, series, projects, answers, and profile surfaces
- Machine-readable outputs: per-page Markdown mirrors, `llms.txt` / `llms-full.txt`, JSON APIs, OpenAPI, and well-known discovery documents
- Optional Live Ask via the reference Cloudflare Worker (`examples/public-ask-worker`): NLWeb-compatible `POST /ask`, Streamable HTTP MCP `ask`, and `/health`
- Content independence: `contentRoot`, `publicDir`, `outDir`, and `instance.config.mjs` / `REFINED_X_INSTANCE_CONFIG` overlays
- Locale packs (`en`, `zh-CN`), light/dark themes, and static Ask search without a backend
- Quality gates: `astro check`, Node test suites, post-build `verify`, and GitHub Actions CI
- End-user static deploy guides (GitHub Pages workflow template, Cloudflare Pages settings) and Live Ask troubleshooting docs
- Trust assets: Changelog, Contributing, Security policy, Issue/PR templates, and a public product roadmap

### Known limitations

- The MCP catalog under `/.well-known/mcp/` remains marked **draft**; treat discovery metadata as advisory, not a guarantee of automatic client pickup
- Live Ask is an optional sibling deploy (Cloudflare AI Search, Gateway, D1, Turnstile); it is not required for the static site
- Live Ask does not provide long-term memory, arbitrary tool actions, elicitation, or impersonation of the site owner

[1.0.0]: https://github.com/tower1229/Refined-X/releases/tag/v1.0.0
[1.1.0]: https://github.com/tower1229/Refined-X/releases/tag/v1.1.0
