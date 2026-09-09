import assert from 'node:assert/strict';
import test from 'node:test';
import {
	projectMcpCatalog,
	projectMcpJson,
	projectMcpServerCard,
	projectAboutDiscovery,
} from './mcp-discovery-project.ts';
import {
	PROTOCOL_PROFILE_DUAL_ERA,
	PROTOCOL_PROFILE_UNDECLARED,
	resolvePublicCapabilities,
} from './public-capabilities.ts';

const baseInput = {
	site: 'https://example.com/',
	title: 'Refined-X',
	mcp: {
		packageIdentifier: 'com.example/refined-x-public-ask',
		airIdentifier: 'urn:air:example.com:public-ask',
	},
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

const urls = {
	absoluteUrl: (pathname: string) => new URL(pathname, 'https://example.com/').href,
	catalogUrl: 'https://example.com/.well-known/mcp/catalog.json',
	serverCardUrl: 'https://example.com/.well-known/mcp/server-card.json',
	mcpJsonUrl: 'https://example.com/.well-known/mcp.json',
	aboutUrl: 'https://example.com/.well-known/about.json',
	openapiUrl: 'https://example.com/openapi.json',
};

test('static catalog has no MCP entries and card has empty remotes', () => {
	const catalog = projectMcpCatalog(caps(), urls);
	assert.equal(catalog.specVersion, 'draft');
	assert.deepEqual(catalog.entries, []);
	const card = projectMcpServerCard(caps(), urls);
	assert.deepEqual(card.remotes, []);
	assert.doesNotMatch(JSON.stringify(catalog), /Official/i);
	assert.doesNotMatch(JSON.stringify(card), /Official/i);
});

test('mcp remotes appear only when mcpUrl is configured', () => {
	const askOnly = projectMcpServerCard(caps({ askUrl: 'https://ask.example.com/ask' }), urls);
	assert.deepEqual(askOnly.remotes, []);

	const mcpOnly = projectMcpServerCard(
		caps({ mcpUrl: 'https://ask.example.com/mcp', protocolProfile: PROTOCOL_PROFILE_UNDECLARED }),
		urls,
	);
	assert.equal(mcpOnly.remotes.length, 1);
	assert.equal(mcpOnly.remotes[0].url, 'https://ask.example.com/mcp');
	assert.equal(mcpOnly.remotes[0].supportedProtocolVersions, undefined);

	const dual = projectMcpServerCard(
		caps({ mcpUrl: 'https://ask.example.com/mcp', protocolProfile: PROTOCOL_PROFILE_DUAL_ERA }),
		urls,
	);
	assert.ok(dual.remotes[0].supportedProtocolVersions?.includes('2026-07-28'));
});

test('mcp.json is a thin projection of the server card', () => {
	const capabilities = caps({ mcpUrl: 'https://ask.example.com/mcp' });
	const card = projectMcpServerCard(capabilities, urls);
	const json = projectMcpJson(capabilities, urls);
	assert.equal(json.catalogUrl, urls.catalogUrl);
	assert.equal(json.serverCardUrl, urls.serverCardUrl);
	assert.deepEqual(json.remotes, card.remotes);
	assert.equal(json.name, card.name);
});

test('about keeps top-level legacy discovery URLs for clients and marks maturity', () => {
	const staticAbout = projectAboutDiscovery(caps(), {
		...urls,
		profile: { name: 'Demo', canonicalUrl: 'https://example.com/about' },
	});
	assert.equal(staticAbout.nlweb.askUrl, '');
	assert.equal(staticAbout.nlweb.mcpUrl, '');
	assert.equal(staticAbout.mcpCatalogUrl, urls.catalogUrl);
	assert.equal(staticAbout.mcpServerCardUrl, urls.serverCardUrl);
	assert.equal(staticAbout.mcpJsonUrl, urls.mcpJsonUrl);
	assert.equal(staticAbout.discoveryMaturity, 'legacy-draft-compatibility');
	assert.match(staticAbout.discoveryNotes, /compatibility/);
	assert.ok(!('mcpUrl' in staticAbout));
	assert.ok(!('legacyDiscovery' in staticAbout));
	assert.deepEqual(staticAbout.nlweb.supported, []);
	assert.ok(!staticAbout.nlweb.notes.some((note: string) => /Supports POST \/ask/.test(note)));

	const both = projectAboutDiscovery(
		caps({
			askUrl: 'https://ask.example.com/ask',
			mcpUrl: 'https://ask.example.com/mcp',
			healthUrl: 'https://ask.example.com/health',
		}),
		{
			...urls,
			profile: { name: 'Demo', canonicalUrl: 'https://example.com/about' },
		},
	);
	assert.equal(both.nlweb.askUrl, 'https://ask.example.com/ask');
	assert.equal(both.mcpUrl, 'https://ask.example.com/mcp');
	assert.equal(both.mcpCatalogUrl, urls.catalogUrl);
	assert.equal(both.discoveryMaturity, 'legacy-draft-compatibility');
	assert.ok(both.nlweb.supported.includes('MCP ask'));
});

test('catalog entry exists only when mcp is configured', () => {
	assert.equal(projectMcpCatalog(caps({ askUrl: 'https://ask.example.com/ask' }), urls).entries.length, 0);
	assert.equal(projectMcpCatalog(caps({ mcpUrl: 'https://ask.example.com/mcp' }), urls).entries.length, 1);
});
