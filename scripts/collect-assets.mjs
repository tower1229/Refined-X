import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { siteConfig } from '../site.config.mjs';

const publishRoot = siteConfig.contentRoot;
const assetRoot = siteConfig.assetSource;
const outputRoot = path.join(siteConfig.publicDir, 'asset');
const imageExtension = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;

if (!assetRoot) {
	console.log('collect-assets: assetSource unset; keeping existing public/asset files.');
	process.exit(0);
}

async function walk(root, accept) {
	const files = [];
	for (const entry of await readdir(root, { withFileTypes: true })) {
		const fullPath = path.join(root, entry.name);
		if (entry.isDirectory()) files.push(...(await walk(fullPath, accept)));
		else if (accept(fullPath)) files.push(fullPath);
	}
	return files;
}

function normalizeReference(value) {
	let clean = value.trim();
	if (clean.startsWith('[[') && clean.endsWith(']]')) clean = clean.slice(2, -2);
	clean = clean.split('|', 1)[0].split('#', 1)[0].trim();
	if (/^(?:https?:|data:)/i.test(clean) || !imageExtension.test(clean)) return undefined;
	try {
		clean = decodeURIComponent(clean);
	} catch {
		throw new Error(`Invalid URL encoding in asset reference: ${clean}`);
	}
	return path.basename(clean.replaceAll('\\', '/'));
}

function findReferences(markdown) {
	const references = new Set();
	const scannable = markdown.replace(/^(?:```|~~~)[^\n]*\n[\s\S]*?^(?:```|~~~)\s*$/gm, '');
	const addReference = (value) => {
		const reference = normalizeReference(value);
		if (reference) references.add(reference);
	};
	for (const match of scannable.matchAll(/!?\[\[([^\]]+)\]\]/g)) {
		addReference(match[1]);
	}
	for (const match of scannable.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
		addReference(match[1]);
	}
	for (const tag of scannable.matchAll(/<img\b[^>]*>/gi)) {
		const src = /\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(tag[0]);
		if (src) addReference(src[1] ?? src[2] ?? src[3]);
	}
	for (const attribute of scannable.matchAll(/\bsrcset\s*=\s*(?:"([^"]+)"|'([^']+)')/gi)) {
		for (const candidate of (attribute[1] ?? attribute[2]).split(',')) {
			addReference(candidate.trim().split(/\s+/, 1)[0]);
		}
	}
	return references;
}

async function digest(file) {
	return createHash('sha256').update(await readFile(file)).digest('hex');
}

const markdownFiles = await walk(publishRoot, (file) => {
	const relative = path.relative(publishRoot, file).replaceAll('\\', '/');
	return !relative.startsWith('public/') && /\.mdx?$/i.test(file);
});
const assetFiles = await walk(assetRoot, (file) => imageExtension.test(file));

const assetsByName = new Map();
for (const file of assetFiles.sort()) {
	const key = path.basename(file).toLocaleLowerCase('en-US');
	const candidates = assetsByName.get(key) ?? [];
	candidates.push(file);
	assetsByName.set(key, candidates);
}

const references = new Set();
references.add('avatar.jpg');
references.add('auto_theme.png');
references.add('og-default.png');
references.add('hero-light.png');
references.add('hero-dark.png');
for (const file of markdownFiles) {
	for (const reference of findReferences(await readFile(file, 'utf8'))) references.add(reference);
}

const resolved = [];
const resolutionErrors = [];
for (const reference of [...references].sort()) {
	const candidates = assetsByName.get(reference.toLocaleLowerCase('en-US')) ?? [];
	if (candidates.length === 0) {
		resolutionErrors.push(`Missing asset referenced by content: ${reference}`);
		continue;
	}
	if (!candidates.some((file) => path.basename(file) === reference)) {
		resolutionErrors.push(
			`Asset filename case mismatch: referenced ${reference}, found ${path.basename(candidates[0])}`,
		);
		continue;
	}
	const hashes = await Promise.all(candidates.map(digest));
	if (new Set(hashes).size > 1) {
		resolutionErrors.push(`Duplicate asset name with different contents: ${reference}\n${candidates.join('\n')}`);
		continue;
	}
	resolved.push({ reference, source: candidates[0], sha256: hashes[0] });
}

if (resolutionErrors.length > 0) throw new Error(resolutionErrors.join('\n'));

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await writeFile(path.join(outputRoot, '.gitkeep'), '');
for (const asset of resolved) await copyFile(asset.source, path.join(outputRoot, asset.reference));

const manifest = resolved.map(({ reference, source, sha256 }) => ({
	file: reference,
	source: path.relative(siteConfig.contentRoot, source).replaceAll('\\', '/') || source,
	sha256,
}));
await writeFile(path.join(outputRoot, 'asset-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Collected ${resolved.length} public assets (scanned ${markdownFiles.length} content files).`);
