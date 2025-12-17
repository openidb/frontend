# Book Metadata Scraper Guide

## Overview

The metadata scraper extracts book information from Shamela book pages to populate catalog entries with accurate publication years and other metadata.

## Location

- **Main scraper**: `shamela-scraper/scripts/shamela/metadata_scraper.py`
- **Test script**: `test_metadata_scraper.py`

## Usage

### Basic Usage

```python
from shamela.metadata_scraper import MetadataScraper
from shamela.utils import ShamelaHTTPClient

# Initialize
client = ShamelaHTTPClient(delay=1.5)
scraper = MetadataScraper(http_client=client)

# Scrape a book
metadata = scraper.scrape_book("22")  # Book ID

# Access publication info
year_gregorian = metadata.publication.year_gregorian  # e.g., "١٩٩٤"
year_hijri = metadata.publication.year_hijri          # e.g., "١٤١٤"
```

### Test Script

```bash
# Test with book 22 (default)
python3 test_metadata_scraper.py

# Test with a different book
python3 test_metadata_scraper.py 123
```

## Extracted Information

The scraper extracts:

1. **Publication Information**
   - Publisher (الناشر)
   - Location
   - Edition (الطبعة)
   - Year (Hijri) - in Arabic numerals
   - Year (Gregorian) - in Arabic numerals
   - ISBN

2. **Author Information**
   - Full name
   - Shamela author ID
   - Birth date (Hijri)
   - Death date (Hijri)

3. **Book Structure**
   - Total volumes
   - Total pages
   - Page alignment notes

4. **Classification**
   - Category
   - Category ID
   - Keywords

## Updating Catalog with Scraped Data

After scraping, update `book-viewer/lib/catalog.json`:

```json
{
  "id": "22",
  "title": "كتاب أعمار الأعيان",
  "titleLatin": "Kitab Amar al-Ayan",
  "author": "ابن الجوزي",
  "authorLatin": "Ibn al-Jawzi",
  "datePublished": "1994",        // Gregorian year in Western numerals
  "filename": "22_كتاب أعمار الأعيان.epub",
  "category": "test",
  "subcategory": "test-book",
  "yearAH": 1414,                 // Hijri year as integer
  "timePeriod": "test"
}
```

**Important Notes:**
- Convert Arabic numerals (١٩٩٤) to Western numerals (1994) for `datePublished`
- Convert Arabic numerals (١٤١٤) to integer (1414) for `yearAH`
- If no year is found, use empty string "" for `datePublished` and 0 for `yearAH`

## Display Logic

In `book-viewer/app/authors/[name]/AuthorDetailClient.tsx`, the date is displayed with this logic:

```typescript
{book.datePublished && book.datePublished !== "TEST"
  ? book.datePublished
  : book.yearAH && book.yearAH > 0
  ? `${book.yearAH} هـ`
  : "—"}
```

This means:
1. If `datePublished` exists and is not "TEST", show it (e.g., "1994")
2. Otherwise, if `yearAH` > 0, show it with " هـ" suffix (e.g., "1414 هـ")
3. Otherwise, show em dash "—"

## Example: Book 22

```
Title: كتاب أعمار الأعيان
Author: ابن الجوزي
Publisher: مكتبة الخانجي
Edition: الأولى
Year (Hijri): ١٤١٤ هـ  → catalog: yearAH: 1414
Year (Gregorian): ١٩٩٤ م → catalog: datePublished: "1994"
```

## Error Handling

The scraper:
- Returns `None` if the book page cannot be fetched
- Logs errors using Python logging
- Gracefully handles missing fields (returns `None` for optional fields)
- Has a configurable HTTP client delay to respect rate limits

## Future Improvements

- Batch scraping multiple books
- Caching scraped metadata
- Automatic catalog updates
- Support for updating existing catalog entries
