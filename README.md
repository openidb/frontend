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

## Project Structure

```
arabic-texts-library/
├── web/                    # Next.js app (Sanad)
│   ├── app/                #   App Router (pages + API routes)
│   ├── components/         #   React components
│   ├── lib/                #   Core libraries (db, qdrant, embeddings, search, graph)
│   ├── prisma/             #   Schema + migrations
│   └── public/             #   Static assets (books, fonts)
│
├── pipelines/              # Data pipelines (TypeScript, run with bun)
│   ├── import/             #   Import scripts (epubs, quran, hadith, tafsir)
│   ├── embed/              #   Embedding generation
│   ├── index/              #   Elasticsearch index scripts
│   ├── knowledge-graph/    #   Neo4j scripts
│   ├── benchmark/          #   Technique benchmarks
│   └── _archive/           #   One-time/archived scripts
│
├── scrapers/               # Web scrapers (Python)
│   ├── shamela/            #   shamela.ws scraper
│   └── openiti/            #   OpenITI EPUB converter
│
├── training/               # BGE-M3 fine-tuning + embedding server
│   ├── embedding-server/   #   Python FastAPI server
│   ├── scripts/            #   Training data generation
│   └── *.py, *.ipynb       #   Fine-tuning code
│
└── docker-compose.yml      # All infrastructure (Postgres, Qdrant, ES, Neo4j, web)
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 16, React 19, TypeScript, TailwindCSS |
| Database | PostgreSQL 16, Prisma |
| Vector Search | Qdrant |
| Keyword Search | Elasticsearch 8.12 |
| Knowledge Graph | Neo4j 5 |
| Embeddings | google/gemini-embedding-001 (3072d) |
| Reranking | Jina, Gemini, GPT-OSS via OpenRouter |

## Setup

```bash
git clone https://github.com/abdulrahman-abdulmojeeb/islamic-texts-search.git
cd islamic-texts-search

# Start services
docker compose up -d db elasticsearch qdrant

# Install & run web app
cd web
bun install
cp .env.example .env
bunx prisma migrate deploy
bun run dev
```

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

## License

MIT
