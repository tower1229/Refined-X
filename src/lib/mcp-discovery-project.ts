import type { PublicCapabilities } from './public-capabilities.ts';

export type DiscoveryUrlContext = {
	absoluteUrl: (pathname: string) => string;
	catalogUrl: string;
	serverCardUrl: string;
	mcpJsonUrl: string;
	aboutUrl: string;
	openapiUrl: string;
	siteDescription?: string;
};

function cardDescription(caps: PublicCapabilities) {
	return `${caps.identity.brand} Public Ask: ${caps.capability}. ${caps.supportedNotes} ${caps.unsupportedNotes}`;
}

/** Legacy draft MCP Catalog — thin compatibility projection (not an official stable standard). */
export function projectMcpCatalog(caps: PublicCapabilities, urls: Pick<DiscoveryUrlContext, 'serverCardUrl'>) {
	return {
		specVersion: 'draft',
		maturity: 'legacy-draft-compatibility',
		notes:
			'Historical SEP-2127-shaped catalog kept as a thin compatibility projection. Prefer OpenAPI, about.json, and the configured MCP endpoint URL.',
		entries: caps.mcp
			? [
					{
						identifier: caps.identity.airIdentifier,
						displayName: `${caps.identity.brand} Public Ask`,
						mediaType: 'application/mcp-server-card+json',
						url: urls.serverCardUrl,
					},
				]
			: [],
	};
}

/** MCP Server Card — identity + remotes projected from shared capabilities. */
export function projectMcpServerCard(caps: PublicCapabilities, urls: DiscoveryUrlContext) {
	const remotes = caps.mcp
		? [
				{
					type: 'streamable-http' as const,
					url: caps.mcp.href,
					headers: [
						{
							name: 'Authorization',
							description:
								'Optional Bearer API key. Anonymous clients default to list; summarize modes may require credentials.',
							isRequired: false,
							isSecret: true,
							value: 'Bearer {token}',
							variables: {
								token: {
									description: 'Machine API key (optional)',
									isRequired: false,
									isSecret: true,
								},
							},
						},
					],
					...(caps.protocolProfile.declaredProtocolVersions.length > 0
						? { supportedProtocolVersions: [...caps.protocolProfile.declaredProtocolVersions] }
						: {}),
				},
			]
		: [];

	return {
		$schema: 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json',
		name: caps.identity.packageIdentifier,
		version: caps.identity.serverVersion,
		description: cardDescription(caps),
		title: `${caps.identity.brand} Public Ask`,
		websiteUrl: urls.absoluteUrl('/'),
		remotes,
		_meta: {
			[caps.identity.discoveryMetaKey]: {
				healthUrl: caps.health?.href,
				aboutUrl: urls.aboutUrl,
				openapiUrl: urls.openapiUrl,
				siteDescription: urls.siteDescription ?? '',
				access: 'public-read-only',
				capability: caps.capability,
				supported: [...caps.supportedItems],
				unsupported: [...caps.unsupportedItems],
				protocolProfile: caps.protocolProfile.id,
				claimsModernDualEra: caps.protocolProfile.claimsModernDualEra,
			},
		},
	};
}

/**
 * Compatibility shim for clients still probing `/.well-known/mcp.json`.
 * Thin projection of the server card + catalog pointers.
 */
export function projectMcpJson(caps: PublicCapabilities, urls: DiscoveryUrlContext) {
	const card = projectMcpServerCard(caps, urls);
	return {
		schemaVersion: '1.0',
		catalogUrl: urls.catalogUrl,
		serverCardUrl: urls.serverCardUrl,
		name: card.name,
		title: card.title,
		description: card.description,
		version: card.version,
		websiteUrl: card.websiteUrl,
		remotes: card.remotes,
		healthUrl: caps.health?.href,
		maturity: 'legacy-draft-compatibility',
	};
}

export type AboutDiscoveryProfile = {
	name: string;
	canonicalUrl: string;
};

export function projectAboutDiscovery(
	caps: PublicCapabilities,
	urls: DiscoveryUrlContext & { profile: AboutDiscoveryProfile },
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
		/** Kept at top level for existing clients during the compatibility window. */
		mcpCatalogUrl: urls.catalogUrl,
		mcpServerCardUrl: urls.serverCardUrl,
		mcpJsonUrl: urls.mcpJsonUrl,
		discoveryMaturity: 'legacy-draft-compatibility',
		discoveryNotes:
			'MCP catalog / server-card / mcp.json are legacy draft compatibility projections. Prefer OpenAPI, this about index, and the configured MCP endpoint URL when present.',
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
