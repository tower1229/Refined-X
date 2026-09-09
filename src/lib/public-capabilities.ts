/**
 * Build-time public capability model: merges shared Ask contract facts with
 * instance config so discovery / OpenAPI / verify stay truthful.
 */

import {
	PUBLIC_ASK_CAPABILITY,
	PUBLIC_ASK_UNSUPPORTED,
	PUBLIC_ASK_UNSUPPORTED_ITEMS,
	NLWEB_VERSION,
} from '../../shared/public-ask-contract.ts';

export const PROTOCOL_PROFILE_UNDECLARED = 'undeclared' as const;
export const PROTOCOL_PROFILE_DUAL_ERA = 'dual-era' as const;

export const PROTOCOL_PROFILES = [PROTOCOL_PROFILE_UNDECLARED, PROTOCOL_PROFILE_DUAL_ERA] as const;
export type ProtocolProfileId = (typeof PROTOCOL_PROFILES)[number];

/** Protocol versions accepted by the batch-0 dual-era spike; only declared after deployment acceptance. */
export const DUAL_ERA_PROTOCOL_VERSIONS = [
	'2026-07-28',
	'2025-11-25',
	'2025-06-18',
	'2025-03-26',
] as const;

export type DeploymentMode = 'static' | 'ask-only' | 'mcp-only' | 'both';

export type AbsoluteHttpEndpoint = {
	href: string;
	origin: string;
	pathname: string;
};

export type ProtocolProfile = {
	id: ProtocolProfileId;
	claimsModernDualEra: boolean;
	declaredProtocolVersions: readonly string[];
};

/** Minimal static-site identity after legacy MCP draft discovery retirement (#18). */
export type PublicCapabilitiesIdentity = {
	brand: string;
};

export type PublicCapabilities = {
	mode: DeploymentMode;
	siteOrigin: string;
	siteBasePath: string;
	ask: AbsoluteHttpEndpoint | null;
	mcp: AbsoluteHttpEndpoint | null;
	health: AbsoluteHttpEndpoint | null;
	protocolProfile: ProtocolProfile;
	identity: PublicCapabilitiesIdentity;
	nlwebVersion: typeof NLWEB_VERSION;
	capability: typeof PUBLIC_ASK_CAPABILITY;
	supportedItems: string[];
	unsupportedItems: readonly string[];
	supportedNotes: string;
	unsupportedNotes: typeof PUBLIC_ASK_UNSUPPORTED;
};

export type PublicCapabilitiesInput = {
	site: string;
	title: string;
	ask: {
		askUrl?: string;
		mcpUrl?: string;
		healthUrl?: string;
		protocolProfile?: string;
	};
};

/** Static OpenAPI path keys that remote Ask/MCP must not overwrite. */
export const STATIC_OPENAPI_PATHS = [
	'/api/profile.json',
	'/api/articles.json',
	'/api/topics.json',
	'/api/search-index.json',
] as const;

export type SiteConfigCapabilitiesSource = {
	site: string;
	title: string;
	ask: {
		askUrl?: string;
		mcpUrl?: string;
		healthUrl?: string;
		protocolProfile?: string;
	};
};

export function siteConfigToCapabilitiesInput(config: SiteConfigCapabilitiesSource): PublicCapabilitiesInput {
	return {
		site: config.site,
		title: config.title,
		ask: {
			askUrl: config.ask.askUrl,
			mcpUrl: config.ask.mcpUrl,
			healthUrl: config.ask.healthUrl,
			protocolProfile: config.ask.protocolProfile,
		},
	};
}

/** Resolve capabilities or throw — used at site.config load for fail-fast. */
export function assertPublicCapabilitiesConfig(config: SiteConfigCapabilitiesSource): PublicCapabilities {
	return resolvePublicCapabilities(siteConfigToCapabilitiesInput(config));
}

const LOCAL_HTTP_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const STATIC_OPENAPI_PATH_SET = new Set<string>(STATIC_OPENAPI_PATHS);

function isLocalHostname(hostname: string) {
	const normalized = hostname.toLowerCase();
	return LOCAL_HTTP_HOSTS.has(normalized) || normalized.endsWith('.localhost');
}

export type ParseAbsoluteHttpUrlOptions = {
	label: string;
	allowHttpLocal?: boolean;
};

export function parseAbsoluteHttpUrl(
	value: string,
	options: ParseAbsoluteHttpUrlOptions,
): AbsoluteHttpEndpoint {
	const label = options.label;
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`${label} must be an absolute http(s) URL`);
	}

	if (url.protocol !== 'https:' && url.protocol !== 'http:') {
		throw new Error(`${label} must use http or https`);
	}
	if (url.username || url.password) {
		throw new Error(`${label} must not include userinfo`);
	}
	if (url.search) {
		throw new Error(`${label} must not include a query string`);
	}
	if (url.hash) {
		throw new Error(`${label} must not include a fragment`);
	}
	if (url.protocol === 'http:') {
		const allowLocal = options.allowHttpLocal === true && isLocalHostname(url.hostname);
		if (!allowLocal) {
			throw new Error(`${label} must use https (http is only allowed for local testing hosts)`);
		}
	}

	return {
		href: url.href,
		origin: url.origin,
		pathname: url.pathname,
	};
}

/** OpenAPI servers[].url + path must reconstruct the configured absolute endpoint. */
export function reconstructEndpointUrl(endpoint: AbsoluteHttpEndpoint) {
	return `${endpoint.origin}${endpoint.pathname}`;
}

export function openApiServerAndPath(endpoint: AbsoluteHttpEndpoint): { serverUrl: string; path: string } {
	return {
		serverUrl: endpoint.origin,
		path: endpoint.pathname,
	};
}

/** Top-level OpenAPI server for static site paths; preserves site base path when present. */
export function siteOpenApiServerUrl(caps: PublicCapabilities): string {
	if (!caps.siteBasePath || caps.siteBasePath === '/') {
		return caps.siteOrigin;
	}
	return `${caps.siteOrigin}${caps.siteBasePath.replace(/\/$/, '')}`;
}

function parseOptionalEndpoint(value: string | undefined, label: string): AbsoluteHttpEndpoint | null {
	const trimmed = (value ?? '').trim();
	if (!trimmed) return null;
	return parseAbsoluteHttpUrl(trimmed, { label, allowHttpLocal: true });
}

function resolveProtocolProfile(raw: string | undefined): ProtocolProfile {
	const id = (raw ?? PROTOCOL_PROFILE_UNDECLARED).trim() || PROTOCOL_PROFILE_UNDECLARED;
	if (id === PROTOCOL_PROFILE_UNDECLARED) {
		return {
			id: PROTOCOL_PROFILE_UNDECLARED,
			claimsModernDualEra: false,
			declaredProtocolVersions: [],
		};
	}
	if (id === PROTOCOL_PROFILE_DUAL_ERA) {
		return {
			id: PROTOCOL_PROFILE_DUAL_ERA,
			claimsModernDualEra: true,
			declaredProtocolVersions: [...DUAL_ERA_PROTOCOL_VERSIONS],
		};
	}
	throw new Error(
		`protocolProfile must be one of ${PROTOCOL_PROFILES.join(', ')}; received ${JSON.stringify(raw)}`,
	);
}

function deploymentMode(ask: AbsoluteHttpEndpoint | null, mcp: AbsoluteHttpEndpoint | null): DeploymentMode {
	if (ask && mcp) return 'both';
	if (ask) return 'ask-only';
	if (mcp) return 'mcp-only';
	return 'static';
}

function supportedItemsFor(mode: DeploymentMode): string[] {
	const items: string[] = [];
	if (mode === 'ask-only' || mode === 'both') {
		items.push('POST /ask', 'conversational_search', 'list', 'summarize', 'SSE');
	}
	if (mode === 'mcp-only' || mode === 'both') {
		if (!items.includes('list')) items.push('list');
		if (!items.includes('summarize')) items.push('summarize');
		items.push('MCP ask');
	}
	return items;
}

function supportedNotesFor(mode: DeploymentMode): string {
	if (mode === 'both') {
		return 'Supports POST /ask with conversational_search, list, summarize, buffered SSE, and MCP ask over Streamable HTTP.';
	}
	if (mode === 'ask-only') {
		return 'Supports POST /ask with conversational_search, list, summarize, and buffered SSE.';
	}
	if (mode === 'mcp-only') {
		return 'Supports MCP ask over Streamable HTTP (list default; summarize may require credentials).';
	}
	return 'No remote Ask or MCP POST endpoints are configured; static /ask/ UI is local search only.';
}

export function resolvePublicCapabilities(input: PublicCapabilitiesInput): PublicCapabilities {
	let siteUrl: URL;
	try {
		siteUrl = new URL(input.site);
	} catch {
		throw new Error('site must be an absolute URL');
	}

	const ask = parseOptionalEndpoint(input.ask.askUrl, 'askUrl');
	const mcp = parseOptionalEndpoint(input.ask.mcpUrl, 'mcpUrl');
	const health = parseOptionalEndpoint(input.ask.healthUrl, 'healthUrl');

	if (ask && mcp && ask.pathname === mcp.pathname) {
		throw new Error(
			`askUrl and mcpUrl cannot share the same pathname (${ask.pathname}); OpenAPI cannot express two POST operations on one path`,
		);
	}
	if (ask && STATIC_OPENAPI_PATH_SET.has(ask.pathname)) {
		throw new Error(
			`askUrl pathname ${ask.pathname} collides with a static OpenAPI path; choose a distinct remote path`,
		);
	}
	if (mcp && STATIC_OPENAPI_PATH_SET.has(mcp.pathname)) {
		throw new Error(
			`mcpUrl pathname ${mcp.pathname} collides with a static OpenAPI path; choose a distinct remote path`,
		);
	}

	const mode = deploymentMode(ask, mcp);
	const protocolProfile = resolveProtocolProfile(input.ask.protocolProfile);

	return {
		mode,
		siteOrigin: siteUrl.origin,
		siteBasePath: siteUrl.pathname || '/',
		ask,
		mcp,
		health,
		protocolProfile,
		identity: {
			brand: input.title,
		},
		nlwebVersion: NLWEB_VERSION,
		capability: PUBLIC_ASK_CAPABILITY,
		supportedItems: supportedItemsFor(mode),
		unsupportedItems: PUBLIC_ASK_UNSUPPORTED_ITEMS,
		supportedNotes: supportedNotesFor(mode),
		unsupportedNotes: PUBLIC_ASK_UNSUPPORTED,
	};
}
