export type Typewriter = {
	reset: () => void;
	append: (value: string) => void;
	show: (value: string) => Promise<void>;
	finish: () => Promise<string>;
	text: () => string;
};

export function createTypewriter(target: HTMLElement, liveRegion?: HTMLElement): Typewriter {
	let desired: string[] = [];
	let visible = 0;
	let timer: number | undefined;
	let waiters: Array<() => void> = [];
	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	const value = () => desired.join('');
	const settle = () => {
		if (visible < desired.length) return;
		if (timer !== undefined) window.clearTimeout(timer);
		timer = undefined;
		target.classList.remove('is-typing');
		if (liveRegion) liveRegion.textContent = value();
		const pending = waiters;
		waiters = [];
		pending.forEach((resolve) => resolve());
	};

	const draw = () => {
		if (reducedMotion) visible = desired.length;
		else visible = Math.min(desired.length, visible + 1);
		target.textContent = desired.slice(0, visible).join('');
		if (visible < desired.length) timer = window.setTimeout(draw, 14);
		else settle();
	};

	const schedule = () => {
		if (timer !== undefined) return;
		if (visible >= desired.length) return settle();
		if (!reducedMotion) target.classList.add('is-typing');
		timer = window.setTimeout(draw, reducedMotion ? 0 : 14);
	};

	const reset = () => {
		if (timer !== undefined) window.clearTimeout(timer);
		timer = undefined;
		desired = [];
		visible = 0;
		target.textContent = '';
		target.classList.remove('is-typing');
		if (liveRegion) liveRegion.textContent = '';
		const pending = waiters;
		waiters = [];
		pending.forEach((resolve) => resolve());
	};

	const append = (next: string) => {
		desired.push(...Array.from(next));
		schedule();
	};

	const finish = () => {
		if (visible >= desired.length) {
			settle();
			return Promise.resolve(value());
		}
		return new Promise<string>((resolve) => {
			waiters.push(() => resolve(value()));
			schedule();
		});
	};

	const show = async (next: string) => {
		reset();
		append(next);
		await finish();
	};

	return { reset, append, show, finish, text: value };
}
