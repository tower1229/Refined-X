import {
	applyResolvedTheme,
	initThemePreference,
	resolveThemePreference,
	writeThemePreference,
	type ThemePreference,
} from './theme-preference.ts';

interface ThemeControlOptions {
	documentElement: HTMLElement;
	menu: HTMLElement | null;
	trigger: HTMLElement | null;
	options: NodeListOf<Element> | Element[];
	document?: Pick<Document, 'addEventListener'>;
	storage?: Storage | null;
	now?: Date;
}

function preferenceLabel(preference: ThemePreference) {
	if (preference === 'light') return '浅色';
	if (preference === 'dark') return '深色';
	return '自动';
}

function isThemePreference(value: string | undefined): value is ThemePreference {
	return value === 'auto' || value === 'light' || value === 'dark';
}

function isThemeOption(option: Element): option is HTMLButtonElement {
	return 'dataset' in option && 'setAttribute' in option;
}

export function initThemeControl({
	documentElement,
	menu,
	trigger,
	options,
	document = globalThis.document,
	storage = globalThis.localStorage,
	now,
}: ThemeControlOptions) {
	const optionList = Array.from(options);

	const setMenuOpen = (isOpen: boolean) => {
		if (menu) menu.hidden = !isOpen;
		trigger?.setAttribute('aria-expanded', String(isOpen));
	};

	const updateControl = (preference: ThemePreference) => {
		const resolvedTheme = resolveThemePreference(preference, now);
		if (trigger) {
			const label = `主题：${preferenceLabel(preference)}（当前${resolvedTheme === 'light' ? '浅色' : '深色'}）。打开主题菜单`;
			trigger.setAttribute('aria-label', label);
			trigger.setAttribute('title', label);
		}
		optionList.forEach((option) => {
			if (!isThemeOption(option)) return;
			const isSelected = option.dataset.themePreferenceOption === preference;
			option.setAttribute('aria-pressed', String(isSelected));
		});
	};

	const setThemePreference = (preference: ThemePreference) => {
		const resolvedTheme = resolveThemePreference(preference, now);
		applyResolvedTheme(documentElement, { preference, resolvedTheme });
		writeThemePreference(storage, preference, resolvedTheme);
		updateControl(preference);
		setMenuOpen(false);
	};

	const initialTheme = initThemePreference({ documentElement, now, storage });
	updateControl(initialTheme.preference);
	setMenuOpen(false);

	trigger?.addEventListener('click', () => {
		setMenuOpen(menu ? menu.hidden === true : true);
	});

	optionList.forEach((option) => {
		option.addEventListener('click', () => {
			if (!isThemeOption(option)) return;
			const preference = option.dataset.themePreferenceOption;
			if (isThemePreference(preference)) setThemePreference(preference);
		});
	});

	document.addEventListener('click', (event) => {
		const target = event.target;
		if (!menu || !trigger || !target) return;
		if (!menu.contains(target as Node) && !trigger.contains(target as Node)) setMenuOpen(false);
	});
}
