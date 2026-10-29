import { readFileSync } from 'node:fs';
import path from 'node:path';
import { siteConfig } from '../../site.config.mjs';

export function loadAssetManifest(publicDir) {
	try { return JSON.parse(readFileSync(path.join(publicDir, 'asset/asset-manifest.json'), 'utf8')); } catch (error) {
		if (error.code === 'ENOENT') return [];
		throw error;
	}
}

export function findAsset(manifest, url) {
	if (!url?.startsWith('/asset/')) return undefined;
	let name;
	try { name = decodeURIComponent(url.split(/[?#]/, 1)[0].slice('/asset/'.length)); } catch { return undefined; }
	return manifest.find((asset) => asset.file === name);
}

const manifest = loadAssetManifest(siteConfig.publicDir);

export function optimizedAssetUrl(url, width = Infinity) {
	const variants = findAsset(manifest, url)?.variants;
	return (variants?.find((variant) => variant.width >= width) ?? variants?.at(-1))?.src ?? url;
}
