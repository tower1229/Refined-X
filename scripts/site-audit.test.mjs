import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { auditSite, createRouteResolver, followRoute, readHtml } from './site-audit.mjs';

test('deployment redirects override existing files and detect missing endpoints and loops', async (t) => {
	const distRoot = await mkdtemp(path.join(os.tmpdir(), 'site-audit-'));
	t.after(() => rm(distRoot, { recursive: true, force: true }));
	await mkdir(path.join(distRoot, 'topics/agent'), { recursive: true });
	await writeFile(path.join(distRoot, 'topics/agent/index.html'), '<title>Agent topic</title>');
	const site = 'https://example.test';
	const resolveRoute = createRouteResolver({ distRoot, site, redirects: [{ from: '/topics/agent/', to: '/topics/missing/', status: 301 }, { from: '/loop/', to: '/loop/', status: 301 }] });
	assert.equal((await followRoute(`${site}/topics/agent/`, resolveRoute, site)).status, 404);
	assert.equal((await followRoute(`${site}/loop/`, resolveRoute, site)).status, 'loop');
	assert.equal((await followRoute(`${site}/topics/agent/`, createRouteResolver({ distRoot, site }), site)).status, 200);
});

test('noindex links, relative and encoded links, same-origin URLs, and deployment base are checked', async (t) => {
	const distRoot = await mkdtemp(path.join(os.tmpdir(), 'site-audit-'));
	t.after(() => rm(distRoot, { recursive: true, force: true }));
	await mkdir(path.join(distRoot, '中文'), { recursive: true });
	await writeFile(path.join(distRoot, '中文/index.html'), '<title>中文内容页面</title>');
	await writeFile(path.join(distRoot, 'index.html'), '<title>Audit example page</title><meta name="robots" content="noindex,follow"><a href="%E4%B8%AD%E6%96%87/?q=1#x">valid</a><a href="https://example.test/blog/中文/">valid</a><a href="missing/">broken</a><img src="x" alt=""><img src="y">');
	const result = await auditSite({ distRoot, site: 'https://example.test/blog/' });
	assert.equal(result.failures.filter((line) => line.includes('broken link')).length, 1);
	assert.match(result.failures.join('\n'), /missing alt attribute on y/);
	assert.match(result.warnings.join('\n'), /empty alt on x/);
	assert.match(result.failures.join('\n'), /missing image x/);
});

test('inline CSS and data-src resources are audited, including noindex pages and subpaths', async (t) => {
	const distRoot = await mkdtemp(path.join(os.tmpdir(), 'style-audit-'));
	t.after(() => rm(distRoot, { recursive: true, force: true }));
	await writeFile(path.join(distRoot, 'index.html'), '<!doctype html><title>Legacy resource fixture</title><meta name="robots" content="noindex"><style>body{background:url(/missing-bg.jpg)}/* url(/comment.jpg) */.x{content:"url(/literal.jpg)"}</style><i style="background:url(https://other.test/a.jpg)"></i><li data-src="/missing-template.jpg"></li>');
	for (const site of ['https://example.test/', 'https://example.test/blog/']) {
		const result = await auditSite({ distRoot, site });
		assert.equal(result.failures.filter((line) => line.includes('missing resource')).length, 2);
		assert.match(result.failures.join('\n'), /missing-bg.jpg/);
		assert.match(result.failures.join('\n'), /missing-template.jpg/);
		assert.doesNotMatch(result.failures.join('\n'), /comment.jpg|literal.jpg|other.test/);
	}
});

test('metadata names and canonical relation tokens are ASCII case-insensitive', () => {
	for (const [description, robots, rel] of [['description', 'robots', 'canonical'], ['Description', 'RoBoTs', 'CANONICAL'], ['DESCRIPTION', 'ROBOTS', 'alternate Canonical']]) {
		const page = readHtml(`<html><title>Legacy metadata fixture</title><meta name="${description}" content="Legacy description"><meta name="${robots}" content="NOINDEX,follow"><link rel="${rel}" href="https://example.test/"><meta HTTP-EQUIV="Refresh" content="0;url=/writing/"></html>`);
		assert.deepEqual(page.descriptions, ['Legacy description']);
		assert.equal(page.noindex, true);
		assert.equal(page.canonical, 'https://example.test/');
		assert.equal(page.refresh, true);
	}
});

test('mixed-case legacy descriptions participate in required metadata and length audit', async (t) => {
	const distRoot = await mkdtemp(path.join(os.tmpdir(), 'metadata-audit-'));
	t.after(() => rm(distRoot, { recursive: true, force: true }));
	await writeFile(path.join(distRoot, 'index.html'), `<!doctype html><title>Legacy metadata audit</title><link rel="canonical" href="https://example.test/"><meta name="Description" content="${'A'.repeat(170)}"><meta name="ROBOTS" content="noindex">`);
	const report = await auditSite({ distRoot, site: 'https://example.test/' });
	assert.deepEqual(report.failures, []);
	assert.equal(report.pages[0].descriptionLength, 170);
	assert.equal(report.pages[0].noindex, true);
	assert.match(report.warnings.join('\n'), /review description length 170/);
});
