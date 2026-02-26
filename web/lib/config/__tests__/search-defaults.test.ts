import { describe, it, expect } from "vitest";
import {
  HADITH_COLLECTIONS,
  QURAN_TRANSLATIONS,
  DEFAULT_SEARCH_CONFIG,
  INTERNAL_CONFIG_KEYS,
} from "../search-defaults";

describe("HADITH_COLLECTIONS", () => {
  it("has no duplicate slugs", () => {
    const slugs = HADITH_COLLECTIONS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("has 6 primary collections (Kutub al-Sittah)", () => {
    const primary = HADITH_COLLECTIONS.filter((c) => c.group === "primary");
    expect(primary).toHaveLength(6);
  });

  it("every collection has a non-empty slug, nameEnglish, and nameArabic", () => {
    for (const c of HADITH_COLLECTIONS) {
      expect(c.slug.length).toBeGreaterThan(0);
      expect(c.nameEnglish.length).toBeGreaterThan(0);
      expect(c.nameArabic.length).toBeGreaterThan(0);
    }
  });

  it("every collection belongs to either 'primary' or 'other'", () => {
    for (const c of HADITH_COLLECTIONS) {
      expect(["primary", "other"]).toContain(c.group);
    }
  });
});

describe("QURAN_TRANSLATIONS", () => {
  it("has no duplicate codes", () => {
    const codes = QURAN_TRANSLATIONS.map((t) => t.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("has no duplicate editions (except none)", () => {
    const editions = QURAN_TRANSLATIONS.filter((t) => t.edition !== "").map((t) => t.edition);
    expect(new Set(editions).size).toBe(editions.length);
  });

  it("includes a 'none' option", () => {
    const none = QURAN_TRANSLATIONS.find((t) => t.code === "none");
    expect(none).toBeDefined();
    expect(none!.edition).toBe("");
  });

  it("includes English translation", () => {
    const en = QURAN_TRANSLATIONS.find((t) => t.code === "en");
    expect(en).toBeDefined();
    expect(en!.edition).toContain("eng-");
  });
});

describe("DEFAULT_SEARCH_CONFIG", () => {
  it("includes Quran and Hadith by default", () => {
    expect(DEFAULT_SEARCH_CONFIG.includeQuran).toBe(true);
    expect(DEFAULT_SEARCH_CONFIG.includeHadith).toBe(true);
  });

  it("excludes books by default", () => {
    expect(DEFAULT_SEARCH_CONFIG.includeBooks).toBe(false);
  });

  it("has hadithCollections that are a subset of HADITH_COLLECTIONS", () => {
    const allSlugs = new Set(HADITH_COLLECTIONS.map((c) => c.slug));
    for (const slug of DEFAULT_SEARCH_CONFIG.hadithCollections) {
      expect(allSlugs.has(slug)).toBe(true);
    }
  });

  it("excludes specific collections from default set", () => {
    const excluded = ["mustadrak", "mujam-kabir", "suyuti", "sunan-kubra-bayhaqi"];
    for (const slug of excluded) {
      expect(DEFAULT_SEARCH_CONFIG.hadithCollections).not.toContain(slug);
    }
  });

  it("has valid similarity cutoffs (0 < cutoff < 1)", () => {
    expect(DEFAULT_SEARCH_CONFIG.similarityCutoff).toBeGreaterThan(0);
    expect(DEFAULT_SEARCH_CONFIG.similarityCutoff).toBeLessThan(1);
    expect(DEFAULT_SEARCH_CONFIG.refineSimilarityCutoff).toBeGreaterThan(0);
    expect(DEFAULT_SEARCH_CONFIG.refineSimilarityCutoff).toBeLessThan(1);
  });
});

describe("INTERNAL_CONFIG_KEYS", () => {
  it("all keys exist in DEFAULT_SEARCH_CONFIG", () => {
    for (const key of INTERNAL_CONFIG_KEYS) {
      expect(key in DEFAULT_SEARCH_CONFIG).toBe(true);
    }
  });

  it("does not include user-facing keys", () => {
    const userFacing = [
      "includeQuran",
      "includeHadith",
      "reranker",
      "dateCalendar",
      "bookTitleDisplay",
      "quranTranslation",
      "hadithTranslation",
    ];
    for (const key of userFacing) {
      expect(INTERNAL_CONFIG_KEYS).not.toContain(key);
    }
  });
});
