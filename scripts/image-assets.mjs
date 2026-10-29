import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Native codec updates can change bytes even when the source/options do not.
const encoderFingerprint = createHash('sha256')
	.update(JSON.stringify({
		platform: process.platform,
		arch: process.arch,
		versions: Object.keys(sharp.versions).sort().map(name => [name, sharp.versions[name]]),
	}))
	.digest('hex').slice(0, 16);

/** Only an explicit, checksummed publication snapshot is compatibility history. */
export async function retainOptimizedAssets(historyRoot, outputRoot) {
	if (!historyRoot) return;
	const history = JSON.parse(await readFile(path.join(historyRoot, 'asset-history.json'), 'utf8'));
	if (history.version !== 1 || !history.sourceRevision || !Array.isArray(history.files)) throw new Error('Invalid asset-history manifest');
	for (const { file, sha256 } of history.files) {
		if (!/^[a-f0-9]{16}-\d+\.webp$/.test(file) || !/^[a-f0-9]{64}$/.test(sha256) || !file.startsWith(`${sha256.slice(0, 16)}-`)) throw new Error(`Invalid historical asset: ${file}`);
		const data = await readFile(path.join(historyRoot, 'optimized', file));
		if (createHash('sha256').update(data).digest('hex') !== sha256) throw new Error(`Historical asset checksum mismatch: ${file}`);
		await mkdir(path.join(outputRoot, 'optimized'), { recursive: true });
		await writeFile(path.join(outputRoot, 'optimized', file), data);
	}
}

/** Keep originals public; only derived, content-addressed files are immutable. */
export async function optimizeAsset(source, outputRoot, { cacheRoot } = {}) {
	const input = await readFile(source);
	const cacheKey = `${createHash('sha256').update(input).digest('hex')}-q82-w1920-v3-${encoderFingerprint}`;
	if (cacheRoot) {
		try {
			const cached = JSON.parse(await readFile(path.join(cacheRoot, `${cacheKey}.json`), 'utf8'));
			await mkdir(path.join(outputRoot, 'optimized'), { recursive: true });
			for (const variant of cached.variants ?? []) await copyFile(path.join(cacheRoot, path.basename(variant.src)), path.join(outputRoot, 'optimized', path.basename(variant.src)));
			return cached;
		} catch (error) { if (error.code !== 'ENOENT') throw error; }
	}
	const metadata = await sharp(input, { animated: true }).metadata();
	const { width, height } = metadata;
	if (!width || !height) return {};
	if (['svg', 'gif'].includes(metadata.format) || (metadata.pages ?? 1) > 1) return { width, height: metadata.pageHeight ?? height };
	// rotate() applies EXIF orientation before resizing, including swapping width and height.
	const maxWidth = Math.min(metadata.autoOrient.width, 1920);
	const widths = [...new Set([480, 960, 1440, maxWidth].filter((value) => value <= maxWidth))].sort((a, b) => a - b);
	const variants = [];
	await mkdir(path.join(outputRoot, 'optimized'), { recursive: true });
	for (const size of widths) {
		const { data, info } = await sharp(input).rotate().resize({ width: size, withoutEnlargement: true }).webp({ quality: 82, effort: 5 }).toBuffer({ resolveWithObject: true });
		const hash = createHash('sha256').update(data).digest('hex').slice(0, 16);
		const filename = `${hash}-${info.width}.webp`;
		await writeFile(path.join(outputRoot, 'optimized', filename), data);
		if (cacheRoot) { await mkdir(cacheRoot, { recursive: true }); await writeFile(path.join(cacheRoot, filename), data); }
		variants.push({ src: `/asset/optimized/${filename}`, width: info.width, height: info.height, bytes: data.length });
	}
	const result = { width: variants.at(-1).width, height: variants.at(-1).height, variants };
	if (cacheRoot) await writeFile(path.join(cacheRoot, `${cacheKey}.json`), JSON.stringify(result));
	return result;
}
