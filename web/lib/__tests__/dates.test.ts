import { describe, it, expect } from "vitest";
import { formatAuthorDates, formatYear, formatBookYear } from "../dates";

describe("formatAuthorDates", () => {
  it("returns empty string when no dates are provided", () => {
    expect(formatAuthorDates({})).toBe("");
  });

  it("formats death-only hijri + gregorian (both calendar)", () => {
    expect(
      formatAuthorDates({ deathDateHijri: "728", deathDateGregorian: "1328" })
    ).toBe("728 AH / 1328 CE");
  });

  it("formats birth and death dates (both calendar)", () => {
    expect(
      formatAuthorDates({
        birthDateHijri: "680",
        deathDateHijri: "728",
        birthDateGregorian: "1281",
        deathDateGregorian: "1328",
      })
    ).toBe("680-728 AH / 1281-1328 CE");
  });

  it("adds death prefix when includeDeathPrefix is true", () => {
    expect(
      formatAuthorDates(
        { deathDateHijri: "728", deathDateGregorian: "1328" },
        { includeDeathPrefix: true }
      )
    ).toBe("d. 728 AH / 1328 CE");
  });

  it("does not add 'd.' prefix to Gregorian when Hijri death date exists", () => {
    const result = formatAuthorDates(
      { deathDateHijri: "728", deathDateGregorian: "1328" },
      { includeDeathPrefix: true }
    );
    // Should be "d. 728 AH / 1328 CE" — not "d. 728 AH / d. 1328 CE"
    expect(result).toBe("d. 728 AH / 1328 CE");
  });

  it("adds 'd.' prefix to Gregorian when no Hijri death date", () => {
    const result = formatAuthorDates(
      { deathDateGregorian: "1328" },
      { includeDeathPrefix: true }
    );
    expect(result).toBe("d. 1328 CE");
  });

  it("handles birth-only dates", () => {
    expect(
      formatAuthorDates({ birthDateHijri: "680", birthDateGregorian: "1281" })
    ).toBe("b. 680 AH / b. 1281 CE");
  });

  it("formats hijri calendar only", () => {
    expect(
      formatAuthorDates(
        { deathDateHijri: "728", deathDateGregorian: "1328" },
        { calendar: "hijri" }
      )
    ).toBe("728 AH");
  });

  it("formats gregorian calendar only", () => {
    expect(
      formatAuthorDates(
        { deathDateHijri: "728", deathDateGregorian: "1328" },
        { calendar: "gregorian" }
      )
    ).toBe("1328 CE");
  });

  it("falls back to hijri when gregorian preferred but unavailable", () => {
    expect(
      formatAuthorDates(
        { deathDateHijri: "728" },
        { calendar: "gregorian" }
      )
    ).toBe("728 AH");
  });

  it("falls back to gregorian when hijri preferred but unavailable", () => {
    expect(
      formatAuthorDates(
        { deathDateGregorian: "1328" },
        { calendar: "hijri" }
      )
    ).toBe("1328 CE");
  });

  it("converts Arabic numerals to Western numerals", () => {
    expect(
      formatAuthorDates({ deathDateHijri: "٧٢٨", deathDateGregorian: "١٣٢٨" })
    ).toBe("728 AH / 1328 CE");
  });

  it("handles null fields gracefully", () => {
    expect(
      formatAuthorDates({
        birthDateHijri: null,
        deathDateHijri: "728",
        birthDateGregorian: null,
        deathDateGregorian: null,
      })
    ).toBe("728 AH");
  });
});

describe("formatYear", () => {
  it("returns empty string when no years provided", () => {
    expect(formatYear(null, null)).toBe("");
    expect(formatYear(undefined, undefined)).toBe("");
  });

  it("formats both calendars", () => {
    expect(formatYear("728", "1328")).toBe("728 AH / 1328 CE");
  });

  it("formats hijri only when gregorian missing", () => {
    expect(formatYear("728", null)).toBe("728 AH");
  });

  it("formats gregorian only when hijri missing", () => {
    expect(formatYear(null, "1328")).toBe("1328 CE");
  });

  it("prefers hijri when calendar is 'hijri'", () => {
    expect(formatYear("728", "1328", "hijri")).toBe("728 AH");
  });

  it("falls back to gregorian when hijri preferred but unavailable", () => {
    expect(formatYear(null, "1328", "hijri")).toBe("1328 CE");
  });

  it("prefers gregorian when calendar is 'gregorian'", () => {
    expect(formatYear("728", "1328", "gregorian")).toBe("1328 CE");
  });

  it("falls back to hijri when gregorian preferred but unavailable", () => {
    expect(formatYear("728", null, "gregorian")).toBe("728 AH");
  });

  it("converts Arabic numerals", () => {
    expect(formatYear("٧٢٨", "١٣٢٨")).toBe("728 AH / 1328 CE");
  });
});

describe("formatBookYear", () => {
  it("returns empty year when no dates available", () => {
    expect(formatBookYear({})).toEqual({ year: "", isPublicationYear: false });
  });

  it("prefers author death year over publication year", () => {
    const result = formatBookYear({
      author: { deathDateHijri: "728", deathDateGregorian: "1328" },
      publicationYearHijri: "800",
      publicationYearGregorian: "1400",
    });
    expect(result).toEqual({
      year: "728 AH / 1328 CE",
      isPublicationYear: false,
    });
  });

  it("falls back to publication year when author has no death date", () => {
    const result = formatBookYear({
      author: {},
      publicationYearHijri: "800",
      publicationYearGregorian: "1400",
    });
    expect(result).toEqual({
      year: "800 AH / 1400 CE",
      isPublicationYear: true,
    });
  });

  it("handles null author", () => {
    const result = formatBookYear({
      author: null,
      publicationYearHijri: "800",
    });
    expect(result).toEqual({
      year: "800 AH",
      isPublicationYear: true,
    });
  });

  it("respects calendar preference", () => {
    const result = formatBookYear(
      {
        author: { deathDateHijri: "728", deathDateGregorian: "1328" },
      },
      "hijri"
    );
    expect(result).toEqual({
      year: "728 AH",
      isPublicationYear: false,
    });
  });
});
