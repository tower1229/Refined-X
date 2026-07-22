import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { siteConfig } from '../../site.config.mjs';

export async function GET(context) {
	const articles = (await getCollection('docs', ({ data }) => data.contentType === 'article')).sort(
		(a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
	);

	return rss({
		title: siteConfig.title,
		description: siteConfig.description,
		site: context.site,
		items: articles.map((article) => ({
			title: article.data.title,
			description: article.data.llmSummary,
			pubDate: article.data.pubDate,
			link: `/${article.id}`,
		})),
	});
}
