# Roadmap

Public product roadmap for Refined-X. For positioning and marketing notes, see [`docs/Roadmap.md`](docs/Roadmap.md).

## Done

- Static-first personal site with editorial UI (Astro + Starlight)
- Agent-readable surfaces: Markdown mirrors, `llms.txt`, JSON APIs, OpenAPI, well-known discovery
- Content independence via `contentRoot` / instance config overlays
- Optional Public Ask Worker (NLWeb `/ask`, MCP `ask`, health)
- Listed on [Astro Themes](https://astro.build/themes/details/refined-x/); Live Ask on the sample [demo](https://demo.refined-x.com)
- CI quality gates, Contributing/Security docs, and static deploy guides (v1.0.0)

## Now

- Lower adoption friction: clearer deploy paths, troubleshooting, and first-run docs
- Polish bilingual docs and i18n edge cases in machine-readable outputs
- Collect real “Built with Refined-X” sites and implementation reports

## Later

- Extract machine-publish surfaces as an Astro Integration (working title `@refined-x/agent-surface`)
- Community gallery / Built-with showcase page
- Graduate MCP catalog metadata from `draft` when discovery patterns stabilize

## Not planned

- Hosted CMS or managed multi-tenant hosting
- Private personal agent / long-term memory as a core product promise
- Guaranteeing that every agent client will auto-discover and call the site
