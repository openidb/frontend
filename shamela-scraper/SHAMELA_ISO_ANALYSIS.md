# Shamela ISO Analysis & Next Steps

## Summary

Successfully downloaded and analyzed the Shamela Desktop Application ISO (version 1446.1, September 2024, 12GB).

## What We Found

### ISO Structure
```
/Volumes/shamela.f.1446.1/
├── shamela.exe (84KB launcher)
└── data/
    ├── shamela.bin (12GB - encrypted 7z archive)
    ├── 7za.exe / 7za64.exe (7-Zip executables)
    └── size.inf (uncompressed size: ~14.9GB)
```

### Archive Contents
The `shamela.bin` file contains:
- **8,000+ SQLite database files** organized by book ID
  - Pattern: `database/book/001/1.db`, `database/book/003/3.db`, etc.
  - Each `.db` file contains the complete text for one book
- **Desktop application** (Windows, with Lucene search indexes)
- **Java Runtime Environment** (bundled)

### The Problem: Encryption
- Archive is encrypted with **7zAES** (password-protected)
- Password is embedded in the Windows application
- Common passwords tested: FAILED
  - Empty password, "shamela", "SHAMELA", "shamela.ws", "1446", "1446.1"
  - Arabic variations: "المكتبة الشاملة", "almaktaba"

### Attempted Extractions
1. ✗ Direct 7z extraction - requires password
2. ✗ Docker + Wine - permissions issues, architecture mismatch
3. ✗ Password guessing - no common passwords work
4. ✗ String extraction from executable - password not found

## Options Moving Forward

### Option 1: Windows VM (Most Reliable)
**Install and run the actual Shamela application on Windows**

**Pros:**
- Application will decrypt automatically
- Access to all 8,567 books
- Can explore the SQLite schema
- One-time setup, permanent access

**Cons:**
- Requires Windows (VM, Parallels, or Boot Camp)
- ~30GB disk space needed (12GB ISO + extraction)
- Setup time: 1-2 hours

**Steps:**
1. Install Windows VM (UTM, Parallels, or VirtualBox)
2. Mount the ISO in Windows
3. Run `shamela.exe`
4. Application extracts databases to `C:\Program Files\Shamela\` or similar
5. Copy extracted `.db` files back to macOS
6. Create converter to transform SQLite → your project format

### Option 2: Continue Web Crawling (Current Progress)
**Resume the parallel crawler with better rate limiting**

**Pros:**
- Already have infrastructure built
- 229 books already crawled successfully
- No Windows required
- Complete control over data format

**Cons:**
- Slow: ~7 hours for 229 books = ~10 days for all 8,567 books
- Server rate limiting (503 errors)
- Incomplete: only ~2.7% done

**Steps:**
1. Reduce crawler workers from 10 to 2-3
2. Increase delay from 0.3s to 1-2s
3. Add adaptive backoff when encountering 503s
4. Run overnight/off-peak hours
5. Resume from book 230 onwards

### Option 3: Password Cracking (Not Recommended)
**Use hashcat/john to brute force the password**

**Pros:**
- Would give direct access to archive

**Cons:**
- Extremely time-consuming (days/weeks/months)
- May never find password if it's long/random
- High computational cost
- Not guaranteed to succeed

### Option 4: Hybrid Approach (Recommended)
**Combine multiple strategies**

1. **Short-term (Today):**
   - Continue crawling with reduced rate (2-3 workers, 1s delay)
   - Target: 50-100 books per day
   - Focus on most popular/important books first

2. **Medium-term (This Week):**
   - Set up Windows VM using UTM (free, ARM-native for M-series Macs)
   - Extract all databases from Shamela application
   - Compare extracted data with crawled data

3. **Long-term:**
   - Create converter from Shamela SQLite → your project format
   - Merge crawled HTML + extracted databases
   - Build unified dataset

## Recommended Next Steps

### Immediate Actions:

1. **Adjust the crawler** (30 minutes):
   ```bash
   # Modify crawl_all_html_parallel.py:
   - workers: 10 → 3
   - delay: 0.3 → 1.5
   - Add: exponential backoff for 503 errors
   ```

2. **Set up Windows VM** (1-2 hours):
   ```bash
   # Install UTM (free, works on Apple Silicon)
   brew install --cask utm

   # Download Windows 11 ARM
   # Create VM, install Windows
   # Mount shamela ISO, run application
   # Extract databases
   ```

3. **Create SQLite analyzer** (30 minutes):
   ```python
   # scripts/analyze_shamela_db.py
   # - Connect to extracted .db files
   # - Explore schema
   # - Compare with HTML format
   # - Design converter
   ```

## Current Status

### Completed:
- ✓ Parallel web crawler (10 workers)
- ✓ WARC converter with 1GB chunks
- ✓ CDX indexing
- ✓ Shamela ISO download & analysis
- ✓ Docker extraction attempts

### In Progress:
- 229 books crawled via HTML (2.7% of 8,567)
- Crawler paused due to rate limiting

### Blocked:
- Shamela ISO extraction (encrypted, need Windows)

## File Locations

- **Downloaded ISO:** `/Users/abdulrahman/Downloads/shamela.full.1446.1.iso`
- **Mounted ISO:** `/Volumes/shamela.f.1446.1/`
- **Crawled HTML:** `shamela-scraper/data/shamela/raw/books/`
- **WARC files:** `shamela-scraper/data/shamela/raw/warc/`
- **Docker scripts:** `shamela-scraper/docker-shamela/`
- **This analysis:** `shamela-scraper/SHAMELA_ISO_ANALYSIS.md`

## Estimated Timeline

| Approach | Time to Complete | Effort |
|----------|------------------|--------|
| Web crawling only | 10-15 days | Low (automated) |
| Windows VM extraction | 2-3 hours | Medium (one-time) |
| Hybrid | 1 day + background crawling | Medium |

## My Recommendation

**Use the Hybrid Approach:**

1. Tonight: Resume crawler at reduced rate (will get 50-100 more books)
2. Tomorrow: Set up Windows VM in UTM, extract all databases
3. This week: Build SQLite → Project converter
4. Result: Complete dataset + infrastructure for future updates

This gives you:
- Immediate progress (crawling continues)
- Complete solution (all 8,567 books)
- Best data quality (official database format)
- Future flexibility (can update when Shamela releases new versions)

---

**Decision Point:** Which option would you like to pursue?
