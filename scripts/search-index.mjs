import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import * as pagefind from 'pagefind';

const manifestName = 'refined-x-manifest.json';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (message) => { throw new Error(`Pagefind: ${message}`); };

function safePath(value) {
	if (typeof value !== 'string' || !value || value.includes('\\') || value.startsWith('/') || value.includes(':')) {
		fail(`invalid bundle path ${value}`);
	}
	if (value.split('/').some(part => !part || part === '.' || part === '..')) fail(`invalid bundle path ${value}`);
	return value;
}

function validateBundle(files) {
	const bundle = new Map();
	for (const file of files) {
		const name = safePath(file.path);
		if (name === manifestName || bundle.has(name)) fail(`duplicate/reserved bundle path ${name}`);
		if (!(file.content instanceof Uint8Array) || !file.content.byteLength) fail(`empty or invalid file ${name}`);
		bundle.set(name, file.content);
		if (/\.(?:pf_meta|pf_index|pf_fragment|pagefind)$/.test(name)) {
			let decoded;
			try { decoded = gunzipSync(file.content); } catch { fail(`invalid compressed file ${name}`); }
			if (decoded.length <= 12 || decoded.subarray(0, 12).toString() !== 'pagefind_dcd') fail(`invalid compressed payload ${name}`);
		}
	}
	const requireFile = (name) => { if (!bundle.has(name)) fail(`missing referenced file ${name}`); };
	for (const name of ['pagefind-entry.json', 'pagefind.js', 'pagefind-worker.js']) requireFile(name);
	let entry;
	try { entry = JSON.parse(Buffer.from(bundle.get('pagefind-entry.json')).toString()); } catch { fail('invalid pagefind-entry.json'); }
	if (!entry || typeof entry.version !== 'string' || !entry.languages || typeof entry.languages !== 'object' || Array.isArray(entry.languages) || !Object.keys(entry.languages).length) {
		fail('entry must declare a version and nonempty languages');
	}
	for (const [language, info] of Object.entries(entry.languages)) {
		if (!info || typeof info.hash !== 'string' || !/^[\w-]+$/.test(info.hash) || !Number.isInteger(info.page_count) || info.page_count < 1) {
			fail(`invalid language ${language}`);
		}
		if (!(info.wasm === null || typeof info.wasm === 'string' && /^[\w-]+$/.test(info.wasm))) fail(`invalid language ${language}`);
		requireFile(`pagefind.${info.hash}.pf_meta`);
		requireFile(`wasm.${info.wasm ?? 'unknown'}.pagefind`);
	}
	for (const extension of ['pf_index', 'pf_fragment']) {
		if (!files.some(file => file.path.endsWith(`.${extension}`))) fail(`missing ${extension} files`);
	}
	return entry;
}

async function listFiles(root, prefix = '') {
	const files = [];
	for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
		const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory()) files.push(...await listFiles(root, relative));
		else if (entry.isFile()) files.push(relative);
		else fail(`unexpected non-file ${relative}`);
	}
	return files.sort();
}

/** Verify every byte, not merely the native writer's success response. */
export async function verifySearchIndex(outputRoot) {
	try {
		const manifest = JSON.parse(await readFile(path.join(outputRoot, manifestName), 'utf8'));
		if (manifest.version !== 1 || !Array.isArray(manifest.files) || !manifest.files.length) fail('invalid integrity manifest');
		const names = manifest.files.map(file => safePath(file.path));
		if (new Set(names).size !== names.length || names.includes(manifestName)) fail('duplicate/reserved manifest path');
		const actual = await listFiles(outputRoot);
		if (JSON.stringify(actual) !== JSON.stringify([...names, manifestName].sort())) fail('bundle file set differs from integrity manifest');
		const files = [];
		for (const file of manifest.files) {
			const content = await readFile(path.join(outputRoot, file.path));
			if (!Number.isInteger(file.bytes) || file.bytes < 1 || content.length !== file.bytes || digest(content) !== file.sha256) fail(`integrity mismatch ${file.path}`);
			files.push({ path: file.path, content });
		}
		const entry = validateBundle(files);
		if (manifest.pagefindVersion !== entry.version) fail('manifest and entry versions differ');
		return { files: files.length, languages: Object.keys(entry.languages) };
	} catch (cause) {
		throw new Error(`Pagefind verification failed at ${outputRoot}: ${cause.message}`, { cause });
	}
}

/** getFiles() owns generation; Node owns and awaits all filesystem writes. No retries. */
export async function writeSearchBundle(files, outputRoot) {
	const entry = validateBundle(files);
	await mkdir(path.dirname(outputRoot), { recursive: true });
	const staging = await mkdtemp(path.join(path.dirname(outputRoot), '.pagefind-'));
	try {
		const manifest = { version: 1, pagefindVersion: entry.version, files: [] };
		for (const file of files) {
			const target = path.join(staging, file.path);
			await mkdir(path.dirname(target), { recursive: true });
			await writeFile(target, file.content);
			manifest.files.push({ path: file.path, bytes: file.content.length, sha256: digest(file.content) });
		}
		await writeFile(path.join(staging, manifestName), `${JSON.stringify(manifest, null, 2)}\n`);
		await verifySearchIndex(staging);
		await rm(outputRoot, { recursive: true, force: true });
		await rename(staging, outputRoot);
		return await verifySearchIndex(outputRoot);
	} catch (cause) {
		// Keep failed output for diagnosis; never report a partially written bundle as success.
		throw new Error(`Pagefind write failed (staging retained at ${staging}): ${cause.message}`, { cause });
	}
}

function assertResponse(response) {
	if (response.errors.length) fail(response.errors.join('\n'));
	return response;
}

export async function buildSearchIndex(distRoot) {
	let files;
	try {
		const { index } = assertResponse(await pagefind.createIndex());
		assertResponse(await index.addDirectory({ path: distRoot }));
		({ files } = assertResponse(await index.getFiles()));
	} finally {
		// The backend has no pending file writes: getFiles transfers bytes over IPC.
		await pagefind.close();
	}
	return writeSearchBundle(files, path.join(distRoot, 'pagefind'));
}

export function verifiedPagefind() {
	return {
		name: 'refined-x-pagefind',
		hooks: {
			'astro:build:done': async ({ dir, logger }) => {
				const result = await buildSearchIndex(fileURLToPath(dir));
				logger.info(`Pagefind: verified ${result.files} files (${result.languages.join(', ')})`);
			},
		},
	};
}

/** Keep last in integrations, after all build output transforms. Also used by verify. */
export function searchArtifactGate() {
	return {
		name: 'refined-x-search-gate',
		hooks: { 'astro:build:done': async ({ dir }) => { await verifySearchIndex(fileURLToPath(new URL('./pagefind/', dir))); } },
	};
}
