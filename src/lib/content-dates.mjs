export function contentDate(value, label = 'content date') {
	if (value === undefined || value === null || value === '') return undefined;
	const date = new Date(value);
	if (!Number.isFinite(date.valueOf()) || !(value instanceof Date || /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(String(value)))) throw new Error(`Invalid ${label}: ${value}`);
	if (!(value instanceof Date)) {
		const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
		const calendar = new Date(0);
		calendar.setUTCFullYear(year, month - 1, day);
		if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) throw new Error(`Invalid ${label}: ${value}`);
	}
	return date;
}

export function articleModifiedDate(article) {
	const published = contentDate(article.pubDate, 'pubDate');
	const modified = contentDate(article.updatedDate, 'updatedDate') ?? published;
	if (!published) throw new Error(`Missing pubDate: ${article.slug ?? article.title}`);
	if (modified < published) throw new Error(`updatedDate precedes pubDate: ${article.slug ?? article.title}`);
	return modified;
}
