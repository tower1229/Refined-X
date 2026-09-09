/**
 * Strip site-config overlay keys retired with legacy MCP discovery (#18).
 * Pure helper so instance overlays keep building while zombie keys are dropped.
 */

/**
 * @param {object | null | undefined} overlay
 * @returns {{ overlay: object, ignoredRetiredMcp: boolean }}
 */
export function omitRetiredSiteOverlayKeys(overlay) {
	if (!overlay || typeof overlay !== 'object') {
		return { overlay: {}, ignoredRetiredMcp: false };
	}
	const { mcp: retiredMcp, ...rest } = overlay;
	return {
		overlay: rest,
		ignoredRetiredMcp: retiredMcp !== undefined,
	};
}
