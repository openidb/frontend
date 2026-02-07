import { getCachedExpansion, setCachedExpansion } from "@/lib/query-expansion-cache";
import type { ExpandedQuery } from "./types";

/**
 * Map query expansion model config value to OpenRouter model ID
 */
export function getQueryExpansionModelId(model: string): string {
  switch (model) {
    case "gpt-oss-120b":
      return "openai/gpt-oss-120b";
    case "gemini-flash":
    default:
      return "google/gemini-3-flash-preview";
  }
}

/**
 * Expand a search query into multiple alternative queries using LLM
 * Returns original query (weight=1.0) plus expanded queries (weight=0.7)
 * Results are cached to avoid redundant LLM calls
 */
export async function expandQuery(query: string, model: string = "gemini-flash"): Promise<ExpandedQuery[]> {
  const cached = getCachedExpansion(query);
  if (cached) {
    return cached;
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return [{ query, weight: 1.0, reason: "Original query" }];
  }

  try {
    const prompt = `You are a search query expansion expert for an Arabic/Islamic text search engine covering Quran, Hadith, and classical Islamic books.

User Query: "${query}"

Your task: Generate 4 alternative search queries that will help find what the user is actually looking for.

EXPANSION STRATEGIES (use the most relevant):

1. **ANSWER-ORIENTED** (if query is a question)
   - Convert questions to statements/topics that would contain the answer
   - "What are the virtues of Shaban?" → "فضائل شعبان" / "ثواب صيام شعبان"
   - "When was the Prophet born?" → "مولد النبي" / "ولادة الرسول"

2. **TOPIC VARIANTS**
   - Arabic equivalents: "fasting" → "صيام" / "صوم"
   - Root variations: "صائم" / "صيام" / "صوم"
   - Related terminology: "Shaban fasting" → "صيام التطوع" / "النوافل"

3. **CONTEXTUAL EXPANSION**
   - What sources would discuss this topic?
   - "ruling on music" → "حكم الغناء" / "المعازف" / "اللهو"
   - "wudu steps" → "فرائض الوضوء" / "أركان الوضوء"

4. **SEMANTIC BRIDGES**
   - English query → Arabic content terms
   - Technical terms → common usage
   - "inheritance law" → "فرائض" / "مواريث" / "تقسيم التركة"

Return ONLY a JSON array of query strings:
["expanded query 1", "expanded query 2", "expanded query 3", "expanded query 4"]

IMPORTANT:
- Prioritize queries that would find ANSWERS, not just mentions
- Include at least one Arabic query if the original is English (and vice versa)
- Keep queries 2-5 words, focused and searchable
- Think: "What text would contain the answer to this?"
- Don't include the original query in your response`;

    const modelId = getQueryExpansionModelId(model);
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.warn(`Query expansion failed: ${response.statusText}`);
      return [{ query, weight: 1.0, reason: "Original query" }];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "[]";

    const match = content.match(/\[[\s\S]*\]/);
    if (!match) {
      console.warn("Query expansion returned invalid format");
      return [{ query, weight: 1.0, reason: "Original query" }];
    }

    const expanded: string[] = JSON.parse(match[0]);

    const results: ExpandedQuery[] = [
      { query, weight: 1.0, reason: "Original query" },
    ];

    for (let i = 0; i < Math.min(expanded.length, 4); i++) {
      const expQuery = typeof expanded[i] === 'string' ? expanded[i] : (expanded[i] as any)?.query;
      if (expQuery && expQuery.trim() && expQuery !== query) {
        results.push({
          query: expQuery.trim(),
          weight: 0.7,
          reason: `Expanded query ${i + 1}`,
        });
      }
    }

    setCachedExpansion(query, results);
    return results;
  } catch (err) {
    console.warn("Query expansion error:", err);
    return [{ query, weight: 1.0, reason: "Original query" }];
  }
}

/**
 * Wrapper for expandQuery that also returns cache status
 */
export async function expandQueryWithCacheInfo(query: string, model: string = "gemini-flash"): Promise<{ queries: ExpandedQuery[]; cached: boolean }> {
  const cached = getCachedExpansion(query);
  if (cached) {
    return { queries: cached, cached: true };
  }
  const queries = await expandQuery(query, model);
  return { queries, cached: false };
}
