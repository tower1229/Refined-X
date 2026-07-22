import { mcpCatalogUrl, mcpJsonUrl, mcpServerCardUrl } from '../../lib/mcp-discovery';
import {
	MCP_ASK_URL,
	MCP_ENDPOINT_URL,
	MCP_HEALTH_URL,
	PUBLIC_ASK_CAPABILITY,
	PUBLIC_ASK_SUPPORTED,
	PUBLIC_ASK_SUPPORTED_ITEMS,
	PUBLIC_ASK_UNSUPPORTED,
	PUBLIC_ASK_UNSUPPORTED_ITEMS,
} from '../../lib/site-copy';
import { absoluteUrl, getPublicProfile, jsonResponse } from '../../lib/public-data';

export async function GET() {
	const profile = await getPublicProfile();
	return jsonResponse({
		schemaVersion: '1.0',
		name: profile.name,
		canonicalUrl: absoluteUrl('/about'),
		profileUrl: absoluteUrl('/api/profile.json'),
		articlesUrl: absoluteUrl('/api/articles.json'),
		topicsUrl: absoluteUrl('/api/topics.json'),
		searchIndexUrl: absoluteUrl('/api/search-index.json'),
		openapiUrl: absoluteUrl('/openapi.json'),
		llmsTxtUrl: absoluteUrl('/llms.txt'),
		llmsFullTxtUrl: absoluteUrl('/llms-full.txt'),
		mcpCatalogUrl: mcpCatalogUrl(),
		mcpServerCardUrl: mcpServerCardUrl(),
		mcpJsonUrl: mcpJsonUrl(),
		nlweb: {
			version: '0.55',
			capability: PUBLIC_ASK_CAPABILITY,
			askUrl: MCP_ASK_URL,
			mcpUrl: MCP_ENDPOINT_URL,
			healthUrl: MCP_HEALTH_URL,
			supported: [...PUBLIC_ASK_SUPPORTED_ITEMS],
			unsupported: [...PUBLIC_ASK_UNSUPPORTED_ITEMS],
			notes: [PUBLIC_ASK_SUPPORTED, PUBLIC_ASK_UNSUPPORTED],
		},
		policy: {
			access: 'public-read-only',
			sourceOfTruth: `Published pages and generated static endpoints on ${absoluteUrl('/')}`,
		},
	});
}
