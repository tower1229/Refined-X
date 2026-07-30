import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { siteConfig } from '../site.config.mjs';
import { builtPageExists, builtResourceExists } from './dist-path.mjs';

const distRoot = siteConfig.outDir;
const requiredPages = ['/', '/about/', '/projects/', '/writing/', '/ask/', '/answers/', '/friends/'];
const requiredFiles = [
	'/.nojekyll',
	'/.well-known/about.json',
	'/.well-known/mcp.json',
	'/.well-known/mcp/catalog.json',
	'/.well-known/mcp/server-card.json',
	'/llms.txt',
	'/openapi.json',
	'/api/profile.json',
	'/api/articles.json',
	'/api/search-index.json',
];

const failures = [];

async function listHtmlFiles(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await listHtmlFiles(entryPath)));
		else if (entry.name.endsWith('.html')) files.push(entryPath);
	}
	return files;
}

for (const page of requiredPages) {
	if (!(await builtPageExists(distRoot, page))) failures.push(`Missing page: ${page}`);
}
for (const file of requiredFiles) {
	if (!(await builtResourceExists(distRoot, file))) failures.push(`Missing file: ${file}`);
}

try {
	const profile = JSON.parse(await readFile(path.join(distRoot, 'api/profile.json'), 'utf8'));
	if (!profile?.name) failures.push('api/profile.json missing name');
} catch (error) {
	failures.push(`api/profile.json unreadable: ${error.message}`);
}

try {
	const llms = await readFile(path.join(distRoot, 'llms.txt'), 'utf8');
	if (!llms.includes('# ')) failures.push('llms.txt looks empty');
	if (siteConfig.ask.mcpUrl && !llms.includes(siteConfig.ask.mcpUrl)) {
		failures.push('llms.txt missing configured MCP URL');
	}
} catch (error) {
	failures.push(`llms.txt unreadable: ${error.message}`);
}

if (siteConfig.ask.askUrl) {
	try {
		const askHtml = await readFile(path.join(distRoot, 'ask', 'index.html'), 'utf8');
		if (!askHtml.includes('challenges.cloudflare.com/turnstile/')) {
			failures.push('Ask page missing Turnstile script');
		}
		if (!askHtml.includes('data-sitekey=') || !askHtml.includes('data-action="public-ask"')) {
			failures.push('Ask page missing configured Turnstile widget');
		}
	} catch (error) {
		failures.push(`Ask integration verification failed: ${error.message}`);
	}

	try {
		const openapi = JSON.parse(await readFile(path.join(distRoot, 'openapi.json'), 'utf8'));
		const askServers = openapi?.paths?.['/ask']?.post?.servers;
		const askOrigin = new URL(siteConfig.ask.askUrl).origin;
		if (!Array.isArray(askServers) || !askServers.some((server) => server?.url === askOrigin)) {
			failures.push('openapi.json missing configured Ask server');
		}
	} catch (error) {
		failures.push(`openapi.json integration verification failed: ${error.message}`);
	}
}

try {
	for (const htmlPath of await listHtmlFiles(distRoot)) {
		const html = await readFile(htmlPath, 'utf8');
		for (const match of html.matchAll(/"inLanguage":"([^"]+)"/g)) {
			const language = match[1];
			if (language !== siteConfig.locale) {
				failures.push(
					`${path.relative(distRoot, htmlPath)} uses inLanguage=${language}; expected ${siteConfig.locale}`,
				);
			}
		}
	}
} catch (error) {
	failures.push(`HTML locale verification failed: ${error.message}`);
}

if (failures.length > 0) {
	console.error('verify failed:\n' + failures.map((line) => `- ${line}`).join('\n'));
	process.exit(1);
}

console.log(`verify ok (dist=${distRoot})`);
