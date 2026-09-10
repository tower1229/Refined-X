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

/** Normalize Astro/Vite BASE_URL to always end with `/` (root is `/`). */
export function resolveDeployBase(base?: string) {
	const fromEnv =
		typeof import.meta !== 'undefined' &&
		import.meta.env &&
		typeof import.meta.env.BASE_URL === 'string'
			? import.meta.env.BASE_URL
			: undefined;
	const raw = base ?? fromEnv ?? '/';
	if (!raw || raw === '/') return '/';
	return raw.endsWith('/') ? raw : `${raw}/`;
}

/**
 * Prefix a site-root pathname with the deploy base without double-joining.
 * Pass-through for absolute http(s) URLs.
 */
export function withBase(pathname: string, base?: string) {
	if (/^https?:\/\//i.test(pathname)) return pathname;
	const b = resolveDeployBase(base);
	const [pathOnly, suffix = ''] = pathname.split(/(?=[#?])/);
	const path = pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
	if (b === '/') return `${path}${suffix}`;
	const prefix = b.replace(/\/$/, '');
	if (path === prefix || path.startsWith(`${prefix}/`)) return `${path}${suffix}`;
	if (path === '/') return `${prefix}/${suffix}`;
	return `${prefix}${path}${suffix}`;
}

/** Strip deploy base from a request pathname for logical route comparisons. */
export function stripBase(pathname: string, base?: string) {
	const b = resolveDeployBase(base);
	if (b === '/') return pathname || '/';
	const prefix = b.replace(/\/$/, '');
	if (pathname === prefix || pathname === `${prefix}/`) return '/';
	if (pathname.startsWith(`${prefix}/`)) {
		const rest = pathname.slice(prefix.length);
		return rest.startsWith('/') ? rest : `/${rest}`;
	}
	return pathname;
}

/** Link to the ask page, optionally prefilled (includes deploy base). */
export function askPageUrl(query = '', base?: string) {
	const q = query.trim();
	const path = q ? sitePath(`/ask?q=${encodeURIComponent(q)}`) : sitePath('/ask');
	return withBase(path, base);
}
