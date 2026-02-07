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
function arabicToWestern(str: string | null | undefined): string {
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
function extractYear(dateStr: string | null | undefined): number | null {
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
function getHijriCentury(year: number): number {
  return Math.ceil(year / 100);
}

/**
 * Format century with ordinal suffix
 * 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th", etc.
 */
function formatOrdinal(n: number): string {
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

