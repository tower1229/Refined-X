/**
 * Thin route helpers for optional AWP discovery endpoints.
 * Both `/agent.json` and `/.well-known/agent.json` must call the same serializer.
 */

import {
	buildAwpManifest,
	isAwpDiscoveryEnabled,
	serializeAwpManifest,
	type AwpDiscoveryConfig,
} from './awp-manifest.ts';
import {
	resolvePublicCapabilities,
	siteConfigToCapabilitiesInput,
	type SiteConfigCapabilitiesSource,
} from './public-capabilities.ts';

export type AwpRouteSiteConfig = SiteConfigCapabilitiesSource &
	AwpDiscoveryConfig & {
		description?: string;
	};

/** Returns serialized manifest bytes when `discovery.awp` is on; otherwise null (route emits 404). */
export function resolveSiteAwpManifestBody(config: AwpRouteSiteConfig): string | null {
	if (!isAwpDiscoveryEnabled(config)) return null;
	const caps = resolvePublicCapabilities(siteConfigToCapabilitiesInput(config));
	const intent =
		(typeof config.description === 'string' && config.description.trim()) ||
		`${caps.identity.brand} public site with static JSON APIs`;
	const manifest = buildAwpManifest(caps, {
		intent,
		siteBasePath: caps.siteBasePath,
	});
	return serializeAwpManifest(manifest);
}

/** Shared GET handler for both AWP discovery paths. */
export function handleAwpManifestRequest(config: AwpRouteSiteConfig): Response {
	const body = resolveSiteAwpManifestBody(config);
	if (body === null) {
		return new Response(null, { status: 404, statusText: 'Not Found' });
	}
	return new Response(body, {
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'no-store',
		},
	});
}
