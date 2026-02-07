# OpenITI to Kavita Pipeline

This pipeline converts Shamela-sourced Arabic texts from OpenITI (0025AH-1450AH) to EPUB format for use with Kavita.

## Setup Complete ✓

- Python environment with `openiti` and `oitei` libraries
- Pandoc for EPUB generation
- Arabic RTL CSS stylesheet
- Conversion script tested on 3 sample books

## Test Results

Successfully converted 3 Shamela books to EPUB:

1. **Ghurar Khasais** by Abu Ishaq Watwat (d. 718 AH) - 411 KB
2. **Ajrumiyya** by Ibn Ajrum (d. 723 AH) - 9.1 KB
3. **Lisan al-Arab** by Ibn Manzur Ifriqi (d. 711 AH) - 8.7 MB

All EPUBs copied to `kavita/library/` and ready to test in Kavita.

## Directory Structure

```
openiti-pipeline/
├── env/                    # Python virtual environment
├── workspace/              # Downloaded OpenITI repositories
│   └── 0725AH/            # Sample repository (contains 63 Shamela texts)
├── scripts/
│   ├── convert_to_epub.py # Main conversion script
│   ├── arabic-rtl.css     # RTL stylesheet for EPUBs
│   └── test_samples.txt   # List of test books
└── output/                 # Generated EPUB files
```

## Usage

### Convert Single File

```bash
cd openiti-pipeline
source env/bin/activate
python scripts/convert_to_epub.py workspace/0725AH/data/.../book.mARkdown output/
```

### Batch Convert from File List

```bash
python scripts/convert_to_epub.py --batch scripts/test_samples.txt output/
```

## Next Steps

1. **Test in Kavita**: Open http://localhost:5001 and add the `/library` path as a library
2. **Verify Quality**: Check RTL rendering, metadata, and text quality
3. **Full Download**: Clone entire OpenITI RELEASE repository
4. **Scale Up**: Create batch script to convert all Shamela texts (0025-1450 AH)

## File Naming Pattern Discovered

Shamela files have two patterns:
- `AuthorDeathYearAuthorName.BookTitle.Shamela[ID]-ara1` (no extension)
- `AuthorDeathYearAuthorName.BookTitle.Shamela[ID]-ara1.mARkdown` (with extension)

Both are valid mARkdown format files.

## Conversion Process

1. **mARkdown → TEI XML** (using `oitei` library)
2. **TEI XML → HTML** (custom conversion for compatibility)
3. **HTML → EPUB** (using Pandoc with Arabic RTL CSS)

## Metadata Extraction

Metadata extracted from filename:
- Death year (first 4 digits)
- Author name (camelCase converted to readable)
- Book title (camelCase converted to readable)
- Shamela ID (for source attribution)

## Known Limitations

- Pandoc 3.x doesn't support TEI input directly (workaround: TEI → HTML → EPUB)
- OCR errors may be present in source texts
- Some special mARkdown tags may not convert perfectly
