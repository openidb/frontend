# Shamela Metadata Collection Analysis

## Current Status

### ✅ Data We Collect Successfully

#### Book Information
- Title (Arabic) ✅
- Shamela Book ID ✅
- Category/Classification ✅
- Category ID ✅
- Total volumes ✅
- Total pages ✅
- Page alignment note ✅
- Full description HTML (book card + TOC) ✅
- Table of Contents (hierarchical) ✅

#### Author Information (from book page)
- Full name (Arabic) ✅
- Shamela Author ID ✅
- Name components (kunya, nasab, nisba, laqab) ✅

#### Publication Information
- Publisher ✅
- Location ✅
- Edition ✅
- Year Hijri ✅
- Year Gregorian ✅

#### Editorial Information
- Editor/Muhaqiq ✅
- Document type (رسالة ماجستير, رسالة دكتوراه, بحث) ✅
- Institution ✅
- Supervisor ✅

### ❌ Extraction Issues Found

1. **Death/Birth dates not extracted from book pages** - Pattern: `(510 هـ - 597 هـ)`
   - Schema fields exist but `_extract_author_info()` doesn't call `extract_death_date()`

2. **Editor field contaminated** - Contains entire page text instead of just editor name
   - Line metadata_scraper.py:226-228 regex too greedy

3. **Publisher/Location parsing broken** - Location field contains full metadata block
   - Line metadata_scraper.py:180-191 needs better text extraction from book card

4. **Missing subcategory extraction** - Some books have subcategories we're not capturing

### 🔧 Author Page Data Available

From `https://shamela.ws/author/{id}`:
- ✅ Author name (h1)
- ✅ List of all author's books with:
  - Book title
  - Shamela ID
  - Brief description
  - Publisher, edition, year
  - Page count
- ⚠️ No biography text on author pages (only book list)
- ⚠️ Death/birth dates embedded in book descriptions, not centralized

### 📋 Proposed Improvements

#### High Priority
1. **Fix author death/birth date extraction from book pages**
   - Extract dates from pattern: `المؤلف: ابن الجوزي، جمال الدين أبي الفرج عبد الرحمن بن علي بن محمد (٥١٠ هـ - ٥٩٧ هـ)`
   - Update `_extract_author_info()` to call date extraction functions

2. **Fix editor field extraction**
   - Improve regex to stop at newline or specific delimiters
   - Extract only editor name, not surrounding text

3. **Fix publisher/location parsing**
   - Extract from clean book card HTML before it's contaminated
   - Better separation of publisher and location fields

4. **Add author enrichment workflow**
   - After scraping book, optionally enrich with `AuthorScraper.enrich_author()`
   - Fetch author page to get complete works list
   - Merge data intelligently

#### Medium Priority
5. **Add subcategory extraction** - Some categories have subcategories

6. **Extract ISBN if available** - Sometimes mentioned in publication info

7. **Better handling of multi-volume works** - Track volume-specific metadata

#### Low Priority
8. **Extract subject tags/keywords** - If available in structured form

9. **Manuscript source information** - Original manuscript details

10. **Scholarly verification status** - تحقيق/authentication status

## Implementation Plan

### Phase 1: Fix Critical Bugs (metadata_scraper.py)
- [ ] Fix `_extract_author_info()` to extract death/birth dates
- [ ] Fix `_extract_editorial_info()` editor field extraction
- [ ] Fix `_extract_publication_info()` publisher/location parsing
- [ ] Add unit tests for each extraction function

### Phase 2: Author Enrichment
- [ ] Update workflow to call `AuthorScraper.enrich_author()`
- [ ] Add author data to EPUB metadata
- [ ] Store enriched author data in metadata.json

### Phase 3: Additional Fields
- [ ] Add subcategory extraction
- [ ] Add ISBN extraction
- [ ] Test with diverse book samples

## Testing Strategy

### Test Books
-  Book 22 (Ibn al-Jawzi) - Has full metadata
- Book 18, 21, 23 - Variety of metadata patterns
- Find books with:
  - Multiple volumes
  - رسالة ماجستير (thesis)
  - Missing printed page numbers
  - No editor (original authored work)

### Validation
- Compare extracted metadata with actual Shamela web page
- Ensure no field contamination (text bleeding between fields)
- Verify author enrichment merges data correctly
