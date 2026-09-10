/** Canonical page pathname with a trailing slash (root stays `/`). */
export function sitePath(pathname: string) {
	const [pathOnly, suffix = ''] = pathname.split(/(?=[#?])/);
	const clean = pathOnly.replace(/^\/+|\/+$/g, '');
	return `${clean ? `/${clean}/` : '/'}${suffix}`;
}

/**
 * Join a site-configured origin+basePath with an absolute-looking pathname.
 * Avoids `new URL('/about/', 'https://example.com/blog/')` dropping `/blog/`.
 */
export function absoluteUrlFromSite(site: string, pathname: string) {
	const siteUrl = new URL(site);
	const basePath = siteUrl.pathname.endsWith('/') ? siteUrl.pathname : `${siteUrl.pathname}/`;
	const base = new URL(basePath, siteUrl.origin);
	const [pathOnly, suffix = ''] = pathname.split(/(?=[#?])/);
	const relative = pathOnly.replace(/^\//, '');
	return new URL(`${relative}${suffix}`, base).href;
}

/**
 * Astro `base` derived from `site` pathname. Root sites return `/`.
 * Non-root values omit a trailing slash (Astro convention), e.g. `/blog`.
 */
export function astroBaseFromSite(site: string) {
	const pathname = new URL(site).pathname || '/';
	if (pathname === '/') return '/';
	return pathname.replace(/\/$/, '') || '/';
}

/** Link to the ask page, optionally prefilled. */
export function askPageUrl(query = '') {
	const q = query.trim();
	return q ? sitePath(`/ask?q=${encodeURIComponent(q)}`) : sitePath('/ask');
}
