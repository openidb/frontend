"use client";

import Link from "next/link";
import { BookOpen, FileText, ExternalLink } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

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
  book: {
    id: string;
    titleArabic: string;
    titleLatin: string;
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
  collectionSlug: string;
  collectionNameArabic: string;
  collectionNameEnglish: string;
  bookNumber: number;
  bookNameArabic: string;
  bookNameEnglish: string;
  hadithNumber: string;
  text: string;
  chapterArabic: string | null;
  chapterEnglish: string | null;
  sunnahComUrl: string;
}

// Unified result type that wraps all content types
export type UnifiedResult =
  | { type: "quran"; data: AyahResultData; score: number }
  | { type: "hadith"; data: HadithResultData; score: number }
  | { type: "book"; data: BookResultData; score: number };

// Score tag component for displaying final score and reranked position
function ScoreTag({ score, rank }: { score?: number; rank?: number }) {
  if (score === undefined && rank === undefined) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
      {score !== undefined && `rank: ${score.toFixed(2)}`}
      {score !== undefined && rank !== undefined && ", "}
      {rank !== undefined && `#${rank}`}
    </span>
  );
}

interface SearchResultProps {
  result: BookResultData;
}

export default function SearchResult({ result }: SearchResultProps) {
  const { t } = useTranslation();

  if (!result.book) return null;

  const { book, pageNumber, volumeNumber, highlightedSnippet, urlPageIndex } = result;

  // Build the reader URL with pn (page number) parameter - uses unique sequential page number
  // that maps directly to EPUB file names like page_0967.xhtml
  const readerUrl = `/reader/${book.id}?pn=${pageNumber}`;

  return (
    <Link
      href={readerUrl}
      className="block p-4 border rounded-lg hover:border-muted-foreground hover:shadow-sm transition-all"
    >
      {/* Header: Book Title */}
      <div className="mb-2">
        <h3 className="text-lg font-semibold truncate text-foreground" dir="rtl">
          {book.titleArabic}
        </h3>
        <p className="text-sm truncate text-muted-foreground">
          {book.titleLatin}
        </p>
      </div>

      {/* Author */}
      <div className="flex items-center gap-1 text-sm mb-3 text-muted-foreground">
        <BookOpen className="h-3.5 w-3.5" />
        <span dir="rtl">{book.author.nameArabic}</span>
        <span className="text-border">|</span>
        <span>{book.author.nameLatin}</span>
      </div>

      {/* Page/Volume Info */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="inline-flex items-center gap-1 text-xs bg-muted text-muted-foreground px-2 py-1 rounded">
          <FileText className="h-3 w-3" />
          {t("results.page")} {urlPageIndex || pageNumber}
          {volumeNumber > 1 && `, ${t("results.volume")} ${volumeNumber}`}
        </span>
        <ScoreTag score={result.score} rank={result.rank} />
      </div>

      {/* Text Snippet with Highlights */}
      <div
        className="text-sm line-clamp-3 text-foreground"
        dir="rtl"
        dangerouslySetInnerHTML={{ __html: highlightedSnippet }}
      />

      {/* Style for highlighted text */}
      <style jsx global>{`
        mark {
          background-color: #fef08a;
          padding: 0 2px;
          border-radius: 2px;
        }
      `}</style>
    </Link>
  );
}

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
    juzNumber: number;
    pageNumber: number;
    quranComUrl: string;
    isChunk?: boolean;
    wordCount?: number;
  };
}

export function AyahResult({ ayah }: AyahResultProps) {
  const { t } = useTranslation();

  // Determine the ayah label (single ayah or range)
  const ayahLabel = ayah.ayahEnd && ayah.ayahEnd !== ayah.ayahNumber
    ? `آيات ${ayah.ayahNumber}-${ayah.ayahEnd}`
    : `آية ${ayah.ayahNumber}`;

  // Hide text for full surah results (chunks starting from ayah 1)
  const isFullSurah = ayah.isChunk && ayah.ayahNumber === 1;

  return (
    <a
      href={ayah.quranComUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-4 border rounded-lg hover:border-muted-foreground hover:shadow-sm transition-all"
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
        <ScoreTag score={ayah.score} rank={ayah.rank} />
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
          {ayah.translation}
        </div>
      )}
    </a>
  );
}

// Component for Hadith results
interface HadithResultProps {
  hadith: {
    score: number;
    semanticScore?: number;
    rank?: number;
    collectionSlug: string;
    collectionNameArabic: string;
    collectionNameEnglish: string;
    bookNumber: number;
    bookNameArabic: string;
    bookNameEnglish: string;
    hadithNumber: string;
    text: string;
    chapterArabic: string | null;
    chapterEnglish: string | null;
    sunnahComUrl: string;
  };
}

export function HadithResult({ hadith }: HadithResultProps) {
  const { t } = useTranslation();

  return (
    <a
      href={hadith.sunnahComUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-4 border rounded-lg hover:border-muted-foreground hover:shadow-sm transition-all"
    >
      {/* Type Tag */}
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">
          {t("results.hadith")}
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <ExternalLink className="h-3 w-3" />
          sunnah.com
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
          حديث {hadith.hadithNumber.replace(/[A-Z]+$/, '')}
        </span>
        <span className="inline-flex items-center gap-1 text-xs bg-muted text-muted-foreground px-2 py-1 rounded">
          <FileText className="h-3 w-3" />
          {t("results.book")} {hadith.bookNumber}
        </span>
        <ScoreTag score={hadith.score} rank={hadith.rank} />
      </div>

      {/* Hadith Text */}
      <div
        className="text-sm line-clamp-3 text-foreground"
        dir="rtl"
      >
        {hadith.text}
      </div>
    </a>
  );
}

// Unified result component that renders the appropriate card based on type
interface UnifiedSearchResultProps {
  result: UnifiedResult;
}

export function UnifiedSearchResult({ result }: UnifiedSearchResultProps) {
  switch (result.type) {
    case "quran":
      return <AyahResult ayah={result.data} />;
    case "hadith":
      return <HadithResult hadith={result.data} />;
    case "book":
      return <SearchResult result={result.data} />;
    default:
      return null;
  }
}
