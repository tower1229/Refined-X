import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'parse5';

async function filesIn(root) {
	return (await Promise.all((await readdir(root, { withFileTypes: true })).map(async (entry) => {
		const file = path.join(root, entry.name);
		return entry.isDirectory() ? filesIn(file) : [file];
	}))).flat();
}

export function readHtml(html) {
	const nodes = [];
	const walk = (node) => {
		if (node.tagName) nodes.push({ tag: node.tagName, attrs: Object.fromEntries((node.attrs ?? []).map(({ name, value }) => [name, value])), node });
		for (const child of node.childNodes ?? []) walk(child);
		if (node.content) walk(node.content);
	};
	walk(parse(html));
	const text = (node) => node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('');
	const titles = nodes.filter(({ tag }) => tag === 'title').map(({ node }) => text(node));
	const namedMeta = (name) => nodes.filter(({ tag, attrs }) => tag === 'meta' && attrs.name?.toLowerCase() === name);
	const descriptions = namedMeta('description').map(({ attrs }) => attrs.content ?? '');
	const resources = nodes.flatMap(({ tag, attrs, node }) => [
		...(attrs['data-src'] ? [attrs['data-src']] : []),
		...cssResourceUrls(attrs.style ?? ''),
		...(tag === 'style' ? cssResourceUrls(text(node)) : []),
	]);
	return {
		titles, descriptions, resources,
		canonical: nodes.find(({ tag, attrs }) => tag === 'link' && (attrs.rel ?? '').toLowerCase().split(/\s+/).includes('canonical'))?.attrs.href,
		noindex: namedMeta('robots').some(({ attrs }) => /\bnoindex\b/i.test(attrs.content ?? '')),
		refresh: nodes.some(({ tag, attrs }) => tag === 'meta' && attrs['http-equiv']?.toLowerCase() === 'refresh'),
		links: nodes.filter(({ tag, attrs }) => tag === 'a' && attrs.href !== undefined).map(({ attrs }) => attrs.href),
		images: nodes.filter(({ tag }) => tag === 'img').map(({ attrs }) => attrs),
	};
}

/** Static CSS url() values; skip comments and strings such as content:"url(...)". */
function cssResourceUrls(css) {
	const tokens = /\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\burl\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^)]*))\s*\)/gi;
	return [...css.matchAll(tokens)].flatMap((match) => {
		const value = match[1] ?? match[2] ?? match[3];
		return value === undefined ? [] : [value.trim()];
	});
}

/** Normalized deployment redirects: { from, to, status }. Hosting adapters own their input format. */
export function matchRoute(pattern, pathname) {
	const names = [];
	const expression = pattern.split(/(:[a-zA-Z]\w*|\*)/).map((part) => {
		if (part === '*') { names.push('splat'); return '(.*)'; }
		if (part.startsWith(':')) { names.push(part.slice(1)); return '([^/]+)'; }
		return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}).join('');
	const match = new RegExp(`^${expression}$`).exec(pathname);
	return match ? Object.fromEntries(names.map((name, index) => [name, match[index + 1]])) : undefined;
}

export function createRouteResolver({ distRoot, site, redirects = [] }) {
	const base = new URL(site).pathname.replace(/\/$/, '');
	return async (url) => {
		let pathname;
		try { pathname = decodeURIComponent(url.pathname); } catch { return { status: 400 }; }
		for (const rule of redirects) {
			const params = matchRoute(rule.from, pathname);
			if (params) return { status: rule.status, location: rule.to.replace(/:(\w+)/g, (_, name) => params[name] ?? `:${name}`) };
		}
		if (base && pathname !== base && !pathname.startsWith(`${base}/`)) return { status: 404 };
		const relative = pathname.slice(base.length).replace(/^\/+/, '');
		const file = path.resolve(distRoot, relative || 'index.html');
		if (!file.startsWith(`${path.resolve(distRoot)}${path.sep}`)) return { status: 404 };
		for (const candidate of [file, path.join(file, 'index.html'), `${file}.html`]) {
			try { if ((await stat(candidate)).isFile()) return { status: 200, file: candidate }; } catch {}
		}
		return { status: 404 };
	};
}

export async function followRoute(url, resolveRoute, site) {
	const seen = new Set();
	const chain = [];
	let current = new URL(url);
	while (chain.length < 20) {
		if (current.origin !== new URL(site).origin) return { status: 'external', chain };
		if (seen.has(current.href)) return { status: 'loop', chain };
		seen.add(current.href);
		const result = await resolveRoute(current);
		chain.push({ url: current.href, status: result.status });
		if (result.status >= 300 && result.status < 400 && result.location) {
			current = new URL(result.location, current);
		} else return { ...result, chain };
	}
	return { status: 'too-many-redirects', chain };
}

export async function auditSite({ distRoot, site, resolveRoute = createRouteResolver({ distRoot, site }) }) {
	const failures = [];
	const warnings = [];
	const pages = [];
	const base = new URL(site).pathname.replace(/\/$/, '');
	const cache = new Map();
	for (const file of (await filesIn(distRoot)).filter((file) => file.endsWith('.html')).sort()) {
		const relative = path.relative(distRoot, file).split(path.sep).join('/');
		const pathname = `/${relative.replace(/index\.html$/, '')}`;
		const url = new URL(`${base}${pathname}`, site);
		const html = await readFile(file, 'utf8');
		const page = readHtml(html);
		const record = { url: url.href, title: page.titles[0] ?? '', titleLength: [...(page.titles[0] ?? '')].length, descriptionLength: [...(page.descriptions[0] ?? '')].length, noindex: page.noindex, canonical: page.canonical, images: page.images };
		pages.push(record);
		if (/<(?:!doctype|html|body)\b/i.test(html) && !page.refresh && (page.titles.length !== 1 || !page.titles[0]?.trim())) failures.push(`${url.href}: expected one nonempty title`);
		if (page.canonical && !page.refresh && !page.descriptions[0]?.trim()) failures.push(`${url.href}: missing description`);
		if (record.titleLength > 65 || record.titleLength < 10) warnings.push(`${url.href}: review title length ${record.titleLength}`);
		if (page.descriptions.length && (record.descriptionLength < 50 || record.descriptionLength > 160)) warnings.push(`${url.href}: review description length ${record.descriptionLength}`);
		for (const img of page.images) {
			if (img.alt === undefined) failures.push(`${url.href}: missing alt attribute on ${img.src}`);
			else if (!img.alt.trim()) warnings.push(`${url.href}: review decorative/empty alt on ${img.src}`);
			if (img.src) {
				const imageUrl = new URL(img.src, url);
				if (imageUrl.origin === new URL(site).origin && ['http:', 'https:'].includes(imageUrl.protocol)) {
					const result = await followRoute(imageUrl, resolveRoute, site);
					if (result.status !== 200) failures.push(`${url.href}: missing image ${img.src} (${result.status})`);
				}
			}
		}
		for (const resource of page.resources) {
			let target;
			try { target = new URL(resource, url); } catch { failures.push(`${url.href}: invalid resource ${resource}`); continue; }
			if (!['http:', 'https:'].includes(target.protocol) || target.origin !== new URL(site).origin) continue;
			if (!cache.has(target.href)) cache.set(target.href, await followRoute(target, resolveRoute, site));
			const result = cache.get(target.href);
			if (result.status !== 200 && result.status !== 'external') failures.push(`${url.href}: missing resource ${resource} (${result.status})`);
		}
		for (const href of page.links) {
			let target;
			try { target = new URL(href, url); } catch { failures.push(`${url.href}: invalid link ${href}`); continue; }
			if (!['http:', 'https:'].includes(target.protocol) || target.origin !== new URL(site).origin) continue;
			target.hash = ''; target.search = '';
			if (!cache.has(target.href)) cache.set(target.href, await followRoute(target, resolveRoute, site));
			const result = cache.get(target.href);
			if (result.status !== 200 && result.status !== 'external') failures.push(`${url.href}: broken link ${href} (${result.chain.map(({ status }) => status).join(' -> ')}${typeof result.status === 'string' ? ` -> ${result.status}` : ''})`);
		}
	}
	return { pages, failures: [...new Set(failures)], warnings: [...new Set(warnings)] };
}
