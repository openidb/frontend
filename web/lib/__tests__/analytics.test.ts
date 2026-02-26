import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Analytics functions depend on browser APIs, so we need to mock them
let getSessionId: typeof import("../analytics").getSessionId;
let trackClick: typeof import("../analytics").trackClick;
let trackBookEvent: typeof import("../analytics").trackBookEvent;

beforeEach(async () => {
  vi.resetModules();

  // Mock sessionStorage
  const storage = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });

  // Mock crypto.randomUUID
  vi.stubGlobal("crypto", { randomUUID: () => "test-uuid-1234" });

  // Mock navigator.sendBeacon
  vi.stubGlobal("navigator", { sendBeacon: vi.fn(() => true) });

  const mod = await import("../analytics");
  getSessionId = mod.getSessionId;
  trackClick = mod.trackClick;
  trackBookEvent = mod.trackBookEvent;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getSessionId", () => {
  it("generates a new UUID on first call", () => {
    const id = getSessionId();
    expect(id).toBe("test-uuid-1234");
  });

  it("returns same ID on subsequent calls", () => {
    const id1 = getSessionId();
    const id2 = getSessionId();
    expect(id1).toBe(id2);
  });

  it("stores the ID in sessionStorage", () => {
    getSessionId();
    expect(sessionStorage.getItem("oidb_session_id")).toBe("test-uuid-1234");
  });

  it("returns existing ID from sessionStorage", () => {
    sessionStorage.setItem("oidb_session_id", "existing-id");
    expect(getSessionId()).toBe("existing-id");
  });
});

describe("trackClick", () => {
  it("sends click event via sendBeacon", () => {
    trackClick("event-123", "doc-456", "quran", 1);
    expect(navigator.sendBeacon).toHaveBeenCalledWith(
      "/api/search/click",
      expect.any(Blob)
    );
  });

  it("falls back to fetch when sendBeacon unavailable", async () => {
    const mockFetch = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { sendBeacon: undefined });
    vi.stubGlobal("fetch", mockFetch);

    trackClick("event-123", "doc-456", "hadith", 2);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/search/click",
      expect.objectContaining({
        method: "POST",
        keepalive: true,
      })
    );
  });
});

describe("trackBookEvent", () => {
  it("sends book event via sendBeacon", () => {
    trackBookEvent("book-1", "open", 5);
    expect(navigator.sendBeacon).toHaveBeenCalledWith(
      "/api/books/events",
      expect.any(Blob)
    );
  });

  it("includes session ID in payload", () => {
    trackBookEvent("book-1", "page_view", 10, 5000);
    const blobArg = (navigator.sendBeacon as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(blobArg).toBeInstanceOf(Blob);
  });

  it("sends word_lookup events", () => {
    trackBookEvent("book-1", "word_lookup", 10, undefined, "بسم");
    expect(navigator.sendBeacon).toHaveBeenCalled();
  });
});
