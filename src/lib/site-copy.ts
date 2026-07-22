import { siteConfig } from '../../site.config.mjs';

/** Shared user-facing copy for Refined-X (driven by site.config / instance overlay). */
export const SITE_BRAND = siteConfig.title;

export const SITE_PERSONA = siteConfig.brand.persona;

export const SITE_ALTERNATE_NAMES = siteConfig.brand.alternateNames;

export const SITE_HOME_HEADING = siteConfig.brand.homeHeading;

export const SITE_HOME_TITLE = siteConfig.brand.homeTitle;

export const SITE_DESCRIPTION = siteConfig.description;

export const SITE_HOME_LEDE = siteConfig.brand.homeLede;

export const WRITING_LEDE = siteConfig.brand.writingLede;

export const ASK_CHIPS = siteConfig.brand.askChips;

export const ASK_PLACEHOLDER = 'Ask this site';

export const ASK_OVERLAY_PLACEHOLDER = 'Ask this site…';

/** Placeholder on the dedicated /ask page (the input is the page headline). */
export const ASK_PAGE_PLACEHOLDER = 'Ask this site';

export const ASK_BUTTON = 'Ask';

export const ASK_PAGE_TITLE = 'Ask this site';

export const ASK_PAGE_LEDE =
	'Ask this site to match curated answers and related articles. The surface can evolve into a conversational entry point.';

export const MCP_ENDPOINT_URL = siteConfig.ask.mcpUrl || '';

export const MCP_ASK_URL = siteConfig.ask.askUrl || '';

export const MCP_HEALTH_URL = siteConfig.ask.healthUrl || '';

export const PUBLIC_ASK_CAPABILITY =
	'NLWeb v0.55-compatible restricted /ask subset';

export const PUBLIC_ASK_SUPPORTED =
	'Supports POST /ask with conversational_search, list, summarize, buffered SSE, and MCP ask over Streamable HTTP.';

export const PUBLIC_ASK_UNSUPPORTED =
	'Does not support /await, promise responses, elicitation, chatgpt_app, arbitrary extension fields, result actions, or long-term memory.';

export const PUBLIC_ASK_SUPPORTED_ITEMS = ['POST /ask', 'conversational_search', 'list', 'summarize', 'SSE', 'MCP ask'] as const;

export const PUBLIC_ASK_UNSUPPORTED_ITEMS = [
	'/await',
	'promise responses',
	'elicitation',
	'chatgpt_app',
	'arbitrary extension fields',
	'result actions',
	'long-term memory',
] as const;

export const MCP_AGENT_PROMPT = MCP_ENDPOINT_URL
	? `Please connect this MCP server: ${MCP_ENDPOINT_URL}`
	: 'Configure ask.mcpUrl in site.config / instance.config to enable MCP.';

export const MCP_GUIDE_TITLE = 'Connect an agent';

export const MCP_GUIDE_LEDE =
	'Copy the prompt below into your agent. This site exposes an NLWeb v0.55-compatible restricted /ask subset when a Public Ask worker is configured.';

export const MCP_GUIDE_FOLLOWUP = `After connecting, ask in natural language. ${PUBLIC_ASK_UNSUPPORTED}`;

export const FOOTER_TAGLINE = siteConfig.brand.footerTagline;
