export const COMMENT_CONFIG_FIELDS = ['repo', 'repoId', 'category', 'categoryId'];

/** Resolve the optional giscus configuration and reject ambiguous partial setup. */
export function resolveCommentsConfig(input = {}) {
	const comments = Object.fromEntries(
		COMMENT_CONFIG_FIELDS.map((field) => [field, String(input[field] ?? '').trim()]),
	);
	const configured = COMMENT_CONFIG_FIELDS.filter((field) => comments[field] !== '');

	if (configured.length === 0) return { ...comments, enabled: false };

	const missing = COMMENT_CONFIG_FIELDS.filter((field) => comments[field] === '');
	if (missing.length > 0) {
		throw new Error(
			`comments 配置不完整，缺少：${missing.map((field) => `comments.${field}`).join('、')}`,
		);
	}

	if (!/^[^/\s]+\/[^/\s]+$/.test(comments.repo)) {
		throw new Error('comments.repo 必须使用 owner/repo 格式');
	}

	return { ...comments, enabled: true };
}

export function articleCommentTerm(entryId) {
	return `article:${entryId}`;
}
