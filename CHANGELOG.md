# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.1.2] - 2026-10-30

### Fixed

- Stop the projects page from adding the site brand before the shared SEO layer adds it. The HTML, Open Graph and Twitter titles now have one brand suffix, including custom brands; page headings, content and article titles are unchanged.
- Add real-build regression coverage for default and custom brands to the existing site test suite. See the [acceptance notes](docs/projects-title-fix-2026-10-30.md).

## [2.1.1] - 2026-10-29

### Security

- Update the site to Astro 7.3.3 and Sharp 0.35.5, with safe compatible Vite, devalue, PostCSS, URI/TOML/YAML parsers, Undici and Zod lockfile versions. Keep Pagefind and Starlight unchanged.
- Update the optional Worker to MCP client/server 2.3.0 and Wrangler 4.153.0, bringing patched Sharp 0.35.5, Undici 7.30.1 and Zod. Preserve current Worker APIs and compatibility date.
- Audit both complete dependency trees in CI, including development dependencies. Fresh local audits report zero known vulnerabilities; exact advisory inventory, version decisions and validation boundaries are in [security upgrade notes](docs/security-upgrade-2026-10-29.md).

### Fixed

- Prevent asset collection from deleting declared source, content or history inputs when paths overlap the generated output, including directory/file symlink aliases. Reject dangerous configurations before cleanup while retaining supported content-root ancestor layouts.
- Include the platform and Sharp/native-codec fingerprint in image cache v3, so an encoder upgrade cannot silently reuse legacy cache results. Public derived URLs remain content-addressed.

### Upgrade notes

- Run `npm ci` and `npm audit` separately for the site and Worker. Regenerate Worker types and rerun offline MCP protocol checks before an instance updates; this release does not deploy an existing Worker.
- Historical product-client/spike records are retained as historical evidence. No new real-model or external product-client acceptance is claimed.

## [2.1.0] - 2026-10-29

### Added

- Site-output audit for internal links, image ALT, inline CSS/data-src resources and page metadata, with deployment-adapter redirect support; editorial length hints stay nonblocking.
- Content-addressed responsive WebP assets, original-URL retention, checksummed publication-history snapshots, EXIF-aware dimensions and versioned image caching. Animated images and SVG retain their format.
- Optional `seoTitle`, authored `feedUpdatedDate` and `pageUpdatedDates`, RSS autodiscovery and a visible subscription link. Collection dates track the newer of member changes and authored dates.
- Self-hosted Spectral Latin fonts with bundled license, active-theme-only hero image loading, and deployment-base rewriting for generated and copied HTML.
- Pagefind integrity manifests and build/verify gates covering file inventory, lengths, SHA-256, entry JSON, language references and compressed payloads; real native and actual-build fault-injection tests in CI.

### Fixed

- Intermittent zero-byte Pagefind entry after the native `writeFiles()`/`close()` sequence. Export through pinned Pagefind 1.5.2 `getFiles()`, then await Node writes and readback verification before accepting a bundle. No delays, retries or patched dependencies.
- Metadata-name case handling in copied legacy HTML, duplicate EXIF-rotated image widths, and a nonexistent default demo project URL.

### Upgrade notes

- Deploy the complete `pagefind/` output including `refined-x-manifest.json`; keep the search artifact gate last when extending Astro integrations. Ask still uses its own JSON search corpus.
- Run `npm ci`, `npm run test:site`, `npm run test:search`, `npm run test:search-build`, `npm run build` and `npm run verify`. The stricter audit may expose existing broken instance links or assets.
- Original image retention and historical optimized-asset snapshots are explicit configuration inputs; generated preview leftovers are not history. Large sites should measure memory usage of the complete Pagefind export.
- Local validation and diagnosis are recorded in [search integrity notes](docs/pagefind-integrity.md). Instance content, hosting redirects, analytics and downstream deployments remain instance-owned.

## [2.0.0] - 2026-09-11

### Removed

- Legacy draft MCP discovery paths `/.well-known/mcp.json`, `/.well-known/mcp/catalog.json`, and `/.well-known/mcp/server-card.json` (builders, fixtures, verify must-exist rules, and llms/about pointers) — **breaking** for clients that still probed those URLs ([#18](https://github.com/tower1229/Refined-X/issues/18); time-boxed early-retirement exception recorded on the issue)
- Site config keys used only by those shapes: `mcp.serverName`, `mcp.packageIdentifier`, `mcp.airIdentifier`, `mcp.discoveryMetaKey` (and the whole `mcp` config object). Static identity for remaining surfaces is `title` / brand only

### Migration

- Prefer configured `ask.mcpUrl` (primary), `/openapi.json`, and `/.well-known/about.json`
- Last **tagged** release that still emitted the legacy discovery files: **1.1.0**
- #14 marked them `legacy-draft-compatibility` on Unreleased/dev only (never tagged); this change removes them under the time-boxed exception on [#18](https://github.com/tower1229/Refined-X/issues/18)
- No `/.well-known/ai-catalog.json` / SEP-2127 path is added in this change
- Core dual-era Worker `POST /mcp` and NLWeb `POST /ask` remain; upgrade the Worker alongside the site when Live Ask is enabled
- Instance overlays that still set retired `mcp` keys are ignored with a console warning
- Do not set `ask.protocolProfile: dual-era` until that instance’s deployment acceptance is recorded; default stays `undeclared`

### Added

- Build-time `public-capabilities` model and `ask.protocolProfile` (`undeclared` default; opt-in `dual-era` after deployment acceptance)
- Capability-aware OpenAPI (conditional Ask/MCP POSTs, full URL reconstruction including path prefixes) and verify helpers (including AWP must-not-exist checks and retired legacy MCP must-not-exist checks)
- Dual-era MCP adapter on Public Ask Worker `POST /mcp` via pinned `@modelcontextprotocol/server@2.0.0` (modern + legacy on one handler / one `ask` tool)
- Worker `PUBLIC_MCP_ORIGIN` Host allowlist for `/mcp`, offline workerd protocol integration (`npm run test:mcp-protocol`)
- MCP request body stream-capped at 16 KiB; final HTTP body bound with cancel/timeout and §6.2/§7.1 protocol coverage in unit + workerd tests
- Product-client support matrix and acceptance records ([#16](https://github.com/tower1229/Refined-X/issues/16)): Claude Code modern + Codex CLI legacy on synthetic mock; extended clients stay `not_run`
- Optional AWP discovery experiment ([#17](https://github.com/tower1229/Refined-X/issues/17)): `discovery.awp` (default off) builds byte-identical `/agent.json` and `/.well-known/agent.json` from shared capabilities (static read actions only; MCP via `protocols.mcp` when dual-era profile is set)

### Changed

- Product-client acceptance final gates: expected protocol path (`modern`/`legacy`) must match all successful business calls; summarize requires `askMode=summarize` + `SearchSummary`; error handling requires `tools/call` 401/403; incomplete/`input_required` results are not success; success phases require CLI exit `0` with no kill signal or spawn error (`null` status fails); truncated SSE bodies are not keyword-guessed as final success
- Site-relative navigation, Ask search (`/api/search-index.json`), and page links use `withBase()` / Astro `BASE_URL` so subpath deploys stay under the configured prefix; SEO canonical/`og:url` strip the deploy base before `absoluteUrl` so the prefix is not doubled
- Product-client acceptance harness hardened: bind gates to `tools/call` + `toolIsError`, require HTTP 401/403 for error handling (no CLI-text false positives), record `gitSha`, run `test:mcp-protocol` for `offlineIntegration`, fail the script on core gate failure; stop defaulting Claude acceptance to a third-party Anthropic-compatible base URL
- OpenAPI Ask documents buffered SSE (`text/event-stream`) alongside JSON; MCP documents conditional protocol headers and `202`/`401` without making modern headers globally required
- Site absolute URLs and Astro `base` derive from `site` pathname so subpath deployments keep Profile / Markdown / OpenAPI / AWP prefixes consistent
- AWP #17 follow-up: plan/README sync for `discovery.awp`, shared phase-1 action allowlist, drop unused `search_index` entity, and tighten static-API output-key fixture contract
- Verify forbids `/.well-known/ai-catalog.json` in dist alongside retired legacy MCP discovery paths
- `/.well-known/about.json` no longer exposes retired catalog/server-card/`mcp.json` URL fields
- Illegal `ask.*` URLs, unknown `protocolProfile`, and Ask/MCP pathnames that collide with static OpenAPI paths fail during site config load
- Hand-rolled MCP initialize/tools dispatcher removed; domain auth/quota codes live in tool error content with HTTP status remapping (no string JSON-RPC business codes)
- README ZH/EN and deploy docs distinguish CI-verified dual-era MCP from product-client matrix statuses (`passed` vs `not_run`)
- Ask UI treats incomplete NLWeb SSE (stream ended without a complete event) as an explicit `incomplete_stream` error with locale copy

### Dependencies

- Site: Astro 7.3.x / Starlight 0.42.x and related lockfile bumps merged on `main` before this tag
- Worker: wrangler / undici / sharp lockfile bumps for `examples/public-ask-worker`

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
[2.0.0]: https://github.com/tower1229/Refined-X/releases/tag/v2.0.0
[2.1.0]: https://github.com/tower1229/Refined-X/releases/tag/v2.1.0
[2.1.1]: https://github.com/tower1229/Refined-X/releases/tag/v2.1.1
[2.1.2]: https://github.com/tower1229/Refined-X/releases/tag/v2.1.2
