#!/usr/bin/env python3
"""Scrape book 22 metadata to extract year published"""

import sys
sys.path.insert(0, 'shamela-scraper/scripts')

from shamela.metadata_scraper import MetadataScraper
from shamela.utils import ShamelaHTTPClient

# Initialize client and scraper
client = ShamelaHTTPClient(delay=1.5)
scraper = MetadataScraper(http_client=client)

# Scrape book 22
print("Scraping book 22...")
metadata = scraper.scrape_book("22")

if metadata:
    print(f"\nBook: {metadata.title.get('arabic', 'N/A')}")
    print(f"Author: {metadata.author.name}")
    print(f"\nPublication Info:")
    print(f"  Publisher: {metadata.publication.publisher}")
    print(f"  Location: {metadata.publication.location}")
    print(f"  Edition: {metadata.publication.edition}")
    print(f"  Year (Hijri): {metadata.publication.year_hijri}")
    print(f"  Year (Gregorian): {metadata.publication.year_gregorian}")
    print(f"  ISBN: {metadata.publication.isbn}")

    # Show what we should use
    if metadata.publication.year_hijri:
        print(f"\n✓ Found Hijri year: {metadata.publication.year_hijri}")
    if metadata.publication.year_gregorian:
        print(f"✓ Found Gregorian year: {metadata.publication.year_gregorian}")
else:
    print("Failed to scrape book metadata")
