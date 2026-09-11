import assert from 'node:assert/strict';
import test from 'node:test';
import {
	absoluteUrlFromSite,
	askPageUrl,
	astroBaseFromSite,
	resolveDeployBase,
	seoAbsoluteUrl,
	seoLogicalPath,
	stripBase,
	withBase,
} from './paths.ts';

test('absoluteUrlFromSite preserves site base path', () => {
	assert.equal(
		absoluteUrlFromSite('https://example.com/blog/', '/about/'),
		'https://example.com/blog/about/',
	);
	assert.equal(
		absoluteUrlFromSite('https://example.com/blog/', '/2026/09/01/example.md'),
		'https://example.com/blog/2026/09/01/example.md',
	);
	assert.equal(
		absoluteUrlFromSite('https://example.com/blog/', '/api/profile.json'),
		'https://example.com/blog/api/profile.json',
	);
	assert.equal(
		absoluteUrlFromSite('https://example.com/blog/', '/#person'),
		'https://example.com/blog/#person',
	);
});

test('absoluteUrlFromSite root site matches origin join', () => {
	assert.equal(absoluteUrlFromSite('https://example.com/', '/about/'), 'https://example.com/about/');
	assert.equal(absoluteUrlFromSite('https://example.com', '/about/'), 'https://example.com/about/');
});

test('astroBaseFromSite derives Astro base from site pathname', () => {
	assert.equal(astroBaseFromSite('https://example.com/'), '/');
	assert.equal(astroBaseFromSite('https://example.com'), '/');
	assert.equal(astroBaseFromSite('https://example.com/blog/'), '/blog');
	assert.equal(astroBaseFromSite('https://example.com/refined-x/'), '/refined-x');
});

test('withBase prefixes once and askPageUrl includes base', () => {
	assert.equal(resolveDeployBase('/blog'), '/blog/');
	assert.equal(withBase('/', '/blog/'), '/blog/');
	assert.equal(withBase('/writing/', '/blog/'), '/blog/writing/');
	assert.equal(withBase('/blog/writing/', '/blog/'), '/blog/writing/');
	assert.equal(withBase('/api/search-index.json', '/blog/'), '/blog/api/search-index.json');
	assert.equal(askPageUrl('hello', '/blog/'), '/blog/ask/?q=hello');
	assert.equal(askPageUrl('', '/'), '/ask/');
	assert.equal(stripBase('/blog/writing/', '/blog/'), '/writing/');
	assert.equal(stripBase('/blog/', '/blog/'), '/');
});

test('seoLogicalPath and seoAbsoluteUrl avoid double base on request pathnames', () => {
	assert.equal(seoLogicalPath('/blog/writing/', '/blog/'), '/writing/');
	assert.equal(seoLogicalPath('/blog/', '/blog/'), '/');
	assert.equal(seoLogicalPath('/blog/404/', '/blog/'), '/404/');
	assert.equal(
		seoAbsoluteUrl('https://example.com/blog/', '/blog/writing/', '/blog/'),
		'https://example.com/blog/writing/',
	);
	assert.equal(seoAbsoluteUrl('https://example.com/blog/', '/blog/', '/blog/'), 'https://example.com/blog/');
	assert.equal(seoAbsoluteUrl('https://example.com/', '/writing/'), 'https://example.com/writing/');
});

test('absoluteUrlFromSite aligns with OpenAPI static server and AWP-style api prefix', () => {
	const site = 'https://example.com/blog/';
	const profile = absoluteUrlFromSite(site, '/api/profile.json');
	assert.equal(profile, 'https://example.com/blog/api/profile.json');
	assert.equal(astroBaseFromSite(site), '/blog');
	const awpEndpoint = `${astroBaseFromSite(site)}/api/profile.json`;
	assert.equal(awpEndpoint, '/blog/api/profile.json');
	assert.ok(profile.endsWith(awpEndpoint));
});
