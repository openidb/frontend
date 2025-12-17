#!/usr/bin/env python3
"""Test script to verify HTML preservation and footnote separation"""

import sys
import os
import json
sys.path.insert(0, os.path.dirname(__file__))

from shamela.page_scraper import PageScraper
from shamela.utils import ShamelaHTTPClient

def test_html_features(book_id: str, page_num: int):
    """Test HTML preservation and footnote extraction"""
    http_client = ShamelaHTTPClient(delay=0.15)
    scraper = PageScraper(http_client)

    print(f"Testing book {book_id}, page {page_num}")
    print("=" * 80)

    page_data = scraper.scrape_page(book_id, page_num, 1)

    print(f"\n✓ Page Number: {page_data.page_number}")
    print(f"✓ Number of footnotes: {len(page_data.footnotes)}")
    print(f"✓ Has main_content_html: {'Yes' if page_data.main_content_html else 'No'}")
    print(f"✓ Has footnotes_html: {'Yes' if page_data.footnotes_html else 'No'}")

    if page_data.footnotes:
        print("\n" + "=" * 80)
        print("FOOTNOTES (Separated):")
        print("=" * 80)
        for i, fn in enumerate(page_data.footnotes, 1):
            print(f"\n{i}. Marker: {fn.marker}")
            content_preview = fn.content[:100] + "..." if len(fn.content) > 100 else fn.content
            print(f"   Content: {content_preview}")

    print("\n" + "=" * 80)
    print("MAIN CONTENT (first 300 chars):")
    print("=" * 80)
    print(page_data.main_content[:300])
    print("...")

    if page_data.main_content_html:
        print("\n" + "=" * 80)
        print("HTML CONTENT (first 400 chars):")
        print("=" * 80)
        print(page_data.main_content_html[:400])
        print("...")

    # Save to file
    output_file = f"../data/test_html_book{book_id}_page{page_num}.json"
    page_data.to_json(output_file)
    print(f"\n✓ Saved to: {output_file}")

    return page_data

if __name__ == "__main__":
    # Test with book 23 page 5 (we know it has footnotes)
    print("Testing HTML preservation features\n")
    page_data = test_html_features('23', 5)

    # Verify structure
    print("\n" + "=" * 80)
    print("VERIFICATION:")
    print("=" * 80)
    print(f"✓ Footnotes extracted: {len(page_data.footnotes) > 0}")
    print(f"✓ HTML preserved: {page_data.main_content_html is not None}")
    print(f"✓ Footnotes HTML: {page_data.footnotes_html is not None}")
    has_paragraphs = '\n\n' in page_data.main_content
    print(f"✓ Paragraph structure: {has_paragraphs}")

    # Check for CSS classes in HTML
    if page_data.main_content_html:
        has_classes = any(cls in page_data.main_content_html for cls in ['class="c1"', 'class="c2"', 'class="c4"', 'class="c5"'])
        print(f"✓ CSS classes preserved: {has_classes}")
