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
				description: `Query public content via ${caps.capability}. Anonymous clients are limited to list; browser summarize modes may require Turnstile. ${caps.unsupportedNotes}`,
				servers: [{ url: serverUrl }],
				security: [{}, { PublicAskApiKey: [] }],
				parameters: [
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
					200: response('NLWeb answer or failure', { $ref: '#/components/schemas/NlWebResponse' }),
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
		const mcpDescription = caps.protocolProfile.claimsModernDualEra
			? `Model Context Protocol Streamable HTTP endpoint (dual-era profile accepted). Exposes ask tool aligned with ${caps.capability}. Anonymous clients default to list; summarize may require Bearer API Key. Endpoint: ${caps.mcp.href}. ${caps.unsupportedNotes}`
			: `Model Context Protocol Streamable HTTP endpoint. Protocol profile is undeclared until deployment acceptance; do not assume modern dual-era. Exposes ask tool aligned with ${caps.capability}. Anonymous clients default to list; summarize may require Bearer API Key. Endpoint: ${caps.mcp.href}. ${caps.unsupportedNotes}`;

		paths[path] = {
			...(paths[path] ?? {}),
			post: {
				operationId: 'mcpStreamableHttp',
				summary: 'MCP Streamable HTTP',
				description: mcpDescription,
				servers: [{ url: serverUrl }],
				security: [{}, { PublicAskApiKey: [] }],
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
					200: response('JSON-RPC result 或 error', { type: 'object' }),
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
			version: '1.3.0',
			description: `Build-time read-only JSON APIs plus ${caps.capability}. Static JSON is for indexing and mirrors; Ask/MCP are optional remote endpoints when configured. ${caps.supportedNotes} ${caps.unsupportedNotes}`,
		},
		servers: [{ url: siteOpenApiServerUrl(caps) }],
		paths,
		components,
	};
}
