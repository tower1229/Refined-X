# Projects title acceptance — v2.1.2

## Scope

The projects page supplied an already branded title to the shared SEO layer,
which appended the brand again. Pass `brand.projects.titleSuffix` directly from
the page; keep `normalizeSeoHead`, article titles, headings and page content
unchanged. No dependency or Worker changes are included.

## Regression evidence

`scripts/seo-build.test.mjs` runs real Astro builds and standalone verification
with the sample corpus. It checks `<title>`, `og:title` and `twitter:title`, the
projects heading/lede/cards, a normal writing-page title and an article whose
authored title already contains the words “Refined-X”. Both fixtures run through
the existing `npm run test:site` CI step.

| Fixture | Before (failed) | After (passed) |
| --- | --- | --- |
| Default brand, root site | `Projects｜Refined-X｜Refined-X` | `Projects｜Refined-X` |
| Custom brand, `/blog/` site | `Selected Work｜Studio & Research｜Studio & Research` | `Selected Work｜Studio & Research` |

The custom page deliberately has a different H1 (`Project Library`) and lede.
All three metadata titles match the expected literal and occur exactly once.
The article remains `Welcome to Refined-X｜Refined-X` under the default brand;
brand words in authored content are not stripped.

Before/after normalized main-text SHA-256 values are identical:

- Default: `da35bb268e216494c5f75fc9c4f20a82eb225ee61253dcecd3bf421cdd1ad527`
- Custom: `f824dfe7d7cb19d255e96383ee3f13fb5fa2932b09f429534e5be503eff844eb`

## Local checks

Node 24.22.1 / npm 11.19.1, baseline commit
`52f23c667b0cde167ff68001772a3e501061997e`:

- `node --test scripts/seo-build.test.mjs`: both fixtures fail before the fix
  on duplicate titles; both pass afterward (3 Node test entries including the parent).
- `npm run test:site`: 31 tests pass, including the real-build regression.
- `npm run check`: 126 files, 0 errors, 0 warnings, 4 existing hints.
- `npm run build` and `npm run verify`: 23 HTML pages, 0 failures,
  28 nonblocking editorial warnings.
- Lockfile comparison: only the root package version changes; dependency tree
  is identical to v2.1.1.
- `git diff --check` with the repository's CRLF-aware whitespace settings passes.

Local logs and the before/after comparison are retained in
`/private/tmp/refined-x-v2.1.2-20261030/`. CI and demo deployment receipts are
recorded with the release, separately from these local results. The downstream
blog must sync and publish the template before claiming the production fix.
