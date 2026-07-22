import assert from 'node:assert/strict';
import test from 'node:test';
import { createTurnstileChallenge } from './turnstile-client.ts';

test('renders the public-ask action and resets for a fresh token per request', async () => {
	let callback: ((token: string) => void) | undefined;
	let resetCalls = 0;
	const challenge = createTurnstileChallenge({
		container: {} as HTMLElement,
		siteKey: 'site-key',
		api: {
			render(_container, options) {
				assert.equal(options.sitekey, 'site-key');
				assert.equal(options.action, 'public-ask');
				assert.equal(options.size, 'compact');
				callback = options.callback;
				queueMicrotask(() => callback?.('token-1'));
				return 'widget-id';
			},
			reset() {
				resetCalls += 1;
				queueMicrotask(() => callback?.('token-2'));
			},
		},
	});
	assert.equal(await challenge.getToken(), 'token-1');
	assert.equal(await challenge.getToken(), 'token-2');
	assert.equal(resetCalls, 1);
});
