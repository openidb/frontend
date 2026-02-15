# frontend

Next.js frontend for [OpenIslamicDB](https://github.com/openidb) — search and browse Quran, Hadith, and classical Arabic books.

**Live:** [openidb.org](https://openidb.org)

## Features

- **Hybrid Search** — Semantic + keyword search with debug panel and timing breakdown
- **13 Languages** — English, Arabic, French, Indonesian, Urdu, Spanish, Chinese, Portuguese, Russian, Japanese, Korean, Italian, Bengali
- **RTL Support** — Full right-to-left layout for Arabic and Urdu with dedicated fonts (Amiri, Scheherazade New)
- **Voice Search** — Audio transcription via Groq Whisper
- **Book Reader** — Built-in HTML reader with navigation, table of contents, and in-book translation
- **Word Definitions** — Tap any Arabic word to see dictionary definitions from 43 classical sources with root derivation
- **Knowledge Graph** — Entity panel showing related concepts from Neo4j
- **Dark Mode** — Light, dark, and system themes with no flash of unstyled content
- **Search Configuration** — Reranker selection, similarity cutoffs, content type filters, query expansion
- **Accessibility** — aria-labels on all icon buttons, loading skeletons, keyboard navigation, pinch-to-zoom

## Tech Stack

| | |
|---|---|
| Framework | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS, shadcn/ui, Radix UI |
| Book Reader | HtmlReader (custom) |
| Math | KaTeX |
| Icons | Lucide React |

No backend dependencies — all data comes from the [api](https://github.com/openidb/api) server via proxy routes.

## Architecture

This is a pure frontend. Server pages fetch data with `fetchAPI<T>()`, and client-side requests go through Next.js API routes that proxy to the API server using `fetchAPIRaw()`. This keeps the backend URL private and allows centralized error handling (all proxy routes return 503 on backend failure).

```
Browser → frontend (Next.js) → /api/* proxy routes → api server (port 4000)
```

## Project Structure

```
web/
├── app/
│   ├── layout.tsx              # Root layout, providers, CSRF, metadata
│   ├── page.tsx                # Home (book listing)
│   ├── search/
│   │   ├── page.tsx            # Search page (server)
│   │   ├── SearchClient.tsx    # Search orchestrator (client)
│   │   ├── SearchDebugPanel.tsx
│   │   └── SearchErrorState.tsx
│   ├── reader/[id]/page.tsx    # Book reader
│   ├── authors/                # Author listing + detail
│   ├── root/[root]/page.tsx    # Root word family page
│   ├── config/page.tsx         # Settings
│   └── api/                    # Proxy routes to api server
│       ├── search/route.ts
│       ├── transcribe/route.ts
│       ├── books/route.ts
│       ├── authors/route.ts
│       ├── ayah/route.ts
│       ├── categories/route.ts
│       ├── centuries/route.ts
│       ├── dictionary/[word]/route.ts
│       ├── dictionary/root/[root]/route.ts
│       ├── dictionary/resolve/[word]/route.ts
│       └── pages/[bookId]/[pageNumber]/translate/route.ts
├── components/
│   ├── Navigation.tsx          # Desktop + mobile nav
│   ├── VoiceRecorder.tsx       # Audio recording + transcription
│   ├── HtmlReader.tsx          # HTML book reader
│   ├── EntityPanel.tsx         # Knowledge graph context
│   ├── SearchResult.tsx        # Individual result card
│   ├── SearchConfigDropdown.tsx
│   ├── LanguageSwitcher.tsx
│   ├── RefiningCarousel.tsx
│   ├── WordDefinitionPopover.tsx
│   └── ui/                     # shadcn/ui primitives
├── lib/
│   ├── api-client.ts           # fetchAPI / fetchAPIRaw
│   ├── i18n/                   # I18nProvider + 13 translation files
│   ├── theme/                  # ThemeProvider (light/dark/system)
│   ├── config/                 # AppConfigProvider (search settings)
│   ├── csrf.ts                 # CSRF token generation
│   └── utils.ts
└── public/
    ├── books/                  # Static assets
    └── fonts/                  # Arabic fonts (Amiri, Scheherazade New)
```

## Setup

```bash
cd frontend/web
bun install
cp .env.example .env    # set OPENIDB_URL
bun run dev             # → http://localhost:3000
```

Requires the [api](https://github.com/openidb/api) server running on port 4000.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENIDB_URL` | `http://localhost:4000` | Backend API URL |
| `INTERNAL_API_SECRET` | — | Shared secret for internal API calls (must match openidb) |
| `SITE_URL` | `https://openidb.org` | Public URL (sitemap, OpenGraph) |

## Part of [OpenIDB](https://github.com/openidb)

This is the frontend. See also:
- [api](https://github.com/openidb/api) — API server (Hono, PostgreSQL, Qdrant, Elasticsearch, Neo4j)
- [scrapers](https://github.com/openidb/scrapers) — Data acquisition
