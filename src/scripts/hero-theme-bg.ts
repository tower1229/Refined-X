import type { ResolvedTheme } from './theme-preference.ts';

export type HeroThemeLayer = 'light' | 'dark';

/** Settled opacity for each hero theme background layer. */
export type HeroThemeLayerOpacity = 0 | 1;

export const HERO_THEME_CROSSFADE_MS = 2100;

/** Maps to `data-hero-theme-crossfade-ready` on the document root. */
export const HERO_THEME_CROSSFADE_READY_DATASET_KEY = 'heroThemeCrossfadeReady';

export function heroThemeLayerOpacity(
	resolvedTheme: ResolvedTheme,
	layer: HeroThemeLayer,
): HeroThemeLayerOpacity {
	return resolvedTheme === layer ? 1 : 0;
}

export function heroThemeCrossfadeTransitionMs(options: {
	prefersReducedMotion: boolean;
	transitionsArmed: boolean;
}): number {
	if (options.prefersReducedMotion || !options.transitionsArmed) return 0;
	return HERO_THEME_CROSSFADE_MS;
}

export function markHeroThemeCrossfadeReady(documentElement: HTMLElement): void {
	documentElement.style.setProperty(
		'--hero-theme-crossfade-duration',
		`${HERO_THEME_CROSSFADE_MS}ms`,
	);
	documentElement.dataset[HERO_THEME_CROSSFADE_READY_DATASET_KEY] = 'true';
}

/** Arm crossfade after the first paint so the initial theme does not animate in. */
export function scheduleHeroThemeCrossfadeReady(
	documentElement: HTMLElement,
	scheduleFrame: (callback: FrameRequestCallback) => number = requestAnimationFrame,
): void {
	scheduleFrame(() => {
		scheduleFrame(() => {
			markHeroThemeCrossfadeReady(documentElement);
		});
	});
}
