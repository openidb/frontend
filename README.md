# Islamic Texts Search

A hybrid search engine for classical Arabic Islamic texts, combining semantic (AI embeddings) and keyword (Elasticsearch BM25) search across Quran, Hadith, and classical books.

**Live:** [sanad.marlin.im](https://sanad.marlin.im)

## Features

- **Hybrid Search** - Semantic + keyword search with Reciprocal Rank Fusion (RRF)
- **Three Content Types** - Quran (6,236 ayahs), Hadith (7 collections), Classical Books
- **12 Quran Translations** - English, French, Indonesian, Urdu, Spanish, Chinese, Portuguese, Russian, Japanese, Korean, Italian, Bengali
- **Reranking Options** - Jina neural reranker, Gemini Flash, GPT-OSS LLMs
- **Query Expansion** - AI-powered query reformulation for better recall
- **Famous Source Lookup** - Fuzzy matching for "Ayat al-Kursi", "حديث جبريل", etc.
- **EPUB Reader** - Built-in reader with navigation and in-book search
- **Dark Mode & RTL** - Full Arabic support

## Content Sources

| Type | Source | Links To |
|------|--------|----------|
| Quran | Database (tafsir-enriched embeddings) | [quran.com](https://quran.com) |
| Hadith | [sunnah.com](https://sunnah.com) | sunnah.com |
| Books | [shamela.ws](https://shamela.ws) | Built-in reader |

## Ranking Algorithm

### 1. Parallel Retrieval
- **Semantic**: Qdrant vector search with `google/gemini-embedding-001` (3072d)
- **Keyword**: Elasticsearch BM25 (k1=1.2, b=0.75) with fuzzy matching

### 2. Score Fusion
```
fusedScore = semanticScore + 0.15 × (bm25Score / (bm25Score + 5))
```
Results appearing in both get a confirmation bonus. RRF (k=60) used as tiebreaker.

### 3. Reranking (Optional)

| Option | Model | Speed |
|--------|-------|-------|
| None | RRF only | Fastest |
| Jina | jina-reranker-v2-base-multilingual | Fast |
| Gemini | google/gemini-2.0-flash-001 | Medium |
| GPT-OSS | openai/gpt-oss-120b | Slower |

### 4. Refine Search (Optional)
Query expansion via `google/gemini-3-flash-preview` generates 4 alternative queries, searches in parallel, merges with weighted RRF, then reranks across all content types.

## Debug Panel

Click the bug icon to see:
- **Timing breakdown** - Embedding, semantic, keyword, merge, rerank times
- **Algorithm params** - BM25 settings, RRF k, embedding model, cutoff
- **Score breakdown** - Each result's keyword, semantic, and final scores
- **Refine stats** - Expanded queries, candidate counts, cache status

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 16, React 19, TypeScript, TailwindCSS |
| Database | PostgreSQL 16, Prisma |
| Vector Search | Qdrant |
| Keyword Search | Elasticsearch 8.12 |
| Embeddings | google/gemini-embedding-001 (3072d) |
| Reranking | Jina, Gemini, GPT-OSS via OpenRouter |

## API

```
GET /api/search?q={query}&mode=hybrid&limit=20
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `mode` | hybrid | `hybrid`, `semantic`, `keyword` |
| `includeQuran/Hadith/Books` | true | Filter content types |
| `reranker` | none | `none`, `jina`, `gemini-flash`, `gpt-oss-120b` |
| `refine` | false | Enable query expansion |
| `similarityCutoff` | 0.6 | Semantic threshold (0.15-0.8) |
| `quranTranslation` | none | Language code (en, fr, ur, etc.) |

## Setup

```bash
git clone https://github.com/abdulrahman-abdulmojeeb/islamic-texts-search.git
cd islamic-texts-search/book-viewer

# Start services
docker compose up -d db elasticsearch qdrant

# Install & run
bun install
cp .env.example .env
bunx prisma migrate deploy
bun run dev
```

## License

MIT
