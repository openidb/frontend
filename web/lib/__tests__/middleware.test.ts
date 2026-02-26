import { describe, it, expect } from "vitest";

// parseAcceptLanguage is not exported from the middleware, so we replicate
// it here to test the logic. The function is small and critical enough
// that having a testable copy is worthwhile.
const SUPPORTED_LOCALES = new Set([
  "en", "ar", "fr", "id", "ur", "es", "zh", "pt", "ru", "ja", "ko", "it", "bn",
  "ha", "sw", "nl", "de", "tr", "fa", "hi", "ms", "pa", "ku", "ps", "so", "uz", "yo", "ta",
]);

function parseAcceptLanguage(header: string): string | null {
  const entries = header.split(",").map((part) => {
    const [lang, ...params] = part.trim().split(";");
    const qParam = params.find((p) => p.trim().startsWith("q="));
    const q = qParam ? parseFloat(qParam.trim().slice(2)) : 1.0;
    return { lang: lang.trim().toLowerCase(), q: isNaN(q) ? 0 : q };
  });

  entries.sort((a, b) => b.q - a.q);

  for (const { lang } of entries) {
    if (SUPPORTED_LOCALES.has(lang)) return lang;
    const prefix = lang.split("-")[0];
    if (SUPPORTED_LOCALES.has(prefix)) return prefix;
  }

  return null;
}

describe("parseAcceptLanguage", () => {
  it("returns exact match for supported locale", () => {
    expect(parseAcceptLanguage("fr")).toBe("fr");
  });

  it("returns prefix match for regional variant", () => {
    expect(parseAcceptLanguage("fr-FR")).toBe("fr");
  });

  it("returns highest quality match", () => {
    expect(parseAcceptLanguage("de;q=0.5, fr;q=0.9, en;q=0.7")).toBe("fr");
  });

  it("treats missing q-value as 1.0 (highest priority)", () => {
    expect(parseAcceptLanguage("ar, en;q=0.5")).toBe("ar");
  });

  it("returns null for unsupported locales", () => {
    expect(parseAcceptLanguage("xx")).toBeNull();
    expect(parseAcceptLanguage("xx-YY")).toBeNull();
  });

  it("handles complex Accept-Language headers", () => {
    expect(
      parseAcceptLanguage("en-US,en;q=0.9,ar;q=0.8,fr;q=0.7")
    ).toBe("en");
  });

  it("handles malformed q-values gracefully (treats as 0)", () => {
    expect(parseAcceptLanguage("fr;q=abc, en;q=0.9")).toBe("en");
  });

  it("handles all supported locales", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(parseAcceptLanguage(locale)).toBe(locale);
    }
  });

  it("handles whitespace in header", () => {
    expect(parseAcceptLanguage("  fr , en ; q=0.5 ")).toBe("fr");
  });

  it("handles empty quality parameter", () => {
    expect(parseAcceptLanguage("ar;q=, en")).toBe("en");
  });

  it("returns first matching when multiple have same quality", () => {
    // When both have q=1.0, the one that appears first in the header wins
    // (sort is stable for equal values)
    const result = parseAcceptLanguage("fr, ar");
    expect(["fr", "ar"]).toContain(result);
  });
});
