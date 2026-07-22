import assert from 'node:assert/strict';
import test from 'node:test';
import {
	applyResolvedTheme,
	initThemePreference,
	readThemePreference,
	resolveThemePreference,
	THEME_PREFERENCE_KEY,
	STARLIGHT_THEME_KEY,
	writeThemePreference,
	type ResolvedTheme,
	type ThemePreference,
} from './theme-preference.ts';

function at(hour: number, minute = 0) {
	return new Date(2026, 0, 1, hour, minute);
}

function storageStub(initial: Record<string, string> = {}) {
	const values = new Map(Object.entries(initial));
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
	};
}

function rootStub() {
	return {
		dataset: {} as Record<string, string>,
		style: {} as { colorScheme?: string },
	} as HTMLElement & { style: { colorScheme?: string } };
}

test('auto preference resolves from local time boundaries', () => {
	const cases: Array<[Date, ResolvedTheme]> = [
		[at(5, 59), 'dark'],
		[at(6, 0), 'light'],
		[at(17, 59), 'light'],
		[at(18, 0), 'dark'],
	];

	for (const [date, expected] of cases) {
		assert.equal(resolveThemePreference('auto', date), expected);
	}
});

test('manual preferences override day and night samples', () => {
	for (const preference of ['light', 'dark'] as ThemePreference[]) {
		assert.equal(resolveThemePreference(preference, at(9)), preference);
		assert.equal(resolveThemePreference(preference, at(21)), preference);
	}
});

test('missing or invalid stored preference falls back to auto', () => {
	assert.equal(readThemePreference(storageStub()), 'auto');
	assert.equal(readThemePreference(storageStub({ [THEME_PREFERENCE_KEY]: 'system' })), 'auto');
});

test('legacy starlight theme migrates to manual preference when canonical preference is absent', () => {
	assert.equal(readThemePreference(storageStub({ [STARLIGHT_THEME_KEY]: 'light' })), 'light');
	assert.equal(readThemePreference(storageStub({ [STARLIGHT_THEME_KEY]: 'dark' })), 'dark');
});

test('init applies resolved root theme and persists canonical preference', () => {
	const storage = storageStub();
	const root = rootStub();

	const state = initThemePreference({ documentElement: root, now: at(21), storage });

	assert.deepEqual(state, { preference: 'auto', resolvedTheme: 'dark' });
	assert.equal(root.dataset.theme, 'dark');
	assert.equal(root.dataset.themePreference, 'auto');
	assert.equal(root.style.colorScheme, 'dark');
	assert.equal(storage.value(THEME_PREFERENCE_KEY), 'auto');
	assert.equal(storage.value(STARLIGHT_THEME_KEY), 'dark');
});

test('manual writes persist preference separately from resolved theme', () => {
	const storage = storageStub();
	writeThemePreference(storage, 'light', 'light');

	assert.equal(storage.value(THEME_PREFERENCE_KEY), 'light');
	assert.equal(storage.value(STARLIGHT_THEME_KEY), 'light');
});

test('applyResolvedTheme updates only the renderable two-state theme on root', () => {
	const root = rootStub();
	applyResolvedTheme(root, { preference: 'auto', resolvedTheme: 'light' });

	assert.equal(root.dataset.theme, 'light');
	assert.equal(root.dataset.themePreference, 'auto');
});
