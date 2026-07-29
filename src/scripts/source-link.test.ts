import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSameOriginSource } from './source-link.ts';

test('accepts only absolute HTTP(S) sources from the current site origin', () => {
	assert.equal(
		resolveSameOriginSource('https://demo.refined-x.com/about/', 'https://demo.refined-x.com')?.href,
		'https://demo.refined-x.com/about/',
	);
	assert.equal(
		resolveSameOriginSource('http://demo.refined-x.com/about/', 'https://demo.refined-x.com'),
		null,
	);
	assert.equal(
		resolveSameOriginSource('https://refined-x.com/about/', 'https://demo.refined-x.com'),
		null,
	);
	assert.equal(resolveSameOriginSource('/about/', 'https://demo.refined-x.com'), null);
	assert.equal(resolveSameOriginSource('javascript:alert(1)', 'https://demo.refined-x.com'), null);
});
