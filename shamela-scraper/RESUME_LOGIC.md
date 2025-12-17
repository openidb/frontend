# Resume Logic Documentation

## Overview

The Shamela scraper now has robust resume logic to handle interruptions, network errors, and partial scrapes without duplicating work or leaving gaps.

## Features Implemented

### 1. Exponential Backoff Retry Logic

**Location**: [scripts/shamela/utils.py:16-116](scripts/shamela/utils.py#L16-L116)

- **Max retries**: 5 attempts (configurable)
- **Backoff strategy**: Exponential with cap at 30 seconds
  - Attempt 1: Original delay (default 1.5s)
  - Attempt 2: 3s backoff
  - Attempt 3: 6s backoff
  - Attempt 4: 12s backoff
  - Attempt 5: 24s backoff
- **Error handling**:
  - **Timeout errors**: Full retry with backoff
  - **Connection errors**: Full retry with backoff (handles network interruptions)
  - **HTTP 404**: No retry if expected (end of book detection)
  - **HTTP 4xx (except 404)**: No retry (client errors are permanent)
  - **HTTP 5xx**: Retry with backoff (server errors may be temporary)

**Benefits**:
- Survives temporary network interruptions
- Handles server overload gracefully
- Prevents hammering the server with rapid retries

### 2. Page-Level Resume Logic

**Location**: [scripts/shamela/page_scraper.py:202-287](scripts/shamela/page_scraper.py#L202-L287)

**How it works**:

1. **Before scraping**: Scans output directory for existing JSON page files
2. **During scraping**: For each page:
   - Checks if JSON file already exists
   - If exists: Loads from disk (fast)
   - If missing or corrupted: Scrapes from web
3. **After scraping**: Saves new pages to JSON

**Key methods**:
- `_get_existing_pages()`: Returns set of page numbers that exist
- `_load_existing_page()`: Loads PageContent from JSON file
- `scrape_book(..., resume=True)`: Main method with resume enabled by default

**Benefits**:
- **No duplicates**: Already-scraped pages loaded from disk
- **Fills gaps**: Missing pages are re-scraped automatically
- **Mid-book resume**: Can restart scraping anywhere in a book
- **Bandwidth efficient**: Doesn't re-download existing content

### 3. Safety Limits (Anti-Infinite Loop)

**Safeguards implemented**:

1. **Max iterations per book**: 10,000 iterations limit
   - Prevents runaway loops if logic breaks
   - Typical book: 50-500 pages (well under limit)

2. **Consecutive failure limit**: 3 consecutive page failures
   - Stops scraping after 3 pages fail in a row
   - Indicates end of book or persistent error

3. **Binary search iteration limit**: 20 iterations
   - For `detect_last_page()` binary search
   - log2(10000) ≈ 13, so 20 is safe headroom

**Benefits**:
- Prevents infinite loops
- Fails fast on persistent errors
- Saves bandwidth and compute time

## Usage Examples

### Basic Usage (Resume Enabled by Default)

```python
from shamela.page_scraper import PageScraper
from shamela.utils import ShamelaHTTPClient

http_client = ShamelaHTTPClient(delay=0.05, max_retries=5)
page_scraper = PageScraper(http_client)

# Resume is enabled by default
pages = page_scraper.scrape_book(
    book_id='18',
    start_page=1,
    output_dir='../data/shamela/pages',
    book_title='My Book',
    author_name='Author Name'
)
# Will load existing pages from disk, scrape missing ones
```

### Force Re-scrape (Disable Resume)

```python
# Disable resume to force re-scraping all pages
pages = page_scraper.scrape_book(
    book_id='18',
    start_page=1,
    output_dir='../data/shamela/pages',
    resume=False  # Will re-scrape everything
)
```

### Resume After Network Interruption

```bash
# Start scraping
python scripts/scrape_book.py 12345 --save-json

# ... network drops, script fails at page 234 ...

# Simply re-run the same command
python scripts/scrape_book.py 12345 --save-json

# Pages 1-233 loaded from disk (instant)
# Pages 234+ scraped from web
# No duplicates, no gaps!
```

## Test Results

All resume logic tests passed (see [test_resume_logic.py](scripts/test_resume_logic.py)):

✓ **Test 1**: Initial scrape creates JSON files
✓ **Test 2**: Resume scrape loads existing pages and scrapes new ones
✓ **Test 3**: Resume with no new pages loads all from disk
✓ **Test 4**: Gaps in existing pages are detected and filled
✓ **Test 5**: Safety limits prevent infinite loops

### Performance

- **Loading from disk**: ~instant (vs. 0.1-0.5s per web request)
- **Gap detection**: O(n) where n = number of files in directory
- **Resume overhead**: Minimal (~0.01s to scan existing pages)

## File Structure

When `output_dir` is provided, pages are saved as:

```
output_dir/
  └── {book_id}/
      ├── page_1.json
      ├── page_2.json
      ├── page_3.json
      └── ...
```

Each JSON file contains complete page data including:
- Main content (text and HTML)
- Footnotes
- Formatting hints
- Book metadata
- Page numbering (URL index and printed page number)
- Source URLs (page URL and PDF URL)

## Error Handling

### Network Errors

```
Connection error → Retry with exponential backoff (up to 5 times)
Timeout → Retry with exponential backoff (up to 5 times)
```

### HTTP Errors

```
404 (end of book) → Stop gracefully, no retry
4xx (client error) → Stop immediately, no retry
5xx (server error) → Retry with exponential backoff
```

### File Errors

```
Corrupt JSON file → Log warning, re-scrape that page
Missing directory → Create automatically
```

## Best Practices

1. **Always use `--save-json`** when running large scrapes to enable resume
2. **Don't delete the data directory** until the full scrape is complete
3. **Use appropriate delays** to avoid overwhelming the server (0.05-0.1s for parallel workers)
4. **Monitor logs** for persistent errors that might need investigation
5. **Keep retry count reasonable** (5 is good balance between resilience and speed)

## Backwards Compatibility

The resume logic is **backwards compatible**:

- Old code: `scrape_book(book_id, output_dir)` → Resume enabled automatically
- New code: `scrape_book(book_id, output_dir, resume=True)` → Explicit control
- No output_dir: Resume logic is skipped (no files to check)

## Future Enhancements

Potential improvements:

- [ ] Checksum validation for loaded pages
- [ ] Compressed JSON storage to save disk space
- [ ] Parallel page loading from disk
- [ ] Resume statistics (pages loaded vs. scraped)
- [ ] Automatic retry of previously failed pages
