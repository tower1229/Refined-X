English | [简体中文](README.zh-CN.md)

# Refined-X

Agent-ready **personal publish** starter for [Astro](https://astro.build/) + [Starlight](https://starlight.astro.build/).

Humans get an editorial reading experience. Agents get `llms.txt`, OpenAPI, JSON APIs, Markdown mirrors, and MCP discovery — generated from the same opinionated public content schema.

## Quick start

```sh
npm create astro@latest -- --template tower1229/Refined-X
cd <project>
npm install
npm run dev
```

Or clone this repo:

```sh
git clone git@github.com:tower1229/Refined-X.git
cd Refined-X
npm install
npm run dev
```

Then open the printed local URL. Sample content lives in `content/`; static assets in `public/`.

```sh
npm run build && npm run verify
```

## Content schema

Point `contentRoot` at any directory that follows this shape (default `./content`):

```text
content/
  articles/**/*.md      # contentType: article + pubDate + slug + llmSummary
  answers/**/*.md       # contentType: answer + question + shortAnswer
  pages/**/*.md         # contentType: page (e.g. friends)
  profile/
    person.yaml         # kind: person
    cooperation.yaml    # kind: cooperation
    resume.md           # about body
  projects/*.{yaml,yml,json}
  series/
    series.json         # { "order": ["…"] }
    *.yaml
```

The schema is **opinionated**. The **location** of the tree is configurable.

## Config reference

Edit [`site.config.mjs`](site.config.mjs), or place an overlay at `../instance.config.mjs` (used when this package is a git submodule) / set `REFINED_X_INSTANCE_CONFIG`.

| Field | Default | Purpose |
|-------|---------|---------|
| `locale` | `en` | UI chrome language pack (`en` \| `zh-CN`) |
| `contentRoot` | `./content` | Public Markdown/YAML root |
| `publicDir` | `./public` | Static assets (copied to dist) |
| `outDir` | `./dist` | Build output |
| `assetSource` | unset | Optional image library for `collect-assets` |
| `site` / `title` / `locale` | example.com / Refined-X / en | Site identity |
| `ask.askUrl` / `mcpUrl` / `healthUrl` | empty | Optional Public Ask / NLWeb worker |
| `redirects` | `{}` | Astro redirects map |
| `brand.*` | Demo Author copy | Identity & content (persona, headings, chips) — not UI chrome |

Relative paths resolve from the package root (this directory).

## Capability matrix

| Capability | Included | Notes |
|------------|----------|-------|
| Editorial UI + theme toggle | Yes | See `DESIGN.md` |
| Articles / series / projects / about | Yes | From `contentRoot` |
| Curated Answers + static Ask search | Yes | `/ask`, `/answers` |
| `llms.txt` / `llms-full.txt` / `.md` mirrors | Yes | Build-time |
| `/api/*.json` + `/openapi.json` | Yes | Build-time |
| `/.well-known/mcp/*` discovery | Yes | URLs empty until `ask.*` configured |
| NLWeb `POST /ask` + MCP tool | Optional | Deploy a Public Ask worker; set `ask.*` |

Live reference implementation: [refined-x.com](https://refined-x.com).

![Home](docs/screenshots/home.png)

![Writing](docs/screenshots/writing.png)

### Themes Portal short description

> Agent-ready personal publish starter for Astro + Starlight: opinionated public content schema, editorial reading UI, `llms.txt` / OpenAPI / JSON APIs, MCP discovery, and an optional NLWeb Public Ask worker.

### create-astro smoke

```sh
npm create astro@latest -- --template tower1229/Refined-X
# expects default branch `main`
cd <project> && npm install && npm run build && npm run verify
```

Optional live Ask backend example: [`examples/public-ask-worker`](examples/public-ask-worker).

## Consume as a submodule

In a parent monorepo (e.g. a vault that owns `20_Publish/`):

```sh
git submodule add git@github.com:tower1229/Refined-X.git 90_Website/Template
```

Add `90_Website/instance.config.mjs` next to the submodule to set `contentRoot` / `publicDir` / `outDir` / brand / ask URLs. Do not edit files inside the submodule for instance-specific settings.

## License

MIT
