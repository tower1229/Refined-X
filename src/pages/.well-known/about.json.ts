import { mcpCatalogUrl, mcpJsonUrl, mcpServerCardUrl, getPublicCapabilities, projectAboutDiscovery } from '../../lib/mcp-discovery';
import { absoluteUrl, getPublicProfile, jsonResponse } from '../../lib/public-data';

export async function GET() {
	const profile = await getPublicProfile();
	const caps = getPublicCapabilities();
	return jsonResponse(
		projectAboutDiscovery(caps, {
			absoluteUrl,
			catalogUrl: mcpCatalogUrl(),
			serverCardUrl: mcpServerCardUrl(),
			mcpJsonUrl: mcpJsonUrl(),
			aboutUrl: absoluteUrl('/.well-known/about.json'),
			openapiUrl: absoluteUrl('/openapi.json'),
			profile: {
				name: profile.name,
				canonicalUrl: absoluteUrl('/about'),
			},
		}),
	);
}
