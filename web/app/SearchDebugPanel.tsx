"use client";

import { Bug } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import AlgorithmDescription from "@/components/AlgorithmDescription";

interface TopResultBreakdown {
  rank: number;
  type: 'book' | 'quran' | 'hadith';
  title: string;
  keywordScore: number | null;
  semanticScore: number | null;
  finalScore: number;
  matchType: 'semantic' | 'keyword' | 'both';
}

interface ExpandedQueryStats {
  query: string;
  weight: number;
  reason?: string;
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

interface SearchDebugPanelProps {
  debugStats: DebugStats;
  showAlgorithm: boolean;
  onToggleAlgorithm: () => void;
}

export function SearchDebugPanel({ debugStats, showAlgorithm, onToggleAlgorithm }: SearchDebugPanelProps) {
  const { t } = useTranslation();

  return (
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
            <div><span className="text-muted-foreground">Author Search:</span> <span className="font-mono">{debugStats.timing.authorSearch}ms</span></div>
            {debugStats.timing.rerank !== undefined && (
              <div><span className="text-muted-foreground">Rerank:</span> <span className="font-mono">{debugStats.timing.rerank}ms</span></div>
            )}
            <div><span className="text-muted-foreground">Translations:</span> <span className="font-mono">{debugStats.timing.translations}ms</span></div>
            <div><span className="text-muted-foreground">Book Meta:</span> <span className="font-mono">{debugStats.timing.bookMetadata}ms</span></div>
            {debugStats.timing.graph !== undefined && (
              <div><span className="text-muted-foreground">Graph:</span> <span className="font-mono">{debugStats.timing.graph}ms</span></div>
            )}
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
            onClick={onToggleAlgorithm}
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
              <span className="text-muted-foreground">Embeddings:</span>{" "}
              {debugStats.algorithm.embeddingTechnique === "metadata-translation" ? (
                <>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-600">metadata + translation</span>
                  <span className="text-muted-foreground">(metadata-prefixed Arabic with English translation)</span>
                </>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-600">original text</span>
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
                {/* Match type badge */}
                <span className={`px-1 rounded text-[10px] ${
                  r.matchType === 'both' ? 'bg-purple-500/20 text-purple-600' :
                  r.matchType === 'semantic' ? 'bg-cyan-500/20 text-cyan-600' :
                  'bg-yellow-500/20 text-yellow-600'
                }`}>
                  {r.matchType === 'both' ? 'sem+kw' : r.matchType === 'semantic' ? 'sem' : 'kw'}
                </span>
                <span className="truncate max-w-[150px]" dir="auto" title={r.title}>{r.title}</span>
                {/* Show scores with weights applied */}
                <span className="text-muted-foreground ml-auto text-[10px]">
                  {r.matchType === 'both' ? (
                    <>
                      kw={r.keywordScore?.toFixed(2)}×0.3 |
                      sem={r.semanticScore?.toFixed(3)}×0.8 |
                    </>
                  ) : r.matchType === 'semantic' ? (
                    <>sem={r.semanticScore?.toFixed(3)}×1.0 |</>
                  ) : (
                    <>kw={r.keywordScore?.toFixed(2)}×1.0 |</>
                  )}
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
              <span className="text-muted-foreground">&rarr;</span>
              <span className="bg-background rounded px-2 py-0.5">
                {debugStats.refineStats.candidates.afterMerge.books + debugStats.refineStats.candidates.afterMerge.ayahs + debugStats.refineStats.candidates.afterMerge.hadiths} unique
                <span className="text-muted-foreground ml-1">
                  ({debugStats.refineStats.candidates.afterMerge.books}b/{debugStats.refineStats.candidates.afterMerge.ayahs}a/{debugStats.refineStats.candidates.afterMerge.hadiths}h)
                </span>
              </span>
              <span className="text-muted-foreground">&rarr;</span>
              <span className="bg-background rounded px-2 py-0.5">{debugStats.refineStats.candidates.sentToReranker} reranked</span>
            </div>
          </div>

          {/* Expanded Queries */}
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Expanded Queries ({debugStats.refineStats.expandedQueries.length}):</div>
            <div className="space-y-1 font-mono text-xs">
              {debugStats.refineStats.expandedQueries.map((eq, i) => (
                <div key={i} className="flex gap-2 bg-background rounded px-2 py-1 items-center">
                  {eq.reason && (
                    <span className={`text-[10px] px-1 rounded shrink-0 ${
                      eq.reason === "Original query" ? "bg-gray-500/20 text-gray-600" :
                      eq.reason === "Enhanced Arabic" ? "bg-blue-500/20 text-blue-600" :
                      "bg-green-500/20 text-green-600"
                    }`}>{eq.reason === "Original query" ? "original" : eq.reason === "Enhanced Arabic" ? "arabic" : "answer"}</span>
                  )}
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
  );
}
