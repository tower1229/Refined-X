type TurnstileRenderOptions = {
	sitekey: string;
	action: string;
	size?: 'normal' | 'compact' | 'flexible';
	callback: (token: string) => void;
	'expired-callback': () => void;
	'error-callback': () => void;
};

export type TurnstileApi = {
	render(container: HTMLElement, options: TurnstileRenderOptions): string;
	reset(widgetId: string): void;
};

type ChallengeOptions = {
	container: HTMLElement;
	siteKey: string;
	api: TurnstileApi;
	size?: TurnstileRenderOptions['size'];
};

export function createTurnstileChallenge({ container, siteKey, api, size = 'compact' }: ChallengeOptions) {
	let token: string | null = null;
	let resolveToken: ((value: string) => void) | undefined;
	let rejectToken: ((reason: Error) => void) | undefined;
	let needsReset = false;
	const widgetId = api.render(container, {
		sitekey: siteKey,
		action: 'public-ask',
		size,
		callback(value) {
			token = value;
			resolveToken?.(value);
			resolveToken = undefined;
			rejectToken = undefined;
		},
		'expired-callback'() {
			token = null;
			needsReset = true;
			rejectToken?.(new Error('Turnstile challenge expired'));
			resolveToken = undefined;
			rejectToken = undefined;
		},
		'error-callback'() {
			token = null;
			needsReset = true;
			rejectToken?.(new Error('Turnstile challenge failed'));
			resolveToken = undefined;
			rejectToken = undefined;
		},
	});

	return {
		async getToken() {
			if (token) {
				const value = token;
				token = null;
				needsReset = true;
				return value;
			}
			const pending = new Promise<string>((resolve, reject) => {
				resolveToken = resolve;
				rejectToken = reject;
			});
			if (needsReset) {
				needsReset = false;
				api.reset(widgetId);
			}
			const value = await pending;
			token = null;
			needsReset = true;
			return value;
		},
	};
}

export async function waitForTurnstile(timeoutMs = 10_000): Promise<TurnstileApi> {
	const started = Date.now();
	while (Date.now() - started < timeoutMs) {
		const api = (window as typeof window & { turnstile?: TurnstileApi }).turnstile;
		if (api) return api;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error('Turnstile failed to load');
}
