import { describe, it, expect } from "vitest";
import { applyInternalDefaults, syncTranslationsToLocale, migrateStoredConfig } from "../utils";
import { DEFAULT_SEARCH_CONFIG, INTERNAL_CONFIG_KEYS } from "../search-defaults";

describe("applyInternalDefaults", () => {
  it("resets all internal config keys to defaults", () => {
    const custom = {
      ...DEFAULT_SEARCH_CONFIG,
      similarityCutoff: 0.99,
      refineSimilarityCutoff: 0.99,
      fuzzyEnabled: false,
      preRerankLimit: 999,
      postRerankLimit: 999,
    };
    const result = applyInternalDefaults(custom);
    for (const key of INTERNAL_CONFIG_KEYS) {
      expect(result[key]).toBe(DEFAULT_SEARCH_CONFIG[key]);
    }
  });

  it("preserves user-facing config keys", () => {
    const custom = {
      ...DEFAULT_SEARCH_CONFIG,
      includeQuran: false,
      includeHadith: false,
      reranker: "jina" as const,
      dateCalendar: "hijri" as const,
    };
    const result = applyInternalDefaults(custom);
    expect(result.includeQuran).toBe(false);
    expect(result.includeHadith).toBe(false);
    expect(result.reranker).toBe("jina");
    expect(result.dateCalendar).toBe("hijri");
  });

  it("does not mutate the input object", () => {
    const original = { ...DEFAULT_SEARCH_CONFIG, similarityCutoff: 0.99 };
    applyInternalDefaults(original);
    expect(original.similarityCutoff).toBe(0.99);
  });
});

describe("syncTranslationsToLocale", () => {
  it("disables translations for Arabic locale", () => {
    const config = { ...DEFAULT_SEARCH_CONFIG, quranTranslation: "en", hadithTranslation: "en" };
    const result = syncTranslationsToLocale(config, "ar");
    expect(result.quranTranslation).toBe("none");
    expect(result.hadithTranslation).toBe("none");
    expect(result.bookTitleDisplay).toBe("none");
    expect(result.showAuthorTransliteration).toBe(false);
  });

  it("enables translations for non-Arabic locale", () => {
    const config = { ...DEFAULT_SEARCH_CONFIG, quranTranslation: "none", hadithTranslation: "none" };
    const result = syncTranslationsToLocale(config, "fr");
    expect(result.quranTranslation).toBe("fr");
    expect(result.hadithTranslation).toBe("fr");
    expect(result.showAuthorTransliteration).toBe(true);
  });

  it("returns same reference when no changes needed", () => {
    const config = {
      ...DEFAULT_SEARCH_CONFIG,
      quranTranslation: "fr",
      hadithTranslation: "fr",
      showAuthorTransliteration: true,
    };
    const result = syncTranslationsToLocale(config, "fr");
    expect(result).toBe(config); // Same reference = no changes
  });

  it("returns same reference for Arabic when already configured", () => {
    const config = {
      ...DEFAULT_SEARCH_CONFIG,
      quranTranslation: "none",
      hadithTranslation: "none",
      bookTitleDisplay: "none" as const,
      showAuthorTransliteration: false,
    };
    const result = syncTranslationsToLocale(config, "ar");
    expect(result).toBe(config);
  });

  it("syncs to each supported language", () => {
    const config = { ...DEFAULT_SEARCH_CONFIG, quranTranslation: "none" };
    for (const locale of ["es", "zh", "ja", "ko"]) {
      const result = syncTranslationsToLocale(config, locale);
      expect(result.quranTranslation).toBe(locale);
      expect(result.hadithTranslation).toBe(locale);
    }
  });
});

describe("migrateStoredConfig", () => {
  it("migrates showTransliterations=true to bookTitleDisplay='transliteration'", () => {
    const result = migrateStoredConfig({ showTransliterations: true });
    expect(result.bookTitleDisplay).toBe("transliteration");
    expect(result.showTransliterations).toBeUndefined();
  });

  it("migrates showTransliterations=false to bookTitleDisplay='none'", () => {
    const result = migrateStoredConfig({ showTransliterations: false });
    expect(result.bookTitleDisplay).toBe("none");
    expect(result.showTransliterations).toBeUndefined();
  });

  it("does not overwrite existing bookTitleDisplay", () => {
    const result = migrateStoredConfig({
      showTransliterations: true,
      bookTitleDisplay: "translation",
    });
    expect(result.bookTitleDisplay).toBe("translation");
  });

  it("removes deprecated tocDisplay field", () => {
    const result = migrateStoredConfig({ tocDisplay: "expanded" });
    expect(result.tocDisplay).toBeUndefined();
  });

  it("resets invalid embedding model to gemini", () => {
    const result = migrateStoredConfig({ embeddingModel: "invalid" });
    expect(result.embeddingModel).toBe("gemini");
  });

  it("preserves valid embedding model values", () => {
    expect(migrateStoredConfig({ embeddingModel: "gemini" }).embeddingModel).toBe("gemini");
    expect(migrateStoredConfig({ embeddingModel: "jina" }).embeddingModel).toBe("jina");
  });

  it("removes empty hadithCollections array (old 'all' sentinel)", () => {
    const result = migrateStoredConfig({ hadithCollections: [] });
    expect(result.hadithCollections).toBeUndefined();
  });

  it("preserves non-empty hadithCollections", () => {
    const result = migrateStoredConfig({ hadithCollections: ["bukhari", "muslim"] });
    expect(result.hadithCollections).toEqual(["bukhari", "muslim"]);
  });

  it("does not mutate the input", () => {
    const input = { tocDisplay: "x", embeddingModel: "invalid" };
    migrateStoredConfig(input);
    expect(input.tocDisplay).toBe("x");
  });

  it("handles empty object gracefully", () => {
    const result = migrateStoredConfig({});
    expect(result.embeddingModel).toBe("gemini");
  });
});
