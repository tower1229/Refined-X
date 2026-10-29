import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createSeoSitemapOptions } from './seo-sitemap.mjs';
import { articleModifiedDate, contentDate } from '../src/lib/content-dates.mjs';

test('sitemap respects subpath, authored page dates, thin topics, and article modified dates', async (t) => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'sitemap-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	await mkdir(path.join(root, 'articles'));
	await writeFile(path.join(root, 'articles/example.md'), '---\nslug: example\npubDate: 2026-02-27T12:35:17Z\nupdatedDate: 2026-06-30T14:00:00Z\ntags: [Agent]\n---\nBody');
	for (const base of ['', '/blog']) {
		const site = `https://example.test${base}/`;
		const sitemap = createSeoSitemapOptions({ contentRoot: root, site, pageUpdatedDates: { '/writing/': '2026-10-29T00:00:00Z' } });
		assert.equal(sitemap.serialize({ url: `${site}2026/02/27/example` }).lastmod.toISOString(), '2026-06-30T14:00:00.000Z');
		assert.equal(sitemap.serialize({ url: `${site}writing/` }).url, `${site}writing/`);
		assert.equal(sitemap.serialize({ url: `${site}writing/` }).lastmod.toISOString(), '2026-10-29T00:00:00.000Z');
		assert.equal(sitemap.serialize({ url: `${site}about/` }).lastmod, undefined);
		assert.equal(sitemap.filter(`${site}topics/agent/`), false);
		assert.equal(sitemap.filter(`${site}404/`), false);
	}
});

test('dates reject invalid input and modification dates before publication', () => {
	assert.throws(() => contentDate('unknown'), /Invalid/);
	assert.throws(() => contentDate('2026-02-30T00:00:00Z'), /Invalid/);
	assert.equal(contentDate('2024-02-29').toISOString(), '2024-02-29T00:00:00.000Z');
	assert.throws(() => articleModifiedDate({ pubDate: '2026-06-01', updatedDate: '2026-05-01' }), /precedes/);
	assert.equal(articleModifiedDate({ pubDate: '2026-02-27' }).toISOString(), '2026-02-27T00:00:00.000Z');
});

test('collection dates advance past authored dates when a member changes', async (t) => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'sitemap-future-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	await mkdir(path.join(root, 'articles'));
	await writeFile(path.join(root, 'articles/example.md'), '---\nslug: example\npubDate: 2026-10-01T00:00:00Z\nupdatedDate: 2026-11-01T00:00:00Z\nseries: frontend\ntags: [Agent]\n---\nBody');
	for (let i = 0; i < 10; i++) await writeFile(path.join(root, `articles/old-${i}.md`), `---\nslug: old-${i}\npubDate: 2026-09-01T00:00:00Z\n---\nBody`);
	for (const site of ['https://example.test/', 'https://example.test/blog/']) {
		const dates = Object.fromEntries(['/', '/writing/', '/writing/page/2/', '/topics/', '/writing/frontend/', '/topics/agent/'].map((route) => [route, '2026-10-29T00:00:00Z']));
		dates['/about/'] = '2026-10-20T00:00:00Z';
		const sitemap = createSeoSitemapOptions({ contentRoot: root, site, pageUpdatedDates: dates });
		for (const route of ['', 'writing/', 'writing/page/2/', 'topics/', 'writing/frontend/', 'topics/agent/']) {
			assert.equal(sitemap.serialize({ url: `${site}${route}` }).lastmod.toISOString(), '2026-11-01T00:00:00.000Z');
		}
		assert.equal(sitemap.serialize({ url: `${site}about/` }).lastmod.toISOString(), '2026-10-20T00:00:00.000Z');
	}
});
