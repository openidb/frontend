#!/usr/bin/env python3
"""Test author biography extraction"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'scripts'))

from shamela.author_scraper import AuthorScraper
from shamela.utils import ShamelaHTTPClient

def test_biography_extraction():
    """Test biography extraction for Ibn al-Jawzi (author ID 51)"""
    print("Testing biography extraction for Ibn al-Jawzi...")
    print("=" * 80)

    client = ShamelaHTTPClient(delay=1.5)
    scraper = AuthorScraper(http_client=client)

    # Scrape author 51 (Ibn al-Jawzi)
    author = scraper.scrape_author("51")

    if not author:
        print("ERROR: Failed to scrape author 51")
        return False

    print("\n✓ Successfully scraped author data\n")
    print(f"Name: {author.name}")
    print(f"Birth: {author.birth_date_hijri} هـ")
    print(f"Death: {author.death_date_hijri} هـ")
    print(f"Works: {len(author.other_works)} books")

    print("\n" + "-" * 80)
    print("BIOGRAPHY TEXT:")
    print("-" * 80)
    if author.biography:
        print(author.biography)
        print("\n" + "-" * 80)
        print(f"Biography length: {len(author.biography)} characters")
    else:
        print("⚠️  No biography extracted!")

    return True

if __name__ == "__main__":
    success = test_biography_extraction()
    sys.exit(0 if success else 1)
