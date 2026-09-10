import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOpenApiDocument } from './openapi-document.ts';
import {
	PROTOCOL_PROFILE_DUAL_ERA,
	reconstructEndpointUrl,
	resolvePublicCapabilities,
} from './public-capabilities.ts';

const baseInput = {
	site: 'https://example.com/',
	title: 'Refined-X',
};

function caps(ask: Record<string, string | undefined> = {}) {
	return resolvePublicCapabilities({
		...baseInput,
		ask: {
			askUrl: '',
			mcpUrl: '',
			healthUrl: '',
			...ask,
		},
	});
}

test('static OpenAPI omits remote Ask and MCP POST paths', () => {
	const doc = buildOpenApiDocument(caps());
	assert.equal(doc.paths['/ask'], undefined);
	assert.equal(doc.paths['/mcp'], undefined);
	assert.ok(doc.paths['/api/profile.json']);
	assert.equal(doc.components?.securitySchemes, undefined);
});

test('ask-only OpenAPI server+path reconstructs the configured ask URL', () => {
	const capabilities = caps({ askUrl: 'https://ask.example.com/public/v1/ask' });
	const doc = buildOpenApiDocument(capabilities);
	const askPath = capabilities.ask!.pathname;
	const post = doc.paths[askPath]?.post;
	assert.ok(post);
	assert.equal(doc.paths['/mcp'], undefined);
	assert.equal(post.servers?.[0]?.url, 'https://ask.example.com');
	assert.equal(
		reconstructEndpointUrl({
			href: '',
			origin: post.servers![0].url,
			pathname: askPath,
		}),
		'https://ask.example.com/public/v1/ask',
	);
	assert.ok(doc.components?.securitySchemes?.PublicAskApiKey);
});

test('mcp-only OpenAPI server+path reconstructs the configured mcp URL', () => {
	const capabilities = caps({ mcpUrl: 'https://ask.example.com/agent/mcp' });
	const doc = buildOpenApiDocument(capabilities);
	const mcpPath = capabilities.mcp!.pathname;
	const post = doc.paths[mcpPath]?.post;
	assert.ok(post);
	assert.equal(doc.paths['/ask'], undefined);
	assert.equal(post.servers?.[0]?.url, 'https://ask.example.com');
	assert.equal(`${post.servers![0].url}${mcpPath}`, 'https://ask.example.com/agent/mcp');
});

test('both mode declares ask and mcp with distinct path keys', () => {
	const capabilities = caps({
		askUrl: 'https://ask.example.com/public/v1/ask',
		mcpUrl: 'https://ask.example.com/public/v1/mcp',
		protocolProfile: PROTOCOL_PROFILE_DUAL_ERA,
	});
	const doc = buildOpenApiDocument(capabilities);
	assert.ok(doc.paths['/public/v1/ask']?.post);
	assert.ok(doc.paths['/public/v1/mcp']?.post);
	assert.match(String(doc.info.description), /MCP ask/);
});

test('site base-path is preserved on the static OpenAPI server URL', () => {
	const capabilities = resolvePublicCapabilities({
		...baseInput,
		site: 'https://example.com/blog/',
		ask: { askUrl: '', mcpUrl: '', healthUrl: '' },
	});
	const doc = buildOpenApiDocument(capabilities);
	assert.equal(doc.servers[0].url, 'https://example.com/blog');
	assert.ok(doc.paths['/api/profile.json']);
	assert.equal(doc.paths['/ask'], undefined);
});

test('Ask 200 documents JSON and text/event-stream; Accept is optional', () => {
	const capabilities = caps({ askUrl: 'https://ask.example.com/ask' });
	const doc = buildOpenApiDocument(capabilities);
	const post = doc.paths['/ask']?.post;
	assert.ok(post);
	const params = post.parameters as Array<{ name: string; required?: boolean }>;
	assert.ok(params.some((p) => p.name === 'Accept' && p.required !== true));
	const ok = (post.responses as Record<string, { content?: Record<string, unknown> }>)['200'];
	assert.ok(ok.content?.['application/json']);
	assert.ok(ok.content?.['text/event-stream']);
});

test('MCP documents conditional protocol headers and 202/401 without requiring modern headers', () => {
	const capabilities = caps({ mcpUrl: 'https://ask.example.com/mcp' });
	const doc = buildOpenApiDocument(capabilities);
	const post = doc.paths['/mcp']?.post;
	assert.ok(post);
	assert.match(String(post.description), /MCP SDK|endpoint map/i);
	assert.match(String(post.description), /conditional|must not be treated as required/i);
	const params = post.parameters as Array<{ name: string; required?: boolean }>;
	for (const name of ['MCP-Protocol-Version', 'MCP-Method', 'MCP-Name', 'Accept']) {
		const header = params.find((p) => p.name === name);
		assert.ok(header, name);
		assert.equal(header.required, false, name);
	}
	const responses = post.responses as Record<string, unknown>;
	assert.ok(responses['200']);
	assert.ok(responses['202']);
	assert.ok(responses['401']);
	assert.ok(responses['403']);
	assert.ok(responses['429']);
});
