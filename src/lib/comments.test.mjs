import assert from 'node:assert/strict';
import test from 'node:test';
import { articleCommentTerm, resolveCommentsConfig } from './comments.mjs';

test('empty comments config stays disabled', () => {
	assert.deepEqual(resolveCommentsConfig(), {
		repo: '',
		repoId: '',
		category: '',
		categoryId: '',
		enabled: false,
	});
});

test('complete comments config is normalized and enabled', () => {
	assert.deepEqual(
		resolveCommentsConfig({
			repo: ' tower1229/Refined-X ',
			repoId: 'R_repo',
			category: 'Comments',
			categoryId: 'DIC_category',
		}),
		{
			repo: 'tower1229/Refined-X',
			repoId: 'R_repo',
			category: 'Comments',
			categoryId: 'DIC_category',
			enabled: true,
		},
	);
});

test('partial comments config fails with the missing public fields', () => {
	assert.throws(
		() => resolveCommentsConfig({ repo: 'tower1229/Refined-X' }),
		/comments\.repoId、comments\.category、comments\.categoryId/,
	);
});

test('comments repository must use owner/repo format', () => {
	assert.throws(
		() =>
			resolveCommentsConfig({
				repo: 'Refined-X',
				repoId: 'R_repo',
				category: 'Comments',
				categoryId: 'DIC_category',
			}),
		/owner\/repo/,
	);
});

test('article comment terms are stable and scoped', () => {
	assert.equal(
		articleCommentTerm('2026/09/01/giscus-comments'),
		'article:2026/09/01/giscus-comments',
	);
});
