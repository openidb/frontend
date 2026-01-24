/**
 * Gemini Embeddings Utility
 *
 * Generates embeddings using Google Gemini embedding-001 via OpenRouter.
 * Optimized for Arabic/multilingual text with 3072 dimensions.
 *
 * Gemini was chosen over OpenAI text-embedding-3-large based on comparison testing:
 * - Better MRR (0.765 vs 0.632)
 * - Superior cross-lingual search (English→Arabic MRR 0.857 vs 0.681)
 * - Faster embedding generation (8.1s vs 11.3s for 500 docs)
 * - Faster query times (325ms vs 397ms avg)
 */

import OpenAI from "openai";
import { EMBEDDING_DIMENSIONS } from "./constants";

// Re-export for backwards compatibility
export { EMBEDDING_DIMENSIONS };

// Use OpenRouter to access Gemini embedding models
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

// Model configuration
const EMBEDDING_MODEL = "google/gemini-embedding-001";

/**
 * Generate embedding for a single text string
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return response.data[0].embedding;
}

/**
 * Generate embeddings for multiple text strings in a single API call
 * More efficient than calling generateEmbedding multiple times
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });

  return response.data.map((d) => d.embedding);
}

/**
 * Normalize Arabic text for better embedding quality
 * - Removes diacritics (tashkeel) for consistent matching
 * - Normalizes whitespace
 * - Removes excessive punctuation
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
 * Truncate text to fit within token limits
 * text-embedding-3-large has 8191 token limit
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
