"use client";

import { useState, useEffect, useCallback, useRef, KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Search, X, Loader2, User, BookOpen, Bug } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { UnifiedSearchResult, UnifiedResult, BookResultData, AyahResultData, HadithResultData } from "@/components/SearchResult";
import { SearchConfigDropdown, type TranslationDisplayOption } from "@/components/SearchConfigDropdown";
import { useAppConfig, type SearchConfig } from "@/lib/config";
import { formatYear } from "@/lib/dates";
import { useTranslation } from "@/lib/i18n";
import AlgorithmDescription from "@/components/AlgorithmDescription";
import { RefiningCarousel } from "@/components/RefiningCarousel";

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
    tafsirSource?: string;
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
    directLookup: number;
    authorSearch: number;
    rerank?: number;
    translations: number;
    bookMetadata: number;
  };
}

interface SurahMatch {
  surahNumber: number;
  url: string;
  totalAyahs: number;
}

interface SearchResponse {
  query: string;
  mode: string;
  count: number;
  results: BookResultData[];
  authors: AuthorResultData[];
  ayahs: AyahResultData[];
  hadiths: HadithResultData[];
  surah?: SurahMatch;
  refined?: boolean;
  expandedQueries?: ExpandedQueryData[];
  debugStats?: DebugStats;
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
  const [showDebugStats, setShowDebugStats] = useState(false);
  const [showAlgorithm, setShowAlgorithm] = useState(false);
  const [surahMatch, setSurahMatch] = useState<SurahMatch | null>(null);
  const restoredQueryRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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
        fuzzyThreshold: String(config.fuzzyThreshold),
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
        const errorData = await response.json();
        throw new Error(errorData.error || "Search failed");
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
      setSurahMatch(data.surah || null);

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
      setError(err instanceof Error ? err.message : "Search failed");
      setUnifiedResults([]);
      setAuthors([]);
      setExpandedQueries([]);
      setDebugStats(null);
      setSurahMatch(null);
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

  // Handle input change - trigger quick search directly
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    setIsRefined(false); // Reset refined state when typing
    setExpandedQueries([]); // Clear expanded queries when typing
    if (newQuery.length >= 2) {
      triggerSearch(newQuery, searchConfig);
    } else if (newQuery.length === 0) {
      setUnifiedResults([]);
      setAuthors([]);
      setExpandedQueries([]);
      setSurahMatch(null);
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

  // Clear search
  const handleClear = () => {
    setQuery("");
    setUnifiedResults([]);
    setAuthors([]);
    setExpandedQueries([]);
    setIsRefined(false);
    setDebugStats(null);
    setShowDebugStats(false);
    setSurahMatch(null);
    window.history.replaceState({}, "", "/search");
  };

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
              >
                <X className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
              </button>
            )}
          </div>
          <Button
            onClick={handleRefineSearch}
            disabled={query.length < 2 || isRefining}
            className="h-10 md:h-12 px-3 md:px-6 shrink-0 border box-border hover:opacity-90 focus:outline-none focus-visible:ring-0 active:transform-none"
            style={{
              borderColor: "#31b9c9",
              backgroundColor: "#31b9c9",
              color: "#ffffff"
            }}
          >
            {isRefining ? <Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin" /> : t("search.refineSearch")}
          </Button>
          <SearchConfigDropdown config={searchConfig} onChange={handleConfigChange} />
        </div>
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
          <div className="text-center py-12">
            <p className="text-red-500">{error}</p>
            <p className="text-muted-foreground mt-2">{t("search.error")}</p>
          </div>
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
          <div className="mb-6 p-4 bg-muted/30 rounded-lg border text-sm space-y-4">
            <h3 className="font-medium text-foreground flex items-center gap-2">
              <Bug className="h-4 w-4" />
              {t("search.debugStats")}
            </h3>

            {/* Database Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-background rounded p-2">
                <div className="text-xs text-muted-foreground">{t("search.totalBooks")}</div>
                <div className="font-mono text-lg">{debugStats.databaseStats.totalBooks.toLocaleString()}</div>
              </div>
              <div className="bg-background rounded p-2">
                <div className="text-xs text-muted-foreground">{t("search.totalPages")}</div>
                <div className="font-mono text-lg">{debugStats.databaseStats.totalPages.toLocaleString()}</div>
              </div>
              <div className="bg-background rounded p-2">
                <div className="text-xs text-muted-foreground">{t("search.totalHadiths")}</div>
                <div className="font-mono text-lg">{debugStats.databaseStats.totalHadiths.toLocaleString()}</div>
              </div>
              <div className="bg-background rounded p-2">
                <div className="text-xs text-muted-foreground">{t("search.totalAyahs")}</div>
                <div className="font-mono text-lg">{debugStats.databaseStats.totalAyahs.toLocaleString()}</div>
              </div>
            </div>

            {/* Search Stats */}
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground uppercase">{t("search.searchStats")}</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div><span className="text-muted-foreground">Mode:</span> <span className="font-mono">{debugStats.algorithm.fusionMethod}</span></div>
                <div><span className="text-muted-foreground">{t("search.cutoffValue")}:</span> <span className="font-mono">{debugStats.searchParams.cutoff}</span></div>
                <div><span className="text-muted-foreground">{t("search.candidatesLimit")}:</span> <span className="font-mono">{debugStats.searchParams.totalAboveCutoff}</span></div>
                <div><span className="text-muted-foreground">{t("search.retrieved")}:</span> <span className="font-mono">{debugStats.searchParams.totalShown}</span></div>
              </div>
            </div>

            {/* Performance Timing */}
            {debugStats.timing && (
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase">Performance</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Total:</span>{" "}
                    <span className={`font-mono ${debugStats.timing.total > 2000 ? 'text-red-500' : debugStats.timing.total > 1000 ? 'text-yellow-500' : 'text-green-500'}`}>
                      {debugStats.timing.total}ms
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Embedding:</span>{" "}
                    <span className={`font-mono ${debugStats.timing.embedding > 400 ? 'text-red-500' : debugStats.timing.embedding > 200 ? 'text-yellow-500' : ''}`}>
                      {debugStats.timing.embedding}ms
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Semantic:</span>{" "}
                    <span className="font-mono">
                      {Math.max(debugStats.timing.semantic.books, debugStats.timing.semantic.ayahs, debugStats.timing.semantic.hadiths)}ms
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Keyword:</span>{" "}
                    <span className="font-mono">
                      {Math.max(debugStats.timing.keyword.books, debugStats.timing.keyword.ayahs, debugStats.timing.keyword.hadiths)}ms
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Merge:</span> <span className="font-mono">{debugStats.timing.merge}ms</span></div>
                  <div><span className="text-muted-foreground">Direct Lookup:</span> <span className="font-mono">{debugStats.timing.directLookup}ms</span></div>
                  <div><span className="text-muted-foreground">Author Search:</span> <span className="font-mono">{debugStats.timing.authorSearch}ms</span></div>
                  {debugStats.timing.rerank !== undefined && (
                    <div><span className="text-muted-foreground">Rerank:</span> <span className="font-mono">{debugStats.timing.rerank}ms</span></div>
                  )}
                  <div><span className="text-muted-foreground">Translations:</span> <span className="font-mono">{debugStats.timing.translations}ms</span></div>
                  <div><span className="text-muted-foreground">Book Meta:</span> <span className="font-mono">{debugStats.timing.bookMetadata}ms</span></div>
                </div>
                {/* Detailed breakdown */}
                <div className="text-[10px] font-mono text-muted-foreground bg-muted/30 p-2 rounded">
                  <div>semantic: books={debugStats.timing.semantic.books}ms ayahs={debugStats.timing.semantic.ayahs}ms hadiths={debugStats.timing.semantic.hadiths}ms</div>
                  <div>keyword: books={debugStats.timing.keyword.books}ms ayahs={debugStats.timing.keyword.ayahs}ms hadiths={debugStats.timing.keyword.hadiths}ms</div>
                </div>
              </div>
            )}

            {/* Algorithm Details */}
            <div className="space-y-3">
              <h4 className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-2">
                {t("search.algorithmDetails")}
                <button
                  onClick={() => setShowAlgorithm(!showAlgorithm)}
                  className="text-muted-foreground hover:text-foreground text-[10px] font-normal normal-case px-2 py-0.5 rounded bg-muted hover:bg-muted/80 transition-colors"
                >
                  {showAlgorithm ? t("search.hideFormulas") : t("search.showFormulas")}
                </button>
              </h4>

              {/* Quick Summary (always visible) */}
              <div className="text-xs font-mono bg-muted/30 p-2 rounded space-y-1">
                <div>
                  <span className="text-muted-foreground">{t("search.fusion")}:</span>{" "}
                  semantic={debugStats.algorithm.fusionWeights.semantic.toFixed(2)}, keyword={debugStats.algorithm.fusionWeights.keyword.toFixed(2)}
                </div>
                <div>
                  <span className="text-muted-foreground">{t("search.keyword")}:</span>{" "}
                  {debugStats.algorithm.keywordEngine} (BM25 k1={debugStats.algorithm.bm25Params.k1}, b={debugStats.algorithm.bm25Params.b})
                </div>
                <div>
                  <span className="text-muted-foreground">{t("search.embedding")}:</span>{" "}
                  {debugStats.algorithm.embeddingModel} ({debugStats.algorithm.embeddingDimensions}-dim)
                </div>
                <div>
                  <span className="text-muted-foreground">{t("search.rerankerModel")}:</span>{" "}
                  {debugStats.algorithm.rerankerModel || "none"}
                </div>
                {debugStats.algorithm.queryExpansionModel && (
                  <div>
                    <span className="text-muted-foreground">{t("search.expansionModel")}:</span>{" "}
                    {debugStats.algorithm.queryExpansionModel}
                  </div>
                )}
                {debugStats.algorithm.quranCollection && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-muted-foreground">Quran Embeddings:</span>{" "}
                    {debugStats.algorithm.quranCollection.includes("enriched") ? (
                      <>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-600">tafsir-enriched</span>
                        {debugStats.algorithm.tafsirSource && (
                          <span className="text-muted-foreground">(via {debugStats.algorithm.tafsirSource === "jalalayn" ? "Al-Jalalayn tafsir" : debugStats.algorithm.tafsirSource})</span>
                        )}
                      </>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-600">original ayah text</span>
                    )}
                    {debugStats.algorithm.quranCollectionFallback && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-600">fallback</span>
                    )}
                  </div>
                )}
              </div>

              {/* Expandable Full Description with LaTeX Formulas */}
              {showAlgorithm && (
                <AlgorithmDescription stats={debugStats.algorithm} />
              )}
            </div>

            {/* Top Results Breakdown */}
            {debugStats.topResultsBreakdown.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase">{t("search.topResultsBreakdown")}</h4>
                <div className="space-y-1 font-mono text-xs">
                  {debugStats.topResultsBreakdown.map((r, i) => (
                    <div key={i} className="flex flex-wrap gap-2 items-center bg-background rounded px-2 py-1">
                      <span className="text-muted-foreground">#{r.rank}</span>
                      <span className={`px-1 rounded text-[10px] uppercase ${
                        r.type === 'quran' ? 'bg-green-500/20 text-green-600' :
                        r.type === 'hadith' ? 'bg-blue-500/20 text-blue-600' :
                        'bg-orange-500/20 text-orange-600'
                      }`}>{r.type}</span>
                      <span className="truncate max-w-[150px]" dir="auto" title={r.title}>{r.title}</span>
                      <span className="text-muted-foreground ml-auto">
                        kw={r.keywordScore?.toFixed(2) ?? 'N/A'} |
                        sem={r.semanticScore?.toFixed(3) ?? 'N/A'} |
                        final=<span className="text-foreground">{r.finalScore.toFixed(3)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Refine Stats */}
            {debugStats.refineStats && (
              <div className="space-y-3">
                <h4 className="text-xs font-medium text-muted-foreground uppercase">{t("search.refineStats")}</h4>

                {/* Refine Timing Breakdown */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono bg-background rounded p-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Query Expansion:</span>
                    <span>{debugStats.refineStats.timing.queryExpansion}ms {debugStats.refineStats.queryExpansionCached && <span className="text-green-500">(cached)</span>}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Parallel Searches:</span>
                    <span>{debugStats.refineStats.timing.parallelSearches}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Merge & Dedup:</span>
                    <span>{debugStats.refineStats.timing.merge}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reranking:</span>
                    <span>{debugStats.refineStats.timing.rerank}ms</span>
                  </div>
                  <div className="flex justify-between col-span-2 border-t border-border pt-1 mt-1">
                    <span className="text-muted-foreground font-medium">Refine Total:</span>
                    <span className="font-medium">{debugStats.refineStats.timing.total}ms</span>
                  </div>
                </div>

                {/* Candidate Pipeline */}
                <div className="text-xs space-y-1">
                  <div className="text-muted-foreground mb-1">Candidate Pipeline:</div>
                  <div className="font-mono flex items-center gap-2 text-[11px]">
                    <span className="bg-background rounded px-2 py-0.5">{debugStats.refineStats.candidates.totalBeforeMerge} raw</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="bg-background rounded px-2 py-0.5">
                      {debugStats.refineStats.candidates.afterMerge.books + debugStats.refineStats.candidates.afterMerge.ayahs + debugStats.refineStats.candidates.afterMerge.hadiths} unique
                      <span className="text-muted-foreground ml-1">
                        ({debugStats.refineStats.candidates.afterMerge.books}b/{debugStats.refineStats.candidates.afterMerge.ayahs}a/{debugStats.refineStats.candidates.afterMerge.hadiths}h)
                      </span>
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span className="bg-background rounded px-2 py-0.5">{debugStats.refineStats.candidates.sentToReranker} reranked</span>
                  </div>
                </div>

                {/* Expanded Queries */}
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Expanded Queries ({debugStats.refineStats.expandedQueries.length}):</div>
                  <div className="space-y-1 font-mono text-xs">
                    {debugStats.refineStats.expandedQueries.map((eq, i) => (
                      <div key={i} className="flex gap-2 bg-background rounded px-2 py-1 items-center">
                        <span className="text-muted-foreground shrink-0">w={eq.weight.toFixed(1)}</span>
                        <span dir="auto" className="truncate flex-1">{eq.query}</span>
                        <span className="text-muted-foreground shrink-0 text-[10px]">
                          {eq.books}b/{eq.ayahs}a/{eq.hadiths}h
                        </span>
                        <span className="text-muted-foreground shrink-0">{eq.searchTimeMs}ms</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
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
