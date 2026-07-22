import assert from 'node:assert/strict';
import test from 'node:test';
import { askPublicAgent, consumeNlWebSse, PublicAskError } from './ask-agent.ts';
import { findExactAnswer, normalizeAskQuery } from './ask-search.ts';

function chunkedStream(chunks: string[]) {
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
			controller.close();
		},
	});
}

test('matches curated quick questions despite punctuation and spaces', () => {
	const answers = [
		{ url: '/answers/who-is-author/', q: 'Who is the author?', a: 'Identity' },
		{ url: '/answers/ai-practice/', q: 'What AI practices are documented?', a: 'AI notes' },
		{ url: '/answers/open-source/', q: 'What open source projects are featured?', a: 'Projects' },
		{ url: '/answers/collaborate/', q: 'How can I collaborate?', a: 'Collaborate' },
	];
	assert.equal(normalizeAskQuery(' How can I collaborate? '), 'howcanicollaborate');
	for (const answer of answers) assert.equal(findExactAnswer(answers, answer.q)?.url, answer.url);
	assert.equal(findExactAnswer(answers, 'collaborate somehow'), undefined);
});

test('parses fragmented NLWeb v0.55 SSE events', async () => {
	let answer = '';
	await consumeNlWebSse(
		chunkedStream([
			'event: start\ndata: {"_meta":{"response_type":"answer","version":"0.55"}}\n',
			'\nevent: result\ndata: {"index":0,"item":{"@type":"SearchSummary","text":"你好"}}\r\n\r\n',
			'event: complete\ndata: {"_meta":{"response_type":"answer","version":"0.55"}}\n\n',
		]),
		(delta) => {
			answer += delta;
		},
	);
	assert.equal(answer, '你好');
});

test('sends the structured NLWeb request with a Turnstile token', async () => {
	let captured: RequestInit | undefined;
	let answer = '';
	let capturedUrl = '';
	const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
		capturedUrl = String(input);
		captured = init;
		return new Response(
			chunkedStream([
				'event: result\ndata: {"index":0,"item":{"@type":"SearchSummary","text":"回答"}}\n\n',
				'event: complete\ndata: {"_meta":{"response_type":"answer","version":"0.55"}}\n\n',
			]),
			{ headers: { 'content-type': 'text/event-stream' } },
		);
	};
	await askPublicAgent('问题', {
		endpoint: 'https://ask.example.com/ask',
		fetchImpl,
		getTurnstileToken: async () => 'turnstile-token',
		onDelta: (delta) => (answer += delta),
	});
	const body = JSON.parse(String(captured?.body));
	assert.equal(capturedUrl, 'https://ask.example.com/ask');
	assert.deepEqual(body.query, { text: '问题' });
	assert.equal(body.meta.version, '0.55');
	assert.equal('remember' in body.meta, false);
	assert.equal(new Headers(captured?.headers).get('cf-turnstile-response'), 'turnstile-token');
	assert.equal(answer, '回答');
});

test('consumes no-reference SearchSummary text through the normal delta callback', async () => {
	const noReference = '我暂时找不到足够材料支撑这个答案。为了保持准确，我不会硬凑结论；可以换个角度继续问。';
	let answer = '';
	await consumeNlWebSse(
		chunkedStream([
			`event: result\ndata: {"index":0,"item":{"@type":"SearchSummary","text":${JSON.stringify(noReference)}}}\n\n`,
			'event: complete\ndata: {"_meta":{"response_type":"answer","version":"0.55"}}\n\n',
		]),
		(delta) => {
			answer += delta;
		},
	);
	assert.equal(answer, noReference);
});

test('refreshes an explicitly expired challenge and retries the full request only once', async () => {
	let challengeCalls = 0;
	let fetchCalls = 0;
	await askPublicAgent('问题', {
		onDelta() {},
		getTurnstileToken: async () => `token-${++challengeCalls}`,
		fetchImpl: async (_input, init) => {
			fetchCalls += 1;
			if (fetchCalls === 1) {
				return Response.json({ error: { code: 'CHALLENGE_EXPIRED', message: 'expired' } }, { status: 403 });
			}
			assert.equal(new Headers(init?.headers).get('cf-turnstile-response'), 'token-2');
			return new Response(chunkedStream([
				'event: complete\ndata: {"_meta":{"response_type":"answer","version":"0.55"}}\n\n',
			]), { headers: { 'content-type': 'text/event-stream' } });
		},
	});
	assert.equal(challengeCalls, 2);
	assert.equal(fetchCalls, 2);
});

test('normalizes NLWeb failure responses', async () => {
	await assert.rejects(
		askPublicAgent('问题', {
			onDelta() {},
			fetchImpl: async () =>
				new Response(
					JSON.stringify({
						_meta: { response_type: 'failure', version: '0.55' },
						error: { code: 'RATE_LIMITED', message: '稍后再试。' },
					}),
					{ status: 429, headers: { 'content-type': 'application/json' } },
				),
		}),
		(error: unknown) =>
			error instanceof PublicAskError && error.code === 'RATE_LIMITED' && error.status === 429,
	);
});
