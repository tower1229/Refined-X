import type { PublicCapabilities } from './public-capabilities.ts';

export type AboutDiscoveryUrlContext = {
	absoluteUrl: (pathname: string) => string;
	openapiUrl: string;
};

export type AboutDiscoveryProfile = {
	name: string;
	canonicalUrl: string;
};

/** Refined-X owned about index — not an MCP draft discovery document. */
export function projectAboutDiscovery(
	caps: PublicCapabilities,
	urls: AboutDiscoveryUrlContext & { profile: AboutDiscoveryProfile },
) {
	return {
		schemaVersion: '1.0',
		format: 'refined-x-about',
		name: urls.profile.name,
		canonicalUrl: urls.profile.canonicalUrl,
		profileUrl: urls.absoluteUrl('/api/profile.json'),
		articlesUrl: urls.absoluteUrl('/api/articles.json'),
		topicsUrl: urls.absoluteUrl('/api/topics.json'),
		searchIndexUrl: urls.absoluteUrl('/api/search-index.json'),
		openapiUrl: urls.openapiUrl,
		llmsTxtUrl: urls.absoluteUrl('/llms.txt'),
		llmsFullTxtUrl: urls.absoluteUrl('/llms-full.txt'),
		...(caps.mcp ? { mcpUrl: caps.mcp.href } : {}),
		nlweb: {
			version: caps.nlwebVersion,
			capability: caps.capability,
			askUrl: caps.ask?.href ?? '',
			mcpUrl: caps.mcp?.href ?? '',
			healthUrl: caps.health?.href ?? '',
			supported: [...caps.supportedItems],
			unsupported: [...caps.unsupportedItems],
			notes: [caps.supportedNotes, caps.unsupportedNotes],
			protocolProfile: caps.protocolProfile.id,
		},
		policy: {
			access: 'public-read-only',
			sourceOfTruth: `Published pages and generated static endpoints on ${urls.absoluteUrl('/')}`,
		},
	};
}
