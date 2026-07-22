import assert from 'node:assert/strict';
import test from 'node:test';
import { initThemeControl } from './theme-control.ts';
import { THEME_PREFERENCE_KEY, STARLIGHT_THEME_KEY } from './theme-preference.ts';

function storageStub() {
	const values = new Map<string, string>();
	return {
		getItem(key: string) {
			return values.get(key) ?? null;
		},
		setItem(key: string, value: string) {
			values.set(key, value);
		},
		value(key: string) {
			return values.get(key);
		},
	} as Storage & { value(key: string): string | undefined };
}

function elementStub<T extends HTMLElement>(tagName: string, dataset: Record<string, string> = {}) {
	const listeners = new Map<string, Array<(event: Event) => void>>();
	const attributes = new Map<string, string>();
	return {
		tagName: tagName.toUpperCase(),
		dataset,
		hidden: false,
		style: {} as CSSStyleDeclaration,
		addEventListener(type: string, listener: EventListener) {
			const callbacks = listeners.get(type) ?? [];
			callbacks.push(listener as (event: Event) => void);
			listeners.set(type, callbacks);
		},
		click() {
			for (const listener of listeners.get('click') ?? []) listener({ target: this } as unknown as Event);
		},
		contains(target: Node) {
			return target === this;
		},
		setAttribute(name: string, value: string) {
			attributes.set(name, value);
		},
		getAttribute(name: string) {
			return attributes.get(name) ?? null;
		},
	} as T & { click(): void; style: CSSStyleDeclaration };
}

test('theme control chooses light, chooses dark, and returns to automatic', () => {
	const root = elementStub<HTMLElement>('html');
	const menu = elementStub<HTMLElement>('div');
	const trigger = elementStub<HTMLButtonElement>('button');
	const auto = elementStub<HTMLButtonElement>('button', { themePreferenceOption: 'auto' });
	const light = elementStub<HTMLButtonElement>('button', { themePreferenceOption: 'light' });
	const dark = elementStub<HTMLButtonElement>('button', { themePreferenceOption: 'dark' });
	const storage = storageStub();

	initThemeControl({
		documentElement: root,
		menu,
		trigger,
		options: [auto, light, dark],
		document: { addEventListener() {} },
		storage,
		now: new Date(2026, 0, 1, 21),
	});

	assert.equal(root.dataset.themePreference, 'auto');
	assert.equal(root.dataset.theme, 'dark');
	assert.equal(trigger.getAttribute('aria-expanded'), 'false');

	trigger.click();
	assert.equal(trigger.getAttribute('aria-expanded'), 'true');
	assert.equal(menu.hidden, false);

	light.click();
	assert.equal(root.dataset.themePreference, 'light');
	assert.equal(root.dataset.theme, 'light');
	assert.equal(storage.value(THEME_PREFERENCE_KEY), 'light');
	assert.equal(storage.value(STARLIGHT_THEME_KEY), 'light');
	assert.equal(trigger.getAttribute('aria-label'), '主题：浅色（当前浅色）。打开主题菜单');
	assert.equal(light.getAttribute('aria-pressed'), 'true');

	trigger.click();
	dark.click();
	assert.equal(root.dataset.themePreference, 'dark');
	assert.equal(root.dataset.theme, 'dark');
	assert.equal(storage.value(THEME_PREFERENCE_KEY), 'dark');
	assert.equal(dark.getAttribute('aria-pressed'), 'true');

	trigger.click();
	auto.click();
	assert.equal(root.dataset.themePreference, 'auto');
	assert.equal(root.dataset.theme, 'dark');
	assert.equal(storage.value(THEME_PREFERENCE_KEY), 'auto');
	assert.equal(auto.getAttribute('aria-pressed'), 'true');
	assert.equal(trigger.getAttribute('aria-expanded'), 'false');
});
