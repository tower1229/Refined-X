import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { siteConfig } from '../../site.config.mjs';

function findSiteRoot(startDir) {
	let dir = startDir;
	while (true) {
		if (existsSync(path.join(dir, 'astro.config.mjs')) && existsSync(path.join(dir, 'package.json'))) {
			return dir;
		}
		const parent = path.dirname(dir);
		if (parent === dir) {
			throw new Error('无法定位 Astro 站点根目录（缺少 astro.config.mjs）');
		}
		dir = parent;
	}
}

const siteRoot = findSiteRoot(path.dirname(fileURLToPath(import.meta.url)));
const seriesRoot = path.join(siteConfig.contentRoot, 'series');

function loadSeries() {
	const manifest = JSON.parse(readFileSync(path.join(seriesRoot, 'series.json'), 'utf8'));
	const order = Array.isArray(manifest.order) ? manifest.order.map(String) : [];
	if (order.length === 0) {
		throw new Error('series/series.json order must not be empty');
	}

	const titles = Object.create(null);
	for (const slug of order) {
		const file = path.join(seriesRoot, `${slug}.yaml`);
		try {
			const data = parseYaml(readFileSync(file, 'utf8')) ?? {};
			titles[slug] = String(data.title ?? slug);
		} catch {
			titles[slug] = slug;
		}
	}

	const onDisk = readdirSync(seriesRoot)
		.filter((name) => /\.ya?ml$/i.test(name))
		.map((name) => path.basename(name, path.extname(name)));
	const orphans = onDisk.filter((slug) => !order.includes(slug));
	if (orphans.length > 0) {
		console.warn(`[series] yaml not listed in series.json order: ${orphans.join(', ')}`);
	}

	return { order, titles };
}

const { order, titles } = loadSeries();

/** @type {readonly string[]} */
export const SERIES_ORDER = Object.freeze(order);

/** @type {readonly [string, ...string[]]} */
export const SERIES_IDS = /** @type {readonly [string, ...string[]]} */ (SERIES_ORDER);

/** @param {string | undefined | null} value */
export function isSeriesId(value) {
	return typeof value === 'string' && SERIES_ORDER.includes(value);
}

/** @param {string | undefined | null} slug */
export function seriesTitle(slug) {
	if (!slug) return 'Article';
	return titles[slug] ?? 'Article';
}
