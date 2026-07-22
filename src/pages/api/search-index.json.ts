import { formatArticleDate, seriesName } from '../../lib/articles';
import { docPath, getAnswers, getArticles, jsonResponse } from '../../lib/public-data';

export async function GET() {
	const [articles, answers] = await Promise.all([getArticles(), getAnswers()]);
	const articleItems = articles.map((entry) => ({
		url: docPath(entry),
		title: entry.data.title || entry.id,
		excerpt: entry.data.llmSummary || entry.data.description || '',
		tags: entry.data.tags,
		series: entry.data.series || '',
		seriesName: seriesName(entry.data.series),
		date: formatArticleDate(entry.data.pubDate!),
	}));
	const answerItems = answers.map((entry) => ({
		url: docPath(entry),
		q: entry.data.question || entry.data.title,
		a: entry.data.shortAnswer || entry.data.description || '',
		full: entry.body || '',
	}));
	return jsonResponse({
		articles: articleItems,
		answers: answerItems,
		items: [
			...articleItems.map((item) => ({ type: 'article', ...item })),
			...answerItems.map((item) => ({ type: 'answer', title: item.q, excerpt: item.a, url: item.url })),
		],
	});
}
