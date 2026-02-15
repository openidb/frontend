"use client";

import { useState, useEffect, useCallback, useRef, KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Search, X, Loader2, User, BookOpen, Bug } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PrefetchLink } from "@/components/PrefetchLink";
import { UnifiedSearchResult, UnifiedResult, BookResultData, AyahResultData, HadithResultData } from "@/components/SearchResult";
import { SearchConfigDropdown } from "@/components/SearchConfigDropdown";
import { QURAN_TRANSLATIONS, type TranslationDisplayOption } from "@/lib/config/search-defaults";
import { useAppConfig, type SearchConfig } from "@/lib/config";
import { formatYear } from "@/lib/dates";
import { useTranslation } from "@/lib/i18n";
import { RefiningCarousel } from "@/components/RefiningCarousel";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import EntityPanel, { type GraphContext } from "@/components/EntityPanel";
import { SearchDebugPanel } from "./SearchDebugPanel";
import { SearchErrorState } from "./SearchErrorState";
import { getSessionId } from "@/lib/analytics";

interface AuthorResultData {
  id: number;
  nameArabic: string;
  nameLatin: string;
  deathDateHijri: string | null;
  deathDateGregorian: string | null;
  booksCount: number;
}

interface ExpandedQueryData {
  query: string;
  reason: string;
}

interface TopResultBreakdown {
  rank: number;
  type: 'book' | 'quran' | 'hadith';
  title: string;
  keywordScore: number | null; // BM25 score from Elasticsearch
  semanticScore: number | null;
  finalScore: number;
  matchType: 'semantic' | 'keyword' | 'both'; // How this result was matched
}

interface ExpandedQueryStats {
  query: string;
  weight: number;
  docsRetrieved: number;
  books: number;
  ayahs: number;
  hadiths: number;
  searchTimeMs: number;
}

interface DebugStats {
  databaseStats: {
    totalBooks: number;
    totalPages: number;
    totalHadiths: number;
    totalAyahs: number;
  };
  searchParams: {
    mode: string;
    cutoff: number;
    totalAboveCutoff: number;
    totalShown: number;
  };
  algorithm: {
    fusionMethod: string;
    fusionWeights: { semantic: number; keyword: number };
    keywordEngine: string;
    bm25Params: { k1: number; b: number; normK: number };
    rrfK: number;
    embeddingModel: string;
    embeddingDimensions: number;
    rerankerModel: string | null;
    queryExpansionModel: string | null;
    // Quran embedding collection info
    quranCollection: string;
    quranCollectionFallback: boolean;
    embeddingTechnique?: string;
  };
  topResultsBreakdown: TopResultBreakdown[];
  refineStats?: {
    expandedQueries: ExpandedQueryStats[];
    originalQueryDocs: number;
    timing: {
      queryExpansion: number;
      parallelSearches: number;
      merge: number;
      rerank: number;
      total: number;
    };
    candidates: {
      totalBeforeMerge: number;
      afterMerge: { books: number; ayahs: number; hadiths: number };
      sentToReranker: number;
    };
    queryExpansionCached: boolean;
  };
  timing?: {
    total: number;
    embedding: number;
    semantic: { books: number; ayahs: number; hadiths: number };
    keyword: { books: number; ayahs: number; hadiths: number };
    merge: number;
    authorSearch: number;
    rerank?: number;
    translations: number;
    bookMetadata: number;
    graph?: number;
  };
}

interface SearchResponse {
  query: string;
  mode: string;
  count: number;
  results: BookResultData[];
  authors: AuthorResultData[];
  ayahs: AyahResultData[];
  hadiths: HadithResultData[];
  refined?: boolean;
  expandedQueries?: ExpandedQueryData[];
  debugStats?: DebugStats;
  graphContext?: GraphContext;
}

function SearchResultSkeleton() {
  return (
    <div className="p-4 border rounded-lg border-s-4 border-s-muted animate-pulse bg-card">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-5 w-16 bg-muted rounded" />
        <div className="h-4 w-24 bg-muted rounded" />
      </div>
      <div className="h-5 w-3/4 bg-muted rounded mb-2" />
      <div className="h-4 w-1/2 bg-muted rounded mb-3" />
      <div className="space-y-2">
        <div className="h-3 w-full bg-muted rounded" />
        <div className="h-3 w-5/6 bg-muted rounded" />
        <div className="h-3 w-2/3 bg-muted rounded" />
      </div>
    </div>
  );
}

export default function SearchClient() {
  const searchParams = useSearchParams();
  const { t, locale } = useTranslation();
  const { config: searchConfig, setConfig: setSearchConfig } = useAppConfig();

  const [query, setQuery] = useState("");
  const [authors, setAuthors] = useState<AuthorResultData[]>([]);
  const [unifiedResults, setUnifiedResults] = useState<UnifiedResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [isRefined, setIsRefined] = useState(false);
  const [expandedQueries, setExpandedQueries] = useState<ExpandedQueryData[]>([]);
  const [debugStats, setDebugStats] = useState<DebugStats | null>(null);
  const [graphContext, setGraphContext] = useState<GraphContext | null>(null);
  const [showDebugStats, setShowDebugStats] = useState(false);
  const [showAlgorithm, setShowAlgorithm] = useState(false);
  const [searchEventId, setSearchEventId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const restoredQueryRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize query and restore cached results on mount only
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return; // Only run once on mount
    initializedRef.current = true;

    const q = searchParams.get("q");
    if (q) {
      setQuery(q);
      // Try to restore cached results
      const cacheKey = `search_${q}`;
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        try {
          const { unifiedResults: cachedUnified, authors: cachedAuthors, isRefined: cachedIsRefined, expandedQueries: cachedExpanded } = JSON.parse(cached);
          setUnifiedResults(cachedUnified || []);
          setAuthors(cachedAuthors || []);
          setIsRefined(cachedIsRefined || false);
          setExpandedQueries(cachedExpanded || []);
          setHasSearched(true);
          restoredQueryRef.current = q;
        } catch {
          // Cache parse failed, will re-fetch
        }
      }
    }
  }, [searchParams]);

  // Fetch search results
  // isRefineSearch: if true, uses query expansion + reranking; if false, uses "none" for fast results
  const fetchResults = useCallback(async (searchQuery: string, config: SearchConfig, isRefineSearch: boolean = false) => {
    if (searchQuery.length < 2) {
      setUnifiedResults([]);
      setAuthors([]);
      setExpandedQueries([]);
      setHasSearched(false);
      return;
    }

    // Cancel any previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request with timeout
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutMs = isRefineSearch ? 30_000 : 15_000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    if (isRefineSearch) {
      setIsRefining(true);
    } else {
      setIsLoading(true);
    }
    setError(null);
    setHasSearched(true);

    try {
      // Build query params with config
      // For quick search (typing), use reranker=none and no refine
      // For refine search (button click), use refine=true and the selected reranker
      const effectiveReranker = isRefineSearch ? config.reranker : "none";
      // Resolve book title display to API language param
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
        bookContentTranslation: locale === "ar" ? "en" : locale,
        bookTitleLang: effectiveBookTitleLang,
        ...(isRefineSearch && {
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

      const eventId = crypto.randomUUID();
      const response = await fetch(`/api/search?${params.toString()}`, {
        signal: controller.signal,
        headers: {
          "x-search-event-id": eventId,
          "x-session-id": getSessionId(),
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const message =
          typeof errorData?.error === "string"
            ? errorData.error
            : errorData?.error?.message || "Search failed";
        throw new Error(message);
      }

      const data: SearchResponse = await response.json();

      // Merge all results into unified array with type tags
      const unified: UnifiedResult[] = [];

      // Add ayahs
      for (const ayah of data.ayahs || []) {
        unified.push({ type: "quran", data: ayah, score: ayah.score });
      }

      // Add hadiths
      for (const hadith of data.hadiths || []) {
        unified.push({ type: "hadith", data: hadith, score: hadith.score });
      }

      // Sort by score descending
      unified.sort((a, b) => b.score - a.score);

      // Apply postRerankLimit to total unified results (not per-content-type)
      const limitedUnified = unified.slice(0, config.postRerankLimit);

      // Assign global rank after sorting (1-indexed)
      limitedUnified.forEach((result, index) => {
        result.data.rank = index + 1;
      });

      translationTriggeredRef.current = null;
      setUnifiedResults(limitedUnified);
      setAuthors(data.authors || []);
      setIsRefined(data.refined || false);
      setExpandedQueries(data.expandedQueries || []);
      setDebugStats(data.debugStats || null);
      setGraphContext(data.graphContext || null);
      setSearchEventId(eventId);

      // Cache results in sessionStorage (ignore quota errors)
      try {
        const cacheKey = `search_${searchQuery}`;
        sessionStorage.setItem(cacheKey, JSON.stringify({
          unifiedResults: limitedUnified,
          authors: data.authors || [],
          isRefined: data.refined || false,
          expandedQueries: data.expandedQueries || [],
        }));
      } catch {
        // Ignore storage quota errors - caching is optional
      }
    } catch (err) {
      // If aborted by a newer search (controller replaced), silently ignore
      if (controller.signal.aborted && abortControllerRef.current !== controller) {
        return;
      }
      // If aborted by timeout (still the active controller), show timeout error
      if (controller.signal.aborted) {
        setError("Search timed out. Please try again.");
        toast.error("Search timed out");
        setIsLoading(false);
        setIsRefining(false);
        return;
      }
      console.error("Search error:", err);
      const errorMessage = err instanceof Error ? err.message : "Search failed";
      setError(errorMessage);
      toast.error("Search failed", { description: errorMessage });
      setUnifiedResults([]);
      setAuthors([]);
      setExpandedQueries([]);
      setDebugStats(null);
    } finally {
      clearTimeout(timeoutId);
      // Only update loading states if this request wasn't aborted by a newer search
      if (!controller.signal.aborted) {
        setIsLoading(false);
        setIsRefining(false);
      }
    }
  }, []);

  // Direct search for typing (fast, no reranking)
  const triggerSearch = useCallback((searchQuery: string, config: SearchConfig) => {
    if (searchQuery.length >= 2) {
      fetchResults(searchQuery, config, false);
      // Update URL without navigation
      window.history.replaceState({}, "", `/search?q=${encodeURIComponent(searchQuery)}`);
    }
  }, [fetchResults]);

  // Save config and re-search if needed
  const handleConfigChange = useCallback((newConfig: SearchConfig) => {
    setSearchConfig(newConfig);
    // Clear restoration ref so config change triggers a fresh search
    restoredQueryRef.current = null;
    // Clear cached results since config affects results
    try {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key?.startsWith("search_")) {
          sessionStorage.removeItem(key);
        }
      }
    } catch {
      // Ignore storage errors
    }
    // Re-search with new config if there's a valid query (quick search, no reranking)
    if (query.length >= 2) {
      fetchResults(query, newConfig, false);
    }
  }, [query, fetchResults, setSearchConfig]);

  // Handle input change - trigger quick search with debounce
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    setIsRefined(false); // Reset refined state when typing
    setExpandedQueries([]); // Clear expanded queries when typing

    // Clear existing debounce timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (newQuery.length >= 2) {
      // Debounce search by 300ms
      debounceRef.current = setTimeout(() => {
        triggerSearch(newQuery, searchConfig);
      }, 300);
    } else if (newQuery.length === 0) {
      setUnifiedResults([]);
      setAuthors([]);
      setExpandedQueries([]);
      window.history.replaceState({}, "", "/search");
    }
  }, [triggerSearch, searchConfig]);

  // Refine Search handler - applies query expansion + reranking
  const handleRefineSearch = useCallback(() => {
    if (query.length < 2) return;
    fetchResults(query, searchConfig, true);
    // Update URL without navigation
    window.history.replaceState({}, "", `/search?q=${encodeURIComponent(query)}`);
  }, [query, searchConfig, fetchResults]);

  // Handle Enter key press - trigger Refine Search
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleRefineSearch();
    }
  };

  // Auto-search on initial load if URL has query param (quick search, no reranking)
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && q.length >= 2 && !hasSearched && restoredQueryRef.current !== q) {
      // Trigger quick search if we have a URL param but haven't searched yet (and no cache)
      fetchResults(q, searchConfig, false);
    }
  }, [searchParams, hasSearched, fetchResults, searchConfig]);

  // Background translation for hadiths without translations
  const translationTriggeredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!unifiedResults.length || isLoading || isRefining) return;

    const pendingHadiths = unifiedResults
      .filter(
        (r): r is UnifiedResult & { type: "hadith" } =>
          r.type === "hadith" && !!(r.data as HadithResultData).translationPending && !(r.data as HadithResultData).translation
      )
      .map((r) => r.data as HadithResultData);

    if (pendingHadiths.length === 0) return;

    // Prevent re-triggering for the same set of results
    const fingerprint = pendingHadiths.map((h) => `${h.bookId}-${h.hadithNumber}`).join(",");
    if (translationTriggeredRef.current === fingerprint) return;
    translationTriggeredRef.current = fingerprint;

    const controller = new AbortController();

    (async () => {
      try {
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute("content");
        const res = await fetch("/api/search/translate-hadiths", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(csrfToken && { "X-CSRF-Token": csrfToken }),
          },
          body: JSON.stringify({
            hadiths: pendingHadiths.slice(0, 10).map((h) => ({
              bookId: h.bookId,
              hadithNumber: h.hadithNumber,
              collectionSlug: h.collectionSlug,
              text: h.text,
            })),
            language: searchConfig.hadithTranslation || "en",
          }),
          signal: controller.signal,
        });

        if (!res.ok) return;
        const data = await res.json();
        if (!data.translations?.length) return;

        const translationMap = new Map<string, string>(
          data.translations.map((t: { bookId: number; hadithNumber: string; translation: string }) => [
            `${t.bookId}-${t.hadithNumber}`,
            t.translation,
          ])
        );

        setUnifiedResults((prev) =>
          prev.map((r) => {
            if (r.type !== "hadith") return r;
            const hd = r.data as HadithResultData;
            const translation = translationMap.get(`${hd.bookId}-${hd.hadithNumber}`);
            if (!translation) return r;
            return {
              ...r,
              data: {
                ...hd,
                translation,
                translationSource: "llm",
                translationPending: false,
              },
            };
          })
        );
      } catch {
        // Silently fail — translations are nice-to-have
      }
    })();

    return () => controller.abort();
  }, [unifiedResults, isLoading, isRefining, searchConfig.hadithTranslation]);

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Clear search
  const handleClear = () => {
    setQuery("");
    setUnifiedResults([]);
    setAuthors([]);
    setExpandedQueries([]);
    setHasSearched(false);
    setIsRefined(false);
    setDebugStats(null);
    setGraphContext(null);
    setShowDebugStats(false);
    translationTriggeredRef.current = null;
    window.history.replaceState({}, "", "/search");
  };

  // Handle voice transcription result
  const handleTranscription = useCallback((text: string) => {
    setQuery(text);
    setVoiceError(null);
    triggerSearch(text, searchConfig);
  }, [triggerSearch, searchConfig]);

  const isHeroState = !hasSearched && !isLoading && query.length < 2;

  return (
    <div className="p-4 md:p-8">
      {/* Header + Search Bar wrapper — centers vertically in hero state, collapses to top otherwise */}
      <div
        className={`transition-all duration-500 ease-out ${
          isHeroState
            ? "min-h-[60vh] flex flex-col justify-center"
            : ""
        }`}
      >
        {/* Header */}
        <div className={`max-w-2xl mx-auto mb-6 md:mb-8 ${isHeroState ? "text-center" : ""}`}>
          <h1 className={`font-bold mb-2 ${isHeroState ? "text-3xl md:text-4xl" : "text-2xl md:text-3xl"}`}>{t("search.title")}</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            {t("search.subtitle")}
          </p>
        </div>

        {/* Search Bar */}
        <div className="max-w-2xl mx-auto mb-6 md:mb-8">
          <div className="flex gap-2 p-1.5 rounded-2xl bg-muted/60" suppressHydrationWarning>
            <div className="relative flex-1 min-w-0 rounded-lg ring-1 ring-transparent focus-within:ring-brand/50 focus-within:shadow-[0_0_0_3px_hsl(var(--brand)/0.1)] transition-[box-shadow,ring-color] duration-200">
              {!isRecording && (
                <>
                  <Search className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder={t("search.placeholder")}
                    className="text-base md:text-sm h-10 md:h-12 pl-9 pr-9 md:px-12 rounded-lg border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    dir="auto"
                    value={query}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                  />
                  {query && (
                    <button
                      onClick={handleClear}
                      className="absolute right-3 md:right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
                      aria-label={t("common.close")}
                    >
                      <X className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
                    </button>
                  )}
                </>
              )}
              <VoiceRecorder
                showMic={!query && !isRecording}
                onRecordingChange={(recording) => { setIsRecording(recording); if (recording) setVoiceError(null); }}
                onTranscription={handleTranscription}
                onError={(msg) => setVoiceError(msg)}
              />
            </div>
            <Button
              onClick={handleRefineSearch}
              disabled={query.length < 2 || isRefining || isRecording}
              className={`h-10 md:h-12 px-3 md:px-6 shrink-0 border box-border rounded-lg focus:outline-none focus-visible:ring-0 active:transform-none transition-shadow duration-200 ${isRecording ? "" : "border-brand bg-gradient-to-b from-brand to-[hsl(var(--brand)/0.85)] text-white shadow-[0_1px_3px_0_hsl(var(--brand)/0.3)] hover:shadow-[0_2px_8px_0_hsl(var(--brand)/0.35)]"}`}
            >
              {isRefining ? <Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin" /> : t("search.refineSearch")}
            </Button>
            <SearchConfigDropdown config={searchConfig} onChange={handleConfigChange} />
          </div>
          {voiceError && (
            <p className="text-sm text-red-500 mt-2 text-center">{voiceError}</p>
          )}
        </div>

        {/* Disclaimer — shown only in hero state, inside the centered flex container */}
        {isHeroState && (
          <p className="max-w-md mx-auto text-[0.65rem] text-muted-foreground/40 text-center leading-relaxed mt-8">
            {t("search.disclaimer")}
          </p>
        )}
      </div>

      {/* Results Section */}
      <div className="max-w-3xl mx-auto">
        <AnimatePresence mode="popLayout">
          {/* Loading State — skeleton cards */}
          {isLoading && !isRefining && (
            <motion.div
              key="loading-skeletons"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="space-y-4"
            >
              {[0, 1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
                >
                  <SearchResultSkeleton />
                </motion.div>
              ))}
            </motion.div>
          )}

          {/* Refining State with Ayah Carousel */}
          {isRefining && (
            <motion.div
              key="refining"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <RefiningCarousel
                quranTranslation={searchConfig.quranTranslation || "none"}
              />
            </motion.div>
          )}

          {/* Error State */}
          {error && !isLoading && !isRefining && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <SearchErrorState
                error={error}
                onRetry={() => {
                  setError(null);
                  fetchResults(query, searchConfig, false);
                }}
              />
            </motion.div>
          )}

          {/* No Results */}
          {hasSearched && !isLoading && !isRefining && !error && unifiedResults.length === 0 && authors.length === 0 && query.length >= 2 && (
            <motion.div
              key="no-results"
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center justify-center py-16 gap-3"
            >
              <Search className="h-12 w-12 text-muted-foreground/30" />
              <p className="text-muted-foreground text-lg">
                {t("search.noResults", { query })}
              </p>
              <p className="text-sm text-muted-foreground/60">
                {t("search.noResultsHint")}
              </p>
            </motion.div>
          )}

          {/* Results */}
          {!isLoading && !isRefining && !error && (unifiedResults.length > 0 || authors.length > 0) && (
            <motion.div
              key={`results-${unifiedResults.length}-${unifiedResults[0]?.data?.score ?? 0}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {/* Authors Section */}
              {authors.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-sm font-medium text-muted-foreground mb-3">{t("search.authorsSection")}</h2>
                  <div className="flex flex-wrap gap-2">
                    {authors.map((author) => (
                      <PrefetchLink
                        key={author.id}
                        href={`/authors/${encodeURIComponent(author.nameLatin)}`}
                        className="flex items-center gap-2 px-3 py-2 border rounded-lg hover:border-muted-foreground hover:shadow-sm transition-all bg-background"
                      >
                        <User className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium" dir="rtl">{author.nameArabic}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            {searchConfig.showAuthorTransliteration && (
                              <span>{author.nameLatin}</span>
                            )}
                            {(author.deathDateHijri || author.deathDateGregorian) && (
                              <>
                                {searchConfig.showAuthorTransliteration && <span className="text-border">|</span>}
                                <span>{formatYear(author.deathDateHijri, author.deathDateGregorian, searchConfig.dateCalendar)}</span>
                              </>
                            )}
                            {(searchConfig.showAuthorTransliteration || author.deathDateHijri || author.deathDateGregorian) && (
                              <span className="text-border">|</span>
                            )}
                            <span className="flex items-center gap-1">
                              <BookOpen className="h-3 w-3" />
                              {author.booksCount}
                            </span>
                          </div>
                        </div>
                      </PrefetchLink>
                    ))}
                  </div>
                </div>
              )}

              {/* Entity Knowledge Panel */}
              {graphContext && graphContext.entities.length > 0 && (
                <EntityPanel
                  graphContext={graphContext}
                  onEntityClick={(nameArabic) => {
                    setQuery(nameArabic);
                    fetchResults(nameArabic, searchConfig, false);
                  }}
                />
              )}

              {/* Unified Results Count and Refined indicator */}
              {unifiedResults.length > 0 && (
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-muted-foreground">
                    {t("search.results", { count: unifiedResults.length })}
                  </p>
                  <div className="flex items-center gap-2">
                    {isRefined && (
                      <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-full">
                        {t("search.refined")}
                      </span>
                    )}
                    {debugStats && (
                      <button
                        onClick={() => setShowDebugStats(!showDebugStats)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 px-2 py-1 rounded-full hover:bg-muted"
                      >
                        <Bug className="h-3 w-3" />
                        {showDebugStats ? t("search.hideDebugStats") : t("search.showDebugStats")}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Debug Stats Panel */}
              <AnimatePresence initial={false}>
                {showDebugStats && debugStats && (
                  <motion.div
                    key="debug-panel"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <SearchDebugPanel
                      debugStats={debugStats}
                      showAlgorithm={showAlgorithm}
                      onToggleAlgorithm={() => setShowAlgorithm(!showAlgorithm)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Unified Results List — staggered entrance */}
              {unifiedResults.length > 0 && (
                <motion.div
                  className="space-y-4"
                  initial="hidden"
                  animate="visible"
                  variants={{
                    hidden: {},
                    visible: { transition: { staggerChildren: 0.04 } },
                  }}
                >
                  {unifiedResults.map((result, index) => {
                    const key = result.type === "quran"
                      ? `quran-${result.data.surahNumber}-${result.data.ayahNumber}-${index}`
                      : `hadith-${result.data.collectionSlug}-${result.data.hadithNumber}-${index}`;
                    return (
                      <motion.div
                        key={key}
                        variants={{
                          hidden: { opacity: 0, y: 12 },
                          visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
                        }}
                      >
                        <UnifiedSearchResult result={result} searchEventId={searchEventId} />
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
