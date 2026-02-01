/**
 * Qdrant Vector Database Client Singleton
 *
 * Provides a singleton Qdrant client instance for the application.
 * Prevents multiple instances in development (hot reload).
 */

import { QdrantClient } from "@qdrant/js-client-rest";

const globalForQdrant = globalThis as unknown as {
  qdrant: QdrantClient | undefined;
};

export const qdrant =
  globalForQdrant.qdrant ??
  new QdrantClient({
    url: process.env.QDRANT_URL || "http://localhost:6333",
  });

if (process.env.NODE_ENV !== "production") {
  globalForQdrant.qdrant = qdrant;
}

// Collection name for Arabic text pages
export const QDRANT_COLLECTION =
  process.env.QDRANT_COLLECTION || "arabic_texts_pages";

// Collection name for authors
export const QDRANT_AUTHORS_COLLECTION =
  process.env.QDRANT_AUTHORS_COLLECTION || "arabic_texts_authors";

/**
 * Original Quran ayahs collection - DEPRECATED
 * Kept for fallback only when enriched collection is unavailable.
 * @deprecated Use QDRANT_QURAN_ENRICHED_COLLECTION instead for new searches.
 */
export const QDRANT_QURAN_COLLECTION =
  process.env.QDRANT_QURAN_COLLECTION || "quran_ayahs";

/**
 * Tafsir-enriched Quran ayahs collection (default for searches)
 * Embeddings generated from Al-Jalalayn tafsir for better semantic retrieval
 * of short ayahs. Payload still contains original ayah text for display.
 */
export const QDRANT_QURAN_ENRICHED_COLLECTION =
  process.env.QDRANT_QURAN_ENRICHED_COLLECTION || "quran_ayahs_enriched";

// Collection name for Hadith
export const QDRANT_HADITH_COLLECTION =
  process.env.QDRANT_HADITH_COLLECTION || "sunnah_hadiths";

// Re-export from constants for backwards compatibility
export { EMBEDDING_DIMENSIONS } from "./constants";

export default qdrant;
