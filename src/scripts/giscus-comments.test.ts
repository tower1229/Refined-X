import assert from 'node:assert/strict';
import test from 'node:test';
import {
	GISCUS_ORIGIN,
	giscusScriptAttributes,
	giscusThemeMessage,
	postGiscusTheme,
	resolveGiscusTheme,
} from './giscus-comments.ts';

const config = {
	repo: 'tower1229/Refined-X',
	repoId: 'R_repo',
	category: 'Comments',
	categoryId: 'DIC_category',
	term: 'article:2026/09/01/example',
	lang: 'zh-CN',
};

test('giscus attributes use stable strict article mapping and lazy loading', () => {
	assert.deepEqual(giscusScriptAttributes(config, 'dark'), {
		repo: 'tower1229/Refined-X',
		'repo-id': 'R_repo',
		category: 'Comments',
		'category-id': 'DIC_category',
		mapping: 'specific',
		term: 'article:2026/09/01/example',
		strict: '1',
		'reactions-enabled': '1',
		'emit-metadata': '0',
		'input-position': 'bottom',
		theme: 'dark',
		lang: 'zh-CN',
		loading: 'lazy',
	});
});

test('giscus theme follows the resolved site theme', () => {
	assert.equal(resolveGiscusTheme({ dataset: { theme: 'dark' } }), 'dark');
	assert.equal(resolveGiscusTheme({ dataset: { theme: 'light' } }), 'light');
	assert.equal(resolveGiscusTheme({ dataset: {} }), 'light');
});

test('theme updates target only the giscus origin', () => {
	const calls: Array<{ message: unknown; origin: string }> = [];
	const frame = {
		contentWindow: {
			postMessage(message: unknown, origin: string) {
				calls.push({ message, origin });
			},
		} as Window,
	};

	postGiscusTheme(frame, 'dark');
	assert.deepEqual(calls, [{ message: giscusThemeMessage('dark'), origin: GISCUS_ORIGIN }]);
});
