# Author Death Year Display Logic

## Overview

The book date display on author pages now automatically uses the **author's death year** as the primary date, since classical Arabic books were typically written during the author's lifetime.

## Implementation

### Location
`book-viewer/app/authors/[name]/AuthorDetailClient.tsx`

### Table Header
- **Column name**: "Year" (changed from "Date Published")

### Display Format

Shows both Gregorian and Hijri years with clear labels:
- **Format**: `{gregorian} CE / {hijri} AH`
- **Example**: "1201 CE / 597 AH"

Where:
- **CE** = Common Era (Gregorian calendar)
- **AH** = Anno Hegirae (Hijri calendar)

### Display Priority

The date shown in the books table follows this priority order:

1. **Author's death year (both calendars)** from `authors-metadata.json`
   - Shows: "{gregorian} CE / {hijri} AH"
   - Example: "1201 CE / 597 AH" (for Ibn al-Jawzi)
   - Converts Arabic numerals to Western numerals
   - Shows only available dates if one is missing

2. **`datePublished`** from `catalog.json` (fallback)
   - Only if not "TEST" or empty
   - Used when author metadata is not available

3. **`yearAH`** from `catalog.json` (second fallback)
   - Only if > 0
   - Displays with " AH" suffix

4. **Em dash "—"** (final fallback)
   - Shown when no date information is available

## Example

For Ibn al-Jawzi's book "كتاب أعمار الأعيان":

```json
// authors-metadata.json
{
  "Ibn al-Jawzi": {
    "death_date_gregorian": "١٢٠١",  // → 1201 CE
    "death_date_hijri": "٥٩٧"        // → 597 AH
  }
}
```

**Result**: The books table shows "1201 CE / 597 AH" for all books by Ibn al-Jawzi.

## Benefits

1. **Automatic**: No need to manually set dates in catalog.json
2. **Consistent**: All books by the same author show the same date
3. **Historically accurate**: Shows when the book was written, not when the modern edition was published
4. **Smart fallback**: Falls back to catalog data if author metadata is unavailable

## Helper Function

```typescript
function arabicToWestern(str: string): string {
  // Converts Arabic-Indic numerals (٠-٩) to Western numerals (0-9)
  return str
    .replace(/٠/g, '0')
    .replace(/١/g, '1')
    // ... etc
}
```

## Catalog Data

The catalog.json entries now serve as fallbacks only:

```json
{
  "id": "22",
  "datePublished": "1201",  // Fallback (not used if author metadata exists)
  "yearAH": 597              // Second fallback
}
```

## Future Considerations

- If we find books with specific composition dates on Shamela, we can add a `composition_year` field to book metadata
- Multi-author books or collections may need special handling
- Anonymous works would use the fallback catalog data
