import { siteConfig } from '../../site.config.mjs';
import { absoluteUrl } from './public-data';
import {
	resolvePublicCapabilities,
	siteConfigToCapabilitiesInput,
	type PublicCapabilities,
} from './public-capabilities.ts';
import { SITE_DESCRIPTION } from './site-copy';
import {
	projectAboutDiscovery,
	projectMcpCatalog,
	projectMcpJson,
	projectMcpServerCard,
	type DiscoveryUrlContext,
} from './mcp-discovery-project.ts';

export {
	projectAboutDiscovery,
	projectMcpCatalog,
	projectMcpJson,
	projectMcpServerCard,
};
export type { DiscoveryUrlContext } from './mcp-discovery-project.ts';

export const MCP_SERVER_CARD_PATH = '/.well-known/mcp/server-card.json';
export const MCP_CATALOG_PATH = '/.well-known/mcp/catalog.json';
export const MCP_JSON_PATH = '/.well-known/mcp.json';

/** @deprecated Prefer capabilities.identity.packageIdentifier — kept for existing imports. */
export const MCP_SERVER_NAME = siteConfig.mcp.packageIdentifier;

/** @deprecated Prefer capabilities.identity.serverVersion. */
export const MCP_SERVER_VERSION = '1.0.0';

export function resolveSitePublicCapabilities(config = siteConfig): PublicCapabilities {
	return resolvePublicCapabilities(siteConfigToCapabilitiesInput(config));
}

export function getPublicCapabilities(): PublicCapabilities {
	return resolveSitePublicCapabilities();
}

export function mcpServerCardUrl() {
	return absoluteUrl(MCP_SERVER_CARD_PATH);
}

export function mcpCatalogUrl() {
	return absoluteUrl(MCP_CATALOG_PATH);
}

export function mcpJsonUrl() {
	return absoluteUrl(MCP_JSON_PATH);
}

function discoveryUrlContext(): DiscoveryUrlContext {
	return {
		absoluteUrl,
		catalogUrl: mcpCatalogUrl(),
		serverCardUrl: mcpServerCardUrl(),
		mcpJsonUrl: mcpJsonUrl(),
		aboutUrl: absoluteUrl('/.well-known/about.json'),
		openapiUrl: absoluteUrl('/openapi.json'),
		siteDescription: SITE_DESCRIPTION,
	};
}

/** Instance builders used by Astro routes. */
export function buildMcpCatalog() {
	return projectMcpCatalog(getPublicCapabilities(), { serverCardUrl: mcpServerCardUrl() });
}

export function buildMcpServerCard() {
	return projectMcpServerCard(getPublicCapabilities(), discoveryUrlContext());
}

export function buildMcpJson() {
	return projectMcpJson(getPublicCapabilities(), discoveryUrlContext());
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
