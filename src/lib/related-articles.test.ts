import assert from 'node:assert/strict';
import test from 'node:test';
import {
	normalizeTag,
	selectRelatedArticles,
	sharedTagCount,
	type RelatedArticleInput,
} from './related-articles.ts';

function article(
	id: string,
	opts: {
		series?: string;
		tags?: string[];
		pubDate?: string;
	} = {},
): RelatedArticleInput {
	return {
		id,
		data: {
			series: opts.series,
			tags: opts.tags ?? [],
			pubDate: opts.pubDate ? new Date(opts.pubDate) : undefined,
			title: id,
		},
	};
}

test('normalizeTag applies NFKC and zh-CN lowercasing', () => {
	assert.equal(normalizeTag('AI'), 'ai');
	assert.equal(normalizeTag('ＡＩ'), 'ai');
});

test('sharedTagCount counts normalized overlaps', () => {
	assert.equal(sharedTagCount(['AI', '前端'], ['ai', '工程']), 1);
	assert.equal(sharedTagCount(['AI'], ['前端']), 0);
});

test('same series without shared tags beats other series with shared tags', () => {
	const current = article('current', { series: 'ai', tags: ['agent'], pubDate: '2026-01-10' });
	const sameSeries = article('same-series', { series: 'ai', tags: ['other'], pubDate: '2026-01-01' });
	const otherSeriesTagged = article('other-tagged', {
		series: 'frontend',
		tags: ['agent'],
		pubDate: '2026-01-09',
	});

	const related = selectRelatedArticles(current, [current, sameSeries, otherSeriesTagged], 2);
	assert.deepEqual(
		related.map((a) => a.id),
		['same-series', 'other-tagged'],
	);
});

test('within same series, more shared tags then newer pubDate win', () => {
	const current = article('current', { series: 'ai', tags: ['a', 'b'], pubDate: '2026-01-10' });
	const moreTagsOlder = article('more-tags', {
		series: 'ai',
		tags: ['a', 'b'],
		pubDate: '2025-01-01',
	});
	const fewerTagsNewer = article('fewer-tags', {
		series: 'ai',
		tags: ['a'],
		pubDate: '2026-01-09',
	});
	const sameTagsNewer = article('same-tags-newer', {
		series: 'ai',
		tags: ['a', 'b'],
		pubDate: '2026-01-08',
	});

	const related = selectRelatedArticles(
		current,
		[current, fewerTagsNewer, moreTagsOlder, sameTagsNewer],
		3,
	);
	assert.deepEqual(
		related.map((a) => a.id),
		['same-tags-newer', 'more-tags', 'fewer-tags'],
	);
});

test('articles without series skip tier1 and use shared tags', () => {
	const current = article('current', { tags: ['agent'], pubDate: '2026-01-10' });
	const tagged = article('tagged', { series: 'ai', tags: ['agent'], pubDate: '2026-01-01' });
	const untaggedRecent = article('recent', { series: 'frontend', tags: [], pubDate: '2026-01-09' });

	const related = selectRelatedArticles(current, [current, untaggedRecent, tagged], 2);
	assert.deepEqual(
		related.map((a) => a.id),
		['tagged', 'recent'],
	);
});

test('pads with recent articles without duplicates or self', () => {
	const current = article('current', { series: 'ai', tags: ['x'], pubDate: '2026-01-10' });
	const peer = article('peer', { series: 'ai', tags: [], pubDate: '2026-01-02' });
	const fillerA = article('filler-a', { series: 'frontend', tags: [], pubDate: '2026-01-09' });
	const fillerB = article('filler-b', { series: 'reflection', tags: [], pubDate: '2026-01-08' });

	const related = selectRelatedArticles(current, [current, peer, fillerA, fillerB], 3);
	assert.deepEqual(
		related.map((a) => a.id),
		['peer', 'filler-a', 'filler-b'],
	);
	assert.equal(related.some((a) => a.id === 'current'), false);
	assert.equal(new Set(related.map((a) => a.id)).size, related.length);
});
