import { buildMcpServerCard, discoveryJsonResponse } from '../../../lib/mcp-discovery';

export function GET() {
	return discoveryJsonResponse(buildMcpServerCard(), 'application/mcp-server-card+json; charset=utf-8');
}
