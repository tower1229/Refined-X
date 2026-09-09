import { SERIES_ORDER, seriesName } from '../lib/articles';
import { absoluteUrl, getAnswers, getArticles, getPublicProfile } from '../lib/public-data';
import { getPublicCapabilities } from '../lib/mcp-discovery';
import { SITE_BRAND } from '../lib/site-copy';

export async function GET() {
	const [profile, articles, answers] = await Promise.all([getPublicProfile(), getArticles(), getAnswers()]);
	const caps = getPublicCapabilities();
	const featured = articles.slice(0, 12).map((entry) =>
		`- [${entry.data.title}](${absoluteUrl(`/${entry.id}.md`)}): ${entry.data.llmSummary}`,
	);
	const answerLinks = answers.map((entry) =>
		`- [${entry.data.question}](${absoluteUrl(`/${entry.id}/`)}): ${entry.data.shortAnswer}`,
	);
	const seriesLinks = SERIES_ORDER.map((slug) =>
		`- [${seriesName(slug)}](${absoluteUrl(`/writing/${slug}/`)})`,
	);

	const askLines: string[] = [];
	if (caps.ask) {
		askLines.push(`- ${caps.capability}: POST ${caps.ask.href}`);
	}
	if (caps.mcp) {
		askLines.push(`- MCP ask: POST ${caps.mcp.href} (tool: ask, Streamable HTTP)`);
	}
	if (caps.ask || caps.mcp) {
		askLines.push(`- Capability boundary: ${caps.supportedNotes} ${caps.unsupportedNotes}`);
		askLines.push(`- Protocol profile: ${caps.protocolProfile.id}`);
	} else {
		askLines.push(`- Public Ask worker not configured (static search / curated answers only)`);
	}

	const discoveryLines = [
		`- [OpenAPI](${absoluteUrl('/openapi.json')})`,
		`- [About index](${absoluteUrl('/.well-known/about.json')})`,
	];
	if (caps.mcp) {
		discoveryLines.push(`- MCP endpoint (primary): POST ${caps.mcp.href}`);
		discoveryLines.push(
			`- Legacy MCP discovery projections (compatibility only): [catalog](${absoluteUrl('/.well-known/mcp/catalog.json')}), [server card](${absoluteUrl('/.well-known/mcp/server-card.json')}), [mcp.json](${absoluteUrl('/.well-known/mcp.json')})`,
		);
	}

	const body = `# ${SITE_BRAND}

> Public articles, projects, and profile for ${profile.name}.

## Core

- [About ${profile.name}](${absoluteUrl('/about.md')})
- [Projects](${absoluteUrl('/projects/')})
- [Answers](${absoluteUrl('/answers/')})
- [Profile JSON](${absoluteUrl('/api/profile.json')})
- [Full corpus](${absoluteUrl('/llms-full.txt')})
${discoveryLines.join('\n')}
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
