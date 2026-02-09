"use client";

import { useState, useEffect, useCallback, useRef, KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Search, X, Loader2, User, BookOpen, Bug } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { UnifiedSearchResult, UnifiedResult, BookResultData, AyahResultData, HadithResultData } from "@/components/SearchResult";
import { SearchConfigDropdown, type TranslationDisplayOption } from "@/components/SearchConfigDropdown";
import { useAppConfig, type SearchConfig } from "@/lib/config";
import { formatYear } from "@/lib/dates";
import { useTranslation } from "@/lib/i18n";
import { RefiningCarousel } from "@/components/RefiningCarousel";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import EntityPanel, { type GraphContext } from "@/components/EntityPanel";
import { SearchDebugPanel } from "./SearchDebugPanel";
import { SearchErrorState } from "./SearchErrorState";

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

interface SearchClientProps {
  bookCount: number;
}

export default function SearchClient({ bookCount }: SearchClientProps) {
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

    // Create new AbortController for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;

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
      // Compute effective book title language for API (auto defaults to transliteration)
      const effectiveBookTitleLang = config.autoTranslation
        ? "transliteration"
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
        quranTranslation: config.autoTranslation
          ? (locale === "ar" ? "en" : locale)
          : (config.quranTranslation || "none"),
        hadithTranslation: config.autoTranslation
          ? "en"  // Only English available for hadiths
          : (config.hadithTranslation || "none"),
        bookContentTranslation: config.autoTranslation
          ? (locale === "ar" ? "en" : locale)
          : (config.bookContentTranslation || "none"),
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

      const response = await fetch(`/api/search?${params.toString()}`, {
        signal: controller.signal,
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

      // Add books
      for (const book of data.results || []) {
        unified.push({ type: "book", data: book, score: book.score });
      }

      // Sort by score descending
      unified.sort((a, b) => b.score - a.score);

      // Apply postRerankLimit to total unified results (not per-content-type)
      const limitedUnified = unified.slice(0, config.postRerankLimit);

      // Assign global rank after sorting (1-indexed)
      limitedUnified.forEach((result, index) => {
        result.data.rank = index + 1;
      });

      setUnifiedResults(limitedUnified);
      setAuthors(data.authors || []);
      setIsRefined(data.refined || false);
      setExpandedQueries(data.expandedQueries || []);
      setDebugStats(data.debugStats || null);
      setGraphContext(data.graphContext || null);

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
      // Check if this was an abort - don't update state for cancelled requests
      if (controller.signal.aborted) {
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
      // Only update loading states if this request wasn't aborted
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
    setIsRefined(false);
    setDebugStats(null);
    setGraphContext(null);
    setShowDebugStats(false);
    window.history.replaceState({}, "", "/search");
  };

  // Handle voice transcription result
  const handleTranscription = useCallback((text: string) => {
    setQuery(text);
    setVoiceError(null);
    triggerSearch(text, searchConfig);
  }, [triggerSearch, searchConfig]);

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="max-w-3xl mx-auto mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-bold mb-2">{t("search.title")}</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          {t("search.subtitle")}
        </p>
      </div>

      {/* Search Bar */}
      <div className="max-w-2xl mx-auto mb-6 md:mb-8">
        <div className="flex gap-2" suppressHydrationWarning>
          <div className="relative flex-1 min-w-0">
            {!isRecording && (
              <>
                <Search className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder={t("search.placeholder")}
                  className="text-base md:text-sm h-10 md:h-12 pl-9 pr-9 md:px-12 rounded-lg"
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
            className={`h-10 md:h-12 px-3 md:px-6 shrink-0 border box-border hover:opacity-90 focus:outline-none focus-visible:ring-0 active:transform-none ${isRecording ? "" : "border-brand bg-brand text-white"}`}
          >
            {isRefining ? <Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin" /> : t("search.refineSearch")}
          </Button>
          <SearchConfigDropdown config={searchConfig} onChange={handleConfigChange} />
        </div>
        {voiceError && (
          <p className="text-sm text-red-500 mt-2 text-center">{voiceError}</p>
        )}
      </div>

      {/* Results Section */}
      <div className="max-w-3xl mx-auto">
        {/* Loading State */}
        {isLoading && !isRefining && (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Refining State with Ayah Carousel */}
        {isRefining && (
          <RefiningCarousel
            quranTranslation={
              searchConfig.autoTranslation
                ? (locale === "ar" ? "en" : locale)
                : (searchConfig.quranTranslation || "none")
            }
          />
        )}

        {/* Error State */}
        {error && !isLoading && !isRefining && (
          <SearchErrorState
            error={error}
            onRetry={() => {
              setError(null);
              fetchResults(query, searchConfig, false);
            }}
          />
        )}

        {/* No Results */}
        {hasSearched && !isLoading && !isRefining && !error && unifiedResults.length === 0 && authors.length === 0 && query.length >= 2 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {t("search.noResults", { query })}
            </p>
          </div>
        )}

        {/* Authors Section */}
        {!isLoading && !isRefining && authors.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-medium text-muted-foreground mb-3">{t("search.authorsSection")}</h2>
            <div className="flex flex-wrap gap-2">
              {authors.map((author) => (
                <Link
                  key={author.id}
                  href={`/authors/${encodeURIComponent(author.nameLatin)}`}
                  className="flex items-center gap-2 px-3 py-2 border rounded-lg hover:border-muted-foreground hover:shadow-sm transition-all bg-background"
                >
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium" dir="rtl">{author.nameArabic}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>{author.nameLatin}</span>
                      {(author.deathDateHijri || author.deathDateGregorian) && (
                        <>
                          <span className="text-border">|</span>
                          <span>{formatYear(author.deathDateHijri, author.deathDateGregorian)}</span>
                        </>
                      )}
                      <span className="text-border">|</span>
                      <span className="flex items-center gap-1">
                        <BookOpen className="h-3 w-3" />
                        {author.booksCount}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Entity Knowledge Panel */}
        {!isLoading && !isRefining && graphContext && graphContext.entities.length > 0 && (
          <EntityPanel
            graphContext={graphContext}
            onEntityClick={(nameArabic) => {
              setQuery(nameArabic);
              fetchResults(nameArabic, searchConfig, false);
            }}
          />
        )}

        {/* Unified Results Count and Refined indicator */}
        {!isLoading && !isRefining && unifiedResults.length > 0 && (
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
        {!isLoading && !isRefining && showDebugStats && debugStats && (
          <SearchDebugPanel
            debugStats={debugStats}
            showAlgorithm={showAlgorithm}
            onToggleAlgorithm={() => setShowAlgorithm(!showAlgorithm)}
          />
        )}

        {/* Unified Results List */}
        {!isLoading && !isRefining && unifiedResults.length > 0 && (
          <div className="space-y-4">
            {unifiedResults.map((result, index) => {
              // Generate unique key based on result type
              let key: string;
              if (result.type === "quran") {
                key = `quran-${result.data.surahNumber}-${result.data.ayahNumber}-${index}`;
              } else if (result.type === "hadith") {
                key = `hadith-${result.data.collectionSlug}-${result.data.hadithNumber}-${index}`;
              } else {
                key = `book-${result.data.bookId}-${result.data.pageNumber}-${index}`;
              }
              // Compute effective book title display (auto defaults to transliteration)
              const effectiveBookTitleDisplay: TranslationDisplayOption = searchConfig.autoTranslation
                ? "transliteration"
                : searchConfig.bookTitleDisplay;
              return <UnifiedSearchResult key={key} result={result} bookTitleDisplay={effectiveBookTitleDisplay} />;
            })}
          </div>
        )}

        {/* Initial State */}
        {!hasSearched && !isLoading && query.length < 2 && (
          <div className="text-center py-12 text-muted-foreground">
            <p>{t("search.minChars")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
