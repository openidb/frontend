import { describe, it, expect } from "vitest";
import {
  expandHonorifics,
  formatContentHtml,
  wrapWords,
  displayPageNumber,
} from "../html-reader-utils";

describe("expandHonorifics", () => {
  it("expands ﷺ (sallallahu alayhi wasallam)", () => {
    expect(expandHonorifics("محمد \uFDFA")).toBe("محمد صلى الله عليه وسلم");
  });

  it("expands ﷻ (jalla jalaluhu)", () => {
    expect(expandHonorifics("الله \uFDFB")).toBe("الله جل جلاله");
  });

  it("expands multiple honorifics in one string", () => {
    const input = `النبي \uFDFA والله \uFDFB`;
    const result = expandHonorifics(input);
    expect(result).toContain("صلى الله عليه وسلم");
    expect(result).toContain("جل جلاله");
  });

  it("expands Unicode 16.0 honorifics", () => {
    expect(expandHonorifics("\uFD47")).toBe("رضي الله عنه");
    expect(expandHonorifics("\uFD4D")).toBe("عليه السلام");
    expect(expandHonorifics("\uFD40")).toBe("رحمه الله");
  });

  it("leaves text without honorifics unchanged", () => {
    const text = "بسم الله الرحمن الرحيم";
    expect(expandHonorifics(text)).toBe(text);
  });

  it("handles empty string", () => {
    expect(expandHonorifics("")).toBe("");
  });
});

describe("formatContentHtml", () => {
  it("wraps plain text lines in paragraph tags", () => {
    const result = formatContentHtml("Hello world", false);
    expect(result).toContain('<p style="margin:0.5em 0 0.6em">Hello world</p>');
  });

  it("skips empty lines", () => {
    const result = formatContentHtml("line1\n\nline2", false);
    expect(result).toContain("line1");
    expect(result).toContain("line2");
    // Should only have 2 paragraphs, not 3
    const pCount = (result.match(/<p /g) || []).length;
    expect(pCount).toBe(2);
  });

  it("converts section separators (***) to styled dividers", () => {
    const result = formatContentHtml("* * *", false);
    expect(result).toContain("text-align:center");
    expect(result).toContain("* * * * *");
  });

  it("detects footnote separator (___) and styles footnotes", () => {
    const result = formatContentHtml("text above\n___\n(١) footnote text", false);
    expect(result).toContain("opacity:0.85");
    expect(result).toContain("font-weight:bold");
    expect(result).toContain("(١)");
  });

  it("strips caret from footnote markers: (^١) → (١)", () => {
    const result = formatContentHtml("reference (^١) here", false);
    expect(result).toContain("(١)");
    expect(result).not.toContain("(^١)");
  });

  it("styles title spans as h3 headings", () => {
    const result = formatContentHtml(
      '<span data-type="title">Chapter One</span>',
      false
    );
    expect(result).toContain("<h3");
    expect(result).toContain("font-size:1.3em");
  });

  it("handles title with trailing text after </span>", () => {
    const result = formatContentHtml(
      '<span data-type="title">Title</span> Body text here',
      false
    );
    expect(result).toContain("</h3>");
    expect(result).toContain("Body text here");
  });

  it("preserves data-page links", () => {
    const result = formatContentHtml(
      '<a data-page="5">Go to page 5</a>',
      false
    );
    expect(result).toContain("data-page");
  });

  it("interleaves translation paragraphs when provided", () => {
    const result = formatContentHtml("Arabic text", false, [
      { index: 0, translation: "English translation" },
    ]);
    expect(result).toContain("Arabic text");
    expect(result).toContain("English translation");
    expect(result).toContain('dir="ltr"');
  });

  it("applies word wrapping when enabled", () => {
    const result = formatContentHtml("بسم الله", true);
    expect(result).toContain('class="word"');
    expect(result).toContain("data-word=");
  });

  it("skips word wrapping when disabled", () => {
    const result = formatContentHtml("بسم الله", false);
    expect(result).not.toContain('class="word"');
  });

  it("expands honorifics in content", () => {
    const result = formatContentHtml("النبي \uFDFA", false);
    expect(result).toContain("صلى الله عليه وسلم");
    expect(result).not.toContain("\uFDFA");
  });
});

describe("wrapWords", () => {
  it("wraps Arabic words in clickable spans", () => {
    const result = wrapWords(">بسم الله");
    expect(result).toContain('<span class="word" data-word="بسم">بسم</span>');
    expect(result).toContain('<span class="word" data-word="الله">الله</span>');
  });

  it("does not wrap non-Arabic text", () => {
    const result = wrapWords(">Hello world");
    expect(result).toBe(">Hello world");
  });

  it("does not wrap content inside HTML tags", () => {
    const result = wrapWords('<p class="arabic">بسم</p>');
    // The regex only targets text after >, so "arabic" shouldn't be touched
    expect(result).toContain('class="arabic"');
  });

  it("handles empty text nodes", () => {
    const result = wrapWords("><");
    expect(result).toBe("><");
  });
});

describe("displayPageNumber", () => {
  it("returns printed page number when available", () => {
    expect(displayPageNumber({ printedPageNumber: 42 }, 5)).toBe("42");
  });

  it("returns Roman numeral for front matter pages (0-9)", () => {
    expect(displayPageNumber(null, 0)).toBe("i");
    expect(displayPageNumber(null, 1)).toBe("ii");
    expect(displayPageNumber(null, 3)).toBe("iv");
    expect(displayPageNumber(null, 9)).toBe("x");
  });

  it("returns Arabic numeral for pages beyond Roman range", () => {
    expect(displayPageNumber(null, 10)).toBe("10");
    expect(displayPageNumber(null, 100)).toBe("100");
  });

  it("handles page with null printedPageNumber", () => {
    expect(displayPageNumber({ printedPageNumber: null }, 2)).toBe("iii");
  });

  it("returns printed 0 as '0'", () => {
    expect(displayPageNumber({ printedPageNumber: 0 }, 5)).toBe("0");
  });
});
