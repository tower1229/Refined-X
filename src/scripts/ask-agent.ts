export class PublicAskError extends Error {
	code: string;
	status: number;

	constructor(code: string, message: string, status = 0) {
		super(message);
		this.name = 'PublicAskError';
		this.code = code;
		this.status = status;
	}
}

export type AskErrorMessages = {
	invalidStream: string;
	invalidStreamEmpty: string;
	serviceUnavailable: string;
};

const DEFAULT_MESSAGES: AskErrorMessages = {
	invalidStream: 'The service returned an unparseable NLWeb stream.',
	invalidStreamEmpty: 'The service did not return a valid NLWeb stream.',
	serviceUnavailable: 'Public Ask is temporarily unavailable.',
};

type AskOptions = {
	signal?: AbortSignal;
	onDelta: (text: string) => void;
	fetchImpl?: typeof fetch;
	endpoint?: string;
	getTurnstileToken?: () => Promise<string>;
	messages?: Partial<AskErrorMessages>;
};

/** Injected at build time via astro.config vite.define from siteConfig.ask.askUrl. */
const DEFAULT_ENDPOINT =
	(typeof import.meta !== 'undefined' && (import.meta as ImportMeta & { env?: Record<string, string> }).env?.PUBLIC_ASK_URL) ||
	'';

function resolveMessages(partial?: Partial<AskErrorMessages>): AskErrorMessages {
	return { ...DEFAULT_MESSAGES, ...partial };
}

function eventPayload(event: string, messages: AskErrorMessages): { name: string; data: unknown } | null {
	let name = 'message';
	const data: string[] = [];
	for (const line of event.split('\n')) {
		if (line.startsWith('event:')) name = line.slice(6).trim();
		if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
	}
	if (data.length === 0) return null;
	try {
		return { name, data: JSON.parse(data.join('\n')) };
	} catch {
		throw new PublicAskError('invalid_stream', messages.invalidStream);
	}
}

function consumeEvent(event: string, onDelta: (text: string) => void, messages: AskErrorMessages) {
	const payload = eventPayload(event, messages);
	if (!payload) return false;
	if (payload.name === 'error') {
		const failure = payload.data as { error?: { code?: string; message?: string } };
		throw new PublicAskError(
			failure.error?.code ?? 'stream_error',
			failure.error?.message ?? messages.serviceUnavailable,
		);
	}
	if (payload.name === 'result') {
		const result = payload.data as { item?: { '@type'?: string; text?: unknown } };
		if (result.item?.['@type'] === 'SearchSummary' && typeof result.item.text === 'string') {
			onDelta(result.item.text);
		}
	}
	return payload.name === 'complete';
}

export async function consumeNlWebSse(
	stream: ReadableStream<Uint8Array>,
	onDelta: (text: string) => void,
	messages: AskErrorMessages = DEFAULT_MESSAGES,
) {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	let complete = false;

	while (!complete) {
		const { done, value } = await reader.read();
		buffer += decoder.decode(value, { stream: !done }).replaceAll('\r\n', '\n');
		let boundary = buffer.indexOf('\n\n');
		while (boundary >= 0) {
			const event = buffer.slice(0, boundary);
			buffer = buffer.slice(boundary + 2);
			complete = consumeEvent(event, onDelta, messages);
			if (complete) break;
			boundary = buffer.indexOf('\n\n');
		}
		if (done) break;
	}
	if (!complete && buffer.trim()) consumeEvent(buffer, onDelta, messages);
}

export async function askPublicAgent(question: string, options: AskOptions) {
	const fetchImpl = options.fetchImpl ?? fetch;
	const messages = resolveMessages(options.messages);
	let attempt = 0;
	while (true) {
		const token = await options.getTurnstileToken?.();
		const headers: Record<string, string> = {
			accept: 'text/event-stream',
			'content-type': 'application/json',
		};
		if (token) headers['cf-turnstile-response'] = token;
		const response = await fetchImpl(options.endpoint ?? DEFAULT_ENDPOINT, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				query: { text: question },
				prefer: {
					streaming: true,
					response_format: 'conversational_search',
					mode: 'list, summarize',
					'accept-language': 'zh-CN',
				},
				meta: { version: '0.55' },
			}),
			signal: options.signal,
		});

		if (!response.ok) {
			let failure: { error?: { code?: string; message?: string } } = {};
			try {
				failure = await response.json();
			} catch {
				// CDN failures may not return NLWeb JSON.
			}
			const code = failure.error?.code ?? 'service_unavailable';
			if (code === 'CHALLENGE_EXPIRED' && options.getTurnstileToken && attempt === 0) {
				attempt += 1;
				continue;
			}
			throw new PublicAskError(
				code,
				failure.error?.message ?? messages.serviceUnavailable,
				response.status,
			);
		}
		if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
			throw new PublicAskError('invalid_stream', messages.invalidStreamEmpty, response.status);
		}
		await consumeNlWebSse(response.body, options.onDelta, messages);
		return { requestId: response.headers.get('x-request-id') };
	}
}
