# Public Ask worker (optional)

Reference Cloudflare Worker that powers the optional **NLWeb-compatible** `POST /ask` + MCP `ask` surface for a Refined-X site.

This is **not** required for the static Astro template. Without it, `/ask` still works as a curated static Answers search. Deploy this worker when you want live retrieval + summarization, then set `ask.askUrl` / `ask.mcpUrl` / `ask.healthUrl` in `site.config.mjs` (or your instance overlay).

## What it implements

- `POST /ask` — restricted NLWeb v0.55-compatible subset (`conversational_search`, `list`, `summarize`, SSE)
- `POST /mcp` — Streamable HTTP MCP with an `ask` tool
- `GET /health` — liveness
- Cloudflare AI Search + AI Gateway (DeepSeek) + D1 quotas + Turnstile for browser summarize modes

Does **not** support `/await`, promise responses, elicitation, `chatgpt_app`, arbitrary extension fields, result actions, or long-term memory.

## Cost & ops notes

- **AI Search** + **Workers AI Gateway / DeepSeek** incur usage-based cost; start with low `DAILY_*_LIMIT` vars.
- **Turnstile** site key is public (inject `PUBLIC_TURNSTILE_SITE_KEY` at Astro build time). The matching **secret** is a Worker secret only.
- Replace every `YOUR_*` placeholder in `wrangler.jsonc` before deploy. Do not commit real account IDs, D1 IDs, or secrets.

## Local checks

```bash
cd examples/public-ask-worker
npm install
npm test
npm run typecheck
```

## Deploy sketch

```bash
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put ACTOR_HMAC_KEY
npx wrangler secret put LEARNING_EXPORT_TOKEN
npm run deploy
```

Point your site config at the deployed URLs, e.g.:

```js
ask: {
  askUrl: 'https://ask.example.com/ask',
  mcpUrl: 'https://ask.example.com/mcp',
  healthUrl: 'https://ask.example.com/health',
}
```

## Isolated demo deployment

Use `wrangler.demo.example.jsonc` as the versioned template for an independent
Demo Worker. Copy it to the ignored `wrangler.demo.jsonc`, replace the account
and D1 placeholders, then run all Demo operations with
`-c wrangler.demo.jsonc`.

The Demo config intentionally omits the learning Queue and sets
`PERSIST_INTERACTIONS=false`. It still needs its own D1 database for quotas and
abuse controls, its own AI Search instance, its own Turnstile widget, and the
following Worker secrets:

```bash
npx wrangler secret put DEEPSEEK_API_KEY -c wrangler.demo.jsonc
npx wrangler secret put TURNSTILE_SECRET_KEY -c wrangler.demo.jsonc
npx wrangler secret put ACTOR_HMAC_KEY -c wrangler.demo.jsonc
```

Apply migrations before deploying:

```bash
npx wrangler d1 migrations apply refined-x-demo-ask --remote -c wrangler.demo.jsonc
npx wrangler deploy -c wrangler.demo.jsonc
```

Protocol reference: [NLWeb v0.55](https://nlweb.ai/docs/specification). Live demo stack: [refined-x.com](https://refined-x.com) / [ask.refined-x.com](https://ask.refined-x.com/health).
