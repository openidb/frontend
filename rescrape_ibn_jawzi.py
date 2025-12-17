#!/usr/bin/env python3
"""Re-scrape Ibn al-Jawzi author page with updated scraper"""

import sys
import json
sys.path.insert(0, 'shamela-scraper/scripts')

from shamela.author_scraper import AuthorScraper
from shamela.utils import ShamelaHTTPClient

client = ShamelaHTTPClient(delay=1.5)
scraper = AuthorScraper(http_client=client)

# Scrape Ibn al-Jawzi (author_id: 51)
author = scraper.scrape_author("51")

if author:
    print(f"Author: {author.name}")
    print(f"Death: {author.death_date_hijri} هـ / {author.death_date_gregorian} م")
    print(f"Birth: {author.birth_date_hijri} هـ / {author.birth_date_gregorian} م")
    print(f"\nBiography length: {len(author.biography) if author.biography else 0} chars")
    print(f"Source: {author.biography_source}")

    # Save to JSON
    metadata = {
        "Ibn al-Jawzi": {
            "name_arabic": author.name,
            "name_latin": "Ibn al-Jawzi",
            "shamela_author_id": author.shamela_author_id,
            "death_date_hijri": author.death_date_hijri,
            "birth_date_hijri": author.birth_date_hijri,
            "death_date_gregorian": author.death_date_gregorian,
            "birth_date_gregorian": author.birth_date_gregorian,
            "biography": author.biography,
            "biography_source": author.biography_source,
            "books_count": 1,
            "books": [
                {
                    "id": "22",
                    "title": "كتاب أعمار الأعيان"
                }
            ]
        }
    }

    with open('book-viewer/lib/authors-metadata.json', 'w', encoding='utf-8') as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    print("\n✓ Updated book-viewer/lib/authors-metadata.json")
else:
    print("Failed to scrape author")
