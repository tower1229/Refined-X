import {
	ASK_RAW_INPUT_SCHEMA,
	ASK_SUCCESS_RESULT_SCHEMA,
	NLWEB_VERSION,
} from '../../shared/public-ask-contract.ts';
import type { PublicCapabilities } from './public-capabilities.ts';
import { openApiServerAndPath, siteOpenApiServerUrl } from './public-capabilities.ts';

type JsonSchema = Record<string, unknown>;

function response(description: string, schema: JsonSchema) {
	return {
		description,
		content: { 'application/json': { schema } },
	};
}

function askSuccessResponse() {
	return {
		description:
			'NLWeb answer or failure. Buffered JSON by default; when prefer.streaming is true or Accept includes text/event-stream, the Worker may return buffered SSE (events: start, result, complete).',
		content: {
			'application/json': { schema: { $ref: '#/components/schemas/NlWebResponse' } },
			'text/event-stream': {
				schema: {
					type: 'string',
					description:
						'Server-Sent Events stream. event:start (meta), event:result (index + item), event:complete (meta). Each event data payload is JSON.',
				},
			},
		},
	};
}

function buildSchemas() {
	return {
		Profile: {
			type: 'object',
			required: ['id', 'name', 'url', 'sameAs'],
			properties: {
				id: { type: 'string', format: 'uri' },
				name: { type: 'string' },
				jobTitle: { type: 'string' },
				description: { type: 'string' },
				url: { type: 'string', format: 'uri' },
				sameAs: { type: 'array', items: { type: 'string', format: 'uri' } },
				email: { type: 'string', format: 'email' },
				wechat: { type: 'string', description: '微信号' },
			},
		},
		NlWebAskRequest: ASK_RAW_INPUT_SCHEMA,
		NlWebAnswer: ASK_SUCCESS_RESULT_SCHEMA,
		NlWebFailure: {
			type: 'object',
			required: ['_meta', 'error'],
			properties: {
				_meta: {
					type: 'object',
					required: ['response_type', 'response_format', 'version', 'request_id'],
					properties: {
						response_type: { const: 'failure' },
						response_format: { const: 'conversational_search' },
						version: { const: NLWEB_VERSION },
						request_id: { type: 'string' },
					},
					additionalProperties: false,
				},
				error: { type: 'object', additionalProperties: true },
			},
			additionalProperties: false,
		},
		NlWebResponse: {
			oneOf: [
				{ $ref: '#/components/schemas/NlWebAnswer' },
				{ $ref: '#/components/schemas/NlWebFailure' },
			],
		},
	};
}

export type OpenApiOperation = {
	operationId?: string;
	summary?: string;
	description?: string;
	servers?: Array<{ url: string }>;
	security?: unknown;
	parameters?: unknown;
	requestBody?: unknown;
	responses?: unknown;
};

export type OpenApiDocument = {
	openapi: string;
	info: { title: string; version: string; description: string };
	servers: Array<{ url: string }>;
	paths: Record<string, Record<string, OpenApiOperation>>;
	components: {
		schemas: Record<string, unknown>;
		securitySchemes?: Record<string, unknown>;
	};
};

const mcpConditionalHeaders = [
	{
		name: 'MCP-Protocol-Version',
		in: 'header' as const,
		required: false,
		description:
			'Optional. Modern (2026-07-28) clients send this with the negotiated protocol version. Legacy initialize clients may omit it or send a 2025-* version after handshake. Do not require this header for all requests.',
		schema: { type: 'string', examples: ['2026-07-28', '2025-06-18'] },
	},
	{
		name: 'MCP-Method',
		in: 'header' as const,
		required: false,
		description:
			'Optional modern routing header (e.g. tools/call, tools/list, server/discover). Required only for modern Streamable HTTP self-describing calls, not for legacy initialize sessions.',
		schema: { type: 'string' },
	},
	{
		name: 'MCP-Name',
		in: 'header' as const,
		required: false,
		description:
			'Optional modern tool name header for tools/call (e.g. ask). Aligns with request _meta when present. Not required for legacy clients.',
		schema: { type: 'string', examples: ['ask'] },
	},
	{
		name: 'Accept',
		in: 'header' as const,
		required: false,
		description:
			'Streamable HTTP clients typically send application/json, text/event-stream. Not all responses are SSE.',
		schema: { type: 'string', examples: ['application/json, text/event-stream'] },
	},
];

export function buildOpenApiDocument(caps: PublicCapabilities): OpenApiDocument {
	const schemas = buildSchemas();
	const paths: OpenApiDocument['paths'] = {
		'/api/profile.json': {
			get: {
				operationId: 'getProfile',
				responses: { 200: response('公开个人资料', { $ref: '#/components/schemas/Profile' }) },
			},
		},
		'/api/articles.json': {
			get: {
				operationId: 'getArticles',
				responses: { 200: response('公开文章索引', { type: 'object' }) },
			},
		},
		'/api/topics.json': {
			get: {
				operationId: 'getTopics',
				responses: { 200: response('公开主题索引', { type: 'object' }) },
			},
		},
		'/api/search-index.json': {
			get: {
				operationId: 'getSearchIndex',
				responses: { 200: response('公开静态搜索索引', { type: 'object' }) },
			},
		},
	};

	if (caps.ask) {
		const { serverUrl, path } = openApiServerAndPath(caps.ask);
		paths[path] = {
			post: {
				operationId: 'askPublicContent',
				description: `Query public content via ${caps.capability}. Anonymous clients are limited to list; browser summarize modes may require Turnstile. Streaming: set prefer.streaming=true and/or Accept: text/event-stream for buffered SSE. ${caps.unsupportedNotes}`,
				servers: [{ url: serverUrl }],
				security: [{}, { PublicAskApiKey: [] }],
				parameters: [
					{
						name: 'Accept',
						in: 'header',
						required: false,
						description:
							'Include text/event-stream to request buffered SSE when prefer.streaming is also honored by the Worker.',
						schema: { type: 'string', examples: ['application/json', 'text/event-stream'] },
					},
					{
						name: 'cf-turnstile-response',
						in: 'header',
						required: false,
						description: 'One-time Turnstile token required for browser summarize mode when enabled.',
						schema: { type: 'string' },
					},
				],
				requestBody: {
					required: true,
					content: { 'application/json': { schema: { $ref: '#/components/schemas/NlWebAskRequest' } } },
				},
				responses: {
					200: askSuccessResponse(),
					400: response('Invalid NLWeb request', { $ref: '#/components/schemas/NlWebResponse' }),
					401: response('Missing, invalid, or revoked machine API key', {
						$ref: '#/components/schemas/NlWebResponse',
					}),
					403: response('需要或未通过浏览器挑战', { $ref: '#/components/schemas/NlWebResponse' }),
					429: response('请求或预算限流', { $ref: '#/components/schemas/NlWebResponse' }),
				},
			},
		};
	}

	if (caps.mcp) {
		const { serverUrl, path } = openApiServerAndPath(caps.mcp);
		const profileNote = caps.protocolProfile.claimsModernDualEra
			? 'dual-era profile accepted'
			: 'protocol profile undeclared until deployment acceptance; do not assume modern dual-era';
		const mcpDescription = [
			`Model Context Protocol Streamable HTTP endpoint (${profileNote}).`,
			`Exposes ask tool aligned with ${caps.capability}. Anonymous clients default to list; summarize may require Bearer API Key.`,
			`Endpoint: ${caps.mcp.href}.`,
			'This OpenAPI path is an endpoint map for humans and generators — prefer an MCP SDK for wire protocol details.',
			'Legacy example: JSON-RPC initialize then tools/list / tools/call without modern MCP-* headers.',
			'Modern example: MCP-Protocol-Version: 2026-07-28 with MCP-Method / MCP-Name as required by the 2026-07-28 Streamable HTTP transport, plus matching request _meta when applicable.',
			'Modern protocol headers are conditional — they must not be treated as required for every POST.',
			caps.unsupportedNotes,
		]
			.filter(Boolean)
			.join(' ');

		paths[path] = {
			...(paths[path] ?? {}),
			post: {
				operationId: 'mcpStreamableHttp',
				summary: 'MCP Streamable HTTP',
				description: mcpDescription,
				servers: [{ url: serverUrl }],
				security: [{}, { PublicAskApiKey: [] }],
				parameters: mcpConditionalHeaders,
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								required: ['jsonrpc', 'method'],
								properties: {
									jsonrpc: { const: '2.0' },
									id: {},
									method: { type: 'string' },
									params: { type: 'object' },
								},
							},
						},
					},
				},
				responses: {
					200: response('JSON-RPC result 或 error（含工具 result.isError）', { type: 'object' }),
					202: {
						description: 'Accepted notification (e.g. notifications/initialized); empty body per Streamable HTTP.',
					},
					401: response('Missing, invalid, or revoked machine API key', { type: 'object' }),
					403: response('未授权的模式或凭据', { type: 'object' }),
					429: response('请求或预算限流', { type: 'object' }),
				},
			},
		};
	}

	const components: OpenApiDocument['components'] = { schemas };
	if (caps.ask || caps.mcp) {
		components.securitySchemes = {
			PublicAskApiKey: {
				type: 'http',
				scheme: 'bearer',
				bearerFormat: 'pask_<key_id>_<secret>',
				description: '运营者签发的 Trusted Machine Client API Key。',
			},
		};
	}

	return {
		openapi: '3.1.0',
		info: {
			title: `${caps.identity.brand} Public APIs`,
			version: '1.3.1',
			description: `Build-time read-only JSON APIs plus ${caps.capability}. Static JSON is for indexing and mirrors; Ask/MCP are optional remote endpoints when configured. ${caps.supportedNotes} ${caps.unsupportedNotes}`,
		},
		servers: [{ url: siteOpenApiServerUrl(caps) }],
		paths,
		components,
	};
}
