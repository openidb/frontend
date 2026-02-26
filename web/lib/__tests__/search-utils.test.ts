import { describe, it, expect } from "vitest";
import { parseSearchResults, buildSearchParams } from "../search-utils";
import { DEFAULT_SEARCH_CONFIG } from "../config/search-defaults";

describe("parseSearchResults", () => {
  it("returns empty array for empty response", () => {
    expect(parseSearchResults({}, 10)).toEqual([]);
  });

  it("combines and sorts ayahs and hadiths by score descending", () => {
    const data = {
      ayahs: [
        { score: 0.5, surahNumber: 1, ayahNumber: 1 },
        { score: 0.9, surahNumber: 2, ayahNumber: 1 },
      ],
      hadiths: [
        { score: 0.7, collectionSlug: "bukhari", hadithNumber: "1" },
      ],
    };
    const results = parseSearchResults(data, 10);
    expect(results).toHaveLength(3);
    expect(results[0].score).toBe(0.9);
    expect(results[0].type).toBe("quran");
    expect(results[1].score).toBe(0.7);
    expect(results[1].type).toBe("hadith");
    expect(results[2].score).toBe(0.5);
    expect(results[2].type).toBe("quran");
  });

  it("limits results to specified count", () => {
    const data = {
      ayahs: [
        { score: 0.9 },
        { score: 0.8 },
        { score: 0.7 },
      ],
    };
    const results = parseSearchResults(data, 2);
    expect(results).toHaveLength(2);
    expect(results[0].score).toBe(0.9);
    expect(results[1].score).toBe(0.8);
  });

  it("assigns 1-based rank to limited results", () => {
    const data = {
      ayahs: [
        { score: 0.9, rank: undefined as number | undefined },
        { score: 0.7, rank: undefined as number | undefined },
        { score: 0.5, rank: undefined as number | undefined },
      ],
    };
    const results = parseSearchResults(data, 3);
    expect(results[0].data.rank).toBe(1);
    expect(results[1].data.rank).toBe(2);
    expect(results[2].data.rank).toBe(3);
  });

  it("handles missing ayahs or hadiths gracefully", () => {
    expect(parseSearchResults({ ayahs: undefined, hadiths: [] }, 5)).toEqual([]);
    expect(parseSearchResults({ ayahs: [], hadiths: undefined }, 5)).toEqual([]);
  });
});

describe("buildSearchParams", () => {
  const config = { ...DEFAULT_SEARCH_CONFIG };

  it("includes basic search parameters", () => {
    const params = buildSearchParams("test query", config, "en", false);
    expect(params.get("q")).toBe("test query");
    expect(params.get("mode")).toBe("hybrid");
    expect(params.get("limit")).toBe("20");
  });

  it("sets reranker to 'none' for non-refine searches", () => {
    const params = buildSearchParams("test", config, "en", false);
    expect(params.get("reranker")).toBe("none");
  });

  it("uses configured reranker for refine searches", () => {
    const params = buildSearchParams("test", config, "en", true);
    expect(params.get("reranker")).toBe(config.reranker);
  });

  it("includes refine parameters only when isRefine is true", () => {
    const nonRefine = buildSearchParams("test", config, "en", false);
    expect(nonRefine.get("refine")).toBeNull();
    expect(nonRefine.get("refineOriginalWeight")).toBeNull();

    const refine = buildSearchParams("test", config, "en", true);
    expect(refine.get("refine")).toBe("true");
    expect(refine.get("refineOriginalWeight")).toBe(String(config.refineOriginalWeight));
    expect(refine.get("queryExpansionModel")).toBe(config.queryExpansionModel);
  });

  it("maps quranTranslation code to edition", () => {
    const enConfig = { ...config, quranTranslation: "en" };
    const params = buildSearchParams("test", enConfig, "en", false);
    expect(params.get("quranTranslation")).toBe("eng-mustafakhattaba");
  });

  it("passes 'none' for quranTranslation when set to none", () => {
    const noTrans = { ...config, quranTranslation: "none" };
    const params = buildSearchParams("test", noTrans, "en", false);
    expect(params.get("quranTranslation")).toBe("none");
  });

  it("uses 'en' for bookTitleLang when locale is 'ar' and display is 'translation'", () => {
    const transConfig = { ...config, bookTitleDisplay: "translation" as const };
    const params = buildSearchParams("test", transConfig, "ar", false);
    expect(params.get("bookTitleLang")).toBe("en");
  });

  it("uses locale for bookTitleLang when display is 'translation' and locale is not 'ar'", () => {
    const transConfig = { ...config, bookTitleDisplay: "translation" as const };
    const params = buildSearchParams("test", transConfig, "fr", false);
    expect(params.get("bookTitleLang")).toBe("fr");
  });

  it("joins hadith collections with comma", () => {
    const withCollections = { ...config, hadithCollections: ["bukhari", "muslim"] };
    const params = buildSearchParams("test", withCollections, "en", false);
    expect(params.get("hadithCollections")).toBe("bukhari,muslim");
  });

  it("omits hadithCollections when empty", () => {
    const noCollections = { ...config, hadithCollections: [] };
    const params = buildSearchParams("test", noCollections, "en", false);
    expect(params.get("hadithCollections")).toBeNull();
  });
});
