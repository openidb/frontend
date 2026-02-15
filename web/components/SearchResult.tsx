"use client";

import React from "react";
import { PrefetchLink } from "./PrefetchLink";
import { BookOpen, FileText, ExternalLink, Loader2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { sanitizeHighlight } from "@/lib/utils";
import type { TranslationDisplayOption } from "@/lib/config/search-defaults";
import { trackClick } from "@/lib/analytics";

// Format translation source/model names for display
const SOURCE_LABELS: Record<string, string> = {
  "sunnah.com": "Sunnah.com",
  "hadithunlocked.com": "HadithUnlocked.com",
  "llm": "AI",
};

function formatSourceLabel(source: string): string {
  return SOURCE_LABELS[source] || source;
}

// Type definitions for result data
export interface BookResultData {
  score: number;
  semanticScore?: number;
  rank?: number;
  bookId: string;
  pageNumber: number;
  volumeNumber: number;
  textSnippet: string;
  highlightedSnippet: string;
  matchType: "semantic" | "keyword" | "both";
  urlPageIndex?: string;
  contentTranslation?: string | null;  // Cached translation of the matched paragraph
  contentTranslationModel?: string | null;
  book: {
    id: string;
    titleArabic: string;
    titleLatin: string;
    titleTranslated?: string | null;
    filename: string;
    author: {
      nameArabic: string;
      nameLatin: string;
    };
  } | null;
}

export interface AyahResultData {
  score: number;
  semanticScore?: number;
  rank?: number;
  surahNumber: number;
  ayahNumber: number;
  ayahEnd?: number;           // End ayah for chunks (undefined for single ayahs)
  ayahNumbers?: number[];     // All ayah numbers in chunk
  surahNameArabic: string;
  surahNameEnglish: string;
  text: string;
  translation?: string;       // Translation text in user's preferred language
  translationEditionId?: string;
  translationName?: string;
  translationSource?: string;
  juzNumber: number;
  pageNumber: number;
  quranComUrl: string;
  isChunk?: boolean;          // True if this is a chunked result
  wordCount?: number;         // Word count for the chunk
}

export interface HadithResultData {
  score: number;
  semanticScore?: number;
  rank?: number;
  bookId?: number;
  collectionSlug: string;
  collectionNameArabic: string;
  collectionNameEnglish: string;
  bookNumber: number;
  bookNameArabic: string;
  bookNameEnglish: string;
  hadithNumber: string;
  numberInCollection?: string | null;
  text: string;
  chapterArabic: string | null;
  chapterEnglish: string | null;
  sourceUrl: string;
  translation?: string;  // English translation (when requested)
  translationSource?: string;
  translationPending?: boolean;
}

// Unified result type that wraps all content types
export type UnifiedResult =
  | { type: "quran"; data: AyahResultData; score: number }
  | { type: "hadith"; data: HadithResultData; score: number };

interface SearchResultProps {
  result: BookResultData;
  bookTitleDisplay?: TranslationDisplayOption;
  showAuthorTransliteration?: boolean;
  searchEventId?: string | null;
}

function SearchResultInner({ result, bookTitleDisplay = "none", showAuthorTransliteration = true, searchEventId }: SearchResultProps) {
  const { t } = useTranslation();

  if (!result.book) return null;

  const { book, pageNumber, volumeNumber, highlightedSnippet, urlPageIndex } = result;

  // Build the reader URL with pn (page number) parameter - uses unique sequential page number
  // that maps directly to EPUB file names like page_0967.xhtml
  const readerUrl = `/reader/${book.id}?pn=${pageNumber}`;

  // Determine secondary title based on bookTitleDisplay setting
  const getSecondaryTitle = (): string | null => {
    if (bookTitleDisplay === "none") {
      return null;
    }
    if (bookTitleDisplay === "transliteration") {
      return book.titleLatin;
    }
    // "translation" — use translated title if available, fallback to transliteration
    return book.titleTranslated || book.titleLatin;
  };

  const secondaryTitle = getSecondaryTitle();

  return (
    <PrefetchLink
      href={readerUrl}
      className="block p-4 border rounded-lg hover:border-muted-foreground hover:shadow-sm transition-all bg-card"
      onClick={() => {
        if (searchEventId) {
          trackClick(searchEventId, `${book.id}:${pageNumber}`, "book", result.rank ?? 0);
        }
      }}
    >
      {/* Header: Book Title */}
      <div className="mb-2">
        <h3 className="text-lg font-semibold truncate text-foreground" dir="rtl">
          {book.titleArabic}
        </h3>
        {secondaryTitle && (
          <p className="text-sm truncate text-muted-foreground">
            {secondaryTitle}
          </p>
        )}
      </div>

      {/* Author */}
      <div className="flex items-center gap-1 text-sm mb-3 text-muted-foreground">
        <BookOpen className="h-3.5 w-3.5" />
        <span dir="rtl">{book.author.nameArabic}</span>
        {showAuthorTransliteration && (
          <>
            <span className="text-border">|</span>
            <span>{book.author.nameLatin}</span>
          </>
        )}
      </div>

      {/* Page/Volume Info */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="inline-flex items-center gap-1 text-xs bg-muted text-muted-foreground px-2 py-1 rounded">
          <FileText className="h-3 w-3" />
          {t("results.page")} {urlPageIndex || pageNumber}
          {volumeNumber > 1 && `, ${t("results.volume")} ${volumeNumber}`}
        </span>
      </div>

      {/* Text Snippet with Highlights */}
      <div
        className="text-sm line-clamp-3 text-foreground"
        dir="rtl"
        dangerouslySetInnerHTML={{ __html: sanitizeHighlight(highlightedSnippet) }}
      />

      {/* Content Translation - from database cache */}
      {result.contentTranslation && (
        <div
          className="text-sm text-muted-foreground mt-2 line-clamp-2 italic border-t border-border/50 pt-2"
          dir="auto"
        >
          {result.contentTranslationModel && "[AI Translation] "}
          {result.contentTranslation}
        </div>
      )}

      {/* Style for highlighted text */}
      <style jsx global>{`
        mark {
          background-color: #fef08a;
          padding: 0 2px;
          border-radius: 2px;
        }
      `}</style>
    </PrefetchLink>
  );
}

const SearchResult = React.memo(SearchResultInner);
export default SearchResult;

// Separate component for Quran ayah results
interface AyahResultProps {
  ayah: {
    score: number;
    semanticScore?: number;
    rank?: number;
    surahNumber: number;
    ayahNumber: number;
    ayahEnd?: number;
    ayahNumbers?: number[];
    surahNameArabic: string;
    surahNameEnglish: string;
    text: string;
    translation?: string;
    translationEditionId?: string;
    translationName?: string;
    translationSource?: string;
    juzNumber: number;
    pageNumber: number;
    quranComUrl: string;
    isChunk?: boolean;
    wordCount?: number;
  };
  searchEventId?: string | null;
}

function AyahResultInner({ ayah, searchEventId }: AyahResultProps) {
  const { t } = useTranslation();

  // Determine the ayah label (single ayah or range)
  const ayahLabel = ayah.ayahEnd && ayah.ayahEnd !== ayah.ayahNumber
    ? `${t("results.ayahRange")} ${ayah.ayahNumber}-${ayah.ayahEnd}`
    : `${t("results.ayahSingle")} ${ayah.ayahNumber}`;

  // Hide text for full surah results (chunks starting from ayah 1)
  const isFullSurah = ayah.isChunk && ayah.ayahNumber === 1;

  return (
    <a
      href={ayah.quranComUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-4 border rounded-lg border-s-4 border-s-emerald-500 hover:border-muted-foreground hover:border-s-emerald-500 hover:shadow-sm transition-all bg-card"
      onClick={() => {
        if (searchEventId) {
          trackClick(searchEventId, `${ayah.surahNumber}:${ayah.ayahNumber}`, "quran", ayah.rank ?? 0);
        }
      }}
    >
      {/* Type Tag */}
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-medium">
          {t("results.quran")}
        </span>
        {ayah.isChunk && (
          <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded">
            {ayah.ayahNumbers?.length || (ayah.ayahEnd ? ayah.ayahEnd - ayah.ayahNumber + 1 : 1)} {t("results.ayahs")}
          </span>
        )}
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <ExternalLink className="h-3 w-3" />
          quran.com
        </span>
      </div>

      {/* Header */}
      <div className="mb-2">
        <h3 className="text-lg font-semibold truncate text-foreground" dir="rtl">
          {ayah.surahNameArabic}
        </h3>
        <p className="text-sm truncate text-muted-foreground">
          {t("results.surah")} {ayah.surahNameEnglish}
        </p>
      </div>

      {/* Surah/Ayah Info */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="inline-flex items-center gap-1 text-xs bg-muted text-muted-foreground px-2 py-1 rounded" dir="rtl">
          {ayahLabel}
        </span>
        <span className="inline-flex items-center gap-1 text-xs bg-muted text-muted-foreground px-2 py-1 rounded">
          <FileText className="h-3 w-3" />
          {t("results.juz")} {ayah.juzNumber}
        </span>
      </div>

      {/* Ayah Text - hide for full surah results */}
      {!isFullSurah && (
        <div
          className="text-sm line-clamp-3 text-foreground"
          dir="rtl"
        >
          {ayah.text}
        </div>
      )}

      {/* Translation - hide for full surah results */}
      {!isFullSurah && ayah.translation && (
        <div
          className="text-sm text-muted-foreground mt-2 line-clamp-2 italic border-t border-border/50 pt-2"
          dir="auto"
        >
          {ayah.translationName && (
            <span className="not-italic font-medium text-xs">[{ayah.translationName} Translation]</span>
          )}{" "}
          {ayah.translation}
        </div>
      )}
    </a>
  );
}

export const AyahResult = React.memo(AyahResultInner);

// Component for Hadith results
interface HadithResultProps {
  hadith: {
    score: number;
    semanticScore?: number;
    rank?: number;
    bookId?: number;
    collectionSlug: string;
    collectionNameArabic: string;
    collectionNameEnglish: string;
    bookNumber: number;
    bookNameArabic: string;
    bookNameEnglish: string;
    hadithNumber: string;
    numberInCollection?: string | null;
    text: string;
    chapterArabic: string | null;
    chapterEnglish: string | null;
    sourceUrl: string;
    translation?: string;
    translationSource?: string;
    translationPending?: boolean;
  };
  searchEventId?: string | null;
}

function HadithResultInner({ hadith, searchEventId }: HadithResultProps) {
  const { t } = useTranslation();

  return (
    <a
      href={hadith.sourceUrl || "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-4 border rounded-lg border-s-4 border-s-amber-500 hover:border-muted-foreground hover:border-s-amber-500 hover:shadow-sm transition-all bg-card"
      onClick={() => {
        if (searchEventId) {
          trackClick(searchEventId, `${hadith.collectionSlug}:${hadith.hadithNumber}`, "hadith", hadith.rank ?? 0);
        }
      }}
    >
      {/* Type Tag */}
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">
          {t("results.hadith")}
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <ExternalLink className="h-3 w-3" />
          {hadith.sourceUrl?.includes("hadithunlocked.com") ? "hadithunlocked.com" : "sunnah.com"}
        </span>
      </div>

      {/* Header: Collection name */}
      <div className="mb-2">
        <h3 className="text-lg font-semibold truncate text-foreground" dir="rtl">
          {hadith.collectionNameArabic}
        </h3>
        <p className="text-sm truncate text-muted-foreground">
          {hadith.collectionNameEnglish}
        </p>
      </div>

      {/* Book name */}
      {hadith.bookNameArabic && (
        <div className="flex items-center gap-1 text-sm mb-3 text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5" />
          <span dir="rtl">{hadith.bookNameArabic}</span>
        </div>
      )}

      {/* Hadith/Book Info */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="inline-flex items-center gap-1 text-xs bg-muted text-muted-foreground px-2 py-1 rounded" dir="rtl">
          {t("results.hadithNumber")} {(hadith.numberInCollection || hadith.hadithNumber).replace(/[A-Z]+$/, '')}
        </span>
        <span className="inline-flex items-center gap-1 text-xs bg-muted text-muted-foreground px-2 py-1 rounded">
          <FileText className="h-3 w-3" />
          {t("results.book")} {hadith.bookNumber}
        </span>
      </div>

      {/* Hadith Text */}
      <div
        className="text-sm line-clamp-3 text-foreground"
        dir="rtl"
      >
        {hadith.text}
      </div>

      {/* Pending Translation Indicator */}
      {hadith.translationPending && !hadith.translation && (
        <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5 italic">
          <Loader2 className="h-3 w-3 animate-spin" />
          Translating...
        </div>
      )}

      {/* Translation */}
      {hadith.translation && (
        <div
          className="text-sm text-muted-foreground mt-2 line-clamp-3 italic border-t border-border/50 pt-2"
          dir="auto"
        >
          {hadith.translationSource && (
            <span className="not-italic font-medium text-xs">[{formatSourceLabel(hadith.translationSource)} Translation]</span>
          )}{" "}
          {hadith.translation}
        </div>
      )}
    </a>
  );
}

export const HadithResult = React.memo(HadithResultInner);

// Unified result component that renders the appropriate card based on type
interface UnifiedSearchResultProps {
  result: UnifiedResult;
  searchEventId?: string | null;
}

export function UnifiedSearchResult({ result, searchEventId }: UnifiedSearchResultProps) {
  switch (result.type) {
    case "quran":
      return <AyahResult ayah={result.data} searchEventId={searchEventId} />;
    case "hadith":
      return <HadithResult hadith={result.data} searchEventId={searchEventId} />;
    default:
      return null;
  }
}
