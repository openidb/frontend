import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We need to reimport the module for each test suite since OPENIDB_URL
// is captured at module-load time as a top-level const.
let fetchAPI: typeof import("../api-client").fetchAPI;
let fetchAPIRaw: typeof import("../api-client").fetchAPIRaw;

const mockFetch = vi.fn();

beforeEach(async () => {
  mockFetch.mockClear();
  vi.stubGlobal("fetch", mockFetch);
  // Re-import the module so OPENIDB_URL re-evaluates with the stubbed env
  vi.resetModules();
  vi.stubEnv("OPENIDB_URL", "http://test-api:4000");
  const mod = await import("../api-client");
  fetchAPI = mod.fetchAPI;
  fetchAPIRaw = mod.fetchAPIRaw;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("fetchAPI", () => {
  it("returns parsed JSON on success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: "test" }),
    });

    const result = await fetchAPI("/api/test");
    expect(result).toEqual({ data: "test" });
  });

  it("sends Content-Type: application/json by default", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await fetchAPI("/api/test");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/test"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      })
    );
  });

  it("throws on 4xx errors without retrying", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    await expect(fetchAPI("/api/test")).rejects.toThrow("API /api/test: 404 Not Found");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries on 5xx errors then throws", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    await expect(fetchAPI("/api/test", { retries: 1 })).rejects.toThrow("API /api/test: 500");
    expect(mockFetch).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
  });

  it("retries on network errors (TypeError)", async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: "recovered" }),
      });

    const result = await fetchAPI("/api/test", { retries: 1 });
    expect(result).toEqual({ data: "recovered" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("respects custom headers", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await fetchAPI("/api/test", {
      headers: { "X-Custom": "value" },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Custom": "value",
        }),
      })
    );
  });

  it("succeeds on retry after 5xx then success", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ retried: true }),
      });

    const result = await fetchAPI("/api/test", { retries: 2 });
    expect(result).toEqual({ retried: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe("fetchAPIRaw", () => {
  it("returns the raw Response object", async () => {
    const mockResponse = { ok: true, status: 200 };
    mockFetch.mockResolvedValue(mockResponse);

    const result = await fetchAPIRaw("/api/raw");
    expect(result).toBe(mockResponse);
  });

  it("passes through request init options", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await fetchAPIRaw("/api/raw", { method: "POST" });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "POST" })
    );
  });
});
