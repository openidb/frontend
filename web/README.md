# frontend

Frontend for OpenIslamicDB — search and browse Quran, Hadith, and classical Arabic books.

Built with Next.js 16 (App Router), Tailwind CSS, and shadcn/ui.

## Features

- **Hybrid search** across Quran, Hadith, and Books with configurable search modes
- **Quran reader** with translations and tafsirs
- **Hadith browser** with collection/book navigation
- **Book reader** with HTML rendering and page translation
- **Voice search** via audio transcription
- **13 languages** — English, Arabic, French, Spanish, Indonesian, Urdu, Chinese, Portuguese, Russian, Japanese, Korean, Italian, Bengali

## Setup

### Prerequisites

- [Bun](https://bun.sh)
- openidb API server running at `http://localhost:4000`

### Install and run

```bash
bun install
bun run dev
```

The app starts at http://localhost:3000.

### Environment

```
OPENIDB_URL=http://localhost:4000   # API server URL (default)
```

## Architecture

This is a pure frontend — no direct database access. All data comes from the openidb API server.

- **Server pages** fetch data via `fetchAPI<T>()` from `lib/api-client.ts`
- **API routes** (`app/api/`) are thin proxies forwarding to the api server via `fetchAPIRaw()`, with error handling returning 503 on backend failure
- **Client components** use Next.js API routes (not the api server directly) to avoid CORS

### Security

- **Headers**: HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy (configured in `next.config.ts`)
- **CSRF**: Token generated server-side in layout for client components
- **API proxy**: All backend errors caught and returned as generic 503

### Accessibility

- `aria-label` on all icon-only buttons (search clear, config dropdown, language switcher)
- Pinch-to-zoom enabled (no `maximum-scale` restriction)
- Loading skeleton screens for all routes (`loading.tsx`)

### SEO

Dynamic `generateMetadata()` on:
- `/search` — includes query in page title
- `/reader/[id]` — book title and author
- `/authors/[name]` — author name

### Internationalization

Type-safe i18n system with 13 languages. Translation files in `lib/i18n/translations/`. All keys are typed from `en.json` — adding a key to English requires adding it to all other languages.

### Error Handling

- **Error boundary** (`app/error.tsx`) with internationalized messages and retry
- **Toast notifications** for transient errors
- **SearchErrorState** component for search-specific errors with retry

## Project Structure

```
web/
├── app/
│   ├── layout.tsx              # Root layout, CSRF, metadata
│   ├── error.tsx               # Error boundary (i18n)
│   ├── loading.tsx             # Root loading skeleton
│   ├── page.tsx                # Books listing
│   ├── search/
│   │   ├── page.tsx            # Search (server, SEO metadata)
│   │   ├── SearchClient.tsx    # Search orchestrator (client)
│   │   ├── SearchDebugPanel.tsx # Debug stats panel
│   │   ├── SearchErrorState.tsx # Error state with retry
│   │   └── loading.tsx         # Search loading skeleton
│   ├── reader/[id]/            # Book reader
│   ├── authors/                # Author listing + detail
│   └── api/                    # Proxy routes to api server
├── components/
│   ├── ui/                     # shadcn/ui primitives
│   ├── SearchConfigDropdown.tsx
│   ├── LanguageSwitcher.tsx
│   ├── Navigation.tsx
│   └── VoiceRecorder.tsx
└── lib/
    ├── api-client.ts           # fetchAPI / fetchAPIRaw
    └── i18n/                   # Translation system + 13 locales
```

## Part of [OpenIDB](https://github.com/openidb)

This is the frontend. See also:
- [api](https://github.com/openidb/api) — API server
- [scrapers](https://github.com/openidb/scrapers) — Data acquisition
