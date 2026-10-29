import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

test('real Astro build and standalone verify reject corrupted search artifacts', async (t) => {
	const work = await mkdtemp(path.join(tmpdir(), 'refined-x-search-build-'));
	t.after(() => rm(work, { recursive: true, force: true }));
	const overlay = path.join(work, 'instance.mjs');
	await writeFile(overlay, `export default ${JSON.stringify({ site: 'https://example.com', outDir: path.join(work, 'dist') })};`);
	const env = { ...process.env, REFINED_X_INSTANCE_CONFIG: overlay };
	const mutations = {
		empty: "await writeFile(new URL('pagefind/pagefind-entry.json', dir), '');",
		malformed: "await writeFile(new URL('pagefind/pagefind-entry.json', dir), '{');",
		missing: "const entry = JSON.parse(await readFile(new URL('pagefind/pagefind-entry.json', dir))); await rm(new URL('pagefind/pagefind.' + Object.values(entry.languages)[0].hash + '.pf_meta', dir));",
	};
	for (const [name, mutation] of Object.entries(mutations)) {
		const config = path.join(work, `${name}.config.mjs`);
		await writeFile(config, `
import config from ${JSON.stringify(pathToFileURL(path.join(root, 'astro.config.mjs')).href)};
import { writeFile, readFile, rm } from 'node:fs/promises';
const integrations = [...config.integrations];
integrations.splice(integrations.findIndex(i => i.name === 'refined-x-search-gate'), 0, {
  name: 'test-corrupt-search', hooks: { 'astro:build:done': async ({ dir }) => { ${mutation} } }
});
export default { ...config, integrations };
`);
		for (const args of [['node_modules/astro/bin/astro.mjs', 'build', '--config', path.relative(root, config)], ['scripts/verify.mjs']]) {
			const result = spawnSync(process.execPath, args, { cwd: root, env, encoding: 'utf8', timeout: 120_000 });
			const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
			assert.equal(result.error, undefined, output);
			assert.equal(result.status, 1, `${name}: ${args[0]} must fail\n${output}`);
			assert.match(output, /Pagefind verification failed/, output);
		}
	}
});
