import assert from 'node:assert/strict';
import test from 'node:test';
import { createAskPendingController, THINKING_MESSAGES } from './ask-pending.ts';

function elementStub() {
	return {
		hidden: true,
		textContent: '',
		dataset: {} as DOMStringMap,
		setAttribute() {},
		removeAttribute() {},
	} as unknown as HTMLElement;
}

test('ask pending controller rotates thinking copy and exposes verify mode', async (t) => {
	const previousWindow = globalThis.window;
	const root = elementStub();
	const label = elementStub();
	const live = elementStub();
	globalThis.window = {
		matchMedia() {
			return { matches: true };
		},
		setInterval,
		clearInterval,
	} as unknown as Window & typeof globalThis;
	t.after(() => {
		globalThis.window = previousWindow;
	});

	const pending = createAskPendingController({
		root,
		label,
		liveRegion: live,
		messages: THINKING_MESSAGES,
	});

	pending.show('verify');
	assert.equal(root.hidden, false);
	assert.equal((root as { dataset: DOMStringMap }).dataset.mode, 'verify');
	assert.equal(label.textContent, '');
	assert.equal(live.textContent, '正在完成安全检查');

	pending.show('think');
	assert.equal((root as { dataset: DOMStringMap }).dataset.mode, 'think');
	assert.ok(THINKING_MESSAGES.some((message) => label.textContent?.startsWith(message)));

	pending.hide();
	assert.equal(root.hidden, true);
	assert.equal(label.textContent, '');
	assert.equal(live.textContent, '');
});
