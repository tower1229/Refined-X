import { absoluteUrl } from '../lib/public-data';

export function GET() {
	return new Response(`User-agent: *\nAllow: /\nSitemap: ${absoluteUrl('/sitemap-index.xml')}\n`, {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
}
