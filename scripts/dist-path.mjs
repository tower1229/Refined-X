import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function exists(file) {
	return readFile(file).then(() => true, () => false);
}

/** Resolve built HTML for a pathname (directory or flat file output). */
export async function resolveBuiltHtml(distRoot, pathname) {
	const clean = decodeURIComponent(pathname).replace(/^\/+|\/+$/g, '');
	if (!clean) return path.join(distRoot, 'index.html');

	const candidates = [
		path.join(distRoot, clean, 'index.html'),
		path.join(distRoot, `${clean}.html`),
	];
	for (const candidate of candidates) {
		if (await exists(candidate)) return candidate;
	}
	return undefined;
}

export async function builtPageExists(distRoot, pathname) {
	return Boolean(await resolveBuiltHtml(distRoot, pathname));
}

/** Resolve either a built static file or an HTML page for a public pathname. */
export async function builtResourceExists(distRoot, pathname) {
	const clean = decodeURIComponent(pathname).replace(/^\/+|\/+$/g, '');
	if (!clean) return exists(path.join(distRoot, 'index.html'));
	if (await exists(path.join(distRoot, clean))) return true;
	return builtPageExists(distRoot, pathname);
}
