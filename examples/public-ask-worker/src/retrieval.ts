import type { NlWebResult } from "./protocol.ts";

export const RETRIEVAL_CONFIG = {
  retrieval_type: "hybrid",
  keyword_match_mode: "or",
  max_num_results: 8,
  match_threshold: 0.45,
  context_expansion: 1,
  return_on_failure: true,
  reranking: true,
} as const;

/** Drop weak matches after reranking so list mode does not surface unrelated pages. */
export const MIN_GROUNDING_SCORE = 0.48;

function sourceUrl(key: string, siteUrl: string): string {
  try {
    const url = new URL(key, `${siteUrl.replace(/\/$/, "")}/`);
    if (url.origin === new URL(siteUrl).origin) return url.href;
  } catch {
    // Fall through to the public site root for malformed source keys.
  }
  return siteUrl;
}

export function sourceResults(
  search: AiSearchSearchResponse,
  siteUrl: string,
  minScore = MIN_GROUNDING_SCORE,
): NlWebResult[] {
  const seen = new Set<string>();
  const results: NlWebResult[] = [];
  for (const chunk of search.chunks ?? []) {
    if ((chunk.score ?? 0) < minScore) continue;
    const url = sourceUrl(chunk.item.key, siteUrl);
    if (seen.has(url)) continue;
    seen.add(url);
    const title = chunk.item.metadata?.title;
    results.push({
      "@type": "Article",
      name: typeof title === "string" ? title : chunk.item.key,
      url,
      description: [...chunk.text].slice(0, 4000).join(""),
      grounding: { url, score: chunk.score, chunk_id: chunk.id },
    });
    if (results.length === 8) break;
  }
  return results;
}

export function aiSearchOptions() {
  return {
    retrieval: {
      retrieval_type: RETRIEVAL_CONFIG.retrieval_type,
      keyword_match_mode: RETRIEVAL_CONFIG.keyword_match_mode,
      max_num_results: RETRIEVAL_CONFIG.max_num_results,
      match_threshold: RETRIEVAL_CONFIG.match_threshold,
      context_expansion: RETRIEVAL_CONFIG.context_expansion,
      return_on_failure: RETRIEVAL_CONFIG.return_on_failure,
    },
    reranking: { enabled: RETRIEVAL_CONFIG.reranking },
  };
}
