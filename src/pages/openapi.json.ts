import { absoluteUrl, jsonResponse } from '../lib/public-data';
import {
	MCP_ASK_URL,
	MCP_ENDPOINT_URL,
	PUBLIC_ASK_CAPABILITY,
	PUBLIC_ASK_SUPPORTED,
	PUBLIC_ASK_UNSUPPORTED,
	SITE_BRAND,
} from '../lib/site-copy';

const askOrigin = MCP_ASK_URL ? new URL(MCP_ASK_URL).origin : absoluteUrl('/');
const mcpOrigin = MCP_ENDPOINT_URL ? new URL(MCP_ENDPOINT_URL).origin : askOrigin;

export function GET() {
	const schemas = {
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
		NlWebAskRequest: {
			type: 'object',
			description: `${PUBLIC_ASK_CAPABILITY}. ${PUBLIC_ASK_SUPPORTED} ${PUBLIC_ASK_UNSUPPORTED}`,
			required: ['query'],
			additionalProperties: false,
			properties: {
				query: {
					type: 'object',
					required: ['text'],
					properties: {
						text: { type: 'string', minLength: 1, maxLength: 500 },
					},
					additionalProperties: false,
				},
				context: { type: 'object', maxProperties: 0, additionalProperties: false },
				prefer: {
					type: 'object',
					additionalProperties: false,
					properties: {
						streaming: { type: 'boolean' },
						response_format: { const: 'conversational_search' },
						mode: { enum: ['list', 'summarize', 'list, summarize'] },
						'accept-language': { type: 'string' },
						'user-agent': { type: 'string' },
					},
				},
				meta: {
					type: 'object',
					properties: { version: { const: '0.55' } },
					additionalProperties: false,
				},
			},
		},
		NlWebResponse: {
			type: 'object',
			required: ['_meta'],
			properties: {
				_meta: {
					type: 'object',
					required: ['response_type', 'version'],
					properties: {
						response_type: { enum: ['answer', 'failure'] },
						version: { const: '0.55' },
					},
				},
				results: { type: 'array', items: { type: 'object', additionalProperties: true } },
				error: { type: 'object', additionalProperties: true },
			},
		},
	};
	const response = (description: string, schema: object) => ({
		description,
		content: { 'application/json': { schema } },
	});
	return jsonResponse({
		openapi: '3.1.0',
		info: {
			title: `${SITE_BRAND} Public APIs`,
			version: '1.2.0',
			description:
				`Build-time read-only JSON APIs plus ${PUBLIC_ASK_CAPABILITY}. Static JSON is for indexing and mirrors; Ask/MCP are optional remote endpoints when configured. ${PUBLIC_ASK_SUPPORTED} ${PUBLIC_ASK_UNSUPPORTED}`,
		},
		servers: [{ url: absoluteUrl('/') }],
		paths: {
			'/ask': {
				post: {
					operationId: 'askPublicContent',
					description: `Query public content via ${PUBLIC_ASK_CAPABILITY}. Anonymous clients are limited to list; browser summarize modes may require Turnstile. ${PUBLIC_ASK_UNSUPPORTED}`,
					servers: MCP_ASK_URL ? [{ url: askOrigin }] : [{ url: absoluteUrl('/') }],
					security: [{}, { PublicAskApiKey: [] }],
					parameters: [{
						name: 'cf-turnstile-response',
						in: 'header',
						required: false,
						description: 'One-time Turnstile token required for browser summarize mode when enabled.',
						schema: { type: 'string' },
					}],
					requestBody: {
						required: true,
						content: { 'application/json': { schema: { $ref: '#/components/schemas/NlWebAskRequest' } } },
					},
					responses: {
						200: response('NLWeb answer or failure', { $ref: '#/components/schemas/NlWebResponse' }),
						400: response('Invalid NLWeb request', { $ref: '#/components/schemas/NlWebResponse' }),
						401: response('Missing, invalid, or revoked machine API key', { $ref: '#/components/schemas/NlWebResponse' }),
						403: response('需要或未通过浏览器挑战', { $ref: '#/components/schemas/NlWebResponse' }),
						429: response('请求或预算限流', { $ref: '#/components/schemas/NlWebResponse' }),
					},
				},
			},
			'/mcp': {
				post: {
					operationId: 'mcpStreamableHttp',
					summary: 'MCP Streamable HTTP',
					description:
						`Model Context Protocol 无状态端点（Streamable HTTP）。JSON-RPC 2.0 方法：initialize、tools/list、tools/call。当前暴露 ask 工具，语义与 ${PUBLIC_ASK_CAPABILITY} 一致。匿名客户端默认 list 模式；summarize 需 Bearer API Key。端点 URL：${MCP_ENDPOINT_URL}。${PUBLIC_ASK_UNSUPPORTED}`,
					servers: MCP_ENDPOINT_URL ? [{ url: mcpOrigin }] : [{ url: absoluteUrl('/') }],
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
										method: { enum: ['initialize', 'tools/list', 'tools/call'] },
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
			},
			'/api/profile.json': {
				get: { operationId: 'getProfile', responses: { 200: response('公开个人资料', { $ref: '#/components/schemas/Profile' }) } },
			},
			'/api/articles.json': {
				get: { operationId: 'getArticles', responses: { 200: response('公开文章索引', { type: 'object' }) } },
			},
			'/api/topics.json': {
				get: { operationId: 'getTopics', responses: { 200: response('公开主题索引', { type: 'object' }) } },
			},
			'/api/search-index.json': {
				get: { operationId: 'getSearchIndex', responses: { 200: response('公开静态搜索索引', { type: 'object' }) } },
			},
		},
		components: {
			schemas,
			securitySchemes: {
				PublicAskApiKey: {
					type: 'http',
					scheme: 'bearer',
					bearerFormat: 'pask_<key_id>_<secret>',
					description: '运营者签发的 Trusted Machine Client API Key。',
				},
			},
		},
	});
}
