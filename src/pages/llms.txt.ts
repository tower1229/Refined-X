import { SERIES_ORDER, seriesName } from '../lib/articles';
import { absoluteUrl, getAnswers, getArticles, getPublicProfile } from '../lib/public-data';
import {
	MCP_ASK_URL,
	MCP_ENDPOINT_URL,
	PUBLIC_ASK_CAPABILITY,
	PUBLIC_ASK_SUPPORTED,
	PUBLIC_ASK_UNSUPPORTED,
	SITE_BRAND,
} from '../lib/site-copy';

export async function GET() {
	const [profile, articles, answers] = await Promise.all([getPublicProfile(), getArticles(), getAnswers()]);
	const featured = articles.slice(0, 12).map((entry) =>
		`- [${entry.data.title}](${absoluteUrl(`/${entry.id}.md`)}): ${entry.data.llmSummary}`,
	);
	const answerLinks = answers.map((entry) =>
		`- [${entry.data.question}](${absoluteUrl(`/${entry.id}/`)}): ${entry.data.shortAnswer}`,
	);
	const seriesLinks = SERIES_ORDER.map((slug) =>
		`- [${seriesName(slug)}](${absoluteUrl(`/writing/${slug}/`)})`,
	);
	const askLines = MCP_ASK_URL
		? [
				`- ${PUBLIC_ASK_CAPABILITY}: POST ${MCP_ASK_URL}`,
				MCP_ENDPOINT_URL ? `- MCP ask: POST ${MCP_ENDPOINT_URL} (tool: ask, Streamable HTTP)` : '',
				`- Capability boundary: ${PUBLIC_ASK_SUPPORTED} ${PUBLIC_ASK_UNSUPPORTED}`,
			].filter(Boolean)
		: [`- Public Ask worker not configured (static search / curated answers only)`];
	const body = `# ${SITE_BRAND}

> Public articles, projects, and profile for ${profile.name}.

## Core

- [About ${profile.name}](${absoluteUrl('/about.md')})
- [Projects](${absoluteUrl('/projects/')})
- [Answers](${absoluteUrl('/answers/')})
- [Profile JSON](${absoluteUrl('/api/profile.json')})
- [OpenAPI](${absoluteUrl('/openapi.json')})
- [Full corpus](${absoluteUrl('/llms-full.txt')})
- [MCP Catalog](${absoluteUrl('/.well-known/mcp/catalog.json')})
- [MCP Server Card](${absoluteUrl('/.well-known/mcp/server-card.json')})
- [MCP discovery shim](${absoluteUrl('/.well-known/mcp.json')})
${askLines.join('\n')}

## Series

${seriesLinks.join('\n')}

## Answers

${answerLinks.join('\n')}

## Recent articles

${featured.join('\n')}
`;
	return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
