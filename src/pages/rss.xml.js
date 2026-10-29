import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { siteConfig } from '../../site.config.mjs';
import { absoluteUrl } from '../lib/public-data';
import { articleModifiedDate, contentDate } from '../lib/content-dates.mjs';

export async function GET(context) {
	const articles = (await getCollection('docs', ({ data }) => data.contentType === 'article')).sort(
		(a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
	);
	const dates = articles.map((article) => articleModifiedDate(article.data).valueOf());
	const explicitUpdated = contentDate(siteConfig.feedUpdatedDate, 'feedUpdatedDate');
	if (explicitUpdated) dates.push(explicitUpdated.valueOf());
	const updated = dates.length ? new Date(Math.max(...dates)) : undefined;

	return rss({
		title: siteConfig.title,
		description: siteConfig.description,
		site: context.site,
		customData: `<language>${siteConfig.locale}</language>${updated ? `<lastBuildDate>${updated.toUTCString()}</lastBuildDate>` : ''}`,
		items: articles.map((article) => ({
			title: article.data.title,
			description: article.data.llmSummary,
			pubDate: article.data.pubDate,
			link: absoluteUrl(`/${article.id}/`),
		})),
	});
}
