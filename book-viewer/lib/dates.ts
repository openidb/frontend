/**
 * Date Utilities for Arabic Texts Library
 *
 * Centralizes all date conversion and formatting logic.
 * - Storage: All dates stored as Western numerals (0-9)
 * - Display: AH first format (e.g., "728 AH / 1328 CE")
 */

/**
 * Convert Arabic numerals (٠-٩) to Western numerals (0-9)
 * Used for normalizing data from Shamela backup
 */
export function arabicToWestern(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/٠/g, "0")
    .replace(/١/g, "1")
    .replace(/٢/g, "2")
    .replace(/٣/g, "3")
    .replace(/٤/g, "4")
    .replace(/٥/g, "5")
    .replace(/٦/g, "6")
    .replace(/٧/g, "7")
    .replace(/٨/g, "8")
    .replace(/٩/g, "9");
}

/**
 * Convert Western numerals (0-9) to Arabic numerals (٠-٩)
 * Used for Arabic-language display when needed
 */
export function westernToArabic(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/0/g, "٠")
    .replace(/1/g, "١")
    .replace(/2/g, "٢")
    .replace(/3/g, "٣")
    .replace(/4/g, "٤")
    .replace(/5/g, "٥")
    .replace(/6/g, "٦")
    .replace(/7/g, "٧")
    .replace(/8/g, "٨")
    .replace(/9/g, "٩");
}

/**
 * Normalize a date string by converting any Arabic numerals to Western
 * Returns null if the input is null/undefined/empty
 */
export function normalizeDate(date: string | null | undefined): string | null {
  if (!date) return null;
  const normalized = arabicToWestern(date).trim();
  return normalized || null;
}

interface AuthorDates {
  birthDateHijri?: string | null;
  deathDateHijri?: string | null;
  birthDateGregorian?: string | null;
  deathDateGregorian?: string | null;
}

/**
 * Format author lifespan for display
 * Returns formats like:
 * - "728 AH / 1328 CE" (death only)
 * - "d. 728 AH / 1328 CE" (death only, with prefix)
 * - "680-728 AH / 1281-1328 CE" (birth and death)
 */
export function formatAuthorDates(
  author: AuthorDates,
  options: { includeDeathPrefix?: boolean } = {}
): string {
  const { includeDeathPrefix = false } = options;

  const birthHijri = arabicToWestern(author.birthDateHijri);
  const deathHijri = arabicToWestern(author.deathDateHijri);
  const birthGregorian = arabicToWestern(author.birthDateGregorian);
  const deathGregorian = arabicToWestern(author.deathDateGregorian);

  // No dates available
  if (!deathHijri && !deathGregorian && !birthHijri && !birthGregorian) {
    return "";
  }

  const parts: string[] = [];

  // Build Hijri part
  if (birthHijri || deathHijri) {
    let hijriPart = "";
    if (birthHijri && deathHijri) {
      hijriPart = `${birthHijri}-${deathHijri} AH`;
    } else if (deathHijri) {
      hijriPart = includeDeathPrefix ? `d. ${deathHijri} AH` : `${deathHijri} AH`;
    } else if (birthHijri) {
      hijriPart = `b. ${birthHijri} AH`;
    }
    if (hijriPart) parts.push(hijriPart);
  }

  // Build Gregorian part
  if (birthGregorian || deathGregorian) {
    let gregorianPart = "";
    if (birthGregorian && deathGregorian) {
      gregorianPart = `${birthGregorian}-${deathGregorian} CE`;
    } else if (deathGregorian) {
      gregorianPart = includeDeathPrefix && !deathHijri
        ? `d. ${deathGregorian} CE`
        : `${deathGregorian} CE`;
    } else if (birthGregorian) {
      gregorianPart = `b. ${birthGregorian} CE`;
    }
    if (gregorianPart) parts.push(gregorianPart);
  }

  return parts.join(" / ");
}

/**
 * Format a year for display (AH first, then CE)
 * Used for book publication years or author death years
 * Returns: "728 AH / 1328 CE" or "728 AH" or "1328 CE" or ""
 */
export function formatYear(
  hijri?: string | null,
  gregorian?: string | null
): string {
  const h = arabicToWestern(hijri);
  const g = arabicToWestern(gregorian);

  if (h && g) {
    return `${h} AH / ${g} CE`;
  }
  if (h) {
    return `${h} AH`;
  }
  if (g) {
    return `${g} CE`;
  }
  return "";
}

interface BookYearResult {
  year: string;
  isPublicationYear: boolean;
}

/**
 * Format author death year for book display
 * Prefers death year, falls back to publication year
 * Returns both the formatted string and whether it's a publication year
 */
export function formatBookYear(book: {
  author?: {
    deathDateHijri?: string | null;
    deathDateGregorian?: string | null;
  } | null;
  publicationYearHijri?: string | null;
  publicationYearGregorian?: string | null;
}): BookYearResult {
  // Primary: Use author's death year
  if (book.author?.deathDateHijri || book.author?.deathDateGregorian) {
    return {
      year: formatYear(book.author.deathDateHijri, book.author.deathDateGregorian),
      isPublicationYear: false,
    };
  }

  // Fallback: Use publication year
  if (book.publicationYearHijri || book.publicationYearGregorian) {
    return {
      year: formatYear(book.publicationYearHijri, book.publicationYearGregorian),
      isPublicationYear: true,
    };
  }

  return { year: "", isPublicationYear: false };
}

/**
 * Extract numeric year from a date string
 * Handles formats like "728", "728 AH", etc.
 */
export function extractYear(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const normalized = arabicToWestern(dateStr);
  const match = normalized.match(/\d+/);
  if (!match) return null;
  const year = parseInt(match[0], 10);
  return isNaN(year) ? null : year;
}

/**
 * Calculate the Hijri century from a year
 * 1-100 = 1st century, 101-200 = 2nd century, etc.
 */
export function getHijriCentury(year: number): number {
  return Math.ceil(year / 100);
}

/**
 * Format century with ordinal suffix
 * 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th", etc.
 */
export function formatOrdinal(n: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

/**
 * Get century label for display
 * Returns: { value: "3", label: "3rd century AH", labelArabic: "القرن الثالث" }
 */
export function getCenturyLabel(century: number): {
  value: string;
  label: string;
  labelArabic: string;
} {
  const arabicOrdinals: Record<number, string> = {
    1: "الأول",
    2: "الثاني",
    3: "الثالث",
    4: "الرابع",
    5: "الخامس",
    6: "السادس",
    7: "السابع",
    8: "الثامن",
    9: "التاسع",
    10: "العاشر",
    11: "الحادي عشر",
    12: "الثاني عشر",
    13: "الثالث عشر",
    14: "الرابع عشر",
    15: "الخامس عشر",
  };

  return {
    value: century.toString(),
    label: `${formatOrdinal(century)} century AH`,
    labelArabic: `القرن ${arabicOrdinals[century] || century}`,
  };
}

/**
 * Get the Hijri century for a book based on author's death date
 */
export function getBookCentury(book: {
  author?: {
    deathDateHijri?: string | null;
  } | null;
}): number | null {
  const year = extractYear(book.author?.deathDateHijri);
  if (!year) return null;
  return getHijriCentury(year);
}

/**
 * Check if an author is from the 15th century Hijri or later (1400+ AH)
 * These are modern/contemporary authors
 * Returns false for authors with no death date (to preserve classical authors with missing data)
 */
export function is15thCenturyHijriOrLater(deathDateHijri: string | null | undefined): boolean {
  const year = extractYear(deathDateHijri);
  // If no death date, keep the book (might be classical author with missing data)
  if (year === null) return false;
  return year >= 1400;
}

/**
 * Check if an author is modern (15th century Hijri / ~1979 CE or later)
 * Checks death dates, birth dates, and optionally publication years
 * Returns false for authors with no conclusive modern indicators
 */
export function isModernAuthor(
  deathDateHijri: string | null | undefined,
  deathDateGregorian: string | null | undefined,
  birthDateHijri?: string | null,
  birthDateGregorian?: string | null
): boolean {
  // Check Hijri death date (1400+ AH = 15th century or later)
  const hijriDeathYear = extractYear(deathDateHijri);
  if (hijriDeathYear !== null && hijriDeathYear >= 1400) {
    return true;
  }

  // Check Gregorian death date (1979+ CE corresponds roughly to 1400 AH)
  const gregorianDeathYear = extractYear(deathDateGregorian);
  if (gregorianDeathYear !== null && gregorianDeathYear >= 1979) {
    return true;
  }

  // Check birth dates - if born recently, they're modern (likely still alive)
  const hijriBirthYear = extractYear(birthDateHijri);
  if (hijriBirthYear !== null && hijriBirthYear >= 1300) { // 1300 AH = ~1882 CE
    return true;
  }

  const gregorianBirthYear = extractYear(birthDateGregorian);
  if (gregorianBirthYear !== null && gregorianBirthYear >= 1900) {
    return true;
  }

  // No conclusive modern dates found
  return false;
}

/**
 * Check if a book is from the 15th century Hijri or later (1400+ AH)
 * Checks author's death date first, then falls back to publication year
 */
export function isBook15thCenturyOrLater(
  authorDeathDateHijri: string | null | undefined,
  publicationYearHijri: string | null | undefined
): boolean {
  const deathYear = extractYear(authorDeathDateHijri);

  // If author has a death date, use that
  if (deathYear !== null) {
    return deathYear >= 1400;
  }

  // If no death date, check publication year (if published in 15th century, it's contemporary)
  const pubYear = extractYear(publicationYearHijri);
  if (pubYear !== null) {
    return pubYear >= 1400;
  }

  // No dates available - keep the book (might be classical)
  return false;
}
