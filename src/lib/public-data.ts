import { getCollection, type CollectionEntry } from 'astro:content';
import { siteConfig } from '../../site.config.mjs';
import { sitePath } from './paths';

export type PublicDocEntry = CollectionEntry<'docs'>;

export function absoluteUrl(pathname: string) {
	return new URL(pathname, siteConfig.site).href;
}

export function docPath(entry: PublicDocEntry) {
	return sitePath(`/${entry.id}`);
}

export function topicSlug(tag: string) {
	return tag
		.normalize('NFKC')
		.trim()
		.toLocaleLowerCase(siteConfig.locale)
		.replace(/\+/g, '-plus-')
		.replace(/#/g, '-sharp-')
		.replace(/\./g, '-dot-')
		.replace(/[^\p{Letter}\p{Number}]+/gu, '-')
		.replace(/^-+|-+$/g, '');
}

export async function getArticles() {
	return (await getCollection('docs', ({ data }) => data.contentType === 'article')).sort(
		(a, b) => b.data.pubDate!.valueOf() - a.data.pubDate!.valueOf(),
	);
}

export async function getAnswers() {
	return (await getCollection('docs', ({ data }) => data.contentType === 'answer'))
		.filter((entry) => entry.data.slug !== 'who-is-zangtao')
		.sort((a, b) => a.data.title.localeCompare(b.data.title, siteConfig.locale));
}

export async function getPublicProfile() {
	const profile = await getCollection('profile');
	const personEntry = profile.find(({ data }) => data.kind === 'person');
	const cooperationEntry = profile.find(({ data }) => data.kind === 'cooperation');
	if (!personEntry || personEntry.data.kind !== 'person') throw new Error('缺少公开 person profile');
	const cooperation = cooperationEntry?.data.kind === 'cooperation' ? cooperationEntry.data : undefined;
	const links = personEntry.data.links ?? {};
	const knowsAbout =
		personEntry.data.knowsAbout.length > 0
			? personEntry.data.knowsAbout
			: personEntry.data.capabilities.map((capability) => capability.title);
	return {
		id: absoluteUrl('/#person'),
		name: personEntry.data.name,
		alternateName: personEntry.data.aliases,
		jobTitle: personEntry.data.title,
		description: personEntry.data.bio,
		url: absoluteUrl('/about/'),
		sameAs: Object.values(links).filter((url) => !url.startsWith('mailto:') && url !== links.website),
		email: cooperation?.contact ?? links.email?.replace(/^mailto:/, ''),
		wechat: personEntry.data.wechat,
		github: links.github,
		stats: personEntry.data.stats,
		knowsAbout,
		cooperation: cooperation
			? { title: cooperation.title, description: cooperation.description }
			: undefined,
	};
}

export function personJsonLd(profile: Awaited<ReturnType<typeof getPublicProfile>>) {
	return {
		'@type': 'Person',
		'@id': profile.id,
		name: profile.name,
		alternateName: profile.alternateName,
		jobTitle: profile.jobTitle,
		description: profile.description,
		image: absoluteUrl('/asset/avatar.jpg'),
		url: profile.url,
		sameAs: profile.sameAs,
		knowsAbout: profile.knowsAbout,
		email: profile.email ? `mailto:${profile.email}` : undefined,
	};
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
	return {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: items.map(({ name, path }, index) => ({
			'@type': 'ListItem',
			position: index + 1,
			name,
			item: absoluteUrl(path),
		})),
	};
}

export function webPageJsonLd({
	path,
	name,
	description,
	type = 'WebPage',
}: {
	path: string;
	name: string;
	description: string;
	type?: 'WebPage' | 'ProfilePage';
}) {
	return {
		'@context': 'https://schema.org',
		'@type': type,
		'@id': absoluteUrl(`${path}#webpage`),
		url: absoluteUrl(path),
		name,
		description,
		inLanguage: 'zh-CN',
		isPartOf: { '@id': absoluteUrl('/#website') },
	};
}

export function collectionPageJsonLd({
	path,
	name,
	description,
	items,
}: {
	path: string;
	name: string;
	description: string;
	items: Array<{ name: string; url: string }>;
}) {
	return {
		'@context': 'https://schema.org',
		'@type': 'CollectionPage',
		'@id': absoluteUrl(`${path}#collection`),
		url: absoluteUrl(path),
		name,
		description,
		inLanguage: 'zh-CN',
		isPartOf: { '@id': absoluteUrl('/#website') },
		mainEntity: {
			'@type': 'ItemList',
			numberOfItems: items.length,
			itemListElement: items.map((item, index) => ({
				'@type': 'ListItem',
				position: index + 1,
				name: item.name,
				url: item.url.startsWith('http') ? item.url : absoluteUrl(item.url),
			})),
		},
	};
}

export function serializeArticle(entry: PublicDocEntry) {
	return {
		id: absoluteUrl(docPath(entry)),
		title: entry.data.title,
		description: entry.data.description,
		llmSummary: entry.data.llmSummary,
		url: absoluteUrl(docPath(entry)),
		pubDate: entry.data.pubDate!.toISOString(),
		updatedDate: entry.data.updatedDate?.toISOString(),
		tags: entry.data.tags,
		seoImage: entry.data.seoImage ? absoluteUrl(entry.data.seoImage) : undefined,
		markdownUrl: absoluteUrl(`/${entry.id}.md`),
	};
}

export function serializeAnswer(entry: PublicDocEntry) {
	return {
		id: absoluteUrl(docPath(entry)),
		title: entry.data.title,
		question: entry.data.question,
		shortAnswer: entry.data.shortAnswer,
		url: absoluteUrl(docPath(entry)),
		tags: entry.data.tags,
	};
}

export async function getTopics() {
	const topics = new Map<string, { slug: string; key: string; name: string; articles: PublicDocEntry[] }>();
	for (const article of await getArticles()) {
		for (const name of article.data.tags) {
			const key = name.normalize('NFKC').trim().toLocaleLowerCase(siteConfig.locale);
			const slug = topicSlug(name);
			if (!slug) throw new Error(`标签无法生成 slug：${name}`);
			const existing = topics.get(slug);
			if (existing && existing.key !== key) throw new Error(`标签 slug 冲突：${existing.name} / ${name}`);
			if (existing) existing.articles.push(article);
			else topics.set(slug, { slug, key, name, articles: [article] });
		}
	}
	return [...topics.values()].sort((a, b) => a.name.localeCompare(b.name, siteConfig.locale));
}

export function jsonResponse(value: unknown, extraHeaders: Record<string, string> = {}) {
	return new Response(`${JSON.stringify(value, null, 2)}\n`, {
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'no-store',
			...extraHeaders,
		},
	});
}
