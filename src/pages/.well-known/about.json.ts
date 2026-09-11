import { getPublicCapabilities, projectAboutDiscovery } from '../../lib/mcp-discovery';
import { absoluteUrl, getPublicProfile, jsonResponse } from '../../lib/public-data';

export async function GET() {
	const profile = await getPublicProfile();
	const caps = getPublicCapabilities();
	return jsonResponse(
		projectAboutDiscovery(caps, {
			absoluteUrl,
			openapiUrl: absoluteUrl('/openapi.json'),
			profile: {
				name: profile.name,
				canonicalUrl: absoluteUrl('/about'),
			},
		}),
	);
}
