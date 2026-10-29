import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, serialize } from 'parse5';

export function prefixPublicPath(value, base) {
	const prefix = base.replace(/\/$/, '');
	if (!prefix || !value.startsWith('/') || value.startsWith('//') || value === prefix || value.startsWith(`${prefix}/`)) return value;
	return `${prefix}${value}`;
}

export function htmlWithBase(html, base) {
	// Search verification tokens use a .html extension but must remain plain text.
	if (!/<(?:!doctype|html|body)\b/i.test(html)) return html;
	const document = parse(html);
	const walk = (node) => {
		if (node.tagName === 'meta' && node.attrs?.some((attr) => attr.name === 'http-equiv' && attr.value.toLowerCase() === 'refresh')) {
			const content = node.attrs.find((attr) => attr.name === 'content');
			if (content) content.value = content.value.replace(/(\burl\s*=\s*["']?)(\/[^"']*)/i, (_, lead, target) => `${lead}${prefixPublicPath(target, base)}`);
		}
		for (const attr of node.attrs ?? []) {
			if (['href', 'src', 'action', 'poster'].includes(attr.name)) attr.value = prefixPublicPath(attr.value, base);
		}
		for (const child of node.childNodes ?? []) walk(child);
		if (node.content) walk(node.content);
	};
	walk(document);
	return serialize(document);
}

/** Includes copied public HTML, which never passes through Markdown plugins. */
export function deploymentBase() {
	let base;
	return {
		name: 'refined-x-deployment-base',
		hooks: {
			'astro:config:done': ({ config }) => { base = config.base; },
			'astro:build:done': async ({ dir }) => {
				if (base === '/') return;
				const walk = async (root) => {
					for (const entry of await readdir(root, { withFileTypes: true })) {
						const file = path.join(root, entry.name);
						if (entry.isDirectory()) await walk(file);
						else if (file.endsWith('.html')) await writeFile(file, htmlWithBase(await readFile(file, 'utf8'), base));
					}
				};
				await walk(fileURLToPath(dir));
			},
		},
	};
}
