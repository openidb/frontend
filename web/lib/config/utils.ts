/**
 * Pure config functions extracted for testability.
 */

import {
  type SearchConfig,
  type TranslationDisplayOption,
  DEFAULT_SEARCH_CONFIG,
  INTERNAL_CONFIG_KEYS,
} from "@/lib/config/search-defaults";

/** Force internal (non-user-facing) config keys back to centralized defaults. */
export function applyInternalDefaults(config: SearchConfig): SearchConfig {
  const patched = { ...config };
  for (const key of INTERNAL_CONFIG_KEYS) {
    (patched as Record<string, unknown>)[key] = DEFAULT_SEARCH_CONFIG[key];
  }
  return patched;
}

/** Sync translation settings to match the given locale. */
export function syncTranslationsToLocale(cfg: SearchConfig, currentLocale: string): SearchConfig {
  // Arabic users don't need translations/transliterations — content is already in Arabic
  if (currentLocale === "ar") {
    const updates: Partial<SearchConfig> = {};
    let changed = false;
    if (cfg.quranTranslation !== "none") { updates.quranTranslation = "none"; changed = true; }
    if (cfg.hadithTranslation !== "none") { updates.hadithTranslation = "none"; changed = true; }
    if (cfg.bookTitleDisplay !== "none") { updates.bookTitleDisplay = "none" as TranslationDisplayOption; changed = true; }
    if (cfg.showAuthorTransliteration !== false) { updates.showAuthorTransliteration = false; changed = true; }
    return changed ? { ...cfg, ...updates } : cfg;
  }

  // Non-Arabic: enable translations in the user's language, and author transliteration
  const target = currentLocale;
  let changed = false;
  const updates: Partial<SearchConfig> = {};
  if (cfg.quranTranslation !== target) {
    updates.quranTranslation = target;
    changed = true;
  }
  if (cfg.hadithTranslation !== target) {
    updates.hadithTranslation = target;
    changed = true;
  }
  if (cfg.showAuthorTransliteration !== true) {
    updates.showAuthorTransliteration = true;
    changed = true;
  }
  return changed ? { ...cfg, ...updates } : cfg;
}

/**
 * Migrate stored config from older schema versions:
 *  - showTransliterations → bookTitleDisplay
 *  - remove deprecated tocDisplay
 *  - validate embeddingModel
 *  - fix empty hadithCollections (old "all" sentinel)
 */
export function migrateStoredConfig(parsed: Record<string, unknown>): Record<string, unknown> {
  const result = { ...parsed };
  // Migrate showTransliterations → bookTitleDisplay
  if (result.showTransliterations !== undefined && !result.bookTitleDisplay) {
    result.bookTitleDisplay = result.showTransliterations ? "transliteration" : "none";
    delete result.showTransliterations;
  }
  // Remove deprecated field
  delete result.tocDisplay;
  // Validate embedding model
  if (result.embeddingModel !== "gemini" && result.embeddingModel !== "jina") {
    result.embeddingModel = "gemini";
  }
  // Migrate empty hadithCollections (old "all" sentinel → use defaults)
  if (Array.isArray(result.hadithCollections) && result.hadithCollections.length === 0) {
    delete result.hadithCollections;
  }
  return result;
}
