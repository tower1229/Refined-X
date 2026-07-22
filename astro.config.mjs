// @ts-check
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import sitemap from '@astrojs/sitemap';
import starlight from '@astrojs/starlight';
import { siteConfig } from './site.config.mjs';
import { createSeoSitemapOptions } from './scripts/seo-sitemap.mjs';
import { remarkObsidianAssets } from './src/markdown/remark-obsidian-assets.mjs';

// https://astro.build/config
export default defineConfig({
	site: siteConfig.site,
	trailingSlash: 'ignore',
	build: {
		format: 'directory',
	},
	outDir: siteConfig.outDir,
	publicDir: siteConfig.publicDir,
	redirects: siteConfig.redirects ?? {},
	markdown: {
		processor: unified({ remarkPlugins: [remarkObsidianAssets] }),
	},
	vite: {
		build: { emptyOutDir: true },
		define: {
			'import.meta.env.PUBLIC_ASK_URL': JSON.stringify(siteConfig.ask.askUrl || ''),
			'import.meta.env.PUBLIC_MCP_URL': JSON.stringify(siteConfig.ask.mcpUrl || ''),
			'import.meta.env.PUBLIC_ASK_HEALTH_URL': JSON.stringify(siteConfig.ask.healthUrl || ''),
		},
	},
	integrations: [
		sitemap(createSeoSitemapOptions({ contentRoot: siteConfig.contentRoot, site: siteConfig.site })),
		starlight({
			title: siteConfig.title,
			description: siteConfig.description,
			disable404Route: true,
			customCss: [
				'./src/styles/refined-x.css',
				'./src/styles/hero-theme-crossfade.css',
				'./src/styles/hero-glass-react.css',
				'./src/styles/chat-transcript.css',
			],
			components: {
				Head: './src/components/Head.astro',
				PageFrame: './src/components/PageFrame.astro',
				Header: './src/components/Header.astro',
				Footer: './src/components/FooterOverride.astro',
				ThemeSelect: './src/components/ThemeSelect.astro',
				PageTitle: './src/components/PageTitle.astro',
				TwoColumnContent: './src/components/TwoColumnContent.astro',
				MarkdownContent: './src/components/MarkdownContent.astro',
			},
			locales: {
				root: { label: siteConfig.locale === 'zh-CN' ? '简体中文' : 'English', lang: siteConfig.locale },
			},
			social: siteConfig.social?.github
				? [{ icon: 'github', label: 'GitHub', href: siteConfig.social.github }]
				: [],
			sidebar: [
				{
					label: 'Public',
					items: [{ autogenerate: { directory: '' } }],
				},
			],
		}),
	],
});
