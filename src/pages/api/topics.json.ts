import { absoluteUrl, getTopics, jsonResponse, serializeArticle } from '../../lib/public-data';
import { sitePath } from '../../lib/paths';

export async function GET() {
	const topics = await getTopics();
	return jsonResponse({
		count: topics.length,
		topics: topics.map((topic) => ({
			name: topic.name,
			slug: topic.slug,
			url: absoluteUrl(sitePath(`/topics/${topic.slug}`)),
			articleCount: topic.articles.length,
			articles: topic.articles.map(serializeArticle),
		})),
	});
}
