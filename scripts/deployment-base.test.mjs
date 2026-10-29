import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlWithBase, prefixPublicPath } from './deployment-base.mjs';

test('subpath publication fixes Markdown and copied HTML without changing external links or script text', () => {
	const html = '<!doctype html><title>Example</title><a href="/writing/?q=1#top">Writing</a><img src="/projects/demo.png"><a href="//other.test/x">external</a><a href="https://example.test/">absolute</a><script>const root = "/api/";</script>';
	const output = htmlWithBase(html, '/blog/');
	assert.match(output, /href="\/blog\/writing\/\?q=1#top"/);
	assert.match(output, /src="\/blog\/projects\/demo.png"/);
	assert.match(output, /href="\/\/other.test\/x"/);
	assert.match(output, /const root = "\/api\/"/);
	assert.equal(prefixPublicPath('/blog/writing/', '/blog/'), '/blog/writing/');
	assert.equal(prefixPublicPath('/writing/', '/'), '/writing/');
	assert.match(htmlWithBase('<html><meta http-equiv="refresh" content="0;url=/writing/"></html>', '/blog/'), /content="0;url=\/blog\/writing\/"/);
	assert.equal(htmlWithBase('google-site-verification: example.html', '/blog/'), 'google-site-verification: example.html');
});
