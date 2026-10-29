# Search artifact integrity

Refined-X owns Pagefind disk publication through `scripts/search-index.mjs`.
This does not change the Ask UI's separate `/api/search-index.json` corpus.

## Diagnosis (2026-10-29)

The original Starlight sequence was `createIndex → addDirectory → writeFiles → close`.
On macOS with Node 24.22.1, Astro 7.3.2, Starlight 0.42.0 and Pagefind 1.5.2,
8 of 100 independent native runs returned `errors: []` but left a zero-byte
`pagefind-entry.json`. Failed directories were preserved for inspection.
A second, dependency-locked probe found 1/100 failures immediately after close;
that file was still empty after 100 ms. Reading the file before closing changed
the timing and produced 0/100 failures. Memory export produced 0/100 failures.
One earlier probe interrupted by dependency installation is excluded from these counts.

The evidence supports a native write/close race: Pagefind 1.5.2's Rust writer
awaits Tokio `write_all`, without `flush`, while its Node service's `close()`
kills the backend process. Tokio documents that dropping a file need not wait for
pending I/O. A success response alone therefore does not establish durable output.
Sources: [Pagefind writer at v1.5.2](https://github.com/CloudCannon/pagefind/blob/v1.5.2/pagefind/src/output/mod.rs),
[Tokio File](https://docs.rs/tokio/latest/tokio/fs/struct.File.html),
[Pagefind Node API](https://pagefind.app/docs/node-api/).

## Publication contract

1. Generate through the pinned public `getFiles()` API; transfer the complete bundle
   before closing the native process. No native filesystem writes remain to race with close.
2. Validate nonempty files, safe unique paths, valid entry JSON and languages,
   referenced language metadata/WASM, and compressed Pagefind payloads.
3. Await Node writes into a sibling staging directory. Record the exact inventory,
   byte lengths and SHA-256 values in `refined-x-manifest.json` and verify every byte.
4. Replace the old output only after staging verification; verify again after moving it.
   Failed staging output is retained with its path in the error. There are no retries or sleeps.
5. Run the final Astro build gate after output transforms. Independent `npm run verify`
   repeats inventory, checksum, entry and reference validation against published files.

Keep `searchArtifactGate()` last if adding build integrations. Deploy the entire
`pagefind/` folder; do not omit the integrity manifest. Do not mutate those files
between build and upload without rerunning verification. This is a build-integrity
check, not a cryptographic signature or a guarantee about a remote CDN's contents.
The staging swap is not an uninterrupted serving mechanism: deploy a finished build,
not a directory while it is being rebuilt.

## Regression checks

- `npm run test:search`: 100 real multilingual native exports and immediate closes;
  repeated writes; empty/malformed entries, language references, missing/changed files,
  truncated gzip, stale files, duplicate paths and traversal rejection.
- `npm run test:search-build`: real Astro builds with injected empty entry, malformed
  JSON and missing language metadata. Each must fail both build and standalone verify.
- `npm run test:site`: image orientation/cache/history, date, link and deployment base checks.
- `npm run build && npm run verify`: the default example site and full bundle gates.

Local acceptance covered the isolated default demo and an overlay with
`site: 'https://example.com/blog/'`, each on first and repeated builds. Both generated
23 HTML pages with zero audit failures (28 editorial warnings), and repeated search
manifests were byte-identical. A real Chromium session loaded `pagefind.js`, searched
`external`, and read result fragments containing “Configuring an external content root”
on both deployments; all subpath results retained `/blog/`.
The existing Ask page also returned the expected static article and navigated to its
`/blog/2026/07/02/external-content-root/` page. This was not a live model call.
A separate clean source copy with its own `npm ci` installation passed build and
verify without an instance overlay. Reusing dependencies through a directory symlink
failed Astro's compile-metadata lookup and was excluded from acceptance. The final
site suites passed 120 tests; `astro check` reported zero errors, zero warnings and
four existing hints. Browser checks also confirmed one active-theme image preload,
RSS discovery, no Google Fonts requests, and dark-theme rendering at a 390px viewport.

These results do not establish Windows compatibility, real-model Ask acceptance,
production traffic improvements, or downstream instance/CDN deployment acceptance.
The memory-export approach holds the whole bundle in RAM; large corpora need memory
measurement. Pagefind is pinned because validation includes its current compressed
file format; update that pin only with the native, build-gate and browser checks.
