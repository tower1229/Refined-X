import assert from 'node:assert/strict';
import test from 'node:test';
import {
	PROTOCOL_PROFILE_DUAL_ERA,
	PROTOCOL_PROFILE_UNDECLARED,
	assertPublicCapabilitiesConfig,
	parseAbsoluteHttpUrl,
	reconstructEndpointUrl,
	resolvePublicCapabilities,
	siteConfigToCapabilitiesInput,
} from './public-capabilities.ts';

const identity = {
	title: 'Refined-X',
	mcp: {
		packageIdentifier: 'com.example/refined-x-public-ask',
		airIdentifier: 'urn:air:example.com:public-ask',
	},
};

function resolve(ask: {
	askUrl?: string;
	mcpUrl?: string;
	healthUrl?: string;
	protocolProfile?: string;
}, site = 'https://example.com/') {
	return resolvePublicCapabilities({
		site,
		title: identity.title,
		ask: {
			askUrl: ask.askUrl ?? '',
			mcpUrl: ask.mcpUrl ?? '',
			healthUrl: ask.healthUrl ?? '',
			protocolProfile: ask.protocolProfile,
		},
		mcp: identity.mcp,
	});
}

test('parseAbsoluteHttpUrl accepts https absolute URLs and preserves pathname prefix', () => {
	const endpoint = parseAbsoluteHttpUrl('https://ask.example.com/public/v1/ask', { label: 'askUrl' });
	assert.equal(endpoint.origin, 'https://ask.example.com');
	assert.equal(endpoint.pathname, '/public/v1/ask');
	assert.equal(reconstructEndpointUrl(endpoint), 'https://ask.example.com/public/v1/ask');
});

test('parseAbsoluteHttpUrl rejects fragment, query, userinfo, and non-http(s) schemes', () => {
	assert.throws(() => parseAbsoluteHttpUrl('https://ask.example.com/ask#x', { label: 'askUrl' }), /askUrl/);
	assert.throws(() => parseAbsoluteHttpUrl('https://ask.example.com/ask?q=1', { label: 'askUrl' }), /askUrl/);
	assert.throws(() => parseAbsoluteHttpUrl('https://user:pass@ask.example.com/ask', { label: 'askUrl' }), /askUrl/);
	assert.throws(() => parseAbsoluteHttpUrl('ftp://ask.example.com/ask', { label: 'askUrl' }), /askUrl/);
	assert.throws(() => parseAbsoluteHttpUrl('/relative/ask', { label: 'askUrl' }), /askUrl/);
});

test('parseAbsoluteHttpUrl rejects plain http unless local testing is allowed', () => {
	assert.throws(() => parseAbsoluteHttpUrl('http://ask.example.com/ask', { label: 'askUrl' }), /askUrl/);
	const local = parseAbsoluteHttpUrl('http://127.0.0.1:8787/ask', {
		label: 'askUrl',
		allowHttpLocal: true,
	});
	assert.equal(local.origin, 'http://127.0.0.1:8787');
	assert.equal(local.pathname, '/ask');
});

test('static mode has no remote ask or mcp endpoints and undeclared protocol profile', () => {
	const caps = resolve({});
	assert.equal(caps.mode, 'static');
	assert.equal(caps.ask, null);
	assert.equal(caps.mcp, null);
	assert.equal(caps.protocolProfile.id, PROTOCOL_PROFILE_UNDECLARED);
	assert.equal(caps.protocolProfile.claimsModernDualEra, false);
	assert.deepEqual(caps.protocolProfile.declaredProtocolVersions, []);
	assert.ok(!caps.supportedItems.includes('POST /ask'));
	assert.ok(!caps.supportedItems.includes('MCP ask'));
});

test('ask-only mode declares ask endpoint only', () => {
	const caps = resolve({ askUrl: 'https://ask.example.com/public/v1/ask' });
	assert.equal(caps.mode, 'ask-only');
	assert.equal(caps.ask?.pathname, '/public/v1/ask');
	assert.equal(caps.mcp, null);
	assert.ok(caps.supportedItems.includes('POST /ask'));
	assert.ok(!caps.supportedItems.includes('MCP ask'));
});

test('mcp-only mode declares mcp endpoint only', () => {
	const caps = resolve({ mcpUrl: 'https://ask.example.com/agent/mcp' });
	assert.equal(caps.mode, 'mcp-only');
	assert.equal(caps.ask, null);
	assert.equal(caps.mcp?.pathname, '/agent/mcp');
	assert.ok(!caps.supportedItems.includes('POST /ask'));
	assert.ok(caps.supportedItems.includes('MCP ask'));
});

test('both mode declares ask and mcp with full configured URLs', () => {
	const caps = resolve({
		askUrl: 'https://ask.example.com/public/v1/ask',
		mcpUrl: 'https://ask.example.com/public/v1/mcp',
		healthUrl: 'https://ask.example.com/public/v1/health',
	});
	assert.equal(caps.mode, 'both');
	assert.equal(reconstructEndpointUrl(caps.ask!), 'https://ask.example.com/public/v1/ask');
	assert.equal(reconstructEndpointUrl(caps.mcp!), 'https://ask.example.com/public/v1/mcp');
	assert.equal(reconstructEndpointUrl(caps.health!), 'https://ask.example.com/public/v1/health');
	assert.ok(caps.supportedItems.includes('POST /ask'));
	assert.ok(caps.supportedItems.includes('MCP ask'));
});

test('site base-path is recorded without inventing remote endpoints', () => {
	const caps = resolve({}, 'https://example.com/blog/');
	assert.equal(caps.mode, 'static');
	assert.equal(caps.siteOrigin, 'https://example.com');
	assert.equal(caps.siteBasePath, '/blog/');
	assert.equal(caps.ask, null);
	assert.equal(caps.mcp, null);
});

test('illegal configured URLs fail capability resolution', () => {
	assert.throws(
		() => resolve({ askUrl: 'https://ask.example.com/ask#frag' }),
		/askUrl/,
	);
	assert.throws(
		() => resolve({ mcpUrl: 'not-a-url' }),
		/mcpUrl/,
	);
});

test('dual-era protocol profile is opt-in after acceptance', () => {
	const undeclared = resolve({ mcpUrl: 'https://ask.example.com/mcp' });
	assert.equal(undeclared.protocolProfile.claimsModernDualEra, false);
	assert.deepEqual(undeclared.protocolProfile.declaredProtocolVersions, []);

	const dual = resolve({
		mcpUrl: 'https://ask.example.com/mcp',
		protocolProfile: PROTOCOL_PROFILE_DUAL_ERA,
	});
	assert.equal(dual.protocolProfile.id, PROTOCOL_PROFILE_DUAL_ERA);
	assert.equal(dual.protocolProfile.claimsModernDualEra, true);
	assert.ok(dual.protocolProfile.declaredProtocolVersions.includes('2026-07-28'));
	assert.ok(dual.protocolProfile.declaredProtocolVersions.includes('2025-11-25'));
});

test('unknown protocol profile fails the build', () => {
	assert.throws(
		() => resolve({ mcpUrl: 'https://ask.example.com/mcp', protocolProfile: 'modern-only' }),
		/protocolProfile/,
	);
});

test('ask and mcp sharing the same pathname with different origins fail', () => {
	assert.throws(
		() =>
			resolve({
				askUrl: 'https://a.example.com/rpc',
				mcpUrl: 'https://b.example.com/rpc',
			}),
		/same pathname/,
	);
});

test('ask or mcp pathname colliding with static OpenAPI paths fails', () => {
	assert.throws(
		() => resolve({ askUrl: 'https://ask.example.com/api/profile.json' }),
		/collides with a static OpenAPI path/,
	);
	assert.throws(
		() => resolve({ mcpUrl: 'https://ask.example.com/api/search-index.json' }),
		/collides with a static OpenAPI path/,
	);
});

test('siteConfigToCapabilitiesInput and assertPublicCapabilitiesConfig fail fast on illegal URLs', () => {
	const base = {
		site: 'https://example.com/',
		title: 'Refined-X',
		ask: { askUrl: '', mcpUrl: '', healthUrl: '', protocolProfile: 'undeclared' },
		mcp: {
			packageIdentifier: 'com.example/refined-x-public-ask',
			airIdentifier: 'urn:air:example.com:public-ask',
		},
	};
	const input = siteConfigToCapabilitiesInput(base);
	assert.equal(input.ask.protocolProfile, 'undeclared');
	assert.equal(assertPublicCapabilitiesConfig(base).mode, 'static');
	assert.throws(
		() =>
			assertPublicCapabilitiesConfig({
				...base,
				ask: { ...base.ask, askUrl: 'https://ask.example.com/ask#x' },
			}),
		/askUrl/,
	);
});
