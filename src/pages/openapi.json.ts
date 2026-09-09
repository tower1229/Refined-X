import { siteConfig } from '../../site.config.mjs';
import { jsonResponse } from '../lib/public-data';
import { buildOpenApiDocument } from '../lib/openapi-document';
import { resolveSitePublicCapabilities } from '../lib/mcp-discovery';

export function GET() {
	return jsonResponse(buildOpenApiDocument(resolveSitePublicCapabilities(siteConfig)));
}
