import { siteConfig } from '../../../site.config.mjs';
import { handleAwpManifestRequest } from '../../lib/awp-manifest-route';

export function GET() {
	return handleAwpManifestRequest(siteConfig);
}
