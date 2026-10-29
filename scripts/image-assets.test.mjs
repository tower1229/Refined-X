import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { optimizeAsset, retainOptimizedAssets } from './image-assets.mjs';
import { rehypeImageAssets } from '../src/markdown/rehype-image-assets.mjs';

test('an encoder upgrade ignores legacy cache and keeps current cold/warm outputs identical', async (t) => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'image-encoder-cache-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const input = path.join(root, 'image.png');
	await sharp({ create: { width: 640, height: 320, channels: 3, background: '#578' } }).png().toFile(input);
	const cacheRoot = path.join(root, 'cache');
	await mkdir(cacheRoot);
	const sourceHash = createHash('sha256').update(await readFile(input)).digest('hex');
	const legacyKey = `${sourceHash}-q82-w1920-v2.json`;
	// Old encoder output must never be reused, even when the source/options match.
	await writeFile(path.join(cacheRoot, legacyKey), JSON.stringify({ width: 1, height: 1, variants: [] }));
	const cold = await optimizeAsset(input, path.join(root, 'cold'));
	const upgraded = await optimizeAsset(input, path.join(root, 'upgraded'), { cacheRoot });
	const warm = await optimizeAsset(input, path.join(root, 'warm'), { cacheRoot });
	assert.deepEqual(upgraded, cold);
	assert.deepEqual(warm, cold);
	assert.equal((await readdir(cacheRoot)).filter(file => file.endsWith('.json') && file !== legacyKey).length, 1);
	for (const variant of cold.variants) {
		const relative = path.join('optimized', path.basename(variant.src));
		const bytes = await readFile(path.join(root, 'cold', relative));
		assert.deepEqual(await readFile(path.join(root, 'upgraded', relative)), bytes);
		assert.deepEqual(await readFile(path.join(root, 'warm', relative)), bytes);
	}
});

test('derived URLs change with content, retain originals and intrinsic size, and rewrite Markdown under a base', async (t) => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'image-assets-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const output = path.join(root, 'asset'); await mkdir(output);
	const input = path.join(root, 'diagram.png');
	await sharp({ create: { width: 1200, height: 600, channels: 4, background: 'red' } }).png().toFile(input);
	const original = await readFile(input);
	const first = await optimizeAsset(input, output);
	assert.deepEqual(await readFile(input), original);
	assert.equal(first.width, 1200); assert.equal(first.height, 600);
	await writeFile(path.join(output, 'asset-manifest.json'), JSON.stringify([{ file: 'diagram.png', ...first }]));
	const image = { type: 'element', tagName: 'img', properties: { src: '/asset/diagram.png', alt: 'Diagram' }, children: [] };
	rehypeImageAssets({ publicDir: root, base: '/blog/' })({ type: 'root', children: [image] });
	assert.match(image.properties.src, /^\/blog\/asset\/optimized\//);
	assert.equal(image.properties.width, 1200);
	assert.equal(image.properties.loading, 'lazy');
	assert.match(image.properties.srcSet, /480w/);
	const authored = { type: 'element', tagName: 'img', properties: { src: '/asset/diagram.png', width: 300, style: 'height:150px' }, children: [] };
	rehypeImageAssets({ publicDir: root })({ type: 'root', children: [authored] });
	assert.equal(authored.properties.width, 300);
	assert.equal(authored.properties.height, 150);
	assert.match(authored.properties.style, /width:auto/);
	await sharp({ create: { width: 1200, height: 600, channels: 4, background: 'blue' } }).png().toFile(input);
	const second = await optimizeAsset(input, output);
	assert.notEqual(first.variants.at(-1).src, second.variants.at(-1).src);
	const cleanOutput = path.join(root, 'clean-public/asset');
	const files = await Promise.all([...first.variants, ...second.variants].map(async (variant) => ({ file: path.basename(variant.src), sha256: createHash('sha256').update(await readFile(path.join(output, 'optimized', path.basename(variant.src)))).digest('hex') })));
	await writeFile(path.join(output, 'asset-history.json'), JSON.stringify({ version: 1, sourceRevision: 'published-fixture', files }));
	await retainOptimizedAssets(output, cleanOutput);
	for (const variant of [...first.variants, ...second.variants]) {
		const relative = variant.src.slice('/asset/'.length);
		assert.deepEqual(await readFile(path.join(cleanOutput, relative)), await readFile(path.join(output, relative)));
	}
});

test('publication history rejects altered bytes instead of serving them under an immutable hash', async (t) => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'image-history-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	await mkdir(path.join(root, 'optimized'));
	const sha256 = 'a'.repeat(64), file = `${sha256.slice(0, 16)}-480.webp`;
	await writeFile(path.join(root, 'optimized', file), 'altered');
	await writeFile(path.join(root, 'asset-history.json'), JSON.stringify({ version: 1, sourceRevision: 'published-fixture', files: [{ file, sha256 }] }));
	await assert.rejects(retainOptimizedAssets(root, path.join(root, 'out')), /checksum mismatch/);
});

test('SVG stays vector and keeps its intrinsic dimensions', async (t) => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'image-svg-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const input = path.join(root, 'vector.svg');
	await writeFile(input, '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"></svg>');
	assert.deepEqual(await optimizeAsset(input, root), { width: 300, height: 200 });
});

test('EXIF rotation yields unique responsive widths from oriented dimensions and bypasses legacy cache', async (t) => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'image-exif-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	for (const fixture of [
		{ width: 2000, height: 1000, orientation: 6, expected: [480, 960, 1000], output: [1000, 2000] },
		{ width: 1000, height: 2000, orientation: 8, expected: [480, 960, 1440, 1920], output: [1920, 960] },
	]) {
		const input = path.join(root, `orientation-${fixture.orientation}.jpg`), output = path.join(root, `${fixture.orientation}/asset`), cacheRoot = path.join(root, 'cache');
		await sharp({ create: { width: fixture.width, height: fixture.height, channels: 3, background: '#528' } }).jpeg().withMetadata({ orientation: fixture.orientation }).toFile(input);
		const original = await readFile(input);
		if (fixture.orientation === 6) {
			// A real v1 result had two identical 1000w entries; it must not survive the fix via cache.
			await mkdir(cacheRoot, { recursive: true });
			const data = await sharp(original).rotate().resize({ width: 1440, withoutEnlargement: true }).webp({ quality: 82, effort: 5 }).toBuffer();
			const file = `${createHash('sha256').update(data).digest('hex').slice(0, 16)}-1000.webp`;
			const variant = { src: `/asset/optimized/${file}`, width: 1000, height: 2000, bytes: data.length };
			await writeFile(path.join(cacheRoot, file), data);
			await writeFile(path.join(cacheRoot, `${createHash('sha256').update(original).digest('hex')}-q82-w1920-v1.json`), JSON.stringify({ width: 1000, height: 2000, variants: [variant, variant] }));
		}
		const result = await optimizeAsset(input, output, { cacheRoot });
		assert.deepEqual(result.variants.map(({ width }) => width), fixture.expected);
		assert.equal(new Set(result.variants.map(({ src }) => src)).size, fixture.expected.length);
		assert.deepEqual([result.width, result.height], fixture.output);
		for (const variant of result.variants) {
			const metadata = await sharp(await readFile(path.join(output, 'optimized', path.basename(variant.src)))).metadata();
			assert.deepEqual([metadata.width, metadata.height], [variant.width, variant.height]);
			assert.equal(metadata.orientation, undefined, 'pixels are already oriented');
		}
		assert.deepEqual(await readFile(input), original);
		assert.deepEqual(await optimizeAsset(input, path.join(root, `${fixture.orientation}-cached/asset`), { cacheRoot }), result);
		await writeFile(path.join(output, 'asset-manifest.json'), JSON.stringify([{ file: 'photo.jpg', ...result }]));
		const image = { type: 'element', tagName: 'img', properties: { src: '/asset/photo.jpg' }, children: [] };
		rehypeImageAssets({ publicDir: path.dirname(output) })({ type: 'root', children: [image] });
		assert.deepEqual(image.properties.srcSet.split(', ').map((entry) => Number(/(\d+)w$/.exec(entry)[1])), fixture.expected);
	}
});
