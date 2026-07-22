import GithubSlugger from 'github-slugger';

export type TocItem = {
	level: 2 | 3 | 4;
	text: string;
	slug: string;
};

export const TOC_MIN_HEADINGS = 2;

const FENCED_CODE_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`[^`\n]+`/g;

function stripCodeBlocks(markdown: string): string {
	return markdown.replace(FENCED_CODE_RE, '').replace(INLINE_CODE_RE, '');
}

function stripInlineMarkdown(text: string): string {
	return text
		.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/\*\*([^*]+)\*\*/g, '$1')
		.replace(/\*([^*]+)\*/g, '$1')
		.replace(/__([^_]+)__/g, '$1')
		.replace(/_([^_]+)_/g, '$1')
		.replace(/`([^`]+)`/g, '$1')
		.replace(/<[^>]+>/g, '')
		.trim();
}

export function extractTocFromMarkdown(body: string): TocItem[] {
	const slugger = new GithubSlugger();
	const cleaned = stripCodeBlocks(body);
	const items: TocItem[] = [];
	const re = /^(#{2,4})\s+(.+)$/gm;
	let match: RegExpExecArray | null;

	while ((match = re.exec(cleaned)) !== null) {
		const level = match[1].length as 2 | 3 | 4;
		const text = stripInlineMarkdown(match[2]);
		if (!text) continue;
		items.push({ level, text, slug: slugger.slug(text) });
	}

	return items;
}

export function shouldShowToc(items: TocItem[]): boolean {
	return items.length >= TOC_MIN_HEADINGS;
}
