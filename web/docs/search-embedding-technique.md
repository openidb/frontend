# Search Embedding Technique: Metadata + Translation

## Chosen Technique

**Metadata + Translation** — a 3-component embedding format with no LLM dependency:

```
سورة البقرة، آية 255:                     ← metadata prefix
الله لا اله الا هو الحي القيوم             ← normalized Arabic text
 ||| Allah! There is no god but He...     ← English translation (if available)
```

Applied to both Quran ayahs and Hadith collections.

## Benchmark Methodology

Evaluated 8 embedding techniques across two test sets:

| Technique | Description |
|-----------|-------------|
| baseline | Plain normalized Arabic text |
| stopword | Arabic with stopword removal |
| contextual | LLM-enriched contextual description |
| tafsir | Al-Jalalayn tafsir text |
| metadata | Surah/collection name prefix |
| translation | Arabic + English translation |
| stemming | Arabic with light stemming |
| combined | Metadata + translation (chosen) |

### Test Sets

1. **Original** — 100 queries (Arabic + English), manually curated with relevance judgments
2. **Multilingual** — 264 queries across 12 languages, testing cross-lingual retrieval

### Metrics

- **Recall@10 (R@10)** — fraction of relevant documents in top 10 results
- **MRR** — mean reciprocal rank of first relevant result

## Key Findings

### Original Test Set (100 queries)

| Technique | R@10 | MRR |
|-----------|------|-----|
| baseline | 45.4% | 0.534 |
| metadata | **48.5%** | 0.561 |
| translation | 47.2% | 0.548 |
| combined | 47.8% | **0.562** |
| tafsir | 43.1% | 0.512 |

### Multilingual Test Set (264 queries)

| Technique | R@10 | MRR |
|-----------|------|-----|
| baseline | 72.3% | 0.621 |
| translation | **84.4%** | 0.734 |
| combined | 83.9% | **0.741** |
| metadata | 74.1% | 0.639 |

## Why Metadata + Translation

1. **Best overall balance** — top MRR on both test sets, near-best R@10
2. **No LLM dependency** — uses only data already in the database (translations from Dr. Mustafa Khattab for Quran, sunnah.com for Hadith)
3. **English as bridge language** — English translations enable cross-lingual retrieval for queries in any language (French, Turkish, Urdu, etc.) since the embedding model maps similar meanings to nearby vectors regardless of source language
4. **Metadata prefix helps disambiguation** — "سورة البقرة" prefix helps when query mentions surah by name
5. **Graceful degradation** — if no translation exists for a hadith, falls back to metadata + Arabic only (2 components)

## Dropped Techniques

- **LLM contextual enrichment** — adds latency, cost, and wasn't validated in isolation
- **Tafsir-only** — hurt recall (tafsir text is verbose, dilutes the core meaning)
- **Stemming** — minimal improvement, adds complexity

## Elasticsearch (BM25 Keyword Search)

Separate `text_searchable` field with metadata-enriched Arabic:
- Ayahs: `سورة البقرة آية 255 الله لا اله الا هو الحي القيوم`
- Hadiths: `صحيح البخاري كتاب الإيمان انما الاعمال بالنيات`

This allows BM25 to match queries like "سورة البقرة" to the correct ayahs.

## Data Sources

| Content | Translation Source | Coverage |
|---------|-------------------|----------|
| Quran | Dr. Mustafa Khattab (eng-mustafakhattaba) via `AyahTranslation` | 100% |
| Hadith | sunnah.com via `HadithTranslation` | Varies by collection |
