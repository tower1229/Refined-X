/**
 * CI-only overlay for the Themes Portal sample demo on GitHub Pages.
 * Loaded via REFINED_X_INSTANCE_CONFIG — not used for local clones or submodule instances.
 */
export default {
	site: 'https://demo.refined-x.com',
	locale: 'en',
	ask: {
		askUrl: 'https://ask-demo.refined-x.com/ask',
		mcpUrl: 'https://ask-demo.refined-x.com/mcp',
		healthUrl: 'https://ask-demo.refined-x.com/health',
		persistInteractions: false,
	},
	brand: {
		askChips: [
			{ label: 'What is Refined-X?', query: 'What is Refined-X?' },
			{ label: 'Agent-ready', query: 'How is Refined-X agent-ready?' },
			{
				label: 'External vault',
				query: 'Can I keep content in an external vault?',
			},
			{ label: 'Live Ask', query: 'How does Live Ask work?' },
		],
	},
};
