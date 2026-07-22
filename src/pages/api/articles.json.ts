import { getArticles, jsonResponse, serializeArticle } from '../../lib/public-data';

export async function GET() {
	const articles = await getArticles();
	return jsonResponse({ count: articles.length, articles: articles.map(serializeArticle) });
}
