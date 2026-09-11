import { siteConfig } from '../../site.config.mjs';
import {
	resolvePublicCapabilities,
	siteConfigToCapabilitiesInput,
	type PublicCapabilities,
} from './public-capabilities.ts';
import { projectAboutDiscovery } from './mcp-discovery-project.ts';

export { projectAboutDiscovery };
export type { AboutDiscoveryProfile, AboutDiscoveryUrlContext } from './mcp-discovery-project.ts';

export function resolveSitePublicCapabilities(config = siteConfig): PublicCapabilities {
	return resolvePublicCapabilities(siteConfigToCapabilitiesInput(config));
}

export function getPublicCapabilities(): PublicCapabilities {
	return resolveSitePublicCapabilities();
}
