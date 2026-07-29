export function resolveSameOriginSource(candidate: string, siteOrigin: string): URL | null {
	try {
		const allowedOrigin = new URL(siteOrigin).origin;
		const source = new URL(candidate);
		if (
			(source.protocol === 'https:' || source.protocol === 'http:') &&
			source.origin === allowedOrigin
		) {
			return source;
		}
	} catch {
		// Invalid and non-absolute URLs are rendered as plain text.
	}
	return null;
}
