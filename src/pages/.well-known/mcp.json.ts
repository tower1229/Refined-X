import { buildMcpJson, discoveryJsonResponse } from '../../lib/mcp-discovery';

/** Compatibility probe path; prefer /.well-known/mcp/catalog.json. */
export function GET() {
	return discoveryJsonResponse(buildMcpJson());
}
