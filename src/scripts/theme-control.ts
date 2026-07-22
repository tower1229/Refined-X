import {
	applyResolvedTheme,
	initThemePreference,
	resolveThemePreference,
	writeThemePreference,
	type ThemePreference,
} from './theme-preference.ts';

export type ThemeControlLabels = {
	auto: string;
	light: string;
	dark: string;
	triggerAria: (preferenceLabel: string, currentLabel: string) => string;
};

interface ThemeControlOptions {
	documentElement: HTMLElement;
	menu: HTMLElement | null;
	trigger: HTMLElement | null;
	options: NodeListOf<Element> | Element[];
	labels: ThemeControlLabels;
	document?: Pick<Document, 'addEventListener'>;
	storage?: Storage | null;
	now?: Date;
}

function preferenceLabel(preference: ThemePreference, labels: ThemeControlLabels) {
	if (preference === 'light') return labels.light;
	if (preference === 'dark') return labels.dark;
	return labels.auto;
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
	labels,
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
			const label = labels.triggerAria(
				preferenceLabel(preference, labels),
				resolvedTheme === 'light' ? labels.light : labels.dark,
			);
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
			const next = option.dataset.themePreferenceOption;
			if (!isThemePreference(next)) return;
			setThemePreference(next);
		});
	});

	document.addEventListener('click', (event) => {
		const target = event.target;
		if (!(target instanceof Node)) return;
		if (menu?.contains(target) || trigger?.contains(target)) return;
		setMenuOpen(false);
	});
}
