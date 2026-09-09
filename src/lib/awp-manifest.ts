/**
 * Optional AWP discovery manifest projection (draft 0.2).
 * Gated by instance `discovery.awp` (default off). Phase-1 actions mirror
 * public static JSON reads only — Ask is not crushed into one auth_required action.
 *
 * Start gate (#17): consumer = official `agent-json` validator + Claude Code via
 * AWP MCP server; access = GET /agent.json and /.well-known/agent.json;
 * draft pin = awp_version "0.2"; acceptance = validate manifests then read
 * profile / articles / topics / search-index static APIs.
 */

import type { PublicCapabilities } from './public-capabilities.ts';

/** AWP Specification Draft RFC v0.2 — not the validator package patch (0.2.1). */
export const AWP_DRAFT_VERSION = '0.2' as const;

/** Dual discovery paths; both must emit identical serialized bytes when enabled. */
export const AWP_MANIFEST_PATHS = ['/agent.json', '/.well-known/agent.json'] as const;

/** Phase-1 action ids — shared by builder and verify allowlist. */
export const PHASE1_AWP_ACTION_IDS = [
	'get_profile',
	'list_articles',
	'list_topics',
	'get_search_index',
] as const;

export type Phase1AwpActionId = (typeof PHASE1_AWP_ACTION_IDS)[number];

export type AwpDiscoveryConfig = {
	discovery?: {
		awp?: boolean;
	};
};

export type AwpAction = {
	id: string;
	description: string;
	auth_required: boolean;
	inputs: Record<string, { type: string; required?: boolean; description?: string }>;
	outputs: Record<string, string>;
	endpoint: string;
	method: 'GET';
};

export type AwpManifest = {
	awp_version: typeof AWP_DRAFT_VERSION;
	domain: string;
	intent: string;
	protocols?: {
		mcp: {
			version: string;
			endpoint: string;
		};
	};
	entities?: Record<string, { fields: Record<string, string> }>;
	actions: AwpAction[];
};

export type BuildAwpManifestOptions = {
	intent: string;
	/** Site URL pathname (e.g. `/` or `/refined-x/`). Prefixed onto static API endpoints. */
	siteBasePath: string;
};

export function isAwpDiscoveryEnabled(config: AwpDiscoveryConfig): boolean {
	return config.discovery?.awp === true;
}

function staticApiEndpoint(siteBasePath: string, apiPath: string): string {
	const base = siteBasePath === '/' ? '' : siteBasePath.replace(/\/$/, '');
	const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
	return `${base}${path}`;
}

function domainFromSiteOrigin(siteOrigin: string): string {
	return new URL(siteOrigin).hostname;
}

function buildEntities(): NonNullable<AwpManifest['entities']> {
	return {
		profile: {
			fields: {
				id: 'url',
				name: 'string',
				jobTitle: 'string',
				description: 'string',
				url: 'url',
				sameAs: 'array[url]',
			},
		},
		article_summary: {
			fields: {
				id: 'url',
				title: 'string',
				description: 'string',
				llmSummary: 'string',
				url: 'url',
				pubDate: 'ISO8601',
				updatedDate: 'ISO8601',
				tags: 'array[string]',
				markdownUrl: 'url',
			},
		},
		topic_summary: {
			fields: {
				name: 'string',
				slug: 'string',
				url: 'url',
				articleCount: 'integer',
				articles: 'array[article_summary]',
			},
		},
	};
}

function buildStaticActions(siteBasePath: string): AwpAction[] {
	const byId: Record<Phase1AwpActionId, AwpAction> = {
		get_profile: {
			id: 'get_profile',
			description: 'Fetch the public author profile JSON (identity, bio, links).',
			auth_required: false,
			inputs: {},
			outputs: {
				id: 'url',
				name: 'string',
				jobTitle: 'string',
				description: 'string',
				url: 'url',
				sameAs: 'array[url]',
			},
			endpoint: staticApiEndpoint(siteBasePath, '/api/profile.json'),
			method: 'GET',
		},
		list_articles: {
			id: 'list_articles',
			description: 'List public articles as a static JSON index (count + article summaries).',
			auth_required: false,
			inputs: {},
			outputs: {
				count: 'integer',
				articles: 'array[article_summary]',
			},
			endpoint: staticApiEndpoint(siteBasePath, '/api/articles.json'),
			method: 'GET',
		},
		list_topics: {
			id: 'list_topics',
			description: 'List public topic tags with linked article summaries.',
			auth_required: false,
			inputs: {},
			outputs: {
				count: 'integer',
				topics: 'array[topic_summary]',
			},
			endpoint: staticApiEndpoint(siteBasePath, '/api/topics.json'),
			method: 'GET',
		},
		get_search_index: {
			id: 'get_search_index',
			description:
				'Retrieve the prebuilt static search index JSON for offline/local filtering. This is index retrieval, not a query search API.',
			auth_required: false,
			inputs: {},
			outputs: {
				articles: 'array[object]',
				answers: 'array[object]',
				items: 'array[object]',
			},
			endpoint: staticApiEndpoint(siteBasePath, '/api/search-index.json'),
			method: 'GET',
		},
	};
	return PHASE1_AWP_ACTION_IDS.map((id) => byId[id]);
}

function buildMcpProtocol(caps: PublicCapabilities): AwpManifest['protocols'] | undefined {
	if (!caps.mcp) return undefined;
	const versions = caps.protocolProfile.declaredProtocolVersions;
	if (versions.length === 0) return undefined;
	return {
		mcp: {
			version: versions[0]!,
			endpoint: caps.mcp.href,
		},
	};
}

/** Build a draft-0.2 AWP manifest from shared public capabilities (static reads + optional MCP). */
export function buildAwpManifest(caps: PublicCapabilities, options: BuildAwpManifestOptions): AwpManifest {
	const protocols = buildMcpProtocol(caps);
	return {
		awp_version: AWP_DRAFT_VERSION,
		domain: domainFromSiteOrigin(caps.siteOrigin),
		intent: options.intent,
		...(protocols ? { protocols } : {}),
		entities: buildEntities(),
		actions: buildStaticActions(options.siteBasePath),
	};
}

/** Canonical serialization shared by both discovery paths (byte-identical). */
export function serializeAwpManifest(manifest: AwpManifest): string {
	return `${JSON.stringify(manifest, null, 2)}\n`;
}
