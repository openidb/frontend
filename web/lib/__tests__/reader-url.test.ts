import { describe, it, expect } from "vitest";
import { buildReaderUrl } from "../reader-url";

describe("buildReaderUrl", () => {
  it("builds a basic reader URL without page number", () => {
    expect(buildReaderUrl("123")).toBe("/reader/123");
  });

  it("builds a reader URL with page number", () => {
    expect(buildReaderUrl("123", 42)).toBe("/reader/123?pn=42");
  });

  it("builds a reader URL with string page number", () => {
    expect(buildReaderUrl("123", "42")).toBe("/reader/123?pn=42");
  });

  it("encodes book IDs with special characters", () => {
    expect(buildReaderUrl("book name")).toBe("/reader/book%20name");
    expect(buildReaderUrl("book/slash")).toBe("/reader/book%2Fslash");
    expect(buildReaderUrl("book&amp")).toBe("/reader/book%26amp");
  });

  it("encodes Arabic book IDs", () => {
    const id = "كتاب_١";
    const url = buildReaderUrl(id);
    expect(url).toBe(`/reader/${encodeURIComponent(id)}`);
  });

  it("handles page number of 0", () => {
    expect(buildReaderUrl("123", 0)).toBe("/reader/123?pn=0");
  });

  it("omits pn when pageNumber is null", () => {
    expect(buildReaderUrl("123", null as unknown as undefined)).toBe("/reader/123");
  });

  it("omits pn when pageNumber is undefined", () => {
    expect(buildReaderUrl("123", undefined)).toBe("/reader/123");
  });
});
