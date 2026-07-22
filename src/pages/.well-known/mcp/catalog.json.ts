import { buildMcpCatalog, discoveryJsonResponse } from '../../../lib/mcp-discovery';

export function GET() {
	return discoveryJsonResponse(buildMcpCatalog());
}
