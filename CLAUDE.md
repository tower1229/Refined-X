## Development

```sh
npm install
npm run dev
```

Build and verify:

```sh
npm run build
npm run verify
```

## Documentation

- Product positioning: `PRODUCT.md`
- Design system: `DESIGN.md`
- User README: `README.md`
- Astro: https://docs.astro.build

Config entrypoint: `site.config.mjs` (optional overlay `../instance.config.mjs`).

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (`gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.
