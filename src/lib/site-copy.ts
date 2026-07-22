import { siteConfig } from '../../site.config.mjs';
import { getUi } from '../i18n/index';

const ui = getUi(siteConfig.locale);

/** Shared brand / content identity (site.config / instance overlay). */
export const SITE_BRAND = siteConfig.title;

export const SITE_PERSONA = siteConfig.brand.persona;

export const SITE_ALTERNATE_NAMES = siteConfig.brand.alternateNames;

export const SITE_HOME_HEADING = siteConfig.brand.homeHeading;

export const SITE_HOME_TITLE = siteConfig.brand.homeTitle;

export const SITE_DESCRIPTION = siteConfig.description;

export const SITE_HOME_LEDE = siteConfig.brand.homeLede;

export const WRITING_LEDE = siteConfig.brand.writingLede;

export const ASK_CHIPS = siteConfig.brand.askChips;

export const FOOTER_TAGLINE = siteConfig.brand.footerTagline;

/** Locale UI pack for chrome strings. */
export const UI = ui;

export const ASK_PLACEHOLDER = ui.ask.placeholder;

export const ASK_OVERLAY_PLACEHOLDER = ui.ask.overlayPlaceholder;

/** Placeholder on the dedicated /ask page (the input is the page headline). */
export const ASK_PAGE_PLACEHOLDER = ui.ask.pagePlaceholder;

export const ASK_BUTTON = ui.ask.button;

export const ASK_PAGE_TITLE = ui.ask.pageTitle;

export const ASK_PAGE_LEDE = ui.ask.pageLede;

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
	? ui.mcp.agentPrompt(MCP_ENDPOINT_URL)
	: ui.mcp.agentPromptMissing;

export const MCP_GUIDE_TITLE = ui.mcp.guideTitle;

export const MCP_GUIDE_LEDE = ui.mcp.guideLede;

export const MCP_GUIDE_FOLLOWUP = ui.mcp.guideFollowup(PUBLIC_ASK_UNSUPPORTED);
