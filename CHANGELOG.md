# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
