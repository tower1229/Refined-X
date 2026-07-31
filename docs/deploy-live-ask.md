# Deploy Live Ask (optional)

Live Ask is a **sibling** Cloudflare Worker. The static Refined-X site works without it; `/ask` falls back to curated static Answers search.

Full package notes: [`examples/public-ask-worker/README.md`](../examples/public-ask-worker/README.md).

This guide is a checklist plus troubleshooting. It is **not** one-click: you must create Cloudflare resources and set secrets.

## Prerequisites

| Resource | Purpose |
| -------- | ------- |
| Cloudflare account with Workers | Host the Ask/MCP endpoints |
| [AI Search](https://developers.cloudflare.com/ai-search/) instance | Retrieval over your public corpus |
| AI Gateway + DeepSeek (or configured upstream) | Optional generated summaries |
| D1 database | Quotas and abuse controls |
| Turnstile widget | Browser summarize / generation modes |
| Static site already deployed | `SITE_URL` / `ALLOWED_ORIGIN` must match |

Cost: AI Search and Gateway usage are billable. Start with low `DAILY_*_LIMIT` values in `wrangler.jsonc`.

## Step-by-step

### 1. Prepare the worker package

```sh
cd examples/public-ask-worker
npm install
cp wrangler.jsonc wrangler.jsonc.local   # optional; or edit in place carefully
```

Replace every `YOUR_*` placeholder in `wrangler.jsonc` (account-related IDs, D1 `database_id`, AI Search instance name, rate-limit binding IDs, `SITE_URL`, `ALLOWED_ORIGIN`, routes/custom domains).

Do **not** commit real account IDs or secrets.

### 2. Create and migrate D1

Create the D1 database in the Cloudflare dashboard (or via Wrangler), put its `database_id` into `wrangler.jsonc`, then:

```sh
npx wrangler d1 migrations apply <your-d1-database-name> --remote
```

Skipping migrations is a common cause of runtime quota failures.

### 3. Configure AI Search and Gateway

- Point AI Search at the corpus you want Ask to retrieve (usually your published Markdown / site content).
- Configure AI Gateway IDs in `wrangler.jsonc` vars.
- Optionally verify indexing with `npm run check:search` when you have a `CLOUDFLARE_API_TOKEN` (not run in CI).

### 4. Set Worker secrets

Full production-style deploy:

```sh
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put ACTOR_HMAC_KEY
npx wrangler secret put LEARNING_EXPORT_TOKEN
# Optional, if your Gateway requires it:
# npx wrangler secret put CF_AIG_TOKEN
```

Isolated **demo** config (`wrangler.demo.example.jsonc` → ignored `wrangler.demo.jsonc`) omits the learning queue and `LEARNING_EXPORT_TOKEN`. See the package README.

### 5. Deploy the Worker

```sh
npm run deploy
# demo:
# npx wrangler d1 migrations apply refined-x-demo-ask --remote -c wrangler.demo.jsonc
# npx wrangler deploy -c wrangler.demo.jsonc
```

`predeploy` syncs persona metadata from the site content.

### 6. Connect the static site

In `instance.config.mjs` or `site.config.mjs`:

```js
export default {
  ask: {
    askUrl: "https://ask.example.com/ask",
    mcpUrl: "https://ask.example.com/mcp",
    healthUrl: "https://ask.example.com/health",
  },
};
```

At **Astro build** time, set the public Turnstile site key:

```sh
PUBLIC_TURNSTILE_SITE_KEY=... npm run build
```

(or a host env var / GitHub Actions variable). The matching **secret** stays only on the Worker.

Redeploy the static site after changing `ask.*` or the Turnstile site key.

### 7. Smoke-check

```sh
curl -sS https://ask.example.com/health
```

From the worker package (with credentials / staging URLs configured):

```sh
npm test
npm run typecheck
# optional remote:
# npm run test:staging
```

## Troubleshooting

| Symptom | Likely cause | What to do |
| ------- | ------------ | ---------- |
| Browser Ask blocked by CORS | `ALLOWED_ORIGIN` / `SITE_URL` ≠ static site origin | Align scheme + host + port; redeploy Worker |
| `/health` unhealthy or 5xx | Missing bindings, bad AI Search name, D1 not migrated | Check Wrangler logs; re-apply migrations; confirm instance names |
| Empty or irrelevant answers | AI Search index empty or out of date | Re-sync / re-index; run `check:search` with an API token |
| Turnstile failures in the UI | Site key ≠ secret, or hostname not allowed on the widget | Recreate/match keys; add your Pages domain to Turnstile hostnames |
| Static `/ask` never calls the Worker | `ask.askUrl` unset or build used old config | Set `ask.*` and rebuild the site |
| Quota / rate-limit errors | `DAILY_*_LIMIT` or rate-limit bindings exhausted | Raise limits carefully or wait for reset; confirm limiter namespace IDs |
| Demo vs full confusion | Demo omits learning queue / `LEARNING_EXPORT_TOKEN` and sets `PERSIST_INTERACTIONS=false` | Use the matching wrangler file and secret list |
| `typecheck` / deploy persona stale | Persona not synced | `npm run sync:persona` (also runs on `predeploy`) |
| Machine MCP clients unauthorized | Expecting browser Turnstile path | Anonymous MCP gets retrieval; generated browser answers need Turnstile + budget |

## Boundaries

Live Ask does **not** provide long-term memory, arbitrary actions, elicitation, or impersonation of the site owner. Protocol reference: [NLWeb v0.55](https://nlweb.ai/docs/specification).
