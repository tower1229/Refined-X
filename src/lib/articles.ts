import { sitePath } from './paths';
import { SERIES_ORDER, seriesTitle } from './series.mjs';

export const ARTICLE_PAGE_SIZE = 10;
export { SERIES_ORDER };

export function seriesNumber(slug?: string) {
	const index = SERIES_ORDER.indexOf(slug as (typeof SERIES_ORDER)[number]);
	return index < 0 ? '--' : String(index + 1).padStart(2, '0');
}

export function seriesName(slug?: string) {
	return seriesTitle(slug);
}

export function formatArticleDate(date: Date, withYear = true) {
	const y = date.getUTCFullYear();
	const m = String(date.getUTCMonth() + 1).padStart(2, '0');
	const d = String(date.getUTCDate()).padStart(2, '0');
	return withYear ? `${y}-${m}-${d}` : `${m}-${d}`;
}

export function getArticlePageCount(total: number) {
	return Math.ceil(total / ARTICLE_PAGE_SIZE);
}

export function pageHref(pageNumber: number) {
	return pageNumber === 1 ? '/writing/' : sitePath(`/writing/page/${pageNumber}`);
}

/** Rough reading time from markdown body length (Chinese + code mixed). */
export function estimateReadingMinutes(bodyLength: number) {
	return Math.max(1, Math.ceil(bodyLength / 400));
}

export function isSameCalendarDay(a: Date, b: Date) {
	return (
		a.getUTCFullYear() === b.getUTCFullYear() &&
		a.getUTCMonth() === b.getUTCMonth() &&
		a.getUTCDate() === b.getUTCDate()
	);
}
