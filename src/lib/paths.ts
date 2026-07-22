/** Canonical page pathname with a trailing slash (root stays `/`). */
export function sitePath(pathname: string) {
	const [pathOnly, suffix = ''] = pathname.split(/(?=[#?])/);
	const clean = pathOnly.replace(/^\/+|\/+$/g, '');
	return `${clean ? `/${clean}/` : '/'}${suffix}`;
}

/** Link to the ask page, optionally prefilled. */
export function askPageUrl(query = '') {
	const q = query.trim();
	return q ? sitePath(`/ask?q=${encodeURIComponent(q)}`) : sitePath('/ask');
}
