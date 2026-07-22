import type { CollectionEntry } from 'astro:content';
import { getArticles } from '../../../../lib/public-data';

interface Props {
	article: CollectionEntry<'docs'>;
}

export async function getStaticPaths() {
	return (await getArticles()).map((article) => {
		const [year, month, day, ...slugParts] = article.id.split('/');
		return {
			params: { year, month, day, slug: slugParts.join('/') },
			props: { article },
		};
	});
}

export function GET({ props }: { props: Props }) {
	const { article } = props;
	const frontmatter = [
		'---',
		`title: ${JSON.stringify(article.data.title)}`,
		`description: ${JSON.stringify(article.data.description)}`,
		`pubDate: ${article.data.pubDate!.toISOString()}`,
		`tags: ${JSON.stringify(article.data.tags)}`,
		'---',
	].join('\n');
	return new Response(`${frontmatter}\n\n${article.body ?? ''}\n`, {
		headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
	});
}
