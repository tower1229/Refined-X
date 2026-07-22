export type AskPendingMode = 'verify' | 'think';

export type AskPendingController = {
	show: (mode: AskPendingMode) => void;
	hide: () => void;
};

type PendingOptions = {
	root: HTMLElement;
	label: HTMLElement;
	liveRegion?: HTMLElement;
	messages?: readonly string[];
	verifyingLive?: string;
};

function pickMessage(messages: readonly string[], previous: string | null) {
	const pool = previous ? messages.filter((message) => message !== previous) : messages;
	return pool[Math.floor(Math.random() * pool.length)] ?? messages[0] ?? '';
}

/** Default thinking copy (English, matches template locale). Pages should pass locale messages. */
export const THINKING_MESSAGES = [
	'Searching public pages for clues',
	'Matching related articles and FAQ',
	'Shaping possible answer directions',
	'Retrieving curated answers and long-form excerpts',
	'Checking public materials on this site',
	'Looking for directly related pages',
] as const;

export function createAskPendingController({
	root,
	label,
	liveRegion,
	messages = THINKING_MESSAGES,
	verifyingLive = 'Completing security check',
}: PendingOptions): AskPendingController {
	let mode: AskPendingMode | null = null;
	let messageTimer: number | undefined;
	let ellipsisTimer: number | undefined;
	let dotCount = 0;
	let currentMessage = '';
	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	const clearTimers = () => {
		if (messageTimer !== undefined) window.clearInterval(messageTimer);
		if (ellipsisTimer !== undefined) window.clearInterval(ellipsisTimer);
		messageTimer = undefined;
		ellipsisTimer = undefined;
	};

	const renderLabel = () => {
		label.textContent = currentMessage;
		if (liveRegion) liveRegion.textContent = `${currentMessage}…`;
	};

	const startEllipsis = () => {
		if (reducedMotion) {
			label.textContent = `${currentMessage}…`;
			if (liveRegion) liveRegion.textContent = `${currentMessage}…`;
			return;
		}
		dotCount = 0;
		ellipsisTimer = window.setInterval(() => {
			dotCount = (dotCount + 1) % 4;
			const dots = '.'.repeat(dotCount);
			label.textContent = `${currentMessage}${dots}`;
			if (liveRegion) liveRegion.textContent = `${currentMessage}${dots || '…'}`;
		}, 420);
	};

	const startThinking = () => {
		currentMessage = pickMessage(messages, null);
		renderLabel();
		startEllipsis();
		if (reducedMotion) return;
		messageTimer = window.setInterval(() => {
			currentMessage = pickMessage(messages, currentMessage);
			renderLabel();
		}, 2800);
	};

	return {
		show(nextMode) {
			mode = nextMode;
			clearTimers();
			root.hidden = false;
			root.dataset.mode = nextMode;
			root.setAttribute('aria-hidden', 'false');
			if (nextMode === 'verify') {
				label.textContent = '';
				if (liveRegion) liveRegion.textContent = verifyingLive;
				return;
			}
			startThinking();
		},
		hide() {
			mode = null;
			clearTimers();
			root.hidden = true;
			root.removeAttribute('data-mode');
			root.setAttribute('aria-hidden', 'true');
			label.textContent = '';
			if (liveRegion) liveRegion.textContent = '';
		},
	};
}
