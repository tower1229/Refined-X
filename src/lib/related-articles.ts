export type RelatedArticleInput = {
	id: string;
	data: {
		series?: string;
		tags: string[];
		pubDate?: Date;
		title?: string;
	};
};

export function normalizeTag(tag: string) {
	return tag.normalize('NFKC').toLocaleLowerCase('zh-CN');
}

export function sharedTagCount(a: string[], b: string[]) {
	const current = new Set(a.map(normalizeTag));
	return b.filter((tag) => current.has(normalizeTag(tag))).length;
}

function pubDateValue(article: RelatedArticleInput) {
	return article.data.pubDate?.valueOf() ?? 0;
}

function bySharedTagsThenDate(currentTags: string[]) {
	return (a: RelatedArticleInput, b: RelatedArticleInput) => {
		const tagDiff = sharedTagCount(currentTags, b.data.tags) - sharedTagCount(currentTags, a.data.tags);
		if (tagDiff !== 0) return tagDiff;
		return pubDateValue(b) - pubDateValue(a);
	};
}

function byDateDesc(a: RelatedArticleInput, b: RelatedArticleInput) {
	return pubDateValue(b) - pubDateValue(a);
}

/**
 * Select related articles by IA tiers: same series first, then shared tags, then recent.
 */
export function selectRelatedArticles<T extends RelatedArticleInput>(
	current: RelatedArticleInput,
	allArticles: T[],
	limit = 3,
): T[] {
	const candidates = allArticles.filter((article) => article.id !== current.id);
	const selected: T[] = [];
	const selectedIds = new Set<string>();

	const take = (pool: T[]) => {
		for (const article of pool) {
			if (selected.length >= limit) break;
			if (selectedIds.has(article.id)) continue;
			selected.push(article);
			selectedIds.add(article.id);
		}
	};

	const currentTags = current.data.tags;
	const currentSeries = current.data.series;

	if (currentSeries) {
		const sameSeries = candidates
			.filter((article) => article.data.series === currentSeries)
			.sort(bySharedTagsThenDate(currentTags));
		take(sameSeries);
	}

	if (selected.length < limit) {
		// Same-series peers may appear here too; take() skips already-selected ids.
		const sharedTags = candidates
			.filter((article) => sharedTagCount(currentTags, article.data.tags) > 0)
			.sort(bySharedTagsThenDate(currentTags));
		take(sharedTags);
	}

	if (selected.length < limit) {
		const recent = [...candidates].sort(byDateDesc);
		take(recent);
	}

	return selected;
}
