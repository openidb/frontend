#!/usr/bin/env python3
"""Test metadata scraper to verify it works correctly"""

import sys
sys.path.insert(0, 'shamela-scraper/scripts')

from shamela.metadata_scraper import MetadataScraper
from shamela.utils import ShamelaHTTPClient

def test_scraper(book_id: str):
    """Test scraping a book's metadata"""
    client = ShamelaHTTPClient(delay=1.5)
    scraper = MetadataScraper(http_client=client)

    print(f"Testing metadata scraper for book {book_id}...")
    print("="*60)

    metadata = scraper.scrape_book(book_id)

    if metadata:
        print(f"✓ Successfully scraped book {book_id}")
        print(f"\nTitle: {metadata.title.get('arabic', 'N/A')}")
        print(f"Author: {metadata.author.name}")
        print(f"  - Shamela Author ID: {metadata.author.shamela_author_id}")
        print(f"  - Birth: {metadata.author.birth_date_hijri} هـ")
        print(f"  - Death: {metadata.author.death_date_hijri} هـ")

        print(f"\nPublication:")
        print(f"  - Publisher: {metadata.publication.publisher}")
        print(f"  - Location: {metadata.publication.location}")
        print(f"  - Edition: {metadata.publication.edition}")
        print(f"  - Year (Hijri): {metadata.publication.year_hijri} هـ")
        print(f"  - Year (Gregorian): {metadata.publication.year_gregorian} م")
        print(f"  - ISBN: {metadata.publication.isbn}")

        print(f"\nStructure:")
        print(f"  - Volumes: {metadata.structure.total_volumes}")
        print(f"  - Pages: {metadata.structure.total_pages}")
        print(f"  - Page alignment: {metadata.structure.page_alignment_note}")

        print(f"\nClassification:")
        print(f"  - Category: {metadata.classification.category}")
        print(f"  - Category ID: {metadata.classification.category_id}")

        # Determine what to use for datePublished and yearAH
        print(f"\n" + "="*60)
        print("Catalog entry should use:")
        if metadata.publication.year_gregorian:
            print(f"  datePublished: \"{metadata.publication.year_gregorian}\"")
        else:
            print(f"  datePublished: \"—\" (no Gregorian year found)")

        if metadata.publication.year_hijri:
            # Convert Arabic numerals to Western if needed
            year_hijri = metadata.publication.year_hijri
            year_hijri_int = int(year_hijri.replace('١', '1').replace('٢', '2').replace('٣', '3')
                                           .replace('٤', '4').replace('٥', '5').replace('٦', '6')
                                           .replace('٧', '7').replace('٨', '8').replace('٩', '9')
                                           .replace('٠', '0'))
            print(f"  yearAH: {year_hijri_int}")
        else:
            print(f"  yearAH: 0 (no Hijri year found)")

        return True
    else:
        print(f"✗ Failed to scrape book {book_id}")
        return False

if __name__ == "__main__":
    # Test with book 22 by default
    book_id = sys.argv[1] if len(sys.argv) > 1 else "22"
    success = test_scraper(book_id)
    sys.exit(0 if success else 1)
