import type { UiCopy } from './types';
import { en } from './en';
import { zhCN } from './zh-CN';

export type { UiCopy } from './types';

function normalizeLocale(locale: string | undefined): 'en' | 'zh-CN' {
	const value = (locale ?? 'en').trim().toLowerCase();
	if (value === 'zh' || value === 'zh-cn' || value.startsWith('zh-')) return 'zh-CN';
	return 'en';
}

/** Resolve UI chrome copy from siteConfig.locale. */
export function getUi(locale: string | undefined): UiCopy {
	return normalizeLocale(locale) === 'zh-CN' ? zhCN : en;
}
