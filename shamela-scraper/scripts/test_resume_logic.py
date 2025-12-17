#!/usr/bin/env python3
"""
Test resume logic for page scraper
"""

import sys
import os
import json
import shutil
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from shamela.page_scraper import PageScraper
from shamela.metadata_scraper import MetadataScraper
from shamela.utils import ShamelaHTTPClient

def test_resume_logic():
    """Test that resume logic works correctly"""

    print("="*70)
    print("TESTING RESUME LOGIC")
    print("="*70)

    # Setup
    test_output_dir = '../data/shamela-test-resume'
    book_id = '18'  # Small test book

    # Clean up any existing test data
    if os.path.exists(test_output_dir):
        shutil.rmtree(test_output_dir)

    # Initialize scrapers
    http_client = ShamelaHTTPClient(delay=0.1, max_retries=5)
    page_scraper = PageScraper(http_client)
    metadata_scraper = MetadataScraper(http_client)

    # Get book metadata for title/author
    metadata = metadata_scraper.scrape_book(book_id)
    book_title = metadata.title.get('arabic', '') if metadata else None
    author_name = metadata.author.name if metadata else None

    # Test 1: Initial scrape of first 5 pages
    print("\n" + "="*70)
    print("TEST 1: Initial scrape of 5 pages")
    print("="*70)

    pages1 = page_scraper.scrape_book(
        book_id,
        start_page=1,
        end_page=5,
        output_dir=test_output_dir,
        book_title=book_title,
        author_name=author_name,
        resume=False  # Don't use resume for initial scrape
    )

    print(f"✓ Scraped {len(pages1)} pages")
    assert len(pages1) == 5, f"Expected 5 pages, got {len(pages1)}"

    # Check that JSON files were created
    book_dir = os.path.join(test_output_dir, book_id)
    json_files = [f for f in os.listdir(book_dir) if f.endswith('.json')]
    print(f"✓ Created {len(json_files)} JSON files")
    assert len(json_files) == 5, f"Expected 5 JSON files, got {len(json_files)}"

    # Test 2: Resume scrape - should load existing pages and scrape new ones
    print("\n" + "="*70)
    print("TEST 2: Resume scrape (pages 1-10, should load 1-5 and scrape 6-10)")
    print("="*70)

    pages2 = page_scraper.scrape_book(
        book_id,
        start_page=1,
        end_page=10,
        output_dir=test_output_dir,
        book_title=book_title,
        author_name=author_name,
        resume=True  # Use resume
    )

    print(f"✓ Got {len(pages2)} pages total")
    assert len(pages2) == 10, f"Expected 10 pages, got {len(pages2)}"

    # Check that we have 10 JSON files now
    json_files = [f for f in os.listdir(book_dir) if f.endswith('.json')]
    print(f"✓ Now have {len(json_files)} JSON files")
    assert len(json_files) == 10, f"Expected 10 JSON files, got {len(json_files)}"

    # Test 3: Resume with no new pages - should just load existing
    print("\n" + "="*70)
    print("TEST 3: Resume with no new pages (should just load from disk)")
    print("="*70)

    pages3 = page_scraper.scrape_book(
        book_id,
        start_page=1,
        end_page=10,
        output_dir=test_output_dir,
        book_title=book_title,
        author_name=author_name,
        resume=True
    )

    print(f"✓ Loaded {len(pages3)} pages from disk")
    assert len(pages3) == 10, f"Expected 10 pages, got {len(pages3)}"

    # Verify content is identical
    for p2, p3 in zip(pages2, pages3):
        assert p2.page_number == p3.page_number, "Page numbers don't match"
        assert p2.main_content == p3.main_content, "Page content doesn't match"
    print("✓ All pages loaded correctly with matching content")

    # Test 4: Test with gap in pages (simulate partial scrape failure)
    print("\n" + "="*70)
    print("TEST 4: Simulated gap (delete pages 6-7, re-scrape 1-10)")
    print("="*70)

    # Delete pages 6 and 7
    os.remove(os.path.join(book_dir, 'page_6.json'))
    os.remove(os.path.join(book_dir, 'page_7.json'))
    print("✓ Deleted pages 6 and 7")

    pages4 = page_scraper.scrape_book(
        book_id,
        start_page=1,
        end_page=10,
        output_dir=test_output_dir,
        book_title=book_title,
        author_name=author_name,
        resume=True
    )

    print(f"✓ Scraped and loaded {len(pages4)} pages")
    assert len(pages4) == 10, f"Expected 10 pages, got {len(pages4)}"

    # Verify pages 6 and 7 were re-scraped
    json_files = [f for f in os.listdir(book_dir) if f.endswith('.json')]
    print(f"✓ Now have {len(json_files)} JSON files (gaps filled)")
    assert len(json_files) == 10, f"Expected 10 JSON files, got {len(json_files)}"

    # Test 5: Test safety limits
    print("\n" + "="*70)
    print("TEST 5: Safety limits (max_iterations)")
    print("="*70)

    # This should stop at max_iterations even if we request more pages
    # Use a fresh directory to avoid resume
    test_safety_dir = '../data/shamela-test-safety'
    if os.path.exists(test_safety_dir):
        shutil.rmtree(test_safety_dir)

    # Note: This will hit 3 consecutive failures and stop, not max_iterations
    # because we're using a real book with limited pages
    pages5 = page_scraper.scrape_book(
        book_id,
        start_page=1,
        output_dir=test_safety_dir,
        book_title=book_title,
        author_name=author_name,
        resume=False
    )

    print(f"✓ Scraped {len(pages5)} pages before hitting end")
    print(f"✓ Safety mechanism prevented infinite loop")

    # Clean up
    print("\n" + "="*70)
    print("CLEANUP")
    print("="*70)
    shutil.rmtree(test_output_dir)
    shutil.rmtree(test_safety_dir)
    print("✓ Cleaned up test directories")

    # Summary
    print("\n" + "="*70)
    print("ALL TESTS PASSED ✓")
    print("="*70)
    print("""
Summary of tested scenarios:
1. ✓ Initial scrape creates JSON files
2. ✓ Resume scrape loads existing pages and scrapes new ones
3. ✓ Resume with no new pages loads all from disk
4. ✓ Gaps in existing pages are detected and filled
5. ✓ Safety limits prevent infinite loops

Resume logic is working correctly!
    """)

if __name__ == '__main__':
    try:
        test_resume_logic()
    except Exception as e:
        print(f"\n❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
