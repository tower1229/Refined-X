import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm, symlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

function runCollector(root, config, historyRoot = '') {
	return spawnSync(process.execPath, [fileURLToPath(new URL('./collect-assets.mjs', import.meta.url))], {
		cwd: root, encoding: 'utf8',
		env: { ...process.env, REFINED_X_INSTANCE_CONFIG: config, REFINED_X_ASSET_HISTORY: historyRoot },
	});
}

for (const input of ['history', 'history-symlink', 'history-manifest-link', 'history-blob-link', 'content', 'content-symlink']) {
	test(`collection preserves ${input} inputs inside its output on rejection`, async (t) => {
		const root = await mkdtemp(path.join(os.tmpdir(), 'asset-input-overlap-'));
		t.after(() => rm(root, { recursive: true, force: true }));
		const publicDir = path.join(root, 'public'), assetSource = path.join(root, 'source');
		const actualInput = path.join(publicDir, 'asset', input);
		await mkdir(actualInput, { recursive: true });
		await mkdir(assetSource);
		await mkdir(path.join(root, 'content'));
		const image = await sharp({ create: { width: 32, height: 16, channels: 4, background: 'red' } }).png().toBuffer();
		for (const name of ['avatar.jpg', 'auto_theme.png', 'og-default.png', 'hero-light.png', 'hero-dark.png']) await writeFile(path.join(assetSource, name), image);
		await writeFile(path.join(root, 'astro.config.mjs'), '');
		await writeFile(path.join(root, 'package.json'), '{}');
		const isHistory = input.startsWith('history');
		let original = '# Original Markdown\n';
		if (isHistory) original = JSON.stringify({ version: 1, sourceRevision: 'test', files: [] });
		if (input === 'history-blob-link') original = await sharp(image).webp().toBuffer();
		const originalPath = path.join(actualInput, isHistory ? 'asset-history.json' : 'article.md');
		await writeFile(originalPath, original);
		let inputPath = actualInput;
		if (input.endsWith('symlink')) {
			inputPath = path.join(root, 'input-alias');
			await symlink(actualInput, inputPath, 'dir');
		}
		if (input.endsWith('-link')) {
			inputPath = path.join(root, 'snapshot');
			await mkdir(path.join(inputPath, 'optimized'), { recursive: true });
			if (input === 'history-manifest-link') {
				await symlink(originalPath, path.join(inputPath, 'asset-history.json'), 'file');
			} else {
				const sha256 = createHash('sha256').update(original).digest('hex');
				const file = `${sha256.slice(0, 16)}-32.webp`;
				await writeFile(path.join(inputPath, 'asset-history.json'), JSON.stringify({ version: 1, sourceRevision: 'test', files: [{ file, sha256 }] }));
				await symlink(originalPath, path.join(inputPath, 'optimized', file), 'file');
			}
		}
		const config = path.join(root, 'instance.mjs');
		await writeFile(config, `export default ${JSON.stringify({ contentRoot: isHistory ? path.join(root, 'content') : inputPath, assetSource, publicDir })};`);
		const result = runCollector(root, config, isHistory ? inputPath : '');
		assert.deepEqual(await readFile(originalPath), Buffer.from(original));
		assert.equal(result.status, 1, result.stdout);
		assert.match(result.stderr, isHistory ? /REFINED_X_ASSET_HISTORY.*publicDir\/asset/ : /contentRoot.*publicDir\/asset/);
	});
}

for (const overlap of ['same', 'nested', 'ancestor', 'source-symlink', 'output-symlink', 'file-symlink', 'missing-output']) {
	test(`collection rejects ${overlap} source/output overlap before deleting any files`, async (t) => {
		const root = await mkdtemp(path.join(os.tmpdir(), 'asset-overlap-'));
		t.after(() => rm(root, { recursive: true, force: true }));
		let publicDir = path.join(root, 'public');
		let assetSource = path.join(publicDir, 'asset');
		if (overlap === 'nested' || overlap === 'source-symlink') assetSource = path.join(assetSource, 'originals');
		if (overlap === 'ancestor' || overlap === 'missing-output') assetSource = publicDir;
		if (overlap === 'file-symlink') assetSource = path.join(root, 'source');
		await mkdir(assetSource, { recursive: true });
		if (overlap === 'source-symlink') {
			const alias = path.join(root, 'source-alias');
			await symlink(assetSource, alias, 'dir');
			assetSource = alias;
		}
		if (overlap === 'output-symlink') {
			const alias = path.join(root, 'public-alias');
			await symlink(publicDir, alias, 'dir');
			publicDir = alias;
		}
		if (overlap === 'missing-output') publicDir = path.join(assetSource, 'new-public');
		const original = await sharp({ create: { width: 32, height: 16, channels: 4, background: 'red' } }).png().toBuffer();
		const originals = ['avatar.jpg', 'auto_theme.png', 'og-default.png', 'hero-light.png', 'hero-dark.png'].map(name => path.join(assetSource, name));
		for (const file of originals) {
			if (overlap === 'file-symlink') {
				const target = path.join(publicDir, 'asset', path.basename(file));
				await mkdir(path.dirname(target), { recursive: true });
				await writeFile(target, original);
				await symlink(target, file, 'file');
			} else await writeFile(file, original);
		}
		await mkdir(path.join(root, 'content'));
		await writeFile(path.join(root, 'astro.config.mjs'), '');
		await writeFile(path.join(root, 'package.json'), '{}');
		const config = path.join(root, 'instance.mjs');
		await writeFile(config, `export default ${JSON.stringify({ contentRoot: path.join(root, 'content'), assetSource, publicDir })};`);
		const result = runCollector(root, config);
		for (const file of originals) assert.deepEqual(await readFile(file), original, 'original bytes must survive rejection');
		assert.equal(result.status, 1, result.stdout);
		assert.match(result.stderr, /assetSource.*overlap.*publicDir\/asset/);
	});
}

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
	// A content root containing public/asset is legitimate: only content inside
	// the directory being deleted is forbidden, not the ancestor relationship.
	await writeFile(config, `export default ${JSON.stringify({ contentRoot: root, assetSource: path.join(root, 'source'), publicDir: path.join(root, 'public'), outDir: path.join(root, 'dist') })}`);
	const collect = () => {
		const result = runCollector(root, config, path.join(root, 'history'));
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
