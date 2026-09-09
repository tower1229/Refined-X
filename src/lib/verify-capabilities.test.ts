import assert from 'node:assert/strict';
import test from 'node:test';
import {
	MUST_NOT_EXIST_PATHS,
	verifyLlmsAgainstCapabilities,
	verifyOpenApiAgainstCapabilities,
} from '../../scripts/verify-capabilities.mjs';
import { buildOpenApiDocument } from './openapi-document.ts';
import { resolvePublicCapabilities } from './public-capabilities.ts';

const base = {
	site: 'https://example.com/',
	title: 'Refined-X',
	mcp: {
		packageIdentifier: 'com.example/refined-x-public-ask',
		airIdentifier: 'urn:air:example.com:public-ask',
	},
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

test('verify requires llms to expose configured MCP URL and not primary-recommend retired catalog', () => {
	const capabilities = caps({ mcpUrl: 'https://ask.example.com/mcp' });
	assert.ok(
		verifyLlmsAgainstCapabilities(capabilities, '# Site\n- [MCP Catalog](https://example.com/.well-known/mcp/catalog.json)\n')
			.length > 0,
	);
	assert.deepEqual(
		verifyLlmsAgainstCapabilities(
			capabilities,
			`# Site\n- MCP endpoint (primary): POST https://ask.example.com/mcp\n- Legacy MCP discovery projections (compatibility only): catalog\n`,
		),
		[],
	);
});

test('AWP paths are listed as must-not-exist for this ticket', () => {
	assert.ok(MUST_NOT_EXIST_PATHS.includes('/agent.json'));
	assert.ok(MUST_NOT_EXIST_PATHS.includes('/.well-known/agent.json'));
});
