# Deploy a static Refined-X site

Refined-X builds to a static `dist/` directory (`npm run build`). No Astro adapter is required. Start here; add [Live Ask](deploy-live-ask.md) only when you need conversational retrieval.

Requires **Node.js 24+**.

## Path A — GitHub Pages

1. Create a repository from the [GitHub template](https://github.com/new?template_name=Refined-X&template_owner=tower1229), or clone and push your own remote.
2. Edit `site.config.mjs` or add `instance.config.mjs` so `site` is your real URL (for example `https://youruser.github.io/your-repo` or a custom domain).
3. Copy [`deploy/user-github-pages.yml`](../deploy/user-github-pages.yml) to `.github/workflows/deploy-pages.yml` in your repository.
4. In GitHub → **Settings → Pages**, set **Source** to **GitHub Actions**.
5. Push to `main` (or run the workflow manually). The site deploys from the `dist` artifact.

### Custom domain (optional)

- Add a `CNAME` file under `public/` (so it is copied into `dist`), or write `dist/CNAME` in the workflow after build.
- Point DNS at GitHub Pages and configure the custom domain under **Settings → Pages**.

### Using an instance overlay in CI

Uncomment the `env` block on the Build step in the user workflow and set `REFINED_X_INSTANCE_CONFIG` to your overlay path.

## Path B — Cloudflare Pages

1. In the [Cloudflare dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** → connect your GitHub repository.
2. Build settings:

| Setting        | Value           |
| -------------- | --------------- |
| Framework preset | None         |
| Build command  | `npm run build` |
| Build output directory | `dist`  |
| Node.js version | `24`           |

3. Set environment variables if needed (`REFINED_X_INSTANCE_CONFIG` is a local file path — prefer committing `instance.config.mjs` or baking config into the repo rather than relying on absolute CI paths).
4. Deploy. HTTPS and previews are handled by Cloudflare Pages.

Official reference: [Cloudflare Pages — Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/).

## Any other static host

Anything that can serve the contents of `dist/` works (Netlify, S3+CDN, nginx, etc.). Build command and output directory are the same: `npm run build` → `dist`.

## Before you ship

```sh
npm run check
npm run test:public-ask
npm run test:related
npm run build
npm run verify
```

## Troubleshooting (static)

| Symptom | Check |
| ------- | ----- |
| Wrong canonical URLs / empty sitemap hosts | `site` in `site.config.mjs` / instance overlay must match the public origin |
| `verify` fails after build | Read the failure list from `npm run verify`; often a missing route or locale mismatch in JSON-LD |
| Assets 404 on project Pages (`/repo/` base) | Configure Astro/`site` and any `base` path for project sites; user Sites on a root custom domain usually need no `base` |
| Build needs Node APIs missing on older runners | Use Node 24 (see `.nvmrc`) |

Maintainer-only demo hosting for `demo.refined-x.com` is documented in [`deploy/README.md`](../deploy/README.md).
