# Security upgrade: v2.1.1

## Scope and baseline

The requested scope is to resolve upstream dependency alerts, preserve site and Worker
contracts, review the result, and publish an independently verified Refined-X version
before a downstream instance updates. No CangHai content, production Worker, hosting
configuration, or blog deployment is changed by this release.

Baseline: v2.1.0, `a9e7246aca0a0852e70d8530e620cb705d3c99de`.
The earlier push summary reported 22 alerts. A fresh GitHub API inventory on
2026-10-29 contained **52 open alerts**: 33 in the site lockfile and 19 in the Worker
lockfile (24 high, 20 medium, 8 low). npm audit counts affected packages, including
transitive parents, rather than GitHub advisory records: site **15**, Worker **7**.
These counts are not interchangeable. Both development and production dependencies
were included. The Worker's installed Wrangler was 4.106.0 although its lockfile
required 4.131.0; a baseline `npm ci` corrected this before compatibility testing.

## Version decisions

Published package metadata and upstream security advisories determined the upgrade.
Root resolver constraints were used temporarily to choose the following safe releases,
then removed. The final manifests contain no overrides; normal installation and
`npm ls --all` validate the declared dependency ranges. No audit dismissal, severity
suppression, `audit fix --force`, or dependency source patch was used.

| Dependency / path | Previous lock | New lock | Reason and primary source |
| --- | --- | --- | --- |
| Astro | 7.3.2 | 7.3.3 | [View Transition CSS injection](https://github.com/withastro/astro/security/advisories/GHSA-mpr7-6m5w-76rw) |
| Astro → Vite | 8.1.0 | 8.1.6 | [filesystem allowlist bypass](https://github.com/vitejs/vite/security/advisories/GHSA-rq7h-c2jc-7f22), plus four other Vite/editor advisories in the inventory |
| Astro → devalue | 5.8.1 | 5.9.3 | [shared-memory serialization](https://github.com/sveltejs/devalue/security/advisories/GHSA-j22f-vq7h-c4qm) and related serialization/validation advisories |
| PostCSS | 8.5.15 | 8.5.23 | [source map file disclosure](https://github.com/postcss/postcss/security/advisories/GHSA-fxqj-rqcc-2cmp) |
| PostCSS → source-map-js | 1.2.1 | 1.2.2 | [indexed source-map offsets](https://github.com/7rulnik/source-map-js/issues/76) |
| postcss-selector-parser | 6.1.4 | 6.1.5 | [flat selector complexity](https://github.com/postcss/postcss-selector-parser/security/advisories/GHSA-rj75-hqrm-r3gf) |
| fast-uri | 3.1.7 | 3.1.9 | [scheme normalization](https://github.com/fastify/fast-uri/security/advisories/GHSA-w74x-v6f9-j3xg) and related URI confusion advisories |
| Astro → smol-toml | 1.8.0 | 1.9.0 | [quadratic parse cost](https://github.com/squirrelchat/smol-toml/security/advisories/GHSA-r4xh-jqrq-34v2) |
| Site Undici | 8.10.2 | 8.12.2 | [redirect/cache origin confusion](https://github.com/nodejs/undici/security/advisories/GHSA-4w7w-5xrc-9h26) and seven other advisories |
| Sharp, site and Worker | 0.35.4 | 0.35.5 | [librsvg security fix](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w); retain SVG support using patched binaries |
| Zod, site / Worker | 4.6.2 / 4.5.4 | 4.6.6 / 4.6.7 | [constrained collection validation](https://github.com/colinhacks/zod/pull/6475) |
| @astrojs/check → language-server → YAML | 2.16.10 → YAML 2.7.1 | 2.16.11 → YAML 2.8.3 | Parent patch selects volar-service-yaml 0.0.71 and yaml-language-server 1.23.0; [YAML advisory](https://github.com/advisories/GHSA-48c2-rrv3-qjmp) |
| MCP client/server | 2.0.0 | 2.3.0 | [client cross-origin redirects](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-6prh-2h8m-c8cw), [server isolation](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-jm63-cq47-j5jp), and other SDK request/auth/validation fixes |
| Wrangler → Miniflare | 4.131.0 → 5.20260910.0-alpha | 4.153.0 → 5.20261023.0-beta | First inspected Wrangler release carrying both Sharp 0.35.5 and Undici 7.30.1; 4.149–4.152 still carried Undici 7.29.1 |
| Worker Undici | 7.29.0 | 7.30.1 | Fixes the 7.x ranges of the [Undici advisories](https://github.com/nodejs/undici/security/advisories) without forcing a major version into Miniflare |

Pagefind 1.5.2 and Starlight 0.42.0 remain unchanged. No Pagefind publication code or
manifest ordering change is part of this security release. Root Sharp declarations
now share the bounded `^0.35.5` range instead of leaving a duplicate open-ended range.

## Exposure and compatibility

The published blog is static. Astro, Vite, image conversion and editor-language
services run in the build/development environment; their presence is not proof that
an arbitrary remote visitor can exploit the static output. Build tools still process
content and must receive security fixes. Sharp's announcement specifically discusses
its bundled librsvg and Linux runtime conditions; local macOS testing alone does not
establish Linux behavior.

MCP server and Zod are Worker runtime dependencies. Existing code creates a server
per request, checks authentication and caps incoming MCP bodies at 16 KiB. Those
controls reduce some exposure but do not substitute for the SDK fixes. SDK 2.3.0
works with the current factory, validator, stateless legacy mode, and JSON response
API: no source-level API adaptation was required. The SDK client is a test dependency.
Wrangler/Miniflare are local tooling; the compatibility date remains 2026-07-02.

Instances must separately install their Worker lockfile, regenerate local types,
and rerun tests. This template release does not update a running Worker. Historical
2.0.0 spike/product-client records remain historical; passing record-schema checks
is not fresh acceptance of actual Claude/Codex clients on SDK 2.3.0.

## Asset safety during the native upgrade

Cache v3 fingerprints platform, architecture, Sharp and all reported native-library
versions in addition to source bytes and encoding options. A regression first reproduced
reuse of an incompatible v2 entry, then confirmed that upgraded-cache, cold-cache and
warm-cache outputs agree. Five repository images / 16 variants were also encoded with
Sharp 0.35.4/libvips 8.18.6 and Sharp 0.35.5/libvips 8.18.7: their payloads were identical
on this macOS host. That sample does not establish equality for every image or platform;
the fingerprint prevents stale encoder results from controlling a new build.

Final review also reproduced destructive collector configurations: a source directory
inside, equal to, or containing `publicDir/asset`, and declared history/content inputs
inside that output. Cleanup could remove source bytes before a later read failed.
Before any removal, the collector now resolves real paths (including existing parents
of not-yet-created outputs), rejects overlapping asset roots, and checks selected source
files, Markdown inputs and history manifest/blob paths for aliases into the output.
Content roots containing the public directory remain valid. CLI regressions check
original bytes survive rejection and nonoverlapping cold/warm collection still works.

## Validation and release gates

- Fresh installs and actual dependency trees for both packages; full npm audit
  reports zero known vulnerabilities in both final lockfiles at verification time.
- Every one of the 52 baseline GitHub alerts is mapped to resolved lockfile versions
  outside its vulnerable range, including duplicate occurrences.
- Site: 134 tests across public Ask, related articles, comments, assets, native Pagefind,
  and injected build-failure tests; typecheck; root and `/blog/` builds and verify.
- Worker: 145 tests, 19 record tests, 11 local workerd protocol tests, regenerated
  types/TypeScript, and Wrangler deploy **dry run**. No remote Worker deploy or model call.
- CI now runs full `npm audit --audit-level=low` in each package. A new advisory or
  registry outage can block it; the check does not silently ignore development dependencies.

Before publishing, run the current-head CI and inspect GitHub's actual alert states.
A zero local audit does not itself prove GitHub has marked alerts fixed, and neither
result guarantees freedom from unknown vulnerabilities. Release receipts record the
actual commit, remote refs, CI, deployment and alert status separately.
