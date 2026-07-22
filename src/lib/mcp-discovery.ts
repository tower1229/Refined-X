import {
	MCP_ENDPOINT_URL,
	MCP_HEALTH_URL,
	PUBLIC_ASK_CAPABILITY,
	PUBLIC_ASK_SUPPORTED,
	PUBLIC_ASK_SUPPORTED_ITEMS,
	PUBLIC_ASK_UNSUPPORTED,
	PUBLIC_ASK_UNSUPPORTED_ITEMS,
	SITE_BRAND,
	SITE_DESCRIPTION,
} from './site-copy';
import { siteConfig } from '../../site.config.mjs';
import { absoluteUrl } from './public-data';

/** Reverse-DNS server id for MCP Server Card / Catalog. */
export const MCP_SERVER_NAME = siteConfig.mcp.packageIdentifier;

/** Matches Public Ask worker initialize `serverInfo.version`. */
export const MCP_SERVER_VERSION = '1.0.0';

/** Protocol version returned by the live MCP initialize handshake. */
export const MCP_PROTOCOL_VERSION = '2024-11-05';

export const MCP_SERVER_CARD_PATH = '/.well-known/mcp/server-card.json';
export const MCP_CATALOG_PATH = '/.well-known/mcp/catalog.json';
export const MCP_JSON_PATH = '/.well-known/mcp.json';

const MCP_CARD_DESCRIPTION =
	`${SITE_BRAND} Public Ask: ${PUBLIC_ASK_CAPABILITY}. ${PUBLIC_ASK_SUPPORTED} ${PUBLIC_ASK_UNSUPPORTED}`;

export function mcpServerCardUrl() {
	return absoluteUrl(MCP_SERVER_CARD_PATH);
}

export function mcpCatalogUrl() {
	return absoluteUrl(MCP_CATALOG_PATH);
}

export function mcpJsonUrl() {
	return absoluteUrl(MCP_JSON_PATH);
}

/** Official MCP Catalog (SEP-2127 discovery entrypoint). */
export function buildMcpCatalog() {
	return {
		specVersion: 'draft',
		entries: [
			{
				identifier: siteConfig.mcp.airIdentifier,
				displayName: `${SITE_BRAND} Public Ask`,
				mediaType: 'application/mcp-server-card+json',
				url: mcpServerCardUrl(),
			},
		],
	};
}

/** MCP Server Card — identity + remotes only (no primitives). */
export function buildMcpServerCard() {
	const remotes = MCP_ENDPOINT_URL
		? [
				{
					type: 'streamable-http',
					url: MCP_ENDPOINT_URL,
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
					supportedProtocolVersions: [MCP_PROTOCOL_VERSION],
				},
			]
		: [];

	return {
		$schema: 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json',
		name: MCP_SERVER_NAME,
		version: MCP_SERVER_VERSION,
		description: MCP_CARD_DESCRIPTION,
		title: `${SITE_BRAND} Public Ask`,
		websiteUrl: absoluteUrl('/'),
		remotes,
		_meta: {
			[siteConfig.mcp.discoveryMetaKey ?? `${siteConfig.mcp.packageIdentifier}/discovery`]: {
				healthUrl: MCP_HEALTH_URL || undefined,
				aboutUrl: absoluteUrl('/.well-known/about.json'),
				openapiUrl: absoluteUrl('/openapi.json'),
				siteDescription: SITE_DESCRIPTION,
				access: 'public-read-only',
				capability: PUBLIC_ASK_CAPABILITY,
				supported: [...PUBLIC_ASK_SUPPORTED_ITEMS],
				unsupported: [...PUBLIC_ASK_UNSUPPORTED_ITEMS],
			},
		},
	};
}

/**
 * Compatibility shim for clients still probing `/.well-known/mcp.json`.
 * Canonical discovery is the Catalog; this document points there and mirrors
 * the primary remote for naive consumers.
 */
export function buildMcpJson() {
	const card = buildMcpServerCard();
	return {
		schemaVersion: '1.0',
		catalogUrl: mcpCatalogUrl(),
		serverCardUrl: mcpServerCardUrl(),
		name: card.name,
		title: card.title,
		description: card.description,
		version: card.version,
		websiteUrl: card.websiteUrl,
		remotes: card.remotes,
		healthUrl: MCP_HEALTH_URL || undefined,
	};
}

export function discoveryJsonResponse(value: unknown, contentType = 'application/json; charset=utf-8') {
	return new Response(`${JSON.stringify(value, null, 2)}\n`, {
		headers: {
			'Content-Type': contentType,
			'Cache-Control': 'public, max-age=3600',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET',
			'Access-Control-Allow-Headers': 'Content-Type, Accept',
		},
	});
}
