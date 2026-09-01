import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveCommentsConfig } from './src/lib/comments.mjs';

function findPackageRoot() {
	let dir = process.cwd();
	while (true) {
		if (existsSync(path.join(dir, 'astro.config.mjs')) && existsSync(path.join(dir, 'package.json'))) {
			return dir;
		}
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return path.dirname(fileURLToPath(import.meta.url));
}

/** Absolute path to the Astro project root (this package). Prefer cwd — import.meta.url breaks when Vite bundles this module. */
export const siteRoot = findPackageRoot();

const defaults = {
	title: 'Refined-X',
	description:
		'Refined-X is an agent-ready personal publish starter for Astro + Starlight: opinionated public content schema, editorial design, and machine-readable surfaces (llms.txt, OpenAPI, MCP discovery).',
	site: 'https://example.com',
	/** Selects UI chrome language pack (`en` | `zh-CN`). Brand/content stay in `brand`. */
	locale: 'en',
	timeZone: 'UTC',
	contentRoot: './content',
	publicDir: './public',
	outDir: './dist',
	/** Optional image library root; when unset, collect-assets is a no-op. */
	assetSource: undefined,
	social: {
		github: 'https://github.com/tower1229/Refined-X',
	},
	ask: {
		askUrl: '',
		mcpUrl: '',
		healthUrl: '',
		/** Must match the Worker PERSIST_INTERACTIONS setting when Live Ask is enabled. */
		persistInteractions: true,
	},
	/** Optional giscus repository/category identifiers. Leave all fields empty to disable comments. */
	comments: {
		repo: '',
		repoId: '',
		category: '',
		categoryId: '',
	},
	redirects: {},
	brand: {
		persona: 'Demo Author',
		alternateNames: ['Refined-X Demo', 'Personal Publish Starter'],
		homeHeading: 'Refined-X',
		homeTitle: 'Refined-X — Agent-ready personal site starter',
		homeLede: 'Editorial personal publishing with agent-friendly surfaces.',
		writingLede:
			'Long-form writing on frontend architecture, AI engineering practice, and professional judgment.',
		askChips: [
			{ label: 'Who is this?', query: 'Who is the author?' },
			{ label: 'AI practice', query: 'What AI practices are documented?' },
			{ label: 'Open source', query: 'What open source projects are featured?' },
			{ label: 'Collaborate', query: 'How can I collaborate?' },
		],
		footerTagline: 'Built for humans and agents.',
		projects: {
			heading: 'Projects',
			description:
				'Selected public projects, courses, and experiments published with this site.',
			lede: 'Open-source tools, product experiments, and teaching materials from the same public corpus.',
			titleSuffix: 'Projects',
		},
		about: {
			crumb: 'About',
			pageName: 'About',
		},
	},
	mcp: {
		serverName: 'refined-x-public-ask',
		packageIdentifier: 'com.example/refined-x-public-ask',
		airIdentifier: 'urn:air:example.com:public-ask',
		/** Optional override for Server Card `_meta` namespace; default `${packageIdentifier}/discovery`. */
		discoveryMetaKey: undefined,
	},
};

async function loadOverlay() {
	const fromEnv = process.env.REFINED_X_INSTANCE_CONFIG;
	const candidates = [
		fromEnv,
		path.resolve(siteRoot, '../instance.config.mjs'),
		path.resolve(siteRoot, 'instance.config.mjs'),
	].filter(Boolean);

	for (const candidate of candidates) {
		if (!existsSync(candidate)) continue;
		const mod = await import(/* @vite-ignore */ pathToFileURL(candidate).href);
		return mod.default ?? mod.siteConfig ?? mod;
	}
	return {};
}

function resolvePath(value) {
	if (value === undefined || value === null || value === '') return undefined;
	return path.isAbsolute(value) ? value : path.resolve(siteRoot, value);
}

const overlay = await loadOverlay();
const mergedBrand = {
	...defaults.brand,
	...(overlay.brand ?? {}),
	projects: { ...defaults.brand.projects, ...(overlay.brand?.projects ?? {}) },
	about: { ...defaults.brand.about, ...(overlay.brand?.about ?? {}) },
	askChips: overlay.brand?.askChips ?? defaults.brand.askChips,
	alternateNames: overlay.brand?.alternateNames ?? defaults.brand.alternateNames,
};
const merged = {
	...defaults,
	...overlay,
	social: { ...defaults.social, ...(overlay.social ?? {}) },
	ask: { ...defaults.ask, ...(overlay.ask ?? {}) },
	comments: resolveCommentsConfig({ ...defaults.comments, ...(overlay.comments ?? {}) }),
	brand: mergedBrand,
	mcp: { ...defaults.mcp, ...(overlay.mcp ?? {}) },
	redirects: overlay.redirects ?? defaults.redirects,
};

const contentRoot = resolvePath(merged.contentRoot);
const publicDir = resolvePath(merged.publicDir);
const outDir = resolvePath(merged.outDir);
const assetSource = resolvePath(merged.assetSource);

/** Resolved site configuration (paths are absolute). */
export const siteConfig = {
	...merged,
	contentRoot,
	publicDir,
	outDir,
	assetSource,
};
