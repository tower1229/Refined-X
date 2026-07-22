export type ThemePreference = 'auto' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_PREFERENCE_KEY = 'refined-x-theme-preference';
export const STARLIGHT_THEME_KEY = 'starlight-theme';

interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

interface ThemeState {
	preference: ThemePreference;
	resolvedTheme: ResolvedTheme;
}

interface InitThemeOptions {
	documentElement: HTMLElement;
	now?: Date;
	storage?: StorageLike | null;
}

function isThemePreference(value: string | null): value is ThemePreference {
	return value === 'auto' || value === 'light' || value === 'dark';
}

function isResolvedTheme(value: string | null): value is ResolvedTheme {
	return value === 'light' || value === 'dark';
}

function safeGet(storage: StorageLike | null | undefined, key: string): string | null {
	try {
		return storage?.getItem(key) ?? null;
	} catch {
		return null;
	}
}

function safeSet(storage: StorageLike | null | undefined, key: string, value: string): void {
	try {
		storage?.setItem(key, value);
	} catch {
		// Storage can be disabled; the current page should still receive a theme.
	}
}

export function normalizeThemePreference(value: string | null): ThemePreference {
	return isThemePreference(value) ? value : 'auto';
}

export function resolveThemePreference(preference: ThemePreference, now = new Date()): ResolvedTheme {
	if (preference === 'light' || preference === 'dark') return preference;
	const hour = now.getHours();
	return hour >= 6 && hour < 18 ? 'light' : 'dark';
}

export function readThemePreference(storage: StorageLike | null | undefined): ThemePreference {
	const storedPreference = safeGet(storage, THEME_PREFERENCE_KEY);
	if (isThemePreference(storedPreference)) return storedPreference;
	if (storedPreference !== null) return 'auto';

	const legacyTheme = safeGet(storage, STARLIGHT_THEME_KEY);
	return isResolvedTheme(legacyTheme) ? legacyTheme : 'auto';
}

export function writeThemePreference(
	storage: StorageLike | null | undefined,
	preference: ThemePreference,
	resolvedTheme = resolveThemePreference(preference),
): void {
	safeSet(storage, THEME_PREFERENCE_KEY, preference);
	safeSet(storage, STARLIGHT_THEME_KEY, resolvedTheme);
}

export function applyResolvedTheme(documentElement: HTMLElement, state: ThemeState): void {
	documentElement.dataset.theme = state.resolvedTheme;
	documentElement.dataset.themePreference = state.preference;
	documentElement.style.colorScheme = state.resolvedTheme;
}

export function initThemePreference({
	documentElement,
	now = new Date(),
	storage = globalThis.localStorage,
}: InitThemeOptions): ThemeState {
	const preference = readThemePreference(storage);
	const resolvedTheme = resolveThemePreference(preference, now);
	const state = { preference, resolvedTheme };
	applyResolvedTheme(documentElement, state);
	writeThemePreference(storage, preference, resolvedTheme);
	return state;
}
