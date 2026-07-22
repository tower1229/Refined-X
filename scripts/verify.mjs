import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { siteConfig } from '../site.config.mjs';
import { builtPageExists, builtResourceExists } from './dist-path.mjs';

const distRoot = siteConfig.outDir;
const requiredPages = ['/', '/about/', '/projects/', '/writing/', '/ask/', '/answers/', '/friends/'];
const requiredFiles = ['/llms.txt', '/openapi.json', '/api/profile.json', '/api/articles.json', '/api/search-index.json'];

const failures = [];

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
} catch (error) {
	failures.push(`llms.txt unreadable: ${error.message}`);
}

if (failures.length > 0) {
	console.error('verify failed:\n' + failures.map((line) => `- ${line}`).join('\n'));
	process.exit(1);
}

console.log(`verify ok (dist=${distRoot})`);
