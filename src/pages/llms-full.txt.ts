import { seriesName } from '../lib/articles';
import { absoluteUrl, getAnswers, getArticles, getPublicProfile } from '../lib/public-data';

export async function GET() {
	const [profile, articles, answers] = await Promise.all([getPublicProfile(), getArticles(), getAnswers()]);
	const sections = [
		`# Refined-X 完整公开语料\n\n姓名：${profile.name}\n\n简介：${profile.description ?? ''}`,
		...answers.map((entry) =>
			`# ${entry.data.question}\n\n作者：${profile.name}\n\n来源：${absoluteUrl(`/${entry.id}/`)}\n\n摘要：${entry.data.shortAnswer}\n\n${entry.body ?? ''}`,
		),
		...articles.map((entry) =>
			`# ${entry.data.title}\n\n作者：${profile.name}\n\n来源：${absoluteUrl(`/${entry.id}/`)}\n\n发布日期：${entry.data.pubDate!.toISOString()}\n\n更新时间：${(entry.data.updatedDate ?? entry.data.pubDate)!.toISOString()}\n\n专栏：${seriesName(entry.data.series)}\n\n摘要：${entry.data.llmSummary}\n\n${entry.body ?? ''}`,
		),
	];
	return new Response(`${sections.join('\n\n---\n\n')}\n`, {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
}
