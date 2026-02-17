"use client";

import { useState, useEffect, useCallback, useRef, KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Search, X, Loader2, User, BookOpen, Bug } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { PrefetchLink } from "@/components/PrefetchLink";
import { UnifiedSearchResult, UnifiedResult, BookResultData, AyahResultData, HadithResultData } from "@/components/SearchResult";
import { SearchFiltersPanel } from "@/components/SearchFiltersPanel";
import { QURAN_TRANSLATIONS } from "@/lib/config/search-defaults";
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

type ActiveTab = "results" | "deep" | "filters";
type DeepSearchStatus = "idle" | "loading" | "done" | "error";

/** Parse search response into sorted, limited UnifiedResult[] */
function parseSearchResults(data: SearchResponse, limit: number): UnifiedResult[] {
  const unified: UnifiedResult[] = [];
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
function buildSearchParams(searchQuery: string, config: SearchConfig, locale: string, isRefine: boolean): URLSearchParams {
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
    bookContentTranslation: locale === "ar" ? "en" : locale,
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

export default function SearchClient() {
  const searchParams = useSearchParams();
  const { t, locale } = useTranslation();
  const { config: searchConfig, setConfig: setSearchConfig, isLoaded: configLoaded } = useAppConfig();

  const [query, setQuery] = useState("");

  // Quick search state
  const [quickResults, setQuickResults] = useState<UnifiedResult[]>([]);
  const [quickAuthors, setQuickAuthors] = useState<AuthorResultData[]>([]);
  const [quickDebugStats, setQuickDebugStats] = useState<DebugStats | null>(null);
  const [quickGraphContext, setQuickGraphContext] = useState<GraphContext | null>(null);
  const [quickSearchEventId, setQuickSearchEventId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Deep search state
  const [deepResults, setDeepResults] = useState<UnifiedResult[]>([]);
  const [deepAuthors, setDeepAuthors] = useState<AuthorResultData[]>([]);
  const [deepDebugStats, setDeepDebugStats] = useState<DebugStats | null>(null);
  const [deepGraphContext, setDeepGraphContext] = useState<GraphContext | null>(null);
  const [deepExpandedQueries, setDeepExpandedQueries] = useState<ExpandedQueryData[]>([]);
  const [deepSearchEventId, setDeepSearchEventId] = useState<string | null>(null);
  const [deepSearchStatus, setDeepSearchStatus] = useState<DeepSearchStatus>("idle");
  const [deepSearchError, setDeepSearchError] = useState<string | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<ActiveTab>("results");

  // UI state
  const [showDebugStats, setShowDebugStats] = useState(false);
  const [showAlgorithm, setShowAlgorithm] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  // Refs
  const restoredQueryRef = useRef<string | null>(null);
  const quickAbortRef = useRef<AbortController | null>(null);
  const deepAbortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevTranslationRef = useRef({ quran: searchConfig.quranTranslation, hadith: searchConfig.hadithTranslation });

  // When translation language changes, re-search to get results in the new language
  useEffect(() => {
    const prev = prevTranslationRef.current;
    prevTranslationRef.current = { quran: searchConfig.quranTranslation, hadith: searchConfig.hadithTranslation };
    const quranChanged = prev.quran !== searchConfig.quranTranslation;
    const hadithChanged = prev.hadith !== searchConfig.hadithTranslation;
    if (!quranChanged && !hadithChanged) return;
    if (!quickResults.length || !query || query.length < 2) return;

    // Re-search with updated translation config (quick search only)
    fetchQuickResults(query, searchConfig);
  }, [searchConfig.quranTranslation, searchConfig.hadithTranslation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize query and restore cached results on mount only
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return; // Only run once on mount
    initializedRef.current = true;

    const q = searchParams.get("q");
    if (q) {
      setQuery(q);
      // Try to restore cached results
      const restoreCollectionKey = searchConfig.hadithCollections.length > 0 ? searchConfig.hadithCollections.join(",") : "all";
      const cacheKey = `search_${q}_${searchConfig.quranTranslation}_${searchConfig.hadithTranslation}_${restoreCollectionKey}`;
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        try {
          const { quickResults: cachedResults, quickAuthors: cachedAuthors } = JSON.parse(cached);
          setQuickResults(cachedResults || []);
          setQuickAuthors(cachedAuthors || []);
          setHasSearched(true);
          restoredQueryRef.current = q;
        } catch {
          // Cache parse failed, will re-fetch
        }
      }
    }
  }, [searchParams]);

  // Fetch quick search results (fast, no reranking)
  const fetchQuickResults = useCallback(async (searchQuery: string, config: SearchConfig) => {
    if (searchQuery.length < 2) {
      setQuickResults([]);
      setQuickAuthors([]);
      setHasSearched(false);
      return;
    }

    // Cancel previous quick search
    if (quickAbortRef.current) {
      quickAbortRef.current.abort();
    }
    // Cancel any in-flight deep search (query changed)
    if (deepAbortRef.current) {
      deepAbortRef.current.abort();
    }

    const controller = new AbortController();
    quickAbortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    setIsLoading(true);
    setError(null);
    setHasSearched(true);

    // Reset deep search state
    setDeepResults([]);
    setDeepAuthors([]);
    setDeepDebugStats(null);
    setDeepGraphContext(null);
    setDeepExpandedQueries([]);
    setDeepSearchStatus("idle");
    setDeepSearchError(null);
    // Switch to results tab unless user is on filters (they stay while results refresh in background)
    setActiveTab((prev) => prev === "filters" ? "filters" : "results");

    try {
      const params = buildSearchParams(searchQuery, config, locale, false);
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
      const limitedUnified = parseSearchResults(data, config.postRerankLimit);

      translationTriggeredRef.current = null;
      setQuickResults(limitedUnified);
      setQuickAuthors(data.authors || []);
      setQuickDebugStats(data.debugStats || null);
      setQuickGraphContext(data.graphContext || null);
      setQuickSearchEventId(eventId);

      // Cache results in sessionStorage (ignore quota errors)
      try {
        const collectionKey = config.hadithCollections.length > 0 ? config.hadithCollections.join(",") : "all";
        const cacheKey = `search_${searchQuery}_${config.quranTranslation}_${config.hadithTranslation}_${collectionKey}`;
        sessionStorage.setItem(cacheKey, JSON.stringify({
          quickResults: limitedUnified,
          quickAuthors: data.authors || [],
        }));
      } catch {
        // Ignore storage quota errors
      }
    } catch (err) {
      if (controller.signal.aborted && quickAbortRef.current !== controller) {
        return;
      }
      if (controller.signal.aborted) {
        setError("Search timed out. Please try again.");
        toast.error("Search timed out");
        setIsLoading(false);
        return;
      }
      console.error("Search error:", err);
      const errorMessage = err instanceof Error ? err.message : "Search failed";
      setError(errorMessage);
      toast.error("Search failed", { description: errorMessage });
      setQuickResults([]);
      setQuickAuthors([]);
      setQuickDebugStats(null);
    } finally {
      clearTimeout(timeoutId);
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [locale]);

  // Fetch deep search results (refine with query expansion + reranking)
  const fetchDeepResults = useCallback(async (searchQuery: string, config: SearchConfig) => {
    if (searchQuery.length < 2) return;

    // Cancel previous deep search only
    if (deepAbortRef.current) {
      deepAbortRef.current.abort();
    }

    const controller = new AbortController();
    deepAbortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    setDeepSearchStatus("loading");
    setDeepSearchError(null);

    try {
      const params = buildSearchParams(searchQuery, config, locale, true);
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
      const limitedUnified = parseSearchResults(data, config.postRerankLimit);

      setDeepResults(limitedUnified);
      setDeepAuthors(data.authors || []);
      setDeepDebugStats(data.debugStats || null);
      setDeepGraphContext(data.graphContext || null);
      setDeepExpandedQueries(data.expandedQueries || []);
      setDeepSearchEventId(eventId);
      setDeepSearchStatus("done");
    } catch (err) {
      if (controller.signal.aborted && deepAbortRef.current !== controller) {
        return;
      }
      if (controller.signal.aborted) {
        setDeepSearchError("Deep search timed out. Please try again.");
        setDeepSearchStatus("error");
        toast.error("Deep search timed out");
        return;
      }
      console.error("Deep search error:", err);
      const errorMessage = err instanceof Error ? err.message : "Deep search failed";
      setDeepSearchError(errorMessage);
      setDeepSearchStatus("error");
      toast.error("Deep search failed", { description: errorMessage });
    } finally {
      clearTimeout(timeoutId);
    }
  }, [locale]);

  // Direct search for typing (fast, no reranking)
  const triggerSearch = useCallback((searchQuery: string, config: SearchConfig) => {
    if (searchQuery.length >= 2) {
      fetchQuickResults(searchQuery, config);
      // Update URL without navigation
      window.history.replaceState({}, "", `/?q=${encodeURIComponent(searchQuery)}`);
    }
  }, [fetchQuickResults]);

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
    // Re-search with new config if there's a valid query
    if (query.length >= 2) {
      fetchQuickResults(query, newConfig);
    }
  }, [query, fetchQuickResults, setSearchConfig]);

  // Handle input change - trigger quick search with debounce
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);

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
      setQuickResults([]);
      setQuickAuthors([]);
      setHasSearched(false);
      // Reset deep state too
      setDeepResults([]);
      setDeepAuthors([]);
      setDeepSearchStatus("idle");
      setActiveTab("results");
      window.history.replaceState({}, "", "/");
    }
  }, [triggerSearch, searchConfig]);

  // Handle Deep Search tab click
  const handleDeepSearchTab = useCallback(() => {
    setActiveTab("deep");
    if (deepSearchStatus === "idle" && query.length >= 2) {
      fetchDeepResults(query, searchConfig);
    }
  }, [deepSearchStatus, query, searchConfig, fetchDeepResults]);

  // Handle Enter key press - trigger Deep Search
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && query.length >= 2) {
      e.preventDefault();
      setActiveTab("deep");
      if (deepSearchStatus === "idle") {
        fetchDeepResults(query, searchConfig);
      }
    }
  };

  // Auto-search on initial load if URL has query param (quick search)
  // Wait for configLoaded to avoid searching with default "en" before locale sync completes
  useEffect(() => {
    if (!configLoaded) return;
    const q = searchParams.get("q");
    if (q && q.length >= 2 && !hasSearched && restoredQueryRef.current !== q) {
      fetchQuickResults(q, searchConfig);
    }
  }, [searchParams, hasSearched, fetchQuickResults, searchConfig, configLoaded]);

  // Background translation for hadiths without translations
  const translationTriggeredRef = useRef<string | null>(null);
  useEffect(() => {
    // Determine which results are currently visible
    const visibleResults = activeTab === "results" ? quickResults : deepResults;
    const setVisibleResults = activeTab === "results" ? setQuickResults : setDeepResults;
    const isDeepLoading = deepSearchStatus === "loading";

    if (!visibleResults.length || isLoading || isDeepLoading) return;
    if (searchConfig.hadithTranslation === "none") return;

    const allHadiths = visibleResults.filter((r) => r.type === "hadith");
    const pendingHadiths = allHadiths
      .filter(
        (r): r is UnifiedResult & { type: "hadith" } =>
          !(r.data as HadithResultData).translation
      )
      .map((r) => r.data as HadithResultData);

    if (pendingHadiths.length === 0) return;

    // Prevent re-triggering for the same set of results
    const fingerprint = `${activeTab}:${searchConfig.hadithTranslation}:${pendingHadiths.map((h) => `${h.bookId}-${h.hadithNumber}`).join(",")}`;
    if (translationTriggeredRef.current === fingerprint) return;
    translationTriggeredRef.current = fingerprint;

    const controller = new AbortController();

    const pendingKeys = new Set(pendingHadiths.map((h) => `${h.bookId}-${h.hadithNumber}`));

    const clearPending = () => {
      setVisibleResults((prev) =>
        prev.map((r) => {
          if (r.type !== "hadith") return r;
          const hd = r.data as HadithResultData;
          if (!pendingKeys.has(`${hd.bookId}-${hd.hadithNumber}`)) return r;
          return { ...r, data: { ...hd, translationPending: false } };
        })
      );
    };

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

        if (!res.ok) { clearPending(); return; }
        const data = await res.json();
        if (!data.translations?.length) { clearPending(); return; }

        const translationMap = new Map<string, string>(
          data.translations.map((t: { bookId: number; hadithNumber: string; translation: string }) => [
            `${t.bookId}-${t.hadithNumber}`,
            t.translation,
          ])
        );

        setVisibleResults((prev) =>
          prev.map((r) => {
            if (r.type !== "hadith") return r;
            const hd = r.data as HadithResultData;
            const key = `${hd.bookId}-${hd.hadithNumber}`;
            const translation = translationMap.get(key);
            if (translation) {
              return { ...r, data: { ...hd, translation, translationSource: "llm", translationPending: false } };
            }
            // Clear pending even if this specific hadith wasn't translated
            if (pendingKeys.has(key)) {
              return { ...r, data: { ...hd, translationPending: false } };
            }
            return r;
          })
        );
      } catch {
        clearPending();
      }
    })();

    return () => controller.abort();
  }, [quickResults, deepResults, activeTab, isLoading, deepSearchStatus, searchConfig.hadithTranslation]);

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
    setQuickResults([]);
    setQuickAuthors([]);
    setQuickDebugStats(null);
    setQuickGraphContext(null);
    setDeepResults([]);
    setDeepAuthors([]);
    setDeepDebugStats(null);
    setDeepGraphContext(null);
    setDeepExpandedQueries([]);
    setDeepSearchStatus("idle");
    setDeepSearchError(null);
    setActiveTab("results");
    setHasSearched(false);
    setShowDebugStats(false);
    translationTriggeredRef.current = null;
    window.history.replaceState({}, "", "/");
  };

  // Handle voice transcription result
  const handleTranscription = useCallback((text: string) => {
    setQuery(text);
    setVoiceError(null);
    triggerSearch(text, searchConfig);
  }, [triggerSearch, searchConfig]);

  const isHeroState = !hasSearched && !isLoading && query.length < 2;

  // Tab bar should show when we have quick results or deep search has been triggered
  const showTabBar = hasSearched && !isLoading && (quickResults.length > 0 || deepSearchStatus !== "idle" || activeTab === "filters");

  return (
    <div className="p-4 sm:p-6 md:p-8">
      {/* Header + Search Bar wrapper — centers vertically in hero state, collapses to top otherwise */}
      <div
        className={
          isHeroState
            ? "min-h-[60vh] flex flex-col justify-center"
            : ""
        }
      >
        {/* Header */}
        <div className={`${isHeroState ? "max-w-4xl text-center" : "max-w-2xl"} mx-auto mb-6 md:mb-8`}>
          <h1 className={`font-bold mb-2 ${isHeroState ? "text-3xl md:text-4xl" : "text-2xl md:text-3xl"}`}>{t("search.title")}</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            {t("search.subtitle")}
          </p>
        </div>

        {/* Search Bar — single row: input + filter + mic */}
        <div className="max-w-2xl w-full mx-auto mb-6 md:mb-8">
          <div className="rounded-2xl border border-border/60 bg-muted/40 focus-within:border-brand/50 transition-colors duration-200" suppressHydrationWarning>
            <div className="flex items-center gap-1 px-3 py-2">
              {!isRecording && (
                <div className="relative flex-1">
                  <Input
                    type="text"
                    placeholder={t("search.placeholder")}
                    className="text-base h-11 px-2 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60"
                    dir="auto"
                    value={query}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                  />
                  {query && (
                    <button
                      onClick={handleClear}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
                      aria-label={t("common.close")}
                    >
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  )}
                </div>
              )}
              <VoiceRecorder
                showMic={!query && !isRecording}
                onRecordingChange={(recording) => { setIsRecording(recording); if (recording) setVoiceError(null); }}
                onTranscription={handleTranscription}
                onError={(msg) => setVoiceError(msg)}
              />
            </div>
          </div>
          {voiceError && (
            <p className="text-sm text-red-500 mt-2 text-center">{voiceError}</p>
          )}
        </div>

        {/* Disclaimer — shown only in hero state, inside the centered flex container */}
        {isHeroState && (
          <p className="max-w-md mx-auto text-xs text-muted-foreground/75 text-center leading-relaxed mt-8">
            {t("search.disclaimer")}
          </p>
        )}
      </div>

      {/* Results Section */}
      <div className="max-w-3xl mx-auto">
        {/* Tab Bar */}
        {showTabBar && (
          <div className="flex gap-1 mb-4 border-b border-border/50">
            <button
              onClick={() => setActiveTab("results")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "results"
                  ? "border-brand text-brand"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("search.results", { count: quickResults.length })}
            </button>
            <button
              onClick={handleDeepSearchTab}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === "deep"
                  ? "border-brand text-brand"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("search.refineSearch")}
              {deepSearchStatus === "loading" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {deepSearchStatus === "done" && ` (${deepResults.length})`}
            </button>
            <button
              onClick={() => setActiveTab("filters")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "filters"
                  ? "border-brand text-brand"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("search.filters")}
            </button>
          </div>
        )}

        <AnimatePresence mode="popLayout">
          {/* Loading State — skeleton cards (quick search only) */}
          {isLoading && (
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

          {/* Error State (quick search) */}
          {error && !isLoading && activeTab === "results" && (
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
                  fetchQuickResults(query, searchConfig);
                }}
              />
            </motion.div>
          )}

          {/* Deep Search Error State */}
          {deepSearchStatus === "error" && activeTab === "deep" && (
            <motion.div
              key="deep-error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <SearchErrorState
                error={deepSearchError || "Deep search failed"}
                onRetry={() => {
                  setDeepSearchError(null);
                  setDeepSearchStatus("idle");
                  fetchDeepResults(query, searchConfig);
                }}
              />
            </motion.div>
          )}

          {/* No Results */}
          {hasSearched && !isLoading && !error && activeTab === "results" && quickResults.length === 0 && quickAuthors.length === 0 && query.length >= 2 && (
            <motion.div
              key="no-results"
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center justify-center py-16 gap-3"
            >
              <Search className="h-16 w-16 sm:h-12 sm:w-12 text-muted-foreground/30" />
              <p className="text-muted-foreground text-xl sm:text-lg">
                {t("search.noResults", { query })}
              </p>
              <p className="text-sm text-muted-foreground/60">
                {t("search.noResultsHint")}
              </p>
            </motion.div>
          )}

          {/* Deep Search — No Results */}
          {activeTab === "deep" && deepSearchStatus === "done" && deepResults.length === 0 && deepAuthors.length === 0 && (
            <motion.div
              key="deep-no-results"
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center justify-center py-16 gap-3"
            >
              <Search className="h-16 w-16 sm:h-12 sm:w-12 text-muted-foreground/30" />
              <p className="text-muted-foreground text-xl sm:text-lg">
                {t("search.noResults", { query })}
              </p>
              <p className="text-sm text-muted-foreground/60">
                {t("search.noResultsHint")}
              </p>
            </motion.div>
          )}

          {/* Results (either tab, when not loading) */}
          {!isLoading && !error && activeTab === "results" && (quickResults.length > 0 || quickAuthors.length > 0) && (
            <motion.div
              key={`results-${quickResults.length}-${quickResults[0]?.data?.score ?? 0}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {/* Authors Section */}
              {quickAuthors.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-sm font-medium text-muted-foreground mb-3">{t("search.authorsSection")}</h2>
                  <div className="flex flex-wrap gap-2">
                    {quickAuthors.map((author) => (
                      <PrefetchLink
                        key={author.id}
                        href={`/authors/${encodeURIComponent(author.nameLatin)}`}
                        className="flex items-center gap-2 px-4 py-3 border rounded-lg hover:border-muted-foreground hover:shadow-sm transition-all bg-background"
                      >
                        <User className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <div className="font-medium" dir="rtl">{author.nameArabic}</div>
                          <div className="text-sm sm:text-xs text-muted-foreground flex items-center gap-2">
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
              {quickGraphContext && quickGraphContext.entities.length > 0 && (
                <EntityPanel
                  graphContext={quickGraphContext}
                  onEntityClick={(nameArabic) => {
                    setQuery(nameArabic);
                    fetchQuickResults(nameArabic, searchConfig);
                  }}
                />
              )}

              {/* Results Count + Debug toggle */}
              {quickResults.length > 0 && (
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-muted-foreground">
                    {t("search.results", { count: quickResults.length })}
                  </p>
                  <div className="flex items-center gap-2">
                    {quickDebugStats && (
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
                {showDebugStats && quickDebugStats && (
                  <motion.div
                    key="debug-panel"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <SearchDebugPanel
                      debugStats={quickDebugStats}
                      showAlgorithm={showAlgorithm}
                      onToggleAlgorithm={() => setShowAlgorithm(!showAlgorithm)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Results List — staggered entrance */}
              {quickResults.length > 0 && (
                <motion.div
                  className="space-y-4"
                  initial="hidden"
                  animate="visible"
                  variants={{
                    hidden: {},
                    visible: { transition: { staggerChildren: 0.04 } },
                  }}
                >
                  {quickResults.map((result, index) => {
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
                        <UnifiedSearchResult result={result} searchEventId={quickSearchEventId} />
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Deep Search Results (when tab is "deep" and status is "done") */}
          {activeTab === "deep" && deepSearchStatus === "done" && (deepResults.length > 0 || deepAuthors.length > 0) && (
            <motion.div
              key={`deep-results-${deepResults.length}-${deepResults[0]?.data?.score ?? 0}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {/* Authors Section */}
              {deepAuthors.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-sm font-medium text-muted-foreground mb-3">{t("search.authorsSection")}</h2>
                  <div className="flex flex-wrap gap-2">
                    {deepAuthors.map((author) => (
                      <PrefetchLink
                        key={author.id}
                        href={`/authors/${encodeURIComponent(author.nameLatin)}`}
                        className="flex items-center gap-2 px-4 py-3 border rounded-lg hover:border-muted-foreground hover:shadow-sm transition-all bg-background"
                      >
                        <User className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <div className="font-medium" dir="rtl">{author.nameArabic}</div>
                          <div className="text-sm sm:text-xs text-muted-foreground flex items-center gap-2">
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
              {deepGraphContext && deepGraphContext.entities.length > 0 && (
                <EntityPanel
                  graphContext={deepGraphContext}
                  onEntityClick={(nameArabic) => {
                    setQuery(nameArabic);
                    fetchQuickResults(nameArabic, searchConfig);
                  }}
                />
              )}

              {/* Results Count + Debug toggle */}
              {deepResults.length > 0 && (
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-muted-foreground">
                    {t("search.results", { count: deepResults.length })}
                  </p>
                  <div className="flex items-center gap-2">
                    {deepDebugStats && (
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
                {showDebugStats && deepDebugStats && (
                  <motion.div
                    key="deep-debug-panel"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <SearchDebugPanel
                      debugStats={deepDebugStats}
                      showAlgorithm={showAlgorithm}
                      onToggleAlgorithm={() => setShowAlgorithm(!showAlgorithm)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Deep Results List — staggered entrance */}
              {deepResults.length > 0 && (
                <motion.div
                  className="space-y-4"
                  initial="hidden"
                  animate="visible"
                  variants={{
                    hidden: {},
                    visible: { transition: { staggerChildren: 0.04 } },
                  }}
                >
                  {deepResults.map((result, index) => {
                    const key = result.type === "quran"
                      ? `deep-quran-${result.data.surahNumber}-${result.data.ayahNumber}-${index}`
                      : `deep-hadith-${result.data.collectionSlug}-${result.data.hadithNumber}-${index}`;
                    return (
                      <motion.div
                        key={key}
                        variants={{
                          hidden: { opacity: 0, y: 12 },
                          visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
                        }}
                      >
                        <UnifiedSearchResult result={result} searchEventId={deepSearchEventId} />
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Filters Panel */}
          {activeTab === "filters" && (
            <motion.div
              key="filters-panel"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="py-2"
            >
              <SearchFiltersPanel config={searchConfig} onChange={handleConfigChange} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Refining carousel — rendered outside AnimatePresence to stay mounted and avoid shuffle flicker */}
        <RefiningCarousel
          quranTranslation={searchConfig.quranTranslation || "none"}
          visible={activeTab === "deep" && deepSearchStatus === "loading"}
        />
      </div>
    </div>
  );
}
