export type AnswerResult = { url: string; q: string; a: string; full?: string };
export type ArticleResult = {
  url: string;
  title: string;
  excerpt: string;
  tags: string[];
  seriesName?: string;
  date: string;
};
export type SearchData = { answers: AnswerResult[]; articles: ArticleResult[] };

export const normalizeAskQuery = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s？?！!，,。；;：:“”'‘’（）()、·-]/g, "");

export const findExactAnswer = (answers: AnswerResult[], query: string) => {
  const normalized = normalizeAskQuery(query);
  if (!normalized) return undefined;
  return answers.find(({ q }) => normalizeAskQuery(q) === normalized);
};

export type AskSearchLimits = {
	answersEmpty: number;
	answersQuery: number;
	articlesEmpty: number;
	articlesQuery: number;
};

export type AskSearchConfig = Partial<AskSearchLimits> & {
	onResultsRendered?: () => void;
	busyTarget?: HTMLElement;
	showAskFallback?: boolean;
};

const defaultLimits: AskSearchLimits = {
  answersEmpty: 3,
  answersQuery: 3,
  articlesEmpty: 4,
  articlesQuery: 6,
};

import { sitePath } from "../lib/paths.ts";

const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
};

export function createAskSearch(
	input: HTMLInputElement | HTMLTextAreaElement,
	results: HTMLElement,
	config: AskSearchConfig = {},
) {
	const limits: AskSearchLimits = { ...defaultLimits, ...config };
	const { onResultsRendered, busyTarget } = config;
	let searchData: SearchData | null = null;

	const setBusy = (busy: boolean) => {
		busyTarget?.setAttribute('aria-busy', busy ? 'true' : 'false');
	};

  const renderMessage = (message: string, retry = false) => {
    const state = element("div", "overlay-state");
    state.textContent = message;
    if (retry) {
      const button = element("button", "btn btn-ghost");
      button.type = "button";
      button.textContent = "重试";
      button.addEventListener("click", () => loadSearchData(true));
      state.append(button);
    }
    results.replaceChildren(state);
  };

  const appendGroup = (label: string, items: HTMLElement[], className?: string) => {
    if (items.length === 0) return;
    const heading = element("div", `res-group-label ${className || ''}`.trim());
    heading.textContent = label;
    results.append(heading, ...items);
  };

  const answerNode = (answer: AnswerResult) => {
    const link = element("a", "res res-answer");
    link.href = `/ask/?q=${encodeURIComponent(answer.q)}`;
    const question = element("div", "res-q");
    question.textContent = answer.q;
    const summary = element("div", "res-a");
    summary.textContent = answer.a;
    link.append(question, summary);
    return link;
  };

  const articleNode = (article: ArticleResult) => {
    const link = element("a", "res");
    link.href = sitePath(article.url);
    const row = element("div", "res-art");
    const title = element("span", "t");
    title.textContent = article.title;
    const meta = element("span", "d");
    meta.textContent = [article.seriesName, article.date]
      .filter(Boolean)
      .join(" · ");
    row.append(title, meta);
    link.append(row);
    return link;
  };

  const renderResults = (query: string) => {
    if (!searchData) return;
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    const answers = normalized
      ? searchData.answers
          .filter(({ q, a }) =>
            `${q}${a}`.toLocaleLowerCase("zh-CN").includes(normalized),
          )
          .slice(0, limits.answersQuery)
      : searchData.answers.slice(0, limits.answersEmpty);
    const articles = normalized
      ? searchData.articles
          .filter(({ title, excerpt, tags }) =>
            `${title}${excerpt}${tags.join("")}`
              .toLocaleLowerCase("zh-CN")
              .includes(normalized),
          )
          .slice(0, limits.articlesQuery)
      : searchData.articles.slice(0, limits.articlesEmpty);

    results.replaceChildren();
    appendGroup("策展答案 · Answers", answers.map(answerNode), "res-group-answers");
    appendGroup("相关文章", articles.map(articleNode));
    
    if (config.showAskFallback && query.trim()) {
      const askLink = element("a", "res-ask");
      askLink.href = `/ask/?q=${encodeURIComponent(query.trim())}`;
      askLink.textContent = "没有找到想要的答案？尝试让 AI 实时解答 ✨";
      results.append(askLink);
    }
    
    onResultsRendered?.();
  };

  const loadSearchData = async (force = false) => {
    if (!force && searchData) return searchData;
    setBusy(true);
    renderMessage("正在加载搜索索引…");
    onResultsRendered?.();
    try {
      const response = await fetch("/api/search-index.json", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      searchData = (await response.json()) as SearchData;
      renderResults(input.value);
      return searchData;
    } catch (error) {
      console.error("Failed to load search index", error);
      renderMessage("搜索索引加载失败，请检查网络后重试。", true);
      onResultsRendered?.();
      return null;
    } finally {
      setBusy(false);
    }
  };

  const invalidate = () => {
    searchData = null;
  };

  const setQuery = (query: string) => {
    input.value = query;
    if (searchData) renderResults(query);
  };

  input.addEventListener("input", () => renderResults(input.value));

  const getExactAnswer = (query: string) =>
    searchData ? findExactAnswer(searchData.answers, query) : undefined;

  return { loadSearchData, renderResults, setQuery, invalidate, getExactAnswer };
}
