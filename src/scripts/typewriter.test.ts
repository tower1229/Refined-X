import assert from 'node:assert/strict';
import test from 'node:test';
import { createTypewriter } from './typewriter.ts';

function elementStub() {
	const classes = new Set<string>();
	return {
		textContent: '',
		classList: {
			add(value: string) {
				classes.add(value);
			},
			remove(value: string) {
				classes.delete(value);
			},
			contains(value: string) {
				return classes.has(value);
			},
		},
	} as unknown as HTMLElement & { classList: { contains(value: string): boolean } };
}

test('typewriter respects reduced motion while rendering the full answer path', async (t) => {
	const previousWindow = globalThis.window;
	const target = elementStub();
	const live = elementStub();
	globalThis.window = {
		matchMedia() {
			return { matches: true };
		},
		setTimeout,
		clearTimeout,
	} as unknown as Window & typeof globalThis;
	t.after(() => {
		globalThis.window = previousWindow;
	});

	const typewriter = createTypewriter(target, live);
	await typewriter.show('无资料回答');

	assert.equal(target.textContent, '无资料回答');
	assert.equal(live.textContent, '无资料回答');
	assert.equal(target.classList.contains('is-typing'), false);
});
