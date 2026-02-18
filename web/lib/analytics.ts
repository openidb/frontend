/**
 * Lightweight search analytics — session tracking and click logging.
 * All functions are client-side only and fire-and-forget.
 */

const SESSION_KEY = "oidb_session_id";

/** Returns a stable session UUID for this browser tab (sessionStorage). */
export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

/** Fire-and-forget click tracking via sendBeacon (falls back to fetch). */
export function trackClick(
  searchEventId: string,
  docId: string,
  resultType: "book" | "quran" | "hadith",
  rank: number,
): void {
  const payload = JSON.stringify({ searchEventId, docId, resultType, rank });

  if (navigator.sendBeacon) {
    const blob = new Blob([payload], { type: "application/json" });
    navigator.sendBeacon("/api/search/click", blob);
  } else {
    fetch("/api/search/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }
}

/** Fire-and-forget book event tracking via sendBeacon. */
export function trackBookEvent(
  bookId: string,
  action: "open" | "page_view" | "pdf_open" | "word_lookup",
  pageNumber?: number,
  durationMs?: number,
  word?: string,
): void {
  const payload = JSON.stringify({
    sessionId: getSessionId() || undefined,
    bookId,
    action,
    pageNumber,
    durationMs,
    word,
  });

  if (navigator.sendBeacon) {
    const blob = new Blob([payload], { type: "application/json" });
    navigator.sendBeacon("/api/books/events", blob);
  } else {
    fetch("/api/books/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }
}

