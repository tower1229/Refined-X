# Deploy notes

## End-user templates

- Static hosting (GitHub Pages workflow + Cloudflare Pages): [`docs/deploy-static.md`](../docs/deploy-static.md)
- Copyable Pages workflow: [`user-github-pages.yml`](./user-github-pages.yml)
- Optional Live Ask Worker: [`docs/deploy-live-ask.md`](../docs/deploy-live-ask.md)

## Maintainer demo (GitHub Pages)

Themes Portal demo at **https://demo.refined-x.com** — exact build of this repo’s sample `content/`, not a generic end-user recipe.

### One-time DNS

At the DNS host for `refined-x.com`, add:

| Type | Name | Target |
|------|------|--------|
| `CNAME` | `demo` | `tower1229.github.io` |

Then in GitHub → **Settings → Pages**: source = GitHub Actions; custom domain = `demo.refined-x.com`; enable HTTPS.

### How it builds

Workflow [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml) loads [`github-pages.config.mjs`](./github-pages.config.mjs) via `REFINED_X_INSTANCE_CONFIG`, builds, writes `dist/CNAME`, and deploys. Template defaults stay `https://example.com` with no `base`.
