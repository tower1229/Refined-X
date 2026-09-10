import assert from 'node:assert/strict';
import test from 'node:test';
import { absoluteUrlFromSite, astroBaseFromSite } from './paths.ts';

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

test('absoluteUrlFromSite aligns with OpenAPI static server and AWP-style api prefix', () => {
	const site = 'https://example.com/blog/';
	const profile = absoluteUrlFromSite(site, '/api/profile.json');
	assert.equal(profile, 'https://example.com/blog/api/profile.json');
	assert.equal(astroBaseFromSite(site), '/blog');
	// AWP staticApiEndpoint style: base without trailing slash + api path
	const awpEndpoint = `${astroBaseFromSite(site)}/api/profile.json`;
	assert.equal(awpEndpoint, '/blog/api/profile.json');
	assert.ok(profile.endsWith(awpEndpoint));
});
