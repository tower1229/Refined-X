/**
 * Capability-aware verify helpers for the static dist tree.
 * Pure functions so unit tests can cover config combinations without a full build.
 */

/**
 * @param {object} caps
 * @param {object} openapi
 * @returns {string[]}
 */
export function verifyOpenApiAgainstCapabilities(caps, openapi) {
	const failures = [];
	const paths = openapi?.paths ?? {};

	if (!caps.ask) {
		for (const [pathKey, methods] of Object.entries(paths)) {
			if (methods?.post?.operationId === 'askPublicContent') {
				failures.push(`openapi.json must not declare remote Ask POST at ${pathKey} in ${caps.mode} mode`);
			}
		}
	} else {
		const askPath = caps.ask.pathname;
		const askPost = paths[askPath]?.post;
		if (!askPost) {
			failures.push(`openapi.json missing Ask POST at configured path ${askPath}`);
		} else {
			const serverUrl = askPost.servers?.[0]?.url;
			if (serverUrl !== caps.ask.origin) {
				failures.push(`openapi.json Ask server ${serverUrl} !== ${caps.ask.origin}`);
			}
			if (`${serverUrl}${askPath}` !== `${caps.ask.origin}${caps.ask.pathname}`) {
				failures.push(
					`openapi.json Ask server+path ${serverUrl}${askPath} !== configured ${caps.ask.origin}${caps.ask.pathname}`,
				);
			}
		}
	}

	if (!caps.mcp) {
		for (const [pathKey, methods] of Object.entries(paths)) {
			if (methods?.post?.operationId === 'mcpStreamableHttp') {
				failures.push(`openapi.json must not declare remote MCP POST at ${pathKey} in ${caps.mode} mode`);
			}
		}
	} else {
		const mcpPath = caps.mcp.pathname;
		const mcpPost = paths[mcpPath]?.post;
		if (!mcpPost) {
			failures.push(`openapi.json missing MCP POST at configured path ${mcpPath}`);
		} else {
			const serverUrl = mcpPost.servers?.[0]?.url;
			if (serverUrl !== caps.mcp.origin) {
				failures.push(`openapi.json MCP server ${serverUrl} !== ${caps.mcp.origin}`);
			}
			if (`${serverUrl}${mcpPath}` !== `${caps.mcp.origin}${caps.mcp.pathname}`) {
				failures.push(
					`openapi.json MCP server+path ${serverUrl}${mcpPath} !== configured ${caps.mcp.origin}${caps.mcp.pathname}`,
				);
			}
		}
	}

	return failures;
}

/**
 * @param {string} llms
 * @param {object} caps
 * @returns {string[]}
 */
export function verifyLlmsAgainstCapabilities(caps, llms) {
	const failures = [];
	if (!llms.includes('# ')) failures.push('llms.txt looks empty');

	if (caps.mcp && !llms.includes(caps.mcp.href)) {
		failures.push('llms.txt missing configured MCP URL');
	}
	if (caps.ask && !llms.includes(caps.ask.href)) {
		failures.push('llms.txt missing configured Ask URL');
	}

	// Retired paths must not be primary recommendations (no bare primary bullets without "compatibility").
	const primaryCatalog = /^\s*-\s*\[MCP Catalog\]/m.test(llms);
	const primaryShim = /^\s*-\s*\[MCP discovery shim\]/m.test(llms);
	if (primaryCatalog) failures.push('llms.txt still recommends MCP Catalog as a primary link');
	if (primaryShim) failures.push('llms.txt still recommends MCP discovery shim as a primary link');

	return failures;
}

/** Paths that must not exist during this migration stage (AWP not in scope). */
export const MUST_NOT_EXIST_PATHS = ['/agent.json', '/.well-known/agent.json'];

/** Fixed discovery files for this migration/compatibility stage (not mode-conditional yet). */
export function requiredDiscoveryFilesForStage() {
	return [
		'/.well-known/about.json',
		'/.well-known/mcp.json',
		'/.well-known/mcp/catalog.json',
		'/.well-known/mcp/server-card.json',
		'/llms.txt',
		'/openapi.json',
	];
}
