import assert from 'node:assert/strict';
import test from 'node:test';
import { projectAboutDiscovery } from './mcp-discovery-project.ts';
import { resolvePublicCapabilities } from './public-capabilities.ts';

function caps(ask: Record<string, string | undefined> = {}) {
	return resolvePublicCapabilities({
		site: 'https://example.com/',
		title: 'Refined-X',
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
	aboutUrl: 'https://example.com/.well-known/about.json',
	openapiUrl: 'https://example.com/openapi.json',
};

test('about exposes site index without retired legacy MCP discovery URLs', () => {
	const staticAbout = projectAboutDiscovery(caps(), {
		...urls,
		profile: { name: 'Demo', canonicalUrl: 'https://example.com/about' },
	});
	assert.equal(staticAbout.format, 'refined-x-about');
	assert.equal(staticAbout.nlweb.askUrl, '');
	assert.equal(staticAbout.nlweb.mcpUrl, '');
	assert.ok(!('mcpCatalogUrl' in staticAbout));
	assert.ok(!('mcpServerCardUrl' in staticAbout));
	assert.ok(!('mcpJsonUrl' in staticAbout));
	assert.ok(!('discoveryMaturity' in staticAbout));
	assert.ok(!('mcpUrl' in staticAbout));
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
	assert.ok(both.nlweb.supported.includes('MCP ask'));
	assert.ok(!('mcpCatalogUrl' in both));
});
