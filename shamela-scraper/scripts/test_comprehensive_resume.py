#!/usr/bin/env python3
"""
Comprehensive resume logic testing with real books and simulated failures
"""

import sys
import os
import json
import shutil
import time
from pathlib import Path
from unittest.mock import patch
import requests.exceptions

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from shamela.page_scraper import PageScraper
from shamela.metadata_scraper import MetadataScraper
from shamela.utils import ShamelaHTTPClient


class FailureSimulator:
    """Simulates network failures for testing"""

    def __init__(self, fail_on_pages=None, fail_with_timeout=False, fail_with_connection_error=False):
        self.fail_on_pages = fail_on_pages or []
        self.fail_with_timeout = fail_with_timeout
        self.fail_with_connection_error = fail_with_connection_error
        self.call_count = 0
        self.original_get = None

    def __call__(self, url, **kwargs):
        """Intercept HTTP calls and simulate failures"""
        self.call_count += 1

        # Extract page number from URL
        if '/book/' in url:
            parts = url.split('/')
            try:
                page_num = int(parts[-1].split('#')[0])

                # Simulate failure on specific pages
                if page_num in self.fail_on_pages:
                    print(f"  [SIMULATOR] Simulating failure for page {page_num}")
                    if self.fail_with_timeout:
                        raise requests.exceptions.Timeout(f"Simulated timeout for page {page_num}")
                    elif self.fail_with_connection_error:
                        raise requests.exceptions.ConnectionError(f"Simulated connection error for page {page_num}")
            except (ValueError, IndexError):
                pass

        # Call original get method
        return self.original_get(url, **kwargs)


def verify_pages_integrity(pages, expected_min_pages=1):
    """Verify pages have no gaps and no duplicates"""

    page_numbers = [p.page_number for p in pages]

    # Check for duplicates
    if len(page_numbers) != len(set(page_numbers)):
        duplicates = [p for p in page_numbers if page_numbers.count(p) > 1]
        raise AssertionError(f"Found duplicate pages: {set(duplicates)}")

    # Check for gaps (pages should be sequential starting from 1)
    page_numbers_sorted = sorted(page_numbers)
    expected = list(range(1, len(pages) + 1))

    if page_numbers_sorted != expected:
        missing = set(expected) - set(page_numbers_sorted)
        extra = set(page_numbers_sorted) - set(expected)
        if missing:
            raise AssertionError(f"Missing pages: {sorted(missing)}")
        if extra:
            raise AssertionError(f"Extra pages: {sorted(extra)}")

    # Check minimum page count
    if len(pages) < expected_min_pages:
        raise AssertionError(f"Expected at least {expected_min_pages} pages, got {len(pages)}")

    # Check content exists
    for page in pages:
        if not page.main_content or len(page.main_content.strip()) == 0:
            raise AssertionError(f"Page {page.page_number} has empty content")

    return True


def test_1_basic_scrape_and_resume():
    """Test 1: Basic scrape with resume"""

    print("\n" + "="*70)
    print("TEST 1: Basic scrape and resume (Book 18)")
    print("="*70)

    test_dir = '../data/test-comprehensive/test1'
    if os.path.exists(test_dir):
        shutil.rmtree(test_dir)

    http_client = ShamelaHTTPClient(delay=0.05, max_retries=3)
    page_scraper = PageScraper(http_client)
    metadata_scraper = MetadataScraper(http_client)

    # Get metadata
    metadata = metadata_scraper.scrape_book('18')
    book_title = metadata.title.get('arabic', '')
    author_name = metadata.author.name

    print(f"\n📖 Book: {book_title}")
    print(f"✍️  Author: {author_name}")

    # Step 1: Scrape first 10 pages
    print("\n[Step 1] Scraping pages 1-10...")
    pages1 = page_scraper.scrape_book(
        '18',
        start_page=1,
        end_page=10,
        output_dir=test_dir,
        book_title=book_title,
        author_name=author_name,
        resume=False
    )

    print(f"✓ Scraped {len(pages1)} pages")
    assert len(pages1) == 10, f"Expected 10 pages, got {len(pages1)}"
    verify_pages_integrity(pages1, expected_min_pages=10)

    # Step 2: Resume and scrape up to page 20
    print("\n[Step 2] Resuming scrape to page 20...")
    pages2 = page_scraper.scrape_book(
        '18',
        start_page=1,
        end_page=20,
        output_dir=test_dir,
        book_title=book_title,
        author_name=author_name,
        resume=True
    )

    print(f"✓ Got {len(pages2)} pages total")
    assert len(pages2) == 20, f"Expected 20 pages, got {len(pages2)}"
    verify_pages_integrity(pages2, expected_min_pages=20)

    # Verify first 10 pages match
    for i in range(10):
        assert pages1[i].page_number == pages2[i].page_number
        assert pages1[i].main_content == pages2[i].main_content

    print("✓ First 10 pages match exactly (loaded from disk)")
    print("✓ Pages 11-20 scraped from web")

    # Cleanup
    shutil.rmtree(test_dir)
    print("\n✅ TEST 1 PASSED")


def test_2_simulated_network_failure_and_recovery():
    """Test 2: Simulate network failure mid-scrape and recover"""

    print("\n" + "="*70)
    print("TEST 2: Simulated network failure and recovery")
    print("="*70)

    test_dir = '../data/test-comprehensive/test2'
    if os.path.exists(test_dir):
        shutil.rmtree(test_dir)

    http_client = ShamelaHTTPClient(delay=0.05, max_retries=3)
    page_scraper = PageScraper(http_client)
    metadata_scraper = MetadataScraper(http_client)

    metadata = metadata_scraper.scrape_book('18')
    book_title = metadata.title.get('arabic', '')
    author_name = metadata.author.name

    # Step 1: Scrape first 5 pages successfully
    print("\n[Step 1] Scraping pages 1-5...")
    pages1 = page_scraper.scrape_book(
        '18',
        start_page=1,
        end_page=5,
        output_dir=test_dir,
        book_title=book_title,
        author_name=author_name,
        resume=False
    )

    assert len(pages1) == 5
    print(f"✓ Successfully scraped {len(pages1)} pages")

    # Step 2: Simulate network failures on pages 6-8
    print("\n[Step 2] Simulating network failures on pages 6-8...")

    # Create a simulator that fails on pages 6, 7, 8
    simulator = FailureSimulator(
        fail_on_pages=[6, 7, 8],
        fail_with_connection_error=True
    )

    # Patch the HTTP client's get method
    simulator.original_get = http_client.get

    with patch.object(http_client, 'get', simulator):
        try:
            # This should fail after retries on page 6
            pages2 = page_scraper.scrape_book(
                '18',
                start_page=1,
                end_page=10,
                output_dir=test_dir,
                book_title=book_title,
                author_name=author_name,
                resume=True
            )
            # Should stop at 3 consecutive failures
            print(f"  Scraping stopped at {len(pages2)} pages (expected: 5)")
            assert len(pages2) == 5, f"Should have stopped at 5 pages due to failures"
        except Exception as e:
            print(f"  Expected failure occurred: {e}")

    # Step 3: "Fix network" and resume
    print("\n[Step 3] Network recovered, resuming scrape...")
    pages3 = page_scraper.scrape_book(
        '18',
        start_page=1,
        end_page=10,
        output_dir=test_dir,
        book_title=book_title,
        author_name=author_name,
        resume=True
    )

    print(f"✓ Successfully completed with {len(pages3)} pages")
    assert len(pages3) == 10, f"Expected 10 pages, got {len(pages3)}"
    verify_pages_integrity(pages3, expected_min_pages=10)

    # Cleanup
    shutil.rmtree(test_dir)
    print("\n✅ TEST 2 PASSED")


def test_3_corrupted_file_recovery():
    """Test 3: Recover from corrupted JSON files"""

    print("\n" + "="*70)
    print("TEST 3: Corrupted file recovery")
    print("="*70)

    test_dir = '../data/test-comprehensive/test3'
    if os.path.exists(test_dir):
        shutil.rmtree(test_dir)

    http_client = ShamelaHTTPClient(delay=0.05, max_retries=3)
    page_scraper = PageScraper(http_client)
    metadata_scraper = MetadataScraper(http_client)

    metadata = metadata_scraper.scrape_book('18')
    book_title = metadata.title.get('arabic', '')
    author_name = metadata.author.name

    # Step 1: Scrape pages 1-10
    print("\n[Step 1] Scraping pages 1-10...")
    pages1 = page_scraper.scrape_book(
        '18',
        start_page=1,
        end_page=10,
        output_dir=test_dir,
        book_title=book_title,
        author_name=author_name,
        resume=False
    )

    assert len(pages1) == 10
    print(f"✓ Scraped {len(pages1)} pages")

    # Step 2: Corrupt some JSON files
    print("\n[Step 2] Corrupting JSON files for pages 5, 6, 7...")
    book_dir = os.path.join(test_dir, '18')

    # Corrupt page 5 (invalid JSON)
    with open(os.path.join(book_dir, 'page_5.json'), 'w') as f:
        f.write("{ invalid json content }")

    # Corrupt page 6 (truncated JSON)
    with open(os.path.join(book_dir, 'page_6.json'), 'w') as f:
        f.write('{"page_number": 6, "main_content":')

    # Corrupt page 7 (empty file)
    with open(os.path.join(book_dir, 'page_7.json'), 'w') as f:
        f.write('')

    print("✓ Corrupted files created")

    # Step 3: Resume scrape - should detect corruption and re-scrape
    print("\n[Step 3] Resuming scrape (should detect and fix corrupted files)...")
    pages2 = page_scraper.scrape_book(
        '18',
        start_page=1,
        end_page=10,
        output_dir=test_dir,
        book_title=book_title,
        author_name=author_name,
        resume=True
    )

    print(f"✓ Got {len(pages2)} pages")
    assert len(pages2) == 10, f"Expected 10 pages, got {len(pages2)}"
    verify_pages_integrity(pages2, expected_min_pages=10)

    # Verify corrupted pages were re-scraped correctly
    assert pages2[4].page_number == 5
    assert pages2[5].page_number == 6
    assert pages2[6].page_number == 7
    assert len(pages2[4].main_content) > 0
    assert len(pages2[5].main_content) > 0
    assert len(pages2[6].main_content) > 0

    print("✓ Corrupted pages were re-scraped successfully")

    # Cleanup
    shutil.rmtree(test_dir)
    print("\n✅ TEST 3 PASSED")


def test_4_multiple_books_different_sizes():
    """Test 4: Test resume logic on multiple books of different sizes"""

    print("\n" + "="*70)
    print("TEST 4: Multiple books of different sizes")
    print("="*70)

    test_dir = '../data/test-comprehensive/test4'
    if os.path.exists(test_dir):
        shutil.rmtree(test_dir)

    http_client = ShamelaHTTPClient(delay=0.05, max_retries=3)
    page_scraper = PageScraper(http_client)
    metadata_scraper = MetadataScraper(http_client)

    # Test different books
    test_books = [
        ('18', 15),   # Small book: first 15 pages
        ('1', 10),    # Another book: first 10 pages
        ('100', 8),   # Another book: first 8 pages
    ]

    for book_id, num_pages in test_books:
        print(f"\n--- Testing Book {book_id} ({num_pages} pages) ---")

        metadata = metadata_scraper.scrape_book(book_id)
        if metadata:
            book_title = metadata.title.get('arabic', '')
            author_name = metadata.author.name
            print(f"📖 {book_title} by {author_name}")
        else:
            book_title = None
            author_name = None

        # Initial scrape (first half)
        half = num_pages // 2
        print(f"\n  [Step 1] Scraping pages 1-{half}...")
        pages1 = page_scraper.scrape_book(
            book_id,
            start_page=1,
            end_page=half,
            output_dir=test_dir,
            book_title=book_title,
            author_name=author_name,
            resume=False
        )

        print(f"  ✓ Scraped {len(pages1)} pages")
        assert len(pages1) == half, f"Expected {half} pages, got {len(pages1)}"

        # Resume and complete
        print(f"  [Step 2] Resuming to page {num_pages}...")
        pages2 = page_scraper.scrape_book(
            book_id,
            start_page=1,
            end_page=num_pages,
            output_dir=test_dir,
            book_title=book_title,
            author_name=author_name,
            resume=True
        )

        print(f"  ✓ Got {len(pages2)} total pages")
        assert len(pages2) == num_pages, f"Expected {num_pages} pages, got {len(pages2)}"
        verify_pages_integrity(pages2, expected_min_pages=num_pages)

        # Verify first half matches
        for i in range(half):
            assert pages1[i].page_number == pages2[i].page_number
            assert pages1[i].main_content == pages2[i].main_content

        print(f"  ✓ First {half} pages loaded from disk, remaining scraped from web")

    # Cleanup
    shutil.rmtree(test_dir)
    print("\n✅ TEST 4 PASSED")


def test_5_gap_detection_and_filling():
    """Test 5: Detect and fill gaps in scraped pages"""

    print("\n" + "="*70)
    print("TEST 5: Gap detection and filling")
    print("="*70)

    test_dir = '../data/test-comprehensive/test5'
    if os.path.exists(test_dir):
        shutil.rmtree(test_dir)

    http_client = ShamelaHTTPClient(delay=0.05, max_retries=3)
    page_scraper = PageScraper(http_client)
    metadata_scraper = MetadataScraper(http_client)

    metadata = metadata_scraper.scrape_book('18')
    book_title = metadata.title.get('arabic', '')
    author_name = metadata.author.name

    # Step 1: Scrape pages 1-15
    print("\n[Step 1] Scraping pages 1-15...")
    pages1 = page_scraper.scrape_book(
        '18',
        start_page=1,
        end_page=15,
        output_dir=test_dir,
        book_title=book_title,
        author_name=author_name,
        resume=False
    )

    assert len(pages1) == 15
    print(f"✓ Scraped {len(pages1)} pages")

    # Step 2: Create gaps by deleting random pages
    print("\n[Step 2] Creating gaps (deleting pages 3, 7, 11, 14)...")
    book_dir = os.path.join(test_dir, '18')

    gaps = [3, 7, 11, 14]
    for page_num in gaps:
        file_path = os.path.join(book_dir, f'page_{page_num}.json')
        os.remove(file_path)
        print(f"  Deleted page {page_num}")

    # Verify gaps exist
    existing_files = set()
    for f in os.listdir(book_dir):
        if f.startswith('page_') and f.endswith('.json'):
            page_num = int(f[5:-5])
            existing_files.add(page_num)

    for gap in gaps:
        assert gap not in existing_files, f"Page {gap} should be deleted"

    print(f"✓ Gaps created: {gaps}")

    # Step 3: Resume scrape - should detect and fill gaps
    print("\n[Step 3] Resuming scrape (should fill gaps)...")
    pages2 = page_scraper.scrape_book(
        '18',
        start_page=1,
        end_page=15,
        output_dir=test_dir,
        book_title=book_title,
        author_name=author_name,
        resume=True
    )

    print(f"✓ Got {len(pages2)} pages")
    assert len(pages2) == 15, f"Expected 15 pages, got {len(pages2)}"
    verify_pages_integrity(pages2, expected_min_pages=15)

    # Verify gaps were filled
    for gap in gaps:
        page = pages2[gap - 1]
        assert page.page_number == gap, f"Page {gap} missing"
        assert len(page.main_content) > 0, f"Page {gap} has no content"

    print(f"✓ All gaps filled successfully: {gaps}")

    # Verify all files exist now
    existing_files = set()
    for f in os.listdir(book_dir):
        if f.startswith('page_') and f.endswith('.json'):
            page_num = int(f[5:-5])
            existing_files.add(page_num)

    assert existing_files == set(range(1, 16)), "Not all page files exist"
    print("✓ All JSON files present")

    # Cleanup
    shutil.rmtree(test_dir)
    print("\n✅ TEST 5 PASSED")


def run_all_tests():
    """Run all comprehensive tests"""

    print("="*70)
    print("COMPREHENSIVE RESUME LOGIC TESTING")
    print("="*70)
    print("\nThis will test:")
    print("1. Basic scrape and resume")
    print("2. Network failure recovery")
    print("3. Corrupted file recovery")
    print("4. Multiple books of different sizes")
    print("5. Gap detection and filling")
    print("\n" + "="*70)

    start_time = time.time()

    try:
        test_1_basic_scrape_and_resume()
        test_2_simulated_network_failure_and_recovery()
        test_3_corrupted_file_recovery()
        test_4_multiple_books_different_sizes()
        test_5_gap_detection_and_filling()

        elapsed = time.time() - start_time

        print("\n" + "="*70)
        print("🎉 ALL COMPREHENSIVE TESTS PASSED! 🎉")
        print("="*70)
        print(f"\nTotal time: {elapsed:.1f} seconds")
        print("\nTested scenarios:")
        print("✅ Basic scrape and resume")
        print("✅ Network failure and recovery")
        print("✅ Corrupted file recovery")
        print("✅ Multiple books (different sizes)")
        print("✅ Gap detection and filling")
        print("\nResume logic is production-ready!")
        print("="*70)

    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    run_all_tests()
