import type { CollectionEntry } from 'astro:content';
import { SITE_BRAND, SITE_HOME_TITLE } from './site-copy';
import { absoluteUrl } from './public-data';

export const DEFAULT_SEO_IMAGE = '/asset/og-default.png';

export type SeoHeadTag = {
	tag: 'title' | 'base' | 'link' | 'style' | 'meta' | 'script' | 'noscript' | 'template';
	attrs?: Record<string, string | boolean | undefined>;
	content?: string;
};
type SeoHead = SeoHeadTag[];

function pagePath(pathname: string) {
	if (pathname === '/') return '/';
	return pathname.endsWith('/') ? pathname : `${pathname}/`;
}


function pageTitle(entry: CollectionEntry<'docs'>, pathname: string) {
	if (pathname === '/') return SITE_HOME_TITLE;
	return `${entry.data.title}｜${SITE_BRAND}`;
}

function tagKey(tag: SeoHeadTag) {
	if (tag.tag === 'title') return 'title';
	if (tag.tag === 'link' && tag.attrs?.rel === 'canonical') return 'canonical';
	if (tag.tag === 'meta') {
		if (tag.attrs?.name) return `meta:name:${tag.attrs.name}`;
		if (tag.attrs?.property === 'article:tag') return undefined;
		if (tag.attrs?.property) return `meta:property:${tag.attrs.property}`;
	}
	return undefined;
}

export function normalizeSeoHead({
	head,
	entry,
	pathname,
}: {
	head: SeoHead;
	entry: CollectionEntry<'docs'>;
	pathname: string;
}): SeoHead {
	const isNotFound = pathname === '/404' || pathname === '/404/';
	const title = pageTitle(entry, pathname);
	const description = entry.data.description;
	const canonical = isNotFound ? undefined : absoluteUrl(pagePath(pathname));
	const image = absoluteUrl(entry.data.seoImage ?? DEFAULT_SEO_IMAGE);
	const contentType = entry.data.contentType;
	const preservedRobots = head.find(
		(tag) => tag.tag === 'meta' && tag.attrs?.name === 'robots',
	);
	const replaceKeys = new Set([
		'title',
		'canonical',
		'meta:name:description',
		'meta:name:twitter:card',
		'meta:name:twitter:title',
		'meta:name:twitter:description',
		'meta:name:twitter:image',
		'meta:property:og:title',
		'meta:property:og:type',
		'meta:property:og:url',
		'meta:property:og:description',
		'meta:property:og:image',
		'meta:property:article:published_time',
		'meta:property:article:modified_time',
		'meta:property:article:section',
	]);
	const normalized = head.filter((tag) => {
		const key = tagKey(tag);
		return !key || !replaceKeys.has(key);
	});

	normalized.push(
		{ tag: 'title', content: title },
		{ tag: 'meta', attrs: { name: 'description', content: description } },
		{ tag: 'meta', attrs: { property: 'og:title', content: title } },
		{ tag: 'meta', attrs: { property: 'og:type', content: contentType === 'article' ? 'article' : 'website' } },
		{ tag: 'meta', attrs: { property: 'og:description', content: description } },
		{ tag: 'meta', attrs: { property: 'og:image', content: image } },
		{ tag: 'meta', attrs: { name: 'twitter:card', content: 'summary' } },
		{ tag: 'meta', attrs: { name: 'twitter:title', content: title } },
		{ tag: 'meta', attrs: { name: 'twitter:description', content: description } },
		{ tag: 'meta', attrs: { name: 'twitter:image', content: image } },
	);
	if (canonical) {
		normalized.push(
			{ tag: 'link', attrs: { rel: 'canonical', href: canonical } },
			{ tag: 'meta', attrs: { property: 'og:url', content: canonical } },
		);
	}
	if (isNotFound && !preservedRobots) {
		normalized.push({ tag: 'meta', attrs: { name: 'robots', content: 'noindex, follow' } });
	}
	if (contentType === 'article') {
		normalized.push(
			{ tag: 'meta', attrs: { property: 'article:published_time', content: entry.data.pubDate!.toISOString() } },
			{
				tag: 'meta',
				attrs: {
					property: 'article:modified_time',
					content: (entry.data.updatedDate ?? entry.data.pubDate)!.toISOString(),
				},
			},
			{
				tag: 'meta',
				attrs: { property: 'article:section', content: entry.data.series },
			},
			...entry.data.tags.map((tag) => ({
				tag: 'meta' as const,
				attrs: { property: 'article:tag', content: tag },
			})),
		);
	}

	const seen = new Set<string>();
	return normalized.filter((tag) => {
		const key = tagKey(tag);
		if (!key) return true;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
