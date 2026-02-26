/**
 * Pure utility functions extracted from SearchClient for testability and reuse.
 */

import { QURAN_TRANSLATIONS, type SearchConfig } from "@/lib/config/search-defaults";

interface ScoredItem {
  score: number;
  rank?: number;
}

/** Parse search response into sorted, limited results with rank assignments */
export function parseSearchResults<A extends ScoredItem, H extends ScoredItem>(
  data: { ayahs?: A[]; hadiths?: H[] },
  limit: number
): { type: "quran" | "hadith"; data: A | H; score: number }[] {
  const unified: { type: "quran" | "hadith"; data: A | H; score: number }[] = [];
  for (const ayah of data.ayahs || []) {
    unified.push({ type: "quran", data: ayah, score: ayah.score });
  }
  for (const hadith of data.hadiths || []) {
    unified.push({ type: "hadith", data: hadith, score: hadith.score });
  }
  unified.sort((a, b) => b.score - a.score);
  const limited = unified.slice(0, limit);
  limited.forEach((result, index) => { result.data.rank = index + 1; });
  return limited;
}

/** Build URLSearchParams for a search request */
export function buildSearchParams(searchQuery: string, config: SearchConfig, locale: string, isRefine: boolean): URLSearchParams {
  const effectiveReranker = isRefine ? config.reranker : "none";
  const effectiveBookTitleLang = config.bookTitleDisplay === "translation"
    ? (locale === "ar" ? "en" : locale)
    : config.bookTitleDisplay;

  const params = new URLSearchParams({
    q: searchQuery,
    mode: "hybrid",
    limit: "20",
    includeQuran: String(config.includeQuran),
    includeHadith: String(config.includeHadith),
    includeBooks: String(config.includeBooks),
    reranker: effectiveReranker,
    similarityCutoff: String(config.similarityCutoff),
    refineSimilarityCutoff: String(config.refineSimilarityCutoff),
    preRerankLimit: String(config.preRerankLimit),
    postRerankLimit: String(config.postRerankLimit),
    fuzzy: String(config.fuzzyEnabled),
    embeddingModel: config.embeddingModel || "gemini",
    quranTranslation: config.quranTranslation !== "none"
      ? (QURAN_TRANSLATIONS.find(t => t.code === config.quranTranslation)?.edition || "eng-mustafakhattaba")
      : "none",
    hadithTranslation: config.hadithTranslation || "none",
    bookTitleLang: effectiveBookTitleLang,
    ...(config.hadithCollections.length > 0 && {
      hadithCollections: config.hadithCollections.join(","),
    }),
    ...(isRefine && {
      refine: "true",
      refineOriginalWeight: String(config.refineOriginalWeight),
      refineExpandedWeight: String(config.refineExpandedWeight),
      refineBookPerQuery: String(config.refineBookPerQuery),
      refineAyahPerQuery: String(config.refineAyahPerQuery),
      refineHadithPerQuery: String(config.refineHadithPerQuery),
      refineBookRerank: String(config.refineBookRerank),
      refineAyahRerank: String(config.refineAyahRerank),
      refineHadithRerank: String(config.refineHadithRerank),
      queryExpansionModel: config.queryExpansionModel,
    }),
  });
  return params;
}
