import assert from 'node:assert/strict';
import test from 'node:test';
import {
	awpPathsMustExist,
	awpPathsMustNotExist,
	requiredDiscoveryFilesForStage,
	retiredLegacyMcpDiscoveryPathsMustNotExist,
	verifyAwpManifestPair,
	verifyLlmsAgainstCapabilities,
	verifyLlmsHasNoAwpWhenDisabled,
	verifyOpenApiAgainstCapabilities,
} from '../../scripts/verify-capabilities.mjs';
import { buildAwpManifest, serializeAwpManifest } from './awp-manifest.ts';
import { resolveSiteAwpManifestBody } from './awp-manifest-route.ts';
import { buildOpenApiDocument } from './openapi-document.ts';
import { PROTOCOL_PROFILE_DUAL_ERA, resolvePublicCapabilities } from './public-capabilities.ts';

const base = {
	site: 'https://example.com/',
	title: 'Refined-X',
};

function caps(ask = {}) {
	return resolvePublicCapabilities({
		...base,
		ask: { askUrl: '', mcpUrl: '', healthUrl: '', ...ask },
	});
}

test('verify rejects invented Ask/MCP POST paths in static OpenAPI', () => {
	const capabilities = caps();
	const bad = {
		paths: {
			'/ask': { post: { operationId: 'askPublicContent', servers: [{ url: 'https://example.com' }] } },
			'/mcp': { post: { operationId: 'mcpStreamableHttp', servers: [{ url: 'https://example.com' }] } },
		},
	};
	const failures = verifyOpenApiAgainstCapabilities(capabilities, bad);
	assert.ok(failures.some((line) => /must not declare remote Ask/.test(line)));
	assert.ok(failures.some((line) => /must not declare remote MCP/.test(line)));
});

test('verify accepts reconstructed prefixed Ask and MCP URLs', () => {
	const capabilities = caps({
		askUrl: 'https://ask.example.com/public/v1/ask',
		mcpUrl: 'https://ask.example.com/public/v1/mcp',
	});
	const doc = buildOpenApiDocument(capabilities);
	assert.deepEqual(verifyOpenApiAgainstCapabilities(capabilities, doc), []);
});

test('verify requires llms to expose configured MCP URL and rejects retired discovery paths', () => {
	const capabilities = caps({ mcpUrl: 'https://ask.example.com/mcp' });
	assert.ok(
		verifyLlmsAgainstCapabilities(capabilities, '# Site\n- [MCP Catalog](https://example.com/.well-known/mcp/catalog.json)\n')
			.length > 0,
	);
	assert.ok(
		verifyLlmsAgainstCapabilities(
			capabilities,
			`# Site\n- MCP endpoint (primary): POST https://ask.example.com/mcp\n- Legacy: https://example.com/.well-known/mcp.json\n`,
		).length > 0,
	);
	assert.deepEqual(
		verifyLlmsAgainstCapabilities(
			capabilities,
			`# Site\n- MCP endpoint (primary): POST https://ask.example.com/mcp\n- [OpenAPI](https://example.com/openapi.json)\n`,
		),
		[],
	);
});

test('verify stage requires about/llms/openapi and forbids retired legacy MCP discovery files', () => {
	assert.deepEqual(requiredDiscoveryFilesForStage(), [
		'/.well-known/about.json',
		'/llms.txt',
		'/openapi.json',
	]);
	assert.deepEqual(retiredLegacyMcpDiscoveryPathsMustNotExist(), [
		'/.well-known/mcp.json',
		'/.well-known/mcp/catalog.json',
		'/.well-known/mcp/server-card.json',
	]);
});

test('AWP paths are must-not-exist when switch is off and must-exist when on', () => {
	assert.deepEqual(awpPathsMustNotExist(false), ['/agent.json', '/.well-known/agent.json']);
	assert.deepEqual(awpPathsMustExist(false), []);
	assert.deepEqual(awpPathsMustNotExist(true), []);
	assert.deepEqual(awpPathsMustExist(true), ['/agent.json', '/.well-known/agent.json']);
});

test('verifyAwpManifestPair accepts byte-identical draft-0.2 manifests', () => {
	const body = serializeAwpManifest(
		buildAwpManifest(caps(), { intent: 'Public site', siteBasePath: '/' }),
	);
	assert.deepEqual(verifyAwpManifestPair(body, body), []);
});

test('verifyAwpManifestPair rejects divergent bytes and Ask actions', () => {
	const good = serializeAwpManifest(
		buildAwpManifest(caps(), { intent: 'Public site', siteBasePath: '/' }),
	);
	assert.ok(verifyAwpManifestPair(good, `${good} `).length > 0);

	const withAsk = JSON.parse(good);
	withAsk.actions.push({
		id: 'ask',
		description: 'Ask',
		auth_required: true,
		inputs: {},
		outputs: {},
		method: 'POST',
		endpoint: '/ask',
	});
	const bad = `${JSON.stringify(withAsk, null, 2)}\n`;
	assert.ok(verifyAwpManifestPair(bad, bad).some((line) => /outside phase-1/.test(line)));
});

test('llms must not mention agent.json when AWP is off', () => {
	assert.deepEqual(verifyLlmsHasNoAwpWhenDisabled('# Site\n', false), []);
	assert.ok(verifyLlmsHasNoAwpWhenDisabled('# Site\n- [/agent.json](/agent.json)\n', false).length > 0);
	assert.deepEqual(verifyLlmsHasNoAwpWhenDisabled('# Site\n- [/agent.json](/agent.json)\n', true), []);
});

test('route helper returns null when AWP off and identical bodies when on', () => {
	const off = resolveSiteAwpManifestBody({
		...base,
		description: 'Demo',
		ask: { askUrl: '', mcpUrl: '' },
		discovery: { awp: false },
	});
	assert.equal(off, null);

	const onConfig = {
		...base,
		description: 'Demo site for agents',
		ask: {
			askUrl: '',
			mcpUrl: 'https://ask.example.com/mcp',
			protocolProfile: PROTOCOL_PROFILE_DUAL_ERA,
		},
		discovery: { awp: true },
	};
	const a = resolveSiteAwpManifestBody(onConfig);
	const b = resolveSiteAwpManifestBody(onConfig);
	assert.ok(a);
	assert.equal(a, b);
	const parsed = JSON.parse(a);
	assert.equal(parsed.awp_version, '0.2');
	assert.equal(parsed.protocols.mcp.endpoint, 'https://ask.example.com/mcp');
});
