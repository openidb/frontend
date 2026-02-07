import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { validateCsrfToken } from "@/lib/csrf";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

// Use OpenRouter to access Gemini models
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

// Model mapping from config values to OpenRouter model IDs
const MODEL_MAP: Record<string, string> = {
  "gemini-flash": "google/gemini-3-flash-preview",
  "gpt-oss-120b": "openai/gpt-oss-120b",
};

// Language names for the prompt
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  id: "Indonesian",
  ur: "Urdu",
  es: "Spanish",
  zh: "Chinese",
  pt: "Portuguese",
  ru: "Russian",
  ja: "Japanese",
  ko: "Korean",
  it: "Italian",
  bn: "Bengali",
};

interface TranslationResult {
  paragraphs: { index: number; translation: string }[];
}

// Arabic Unicode ranges for detecting meaningful Arabic content
const ARABIC_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/**
 * Check if text contains meaningful content worth translating
 * Filters out single characters, punctuation-only, and non-Arabic text
 */
function isMeaningfulContent(text: string): boolean {
  // Must be at least 2 characters
  if (text.length < 2) return false;

  // Must contain at least one Arabic character
  if (!ARABIC_REGEX.test(text)) return false;

  // Filter out strings that are only punctuation, numbers, or symbols
  const onlyPunctuationOrNumbers = /^[\s\d\-–—_.*•·,،؛:;!?'"()[\]{}«»<>\/\\|@#$%^&+=~`]+$/;
  if (onlyPunctuationOrNumbers.test(text)) return false;

  return true;
}

/**
 * Extract paragraphs from HTML content
 * Returns array of { index, text } to preserve original indices for frontend matching
 */
function extractParagraphs(html: string): { index: number; text: string }[] {
  const paragraphs: { index: number; text: string }[] = [];

  // Match <p> tags and extract their text content
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  let index = 0;

  while ((match = pRegex.exec(html)) !== null) {
    // Strip inner HTML tags and get plain text
    const text = match[1]
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();

    // Only include paragraphs with meaningful Arabic content, but preserve original index
    if (isMeaningfulContent(text)) {
      paragraphs.push({ index, text });
    }
    index++;
  }

  return paragraphs;
}

/**
 * POST /api/pages/[bookId]/[pageNumber]/translate
 *
 * Translate paragraphs from a book page
 *
 * Request body:
 * - lang: Target language code (e.g., "en", "fr")
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ bookId: string; pageNumber: string }> }
) {
  const limited = rateLimit(request, "paid");
  if (limited) return limited;

  if (!validateCsrfToken(request.headers.get("x-csrf-token"))) {
    return NextResponse.json(
      { error: "Invalid or missing token" },
      { status: 403 }
    );
  }

  try {
    const params = await context.params;
    const { bookId, pageNumber } = params;

    const body = await request.json();
    if (body.lang !== undefined && typeof body.lang !== "string") {
      return NextResponse.json(
        { error: "Invalid lang parameter" },
        { status: 400 }
      );
    }
    const lang = body.lang || "en";
    const modelKey = body.model || "gemini-flash";
    const model = MODEL_MAP[modelKey] || MODEL_MAP["gemini-flash"];

    // Validate language
    const targetLanguage = LANGUAGE_NAMES[lang];
    if (!targetLanguage) {
      return NextResponse.json(
        { error: "Unsupported language" },
        { status: 400 }
      );
    }

    // Fetch the page content from database
    const page = await prisma.page.findUnique({
      where: {
        bookId_pageNumber: {
          bookId,
          pageNumber: parseInt(pageNumber, 10),
        },
      },
      select: {
        id: true,
        contentHtml: true,
      },
    });

    if (!page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    // Check for existing cached translation
    const existingTranslation = await prisma.pageTranslation.findUnique({
      where: {
        pageId_language: {
          pageId: page.id,
          language: lang,
        },
      },
    });

    if (existingTranslation) {
      return NextResponse.json({
        paragraphs: existingTranslation.paragraphs,
        cached: true,
      });
    }

    // Extract paragraphs from HTML
    const paragraphs = extractParagraphs(page.contentHtml);

    if (paragraphs.length === 0) {
      return NextResponse.json({ paragraphs: [] });
    }

    // Build the prompt for translation (use original indices for frontend matching)
    const numberedParagraphs = paragraphs
      .map((p) => `[${p.index}] ${p.text}`)
      .join("\n\n");

    const prompt = `Translate the following Arabic paragraphs to ${targetLanguage}.
Each paragraph is numbered with [N]. Return a JSON array where each element has "index" (the paragraph number) and "translation" (the translated text).
Only translate the text content - do not include the original Arabic or the [N] markers in the translation.
Preserve the meaning and tone of the original text.

IMPORTANT: Preserve Islamic terminology in their original Arabic form. Do NOT translate:
- "الله" → "Allah" (not "God")
- "محمد" → "Muhammad" or "the Prophet Muhammad"
- "القرآن" → "Quran" (not "the holy book")
- "الرسول" → "the Messenger" or "the Prophet"
- "صلى الله عليه وسلم" → "peace be upon him" or "ﷺ"
- Other Islamic terms like: Salah, Zakat, Hajj, Iman, Taqwa, Sunnah, Hadith, etc.

Arabic paragraphs:
${numberedParagraphs}

Respond with ONLY a valid JSON array, no other text. Example format:
[{"index": 0, "translation": "First paragraph translation"}, {"index": 1, "translation": "Second paragraph translation"}]`;

    // Call OpenRouter for translation
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 8000,
    });

    const responseText = completion.choices[0]?.message?.content || "[]";

    // Parse the JSON response
    let translations: { index: number; translation: string }[] = [];
    try {
      // Clean up the response - remove markdown code blocks if present
      let cleanedResponse = responseText.trim();
      if (cleanedResponse.startsWith("```json")) {
        cleanedResponse = cleanedResponse.slice(7);
      } else if (cleanedResponse.startsWith("```")) {
        cleanedResponse = cleanedResponse.slice(3);
      }
      if (cleanedResponse.endsWith("```")) {
        cleanedResponse = cleanedResponse.slice(0, -3);
      }
      cleanedResponse = cleanedResponse.trim();

      translations = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error("Failed to parse translation response:", responseText);
      return NextResponse.json(
        { error: "Failed to parse translation" },
        { status: 500 }
      );
    }

    // Cache the translation in the database
    await prisma.pageTranslation.create({
      data: {
        pageId: page.id,
        language: lang,
        model: modelKey,
        paragraphs: translations,
      },
    });

    return NextResponse.json({ paragraphs: translations, cached: false });
  } catch (error) {
    console.error("Error translating page:", error);
    return NextResponse.json(
      { error: "Failed to translate page" },
      { status: 500 }
    );
  }
}
