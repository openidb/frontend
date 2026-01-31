/**
 * Local Embedding Client for EmbeddingGemma-300M
 *
 * Connects to a local FastAPI server running EmbeddingGemma-300M model.
 * Provides fast, low-latency embeddings (~10-20ms vs ~500ms with Gemini API).
 *
 * Model: google/embeddinggemma-300m
 * Dimensions: 768
 *
 * Usage:
 *   1. Start the Python server: cd embedding-server && uvicorn main:app --port 8000
 *   2. Use these functions to generate embeddings
 *
 * Environment variables:
 *   EMBEDDINGGEMMA_URL - Server URL (default: http://localhost:8000)
 */

import { EMBEDDINGGEMMA_DIMENSIONS } from "./constants";

// Re-export for convenience
export { EMBEDDINGGEMMA_DIMENSIONS };

// Default server URL
const EMBEDDING_SERVER_URL =
  process.env.EMBEDDINGGEMMA_URL || "http://localhost:8000";

// Request timeout in milliseconds
const REQUEST_TIMEOUT = 30000;

interface EmbedResponse {
  embedding: number[];
  dimensions: number;
  latency_ms: number;
}

interface EmbedBatchResponse {
  embeddings: number[][];
  dimensions: number;
  count: number;
  latency_ms: number;
}

interface HealthResponse {
  status: string;
  model: string;
  dimensions: number;
  device: string;
}

/**
 * Check if the local embedding server is available
 */
export async function isEmbeddingServerAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${EMBEDDING_SERVER_URL}/health`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get health information from the embedding server
 */
export async function getEmbeddingServerHealth(): Promise<HealthResponse> {
  const response = await fetch(`${EMBEDDING_SERVER_URL}/health`);

  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Generate embedding for a single text using local EmbeddingGemma model
 *
 * @param text - Text to embed
 * @param textType - Type of text: 'query' for search queries, 'passage' for documents (default: 'query')
 * @returns Promise<number[]> - 768-dimensional embedding vector
 * @throws Error if server is unavailable or request fails
 */
export async function generateEmbeddingLocal(
  text: string,
  textType: "query" | "passage" = "query"
): Promise<number[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(`${EMBEDDING_SERVER_URL}/embed`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, text_type: textType }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Embedding request failed: ${response.status} - ${errorText}`
      );
    }

    const data: EmbedResponse = await response.json();

    if (data.dimensions !== EMBEDDINGGEMMA_DIMENSIONS) {
      console.warn(
        `Unexpected embedding dimensions: ${data.dimensions}, expected ${EMBEDDINGGEMMA_DIMENSIONS}`
      );
    }

    return data.embedding;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Embedding request timed out after ${REQUEST_TIMEOUT}ms`);
    }

    throw error;
  }
}

/**
 * Generate embeddings for multiple texts in a single batch request
 *
 * More efficient than calling generateEmbeddingLocal multiple times.
 * Maximum batch size is 32 texts.
 *
 * @param texts - Array of texts to embed
 * @param textType - Type of text: 'query' for search queries, 'passage' for documents (default: 'passage')
 * @returns Promise<number[][]> - Array of 768-dimensional embedding vectors
 * @throws Error if server is unavailable or request fails
 */
export async function generateEmbeddingsLocal(
  texts: string[],
  textType: "query" | "passage" = "passage"
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  // Split into chunks of 32 if needed
  const MAX_BATCH_SIZE = 32;
  if (texts.length > MAX_BATCH_SIZE) {
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
      const chunk = texts.slice(i, i + MAX_BATCH_SIZE);
      const chunkEmbeddings = await generateEmbeddingsLocal(chunk, textType);
      results.push(...chunkEmbeddings);
    }
    return results;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(`${EMBEDDING_SERVER_URL}/embed/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ texts, text_type: textType }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Batch embedding request failed: ${response.status} - ${errorText}`
      );
    }

    const data: EmbedBatchResponse = await response.json();

    if (data.dimensions !== EMBEDDINGGEMMA_DIMENSIONS) {
      console.warn(
        `Unexpected embedding dimensions: ${data.dimensions}, expected ${EMBEDDINGGEMMA_DIMENSIONS}`
      );
    }

    return data.embeddings;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `Batch embedding request timed out after ${REQUEST_TIMEOUT}ms`
      );
    }

    throw error;
  }
}

/**
 * Normalize Arabic text for better embedding quality
 * Re-exported from embeddings.ts for convenience
 */
export function normalizeArabicText(text: string): string {
  return (
    text
      // Remove Arabic diacritics (tashkeel)
      .replace(/[\u064B-\u065F\u0670]/g, "")
      // Normalize alef variants to plain alef
      .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627")
      // Normalize teh marbuta to heh
      .replace(/\u0629/g, "\u0647")
      // Normalize whitespace
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Truncate text to fit within model token limits
 * EmbeddingGemma has 8192 token context
 * Rough estimate: 1 token ~ 4 characters for Arabic
 */
export function truncateForEmbedding(
  text: string,
  maxChars: number = 6000
): string {
  if (text.length <= maxChars) return text;

  // Try to cut at a sentence boundary
  const truncated = text.slice(0, maxChars);
  const lastPeriod = truncated.lastIndexOf(".");
  const lastArabicPeriod = truncated.lastIndexOf("\u06D4");

  const cutPoint = Math.max(lastPeriod, lastArabicPeriod);

  if (cutPoint > maxChars * 0.7) {
    return truncated.slice(0, cutPoint + 1);
  }

  return truncated;
}
