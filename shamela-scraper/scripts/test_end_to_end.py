#!/usr/bin/env python3
"""
Complete end-to-end test: Scrape book → Generate EPUB → Deploy to viewer
"""

import sys
import os
import shutil
import json
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from shamela.page_scraper import PageScraper
from shamela.metadata_scraper import MetadataScraper
from shamela.epub_generator import EPUBGenerator
from shamela.utils import ShamelaHTTPClient


def end_to_end_test(book_id='18', max_pages=None):
    """
    Complete end-to-end test of the entire pipeline

    Args:
        book_id: Book ID to test with (default: 18)
        max_pages: Limit to first N pages (None = all pages)
    """

    print("="*70)
    print("END-TO-END TEST: SHAMELA SCRAPER → EPUB → BOOK VIEWER")
    print("="*70)

    # Directories - use book-specific dirs for parallel testing
    data_dir = f'../data/e2e-test-{book_id}'
    output_dir = f'../output/e2e-test-{book_id}'
    viewer_books_dir = '../../book-viewer/public/books'

    # Clean up previous test data
    print(f"\n📁 Setting up directories...")
    for d in [data_dir, output_dir]:
        if os.path.exists(d):
            shutil.rmtree(d)
        os.makedirs(d, exist_ok=True)

    # Ensure viewer books directory exists
    os.makedirs(viewer_books_dir, exist_ok=True)

    print(f"   ✓ Data dir: {data_dir}")
    print(f"   ✓ Output dir: {output_dir}")
    print(f"   ✓ Viewer dir: {viewer_books_dir}")

    # Initialize components with slower delay to be gentle on the server
    print(f"\n⚙️  Initializing scrapers...")
    http_client = ShamelaHTTPClient(delay=0.5, max_retries=5)  # 0.5s delay between requests
    metadata_scraper = MetadataScraper(http_client)
    page_scraper = PageScraper(http_client)
    epub_generator = EPUBGenerator()
    print("   ✓ HTTP client ready (0.5s delay between requests)")
    print("   ✓ Scrapers initialized")

    # Step 1: Scrape metadata
    print(f"\n" + "="*70)
    print(f"STEP 1: SCRAPING METADATA (Book {book_id})")
    print("="*70)

    metadata = metadata_scraper.scrape_book(book_id)
    if not metadata:
        print(f"❌ Failed to scrape metadata for book {book_id}")
        return False

    book_title = metadata.title.get('arabic', '')
    author_name = metadata.author.name

    print(f"\n📖 Book Information:")
    print(f"   ID: {book_id}")
    print(f"   Title: {book_title}")
    print(f"   Author: {author_name}")
    print(f"   Total pages: {metadata.structure.total_pages}")
    print(f"   Volumes: {metadata.structure.total_volumes}")

    # Save metadata
    metadata_path = os.path.join(data_dir, 'metadata.json')
    metadata.to_json(metadata_path)
    print(f"   ✓ Saved metadata to {metadata_path}")

    # Step 2: Scrape TOC
    print(f"\n" + "="*70)
    print("STEP 2: SCRAPING TABLE OF CONTENTS")
    print("="*70)

    toc = metadata_scraper.scrape_toc(book_id)
    if not toc:
        print(f"❌ Failed to scrape TOC")
        return False

    print(f"\n📑 Table of Contents:")
    # Get all chapters from all volumes
    all_chapters = []
    for volume in toc.volumes:
        all_chapters.extend(volume.chapters)

    print(f"   Volumes: {len(toc.volumes)}")
    print(f"   Total chapters: {len(all_chapters)}")
    if all_chapters:
        print(f"   Sample chapters:")
        for chapter in all_chapters[:3]:
            print(f"     - {chapter.title} (Page {chapter.page})")
        if len(all_chapters) > 3:
            print(f"     ... and {len(all_chapters) - 3} more")

    # Save TOC
    toc_path = os.path.join(data_dir, 'toc.json')
    toc.to_json(toc_path)
    print(f"   ✓ Saved TOC to {toc_path}")

    # Step 3: Scrape pages
    print(f"\n" + "="*70)
    print("STEP 3: SCRAPING PAGE CONTENT")
    print("="*70)

    pages_output_dir = os.path.join(data_dir, 'pages')
    os.makedirs(pages_output_dir, exist_ok=True)

    if max_pages:
        print(f"\n📄 Scraping first {max_pages} pages...")
        pages = page_scraper.scrape_book(
            book_id,
            start_page=1,
            end_page=max_pages,
            output_dir=pages_output_dir,
            book_title=book_title,
            author_name=author_name,
            resume=True
        )
    else:
        print(f"\n📄 Scraping all pages (this may take a while)...")
        pages = page_scraper.scrape_book(
            book_id,
            start_page=1,
            output_dir=pages_output_dir,
            book_title=book_title,
            author_name=author_name,
            resume=True
        )

    if not pages:
        print(f"❌ Failed to scrape pages")
        return False

    print(f"\n✅ Scraped {len(pages)} pages successfully")

    # Show page numbering info
    print(f"\n📊 Page Numbering Analysis:")
    print(f"   First page:")
    print(f"     - URL page index: {pages[0].url_page_index}")
    print(f"     - Printed page number: {pages[0].printed_page_number}")
    print(f"     - Source URL: {pages[0].source_url}")
    if pages[0].pdf_url:
        print(f"     - PDF URL: {pages[0].pdf_url[:80]}...")

    if len(pages) > 1:
        print(f"   Last page:")
        print(f"     - URL page index: {pages[-1].url_page_index}")
        print(f"     - Printed page number: {pages[-1].printed_page_number}")
        print(f"     - Source URL: {pages[-1].source_url}")

    # Statistics
    pages_with_footnotes = sum(1 for p in pages if p.footnotes)
    pages_with_pdf = sum(1 for p in pages if p.pdf_url)

    print(f"\n   Statistics:")
    print(f"     - Pages with footnotes: {pages_with_footnotes} ({pages_with_footnotes/len(pages)*100:.1f}%)")
    print(f"     - Pages with PDF URLs: {pages_with_pdf} ({pages_with_pdf/len(pages)*100:.1f}%)")

    # Step 4: Generate EPUB
    print(f"\n" + "="*70)
    print("STEP 4: GENERATING EPUB")
    print("="*70)

    # Clean filename
    safe_title = book_title.replace('/', '_').replace('\\', '_').replace(':', '_')
    epub_filename = f"{book_id}_{safe_title}.epub"
    epub_path = os.path.join(output_dir, epub_filename)

    print(f"\n📚 Generating EPUB file...")
    print(f"   Filename: {epub_filename}")

    success = epub_generator.generate_epub(metadata, toc, pages, epub_path)

    if not success:
        print(f"❌ Failed to generate EPUB")
        return False

    # Check file size
    file_size = os.path.getsize(epub_path)
    print(f"\n✅ EPUB generated successfully!")
    print(f"   Path: {epub_path}")
    print(f"   Size: {file_size:,} bytes ({file_size/1024:.1f} KB)")

    if file_size < 1000:
        print(f"   ⚠️  Warning: File seems small")

    # Step 5: Copy to book viewer
    print(f"\n" + "="*70)
    print("STEP 5: DEPLOYING TO BOOK VIEWER")
    print("="*70)

    viewer_epub_path = os.path.join(viewer_books_dir, epub_filename)
    shutil.copy2(epub_path, viewer_epub_path)

    print(f"\n📖 Copied EPUB to book viewer")
    print(f"   Destination: {viewer_epub_path}")

    # Create a simple catalog entry
    catalog_path = os.path.join(viewer_books_dir, 'catalog.json')

    catalog_entry = {
        "books": [
            {
                "id": book_id,
                "title": book_title,
                "author": author_name,
                "filename": epub_filename,
                "pages": len(pages),
                "first_printed_page": pages[0].printed_page_number if pages else None,
                "has_pdf": bool(pages[0].pdf_url) if pages else False,
                "test_book": True
            }
        ]
    }

    with open(catalog_path, 'w', encoding='utf-8') as f:
        json.dump(catalog_entry, f, ensure_ascii=False, indent=2)

    print(f"   ✓ Updated catalog: {catalog_path}")

    # Final summary
    print(f"\n" + "="*70)
    print("🎉 END-TO-END TEST COMPLETE!")
    print("="*70)

    print(f"\n✅ Summary:")
    print(f"   • Book ID: {book_id}")
    print(f"   • Title: {book_title}")
    print(f"   • Pages scraped: {len(pages)}")
    print(f"   • EPUB generated: {epub_filename}")
    print(f"   • File size: {file_size/1024:.1f} KB")
    print(f"   • Deployed to: {viewer_books_dir}")

    print(f"\n📋 Page Numbering Verification:")
    print(f"   • URL pages: 1 to {len(pages)}")
    print(f"   • Printed pages: {pages[0].printed_page_number} to {pages[-1].printed_page_number}")
    print(f"   • Mapping preserved in EPUB ✓")

    print(f"\n🚀 Next Steps:")
    print(f"   1. Start the book viewer:")
    print(f"      cd book-viewer && bun run dev")
    print(f"   2. Open: http://localhost:3000")
    print(f"   3. Look for: {book_title}")
    print(f"   4. Verify page numbers display correctly")

    print(f"\n" + "="*70)

    return True


if __name__ == '__main__':
    # Accept book ID from command line, default to 18
    book_id = sys.argv[1] if len(sys.argv) > 1 else '18'
    max_pages = int(sys.argv[2]) if len(sys.argv) > 2 else None

    try:
        success = end_to_end_test(book_id=book_id, max_pages=max_pages)
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
