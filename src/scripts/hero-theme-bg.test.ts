import assert from 'node:assert/strict';
import test from 'node:test';
import {
	HERO_THEME_CROSSFADE_MS,
	HERO_THEME_CROSSFADE_READY_DATASET_KEY,
	heroThemeCrossfadeTransitionMs,
	heroThemeLayerOpacity,
	markHeroThemeCrossfadeReady,
	scheduleHeroThemeCrossfadeReady,
} from './hero-theme-bg.ts';

test('crossfade duration is 2100ms', () => {
	assert.equal(HERO_THEME_CROSSFADE_MS, 2100);
});

test('light theme settles with light layer opaque and dark layer transparent', () => {
	assert.equal(heroThemeLayerOpacity('light', 'light'), 1);
	assert.equal(heroThemeLayerOpacity('light', 'dark'), 0);
});

test('dark theme settles with dark layer opaque and light layer transparent', () => {
	assert.equal(heroThemeLayerOpacity('dark', 'dark'), 1);
	assert.equal(heroThemeLayerOpacity('dark', 'light'), 0);
});

test('transition is armed only after ready and when motion is allowed', () => {
	assert.equal(
		heroThemeCrossfadeTransitionMs({ prefersReducedMotion: false, transitionsArmed: false }),
		0,
	);
	assert.equal(
		heroThemeCrossfadeTransitionMs({ prefersReducedMotion: true, transitionsArmed: true }),
		0,
	);
	assert.equal(
		heroThemeCrossfadeTransitionMs({ prefersReducedMotion: false, transitionsArmed: true }),
		HERO_THEME_CROSSFADE_MS,
	);
});

test('markHeroThemeCrossfadeReady arms transitions on the document root', () => {
	const root = {
		dataset: {} as Record<string, string>,
		style: { setProperty(_name: string, _value: string) {} },
	} as HTMLElement;
	const setPropertyCalls: Array<[string, string]> = [];
	root.style.setProperty = (name: string, value: string) => {
		setPropertyCalls.push([name, value]);
	};

	markHeroThemeCrossfadeReady(root);

	assert.equal(root.dataset[HERO_THEME_CROSSFADE_READY_DATASET_KEY], 'true');
	assert.deepEqual(setPropertyCalls, [
		['--hero-theme-crossfade-duration', `${HERO_THEME_CROSSFADE_MS}ms`],
	]);
});

test('scheduleHeroThemeCrossfadeReady waits two animation frames before arming', () => {
	const root = {
		dataset: {} as Record<string, string>,
		style: { setProperty() {} },
	} as HTMLElement;
	const queued: FrameRequestCallback[] = [];
	const scheduleFrame = (callback: FrameRequestCallback) => {
		queued.push(callback);
		return queued.length;
	};

	scheduleHeroThemeCrossfadeReady(root, scheduleFrame);
	assert.equal(root.dataset[HERO_THEME_CROSSFADE_READY_DATASET_KEY], undefined);
	assert.equal(queued.length, 1);

	queued.shift()!(0);
	assert.equal(root.dataset[HERO_THEME_CROSSFADE_READY_DATASET_KEY], undefined);
	assert.equal(queued.length, 1);

	queued.shift()!(0);
	assert.equal(root.dataset[HERO_THEME_CROSSFADE_READY_DATASET_KEY], 'true');
});
