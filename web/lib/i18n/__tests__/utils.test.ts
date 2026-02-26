import { describe, it, expect } from "vitest";
import { getNestedValue, interpolate } from "../utils";

describe("getNestedValue", () => {
  const dict = {
    simple: "hello",
    nested: {
      key: "world",
      deep: {
        value: "deep value",
      },
    },
    number: 42,
    nullValue: null,
  };

  it("retrieves top-level string values", () => {
    expect(getNestedValue(dict, "simple")).toBe("hello");
  });

  it("retrieves nested values with dot notation", () => {
    expect(getNestedValue(dict, "nested.key")).toBe("world");
  });

  it("retrieves deeply nested values", () => {
    expect(getNestedValue(dict, "nested.deep.value")).toBe("deep value");
  });

  it("returns undefined for missing keys", () => {
    expect(getNestedValue(dict, "missing")).toBeUndefined();
  });

  it("returns undefined for missing nested keys", () => {
    expect(getNestedValue(dict, "nested.missing")).toBeUndefined();
  });

  it("returns undefined for path through non-object", () => {
    expect(getNestedValue(dict, "simple.child")).toBeUndefined();
  });

  it("returns undefined for non-string values", () => {
    expect(getNestedValue(dict, "number")).toBeUndefined();
  });

  it("returns undefined for null values", () => {
    expect(getNestedValue(dict, "nullValue")).toBeUndefined();
  });

  it("returns undefined for path through null", () => {
    expect(getNestedValue(dict, "nullValue.child")).toBeUndefined();
  });

  it("handles null root object", () => {
    expect(getNestedValue(null, "key")).toBeUndefined();
  });

  it("handles undefined root object", () => {
    expect(getNestedValue(undefined, "key")).toBeUndefined();
  });

  it("retrieves nested object (returns undefined since not string)", () => {
    expect(getNestedValue(dict, "nested")).toBeUndefined();
  });
});

describe("interpolate", () => {
  it("replaces single parameter", () => {
    expect(interpolate("Hello {name}", { name: "World" })).toBe("Hello World");
  });

  it("replaces multiple parameters", () => {
    expect(
      interpolate("{greeting} {name}!", { greeting: "Hello", name: "World" })
    ).toBe("Hello World!");
  });

  it("replaces all occurrences of same parameter", () => {
    expect(interpolate("{x} and {x}", { x: "A" })).toBe("A and A");
  });

  it("handles numeric values", () => {
    expect(interpolate("Page {page} of {total}", { page: 1, total: 10 })).toBe(
      "Page 1 of 10"
    );
  });

  it("leaves unmatched placeholders untouched", () => {
    expect(interpolate("{unknown} text", {})).toBe("{unknown} text");
  });

  it("handles empty params object", () => {
    expect(interpolate("no params", {})).toBe("no params");
  });

  it("handles string with no placeholders", () => {
    expect(interpolate("plain text", { key: "val" })).toBe("plain text");
  });
});
