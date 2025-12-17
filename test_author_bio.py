#!/usr/bin/env python3
"""Test author biography extraction"""

import sys
sys.path.insert(0, 'shamela-scraper/scripts')

from shamela.author_scraper import AuthorScraper
from shamela.utils import ShamelaHTTPClient

client = ShamelaHTTPClient(delay=1.5)
scraper = AuthorScraper(http_client=client)

print("Testing biography extraction for Ibn al-Jawzi (ID: 51)...")
author = scraper.scrape_author("51")

if author:
    print(f"\n✓ Name: {author.name}")
    print(f"✓ Birth: {author.birth_date_hijri} هـ")
    print(f"✓ Death: {author.death_date_hijri} هـ")
    print(f"✓ Works: {len(author.other_works)} books")

    if author.biography:
        print("\n" + "="*80)
        print("BIOGRAPHY:")
        print("="*80)
        print(author.biography)

    if author.biography_source:
        print("\n" + "="*80)
        print("SOURCE:")
        print("="*80)
        print(author.biography_source)
else:
    print("❌ Failed to scrape author")
