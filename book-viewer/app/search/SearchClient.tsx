"use client";

import { useState, useEffect, useCallback, useRef, KeyboardEvent, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Search, X, Loader2, User, BookOpen } from "lucide-react";
import debounce from "lodash/debounce";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { UnifiedSearchResult, UnifiedResult, BookResultData, AyahResultData, HadithResultData } from "@/components/SearchResult";
import { SearchConfigDropdown, SearchConfig, defaultSearchConfig } from "@/components/SearchConfigDropdown";
import { formatYear } from "@/lib/dates";
import { useTranslation } from "@/lib/i18n";

interface AuthorResultData {
  id: number;
  nameArabic: string;
  nameLatin: string;
  deathDateHijri: string | null;
  deathDateGregorian: string | null;
  booksCount: number;
}

interface SearchResponse {
  query: string;
  mode: string;
  count: number;
  results: BookResultData[];
  authors: AuthorResultData[];
  ayahs: AyahResultData[];
  hadiths: HadithResultData[];
}

const SEARCH_CONFIG_KEY = "searchConfig";
const SEARCH_CONFIG_VERSION_KEY = "searchConfigVersion";
const CURRENT_CONFIG_VERSION = 5; // Bump when changing defaults

interface SearchClientProps {
  bookCount: number;
}

export default function SearchClient({ bookCount }: SearchClientProps) {
  const searchParams = useSearchParams();
  const { t } = useTranslation();

  const [query, setQuery] = useState("");
  const [authors, setAuthors] = useState<AuthorResultData[]>([]);
  const [unifiedResults, setUnifiedResults] = useState<UnifiedResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeepSearching, setIsDeepSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [isReranked, setIsReranked] = useState(false);
  const restoredQueryRef = useRef<string | null>(null);

  // Search config with LocalStorage persistence
  const [searchConfig, setSearchConfig] = useState<SearchConfig>(defaultSearchConfig);

  // Load config from localStorage on mount (with migration for new defaults)
  useEffect(() => {
    try {
      const storedVersion = parseInt(localStorage.getItem(SEARCH_CONFIG_VERSION_KEY) || "0", 10);
      const stored = localStorage.getItem(SEARCH_CONFIG_KEY);

      if (stored) {
        const parsed = JSON.parse(stored);

        // Migration: if version is old, reset reranker to new default
        if (storedVersion < CURRENT_CONFIG_VERSION) {
          parsed.reranker = defaultSearchConfig.reranker;
          localStorage.setItem(SEARCH_CONFIG_VERSION_KEY, String(CURRENT_CONFIG_VERSION));
          localStorage.setItem(SEARCH_CONFIG_KEY, JSON.stringify({ ...defaultSearchConfig, ...parsed }));
        }

        setSearchConfig({ ...defaultSearchConfig, ...parsed });
      } else {
        // New user, set version
        localStorage.setItem(SEARCH_CONFIG_VERSION_KEY, String(CURRENT_CONFIG_VERSION));
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

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
          const { unifiedResults: cachedUnified, authors: cachedAuthors, isReranked: cachedIsReranked } = JSON.parse(cached);
          setUnifiedResults(cachedUnified || []);
          setAuthors(cachedAuthors || []);
          setIsReranked(cachedIsReranked || false);
          setHasSearched(true);
          restoredQueryRef.current = q;
        } catch {
          // Cache parse failed, will re-fetch
        }
      }
    }
  }, [searchParams]);

  // Fetch search results
  // isDeepSearch: if true, uses the config.reranker; if false, uses "none" for fast results
  const fetchResults = useCallback(async (searchQuery: string, config: SearchConfig, isDeepSearch: boolean = false) => {
    if (searchQuery.length < 2) {
      setUnifiedResults([]);
      setAuthors([]);
      setHasSearched(false);
      return;
    }

    if (isDeepSearch) {
      setIsDeepSearching(true);
    } else {
      setIsLoading(true);
    }
    setError(null);
    setHasSearched(true);

    try {
      // Build query params with config
      // For quick search (typing), use reranker=none for fast results
      // For deep search (button click), use the selected reranker
      const effectiveReranker = isDeepSearch ? config.reranker : "none";
      const params = new URLSearchParams({
        q: searchQuery,
        mode: "hybrid",
        limit: "20",
        includeQuran: String(config.includeQuran),
        includeHadith: String(config.includeHadith),
        includeBooks: String(config.includeBooks),
        reranker: effectiveReranker,
        similarityCutoff: String(config.similarityCutoff),
        preRerankLimit: String(config.preRerankLimit),
        postRerankLimit: String(config.postRerankLimit),
        fuzzy: String(config.fuzzyEnabled),
        fuzzyThreshold: String(config.fuzzyThreshold),
      });

      const response = await fetch(`/api/search?${params.toString()}`);

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
      setIsReranked(isDeepSearch && config.reranker !== "none");

      // Cache results in sessionStorage (ignore quota errors)
      try {
        const cacheKey = `search_${searchQuery}`;
        sessionStorage.setItem(cacheKey, JSON.stringify({
          unifiedResults: limitedUnified,
          authors: data.authors || [],
          isReranked: isDeepSearch && config.reranker !== "none",
        }));
      } catch {
        // Ignore storage quota errors - caching is optional
      }
    } catch (err) {
      console.error("Search error:", err);
      setError(err instanceof Error ? err.message : "Search failed");
      setUnifiedResults([]);
      setAuthors([]);
    } finally {
      setIsLoading(false);
      setIsDeepSearching(false);
    }
  }, []);

  // Debounced search for typing (fast, no reranking)
  const debouncedSearch = useMemo(
    () =>
      debounce((searchQuery: string, config: SearchConfig) => {
        if (searchQuery.length >= 2) {
          fetchResults(searchQuery, config, false);
          // Update URL without navigation
          window.history.replaceState({}, "", `/search?q=${encodeURIComponent(searchQuery)}`);
        }
      }, 300),
    [fetchResults]
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      debouncedSearch.cancel();
    };
  }, [debouncedSearch]);

  // Save config to localStorage when it changes and re-search if needed
  const handleConfigChange = useCallback((newConfig: SearchConfig) => {
    setSearchConfig(newConfig);
    localStorage.setItem(SEARCH_CONFIG_KEY, JSON.stringify(newConfig));
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
  }, [query, fetchResults]);

  // Handle input change - trigger debounced quick search
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    setIsReranked(false); // Reset reranked state when typing
    if (newQuery.length >= 2) {
      debouncedSearch(newQuery, searchConfig);
    } else if (newQuery.length === 0) {
      setUnifiedResults([]);
      setAuthors([]);
      setHasSearched(false);
    }
  }, [debouncedSearch, searchConfig]);

  // Deep Search handler - applies full reranking
  const handleDeepSearch = useCallback(() => {
    if (query.length < 2) return;
    debouncedSearch.cancel(); // Cancel any pending debounced search
    fetchResults(query, searchConfig, true);
    // Update URL without navigation
    window.history.replaceState({}, "", `/search?q=${encodeURIComponent(query)}`);
  }, [query, searchConfig, fetchResults, debouncedSearch]);

  // Handle Enter key press - trigger Deep Search
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleDeepSearch();
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
    setHasSearched(false);
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
              className="text-base md:text-lg h-10 md:h-12 pl-9 pr-9 md:px-12 rounded-lg"
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
            onClick={handleDeepSearch}
            disabled={query.length < 2 || isLoading || isDeepSearching}
            className="h-10 md:h-12 px-3 md:px-6 shrink-0"
          >
            {isDeepSearching ? <Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin" /> : t("search.rerank")}
          </Button>
          <SearchConfigDropdown config={searchConfig} onChange={handleConfigChange} />
        </div>
      </div>

      {/* Results Section */}
      <div className="max-w-3xl mx-auto">
        {/* Loading State */}
        {(isLoading || isDeepSearching) && (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            {isDeepSearching && (
              <span className="text-sm text-muted-foreground">{t("search.reranking")}</span>
            )}
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && !isDeepSearching && (
          <div className="text-center py-12">
            <p className="text-red-500">{error}</p>
            <p className="text-muted-foreground mt-2">{t("search.error")}</p>
          </div>
        )}

        {/* No Results */}
        {hasSearched && !isLoading && !isDeepSearching && !error && unifiedResults.length === 0 && authors.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {t("search.noResults", { query })}
            </p>
          </div>
        )}

        {/* Authors Section */}
        {!isLoading && !isDeepSearching && authors.length > 0 && (
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

        {/* Unified Results Count and Rerank indicator */}
        {!isLoading && !isDeepSearching && unifiedResults.length > 0 && (
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              {t("search.results", { count: unifiedResults.length })}
            </p>
            {isReranked && (
              <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-full">
                {t("search.reranked")}
              </span>
            )}
          </div>
        )}

        {/* Unified Results List */}
        {!isLoading && !isDeepSearching && unifiedResults.length > 0 && (
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
              return <UnifiedSearchResult key={key} result={result} />;
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
