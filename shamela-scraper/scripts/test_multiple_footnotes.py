#!/usr/bin/env python3
"""Test script to demonstrate multiple footnotes on a page"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from shamela.page_scraper import PageScraper
from shamela.utils import ShamelaHTTPClient

def test_page_with_footnotes(book_id: str, page_num: int):
    """Test a specific page for footnotes"""
    http_client = ShamelaHTTPClient(delay=0.15)
    scraper = PageScraper(http_client)

    print(f"Testing book {book_id}, page {page_num}")
    print("=" * 80)

    page_data = scraper.scrape_page(book_id, 1, page_num)

    print(f"\nPage Number: {page_data.page_number}")
    print(f"Number of footnotes: {len(page_data.footnotes)}")
    print()

    if page_data.footnotes:
        print("=" * 80)
        print("FOOTNOTES:")
        print("=" * 80)
        for i, fn in enumerate(page_data.footnotes, 1):
            print(f"\n{i}. Marker: {fn.marker}")
            print(f"   Content: {fn.content[:200]}..." if len(fn.content) > 200 else f"   Content: {fn.content}")

        print("\n" + "=" * 80)
        print("MAIN CONTENT (first 500 chars):")
        print("=" * 80)
        print(page_data.main_content[:500])
        print("...")
    else:
        print("No footnotes found on this page")
        print("\n" + "=" * 80)
        print("MAIN CONTENT (first 500 chars):")
        print("=" * 80)
        print(page_data.main_content[:500])
        print("...")

if __name__ == "__main__":
    # Test a few pages that likely have footnotes
    pages_to_test = [
        ('23', 5),   # We know this has 1 footnote
        ('23', 17),  # Try another page
        ('23', 20),  # Try another page
    ]

    for book_id, page_num in pages_to_test:
        test_page_with_footnotes(book_id, page_num)
        print("\n" + "=" * 80 + "\n")
