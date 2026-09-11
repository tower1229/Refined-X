import assert from 'node:assert/strict';
import test from 'node:test';
import { omitRetiredSiteOverlayKeys } from './site-config-overlay.mjs';

test('omitRetiredSiteOverlayKeys leaves overlays without mcp unchanged', () => {
	const overlay = { title: 'Demo', ask: { mcpUrl: 'https://ask.example.com/mcp' } };
	const result = omitRetiredSiteOverlayKeys(overlay);
	assert.equal(result.ignoredRetiredMcp, false);
	assert.deepEqual(result.overlay, overlay);
});

test('omitRetiredSiteOverlayKeys drops retired mcp and flags ignore', () => {
	const result = omitRetiredSiteOverlayKeys({
		title: 'Demo',
		mcp: {
			packageIdentifier: 'com.example/old',
			airIdentifier: 'urn:air:example.com:public-ask',
		},
		discovery: { awp: false },
	});
	assert.equal(result.ignoredRetiredMcp, true);
	assert.ok(!('mcp' in result.overlay));
	const rest = /** @type {{ title: string, discovery: { awp: boolean } }} */ (result.overlay);
	assert.equal(rest.title, 'Demo');
	assert.deepEqual(rest.discovery, { awp: false });
});

test('omitRetiredSiteOverlayKeys treats nullish overlay as empty', () => {
	assert.deepEqual(omitRetiredSiteOverlayKeys(undefined), { overlay: {}, ignoredRetiredMcp: false });
	assert.deepEqual(omitRetiredSiteOverlayKeys(null), { overlay: {}, ignoredRetiredMcp: false });
});
