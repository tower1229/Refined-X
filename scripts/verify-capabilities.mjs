/**
 * Capability-aware verify helpers for the static dist tree.
 * Pure functions so unit tests can cover config combinations without a full build.
 */

import { AWP_MANIFEST_PATHS, PHASE1_AWP_ACTION_IDS } from '../src/lib/awp-manifest.ts';

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

export { AWP_MANIFEST_PATHS };

/** @param {boolean} awpEnabled */
export function awpPathsMustNotExist(awpEnabled) {
	return awpEnabled ? [] : [...AWP_MANIFEST_PATHS];
}

/** @param {boolean} awpEnabled */
export function awpPathsMustExist(awpEnabled) {
	return awpEnabled ? [...AWP_MANIFEST_PATHS] : [];
}

/**
 * @param {string} rootBody
 * @param {string} wellKnownBody
 * @returns {string[]}
 */
export function verifyAwpManifestPair(rootBody, wellKnownBody) {
	const failures = [];
	if (rootBody !== wellKnownBody) {
		failures.push('/agent.json and /.well-known/agent.json must be byte-identical');
	}

	let manifest;
	try {
		manifest = JSON.parse(rootBody);
	} catch (error) {
		failures.push(`AWP manifest is not valid JSON: ${error.message}`);
		return failures;
	}

	for (const field of ['awp_version', 'domain', 'intent', 'actions']) {
		if (manifest[field] === undefined || manifest[field] === null || manifest[field] === '') {
			failures.push(`AWP manifest missing required field ${field}`);
		}
	}
	if (manifest.awp_version !== '0.2') {
		failures.push(`AWP awp_version must be "0.2" (pinned draft); got ${JSON.stringify(manifest.awp_version)}`);
	}
	if (!Array.isArray(manifest.actions) || manifest.actions.length === 0) {
		failures.push('AWP manifest actions must be a non-empty array');
	} else {
		const allowedActionIds = new Set(PHASE1_AWP_ACTION_IDS);
		const requiredActionFields = ['id', 'description', 'auth_required', 'inputs', 'outputs'];
		for (const action of manifest.actions) {
			for (const field of requiredActionFields) {
				if (action?.[field] === undefined) {
					failures.push(`AWP action ${action?.id ?? '(unknown)'} missing ${field}`);
				}
			}
			if (!action?.via && (!action?.method || !action?.endpoint)) {
				failures.push(`AWP action ${action?.id ?? '(unknown)'} needs method+endpoint or via`);
			}
			if (action?.id && !allowedActionIds.has(action.id)) {
				failures.push(`AWP action ${action.id} is outside phase-1 static read allowlist`);
			}
		}
	}

	if (manifest.protocols?.['mcp-v1'] || manifest.protocols?.['mcp-v2']) {
		failures.push('AWP must not declare fake mcp-v1/mcp-v2 protocol entries');
	}
	if (manifest.protocols?.mcp && typeof manifest.protocols.mcp.supportedVersions !== 'undefined') {
		failures.push('AWP protocols.mcp must not invent supportedVersions (not an AWP field)');
	}

	return failures;
}

/**
 * @param {string} llms
 * @param {boolean} awpEnabled
 * @returns {string[]}
 */
export function verifyLlmsHasNoAwpWhenDisabled(llms, awpEnabled) {
	if (awpEnabled) return [];
	const failures = [];
	if (/agent\.json/i.test(llms)) {
		failures.push('llms.txt must not link AWP agent.json when discovery.awp is off');
	}
	return failures;
}

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
