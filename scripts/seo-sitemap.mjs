import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

function walkMarkdown(directory) {
	return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const target = path.join(directory, entry.name);
		return entry.isDirectory() ? walkMarkdown(target) : entry.name.endsWith('.md') ? [target] : [];
	});
}

function frontmatter(file) {
	const source = fs.readFileSync(file, 'utf8');
	const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
	if (!match) throw new Error(`缺少 YAML frontmatter：${file}`);
	return YAML.parse(match[1]);
}

function topicSlug(tag) {
	return tag
		.normalize('NFKC')
		.trim()
		.toLocaleLowerCase('zh-CN')
		.replace(/\+/g, '-plus-')
		.replace(/#/g, '-sharp-')
		.replace(/\./g, '-dot-')
		.replace(/[^\p{Letter}\p{Number}]+/gu, '-')
		.replace(/^-+|-+$/g, '');
}

function pageUrl(site, pathname) {
	return new URL(pathname.endsWith('/') ? pathname : `${pathname}/`, site).href;
}

export function createSeoSitemapOptions({ contentRoot, site }) {
	const articles = walkMarkdown(path.join(contentRoot, 'articles')).map(frontmatter);
	const tagCounts = new Map();
	const lastModified = new Map();
	const seriesDates = new Map();
	let latest;

	for (const article of articles) {
		const dateMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(article.pubDate));
		if (!dateMatch) throw new Error(`文章缺少有效 pubDate：${article.slug}`);
		const articleDate = new Date(article.updatedDate ?? article.pubDate);
		const articlePath = `/${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}/${article.slug}/`;
		lastModified.set(pageUrl(site, articlePath), articleDate);
		if (!latest || articleDate > latest) latest = articleDate;
		if (article.series) {
			const previousSeriesDate = seriesDates.get(article.series);
			if (!previousSeriesDate || articleDate > previousSeriesDate) seriesDates.set(article.series, articleDate);
		}
		for (const tag of article.tags ?? []) {
			const slug = topicSlug(tag);
			const current = tagCounts.get(slug) ?? { count: 0, latest: articleDate };
			current.count += 1;
			if (articleDate > current.latest) current.latest = articleDate;
			tagCounts.set(slug, current);
		}
	}

	for (const [series, date] of seriesDates) lastModified.set(pageUrl(site, `/writing/${series}/`), date);
	for (const [slug, data] of tagCounts) lastModified.set(pageUrl(site, `/topics/${slug}/`), data.latest);
	for (const route of ['/', '/writing/', '/topics/']) lastModified.set(pageUrl(site, route), latest);

	return {
		filter(page) {
			const url = new URL(page);
			if (url.pathname === '/404/' || url.pathname === '/404') return false;
			const topic = /^\/topics\/([^/]+)\/$/.exec(url.pathname);
			if (topic && (tagCounts.get(decodeURIComponent(topic[1]))?.count ?? 0) < 3) return false;
			return true;
		},
		serialize(item) {
			const normalized = pageUrl(site, new URL(item.url).pathname);
			const lastmod = lastModified.get(normalized);
			return { url: normalized, ...(lastmod ? { lastmod } : {}) };
		},
	};
}

