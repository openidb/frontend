import { describe, it, expect } from "vitest";
import { sanitizeHighlight } from "../utils";

describe("sanitizeHighlight", () => {
  it("preserves bare <mark> tags", () => {
    expect(sanitizeHighlight("hello <mark>world</mark>")).toBe(
      "hello <mark>world</mark>"
    );
  });

  it("handles multiple <mark> tags", () => {
    expect(
      sanitizeHighlight("<mark>foo</mark> bar <mark>baz</mark>")
    ).toBe("<mark>foo</mark> bar <mark>baz</mark>");
  });

  it("strips all non-mark HTML tags", () => {
    expect(sanitizeHighlight('<script>alert("xss")</script>')).toBe(
      'alert(&quot;xss&quot;)'
    );
  });

  it("strips dangerous tags while preserving mark", () => {
    expect(
      sanitizeHighlight('<mark>safe</mark><script>evil</script>')
    ).toBe("<mark>safe</mark>evil");
  });

  it("escapes HTML entities that could decode to executable markup", () => {
    // &#60;script&#62; is &lt;script&gt; which could be decoded
    expect(sanitizeHighlight("&#60;script&#62;alert(1)&#60;/script&#62;")).toBe(
      "&amp;#60;script&amp;#62;alert(1)&amp;#60;/script&amp;#62;"
    );
  });

  it("escapes ampersands and quotes in plain text", () => {
    expect(sanitizeHighlight('a & b "e"')).toBe('a &amp; b &quot;e&quot;');
  });

  it("strips angle-bracket content that looks like HTML tags", () => {
    // `< c >` matches the tag-stripping regex /<[^>]*>/g — this is intentional
    // since sanitizeHighlight is designed for Elasticsearch highlight snippets
    // where angle brackets indicate HTML
    const result = sanitizeHighlight("a < c > d");
    expect(result).toBe("a  d");
  });

  it("handles empty string", () => {
    expect(sanitizeHighlight("")).toBe("");
  });

  it("handles plain text without any HTML", () => {
    expect(sanitizeHighlight("just plain text")).toBe("just plain text");
  });

  it("handles case-insensitive mark tags", () => {
    expect(sanitizeHighlight("<MARK>hi</MARK>")).toBe("<mark>hi</mark>");
  });

  it("handles mark tags with spaces", () => {
    expect(sanitizeHighlight("<mark >hi</mark >")).toBe("<mark>hi</mark>");
  });

  it("strips nested HTML inside mark content", () => {
    expect(
      sanitizeHighlight("<mark><b>bold</b></mark>")
    ).toBe("<mark>bold</mark>");
  });

  it("neutralizes img onerror injection", () => {
    expect(
      sanitizeHighlight('<img src=x onerror="alert(1)">')
    ).toBe("");
  });

  it("handles unbalanced mark tags", () => {
    // Should still work — output may have unbalanced marks but no XSS
    const result = sanitizeHighlight("<mark>unclosed");
    expect(result).toBe("<mark>unclosed");
    expect(result).not.toContain("<script");
  });
});
