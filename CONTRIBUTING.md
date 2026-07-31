# Contributing

Thanks for helping improve Refined-X.

## Before you start

- Read [`PRODUCT.md`](PRODUCT.md) for product purpose and audience.
- Read [`DESIGN.md`](DESIGN.md) before changing visual or interaction behavior.
- Prefer small, reviewable pull requests over large mixed changes.

## Development setup

Requires **Node.js 24+** (see `.nvmrc`).

```sh
npm install
npm run dev
```

Optional Public Ask worker (separate package):

```sh
cd examples/public-ask-worker
npm install
npm test
npm run typecheck
```

## Required checks before opening a PR

From the repository root:

```sh
npm run check
npm run test:public-ask
npm run test:related
npm run build
npm run verify
```

If you touch the worker:

```sh
cd examples/public-ask-worker
npm test
npm run typecheck
```

Do not run staging or remote Cloudflare scripts in CI; those need account credentials.

## Issues

- Use the **Bug report** template for broken builds, incorrect outputs, or runtime failures.
- Use the **Feature request** template for new capabilities. State the user scenario and what is explicitly out of scope.
- Showcase / “Built with Refined-X” reports are welcome as ordinary issues with your live URL.

## Pull requests

- Describe *why* the change is needed, not only what changed.
- Keep sample `content/` edits minimal unless the PR is about demo content.
- Match existing naming, file layout, and bilingual README discipline (update `README.md` and `README.zh-CN.md` together when user-facing docs change).
- Do not commit secrets, real Cloudflare account IDs, or production `wrangler.demo.jsonc` files.

## Design and product boundaries

Refined-X is a static-first personal publishing starter with optional Live Ask. It is not a hosted CMS, a private agent, or a long-term memory service. Marketing and docs should promise “readable, connectable, queryable” surfaces — not automatic discovery by every agent client.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
