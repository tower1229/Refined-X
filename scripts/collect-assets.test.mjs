import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

test('collection ignores local previews and dirty dist while retaining an explicit published snapshot', async (t) => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'asset-collection-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	for (const dir of ['content', 'source', 'public/asset/optimized', 'dist/asset/optimized', 'history/optimized']) await mkdir(path.join(root, dir), { recursive: true });
	// Keep the collector cache and all generated inputs inside the fixture.
	await writeFile(path.join(root, 'astro.config.mjs'), '');
	await writeFile(path.join(root, 'package.json'), '{}');
	for (const name of ['avatar.jpg', 'auto_theme.png', 'og-default.png', 'hero-light.png', 'hero-dark.png']) {
		await sharp({ create: { width: 32, height: 16, channels: 4, background: 'red' } }).png().toFile(path.join(root, 'source', name));
	}
	const addImage = async (dir, background) => {
		const data = await sharp({ create: { width: 32, height: 16, channels: 4, background } }).webp().toBuffer();
		const sha256 = createHash('sha256').update(data).digest('hex');
		const file = `${sha256.slice(0, 16)}-32.webp`;
		await writeFile(path.join(root, dir, file), data);
		return { file, sha256 };
	};
	const published = await addImage('history/optimized', 'yellow');
	await writeFile(path.join(root, 'history/asset-history.json'), JSON.stringify({ version: 1, sourceRevision: 'published-fixture', files: [published] }));
	const config = path.join(root, 'instance.mjs');
	await writeFile(config, `export default ${JSON.stringify({ contentRoot: path.join(root, 'content'), assetSource: path.join(root, 'source'), publicDir: path.join(root, 'public'), outDir: path.join(root, 'dist') })}`);
	const collect = () => {
		const result = spawnSync(process.execPath, [fileURLToPath(new URL('./collect-assets.mjs', import.meta.url))], {
			cwd: root, encoding: 'utf8', env: { ...process.env, REFINED_X_INSTANCE_CONFIG: config, REFINED_X_ASSET_HISTORY: path.join(root, 'history') },
		});
		assert.equal(result.status, 0, result.stderr);
	};
	collect();
	const clean = (await readdir(path.join(root, 'public/asset/optimized'))).sort();
	const preview = await addImage('public/asset/optimized', 'blue');
	const dirtyDist = await addImage('dist/asset/optimized', 'black');
	collect();
	const rebuilt = (await readdir(path.join(root, 'public/asset/optimized'))).sort();
	assert.ok(!rebuilt.includes(preview.file), 'unpublished preview must not enter the next build');
	assert.ok(!rebuilt.includes(dirtyDist.file), 'uncommitted dist is not published history');
	assert.ok(rebuilt.includes(published.file), 'published hash must survive a clean rebuild');
	assert.deepEqual(rebuilt, clean, 'source and explicit history determine the output file set');
	assert.equal(createHash('sha256').update(await readFile(path.join(root, 'public/asset/optimized', published.file))).digest('hex'), published.sha256);
});
