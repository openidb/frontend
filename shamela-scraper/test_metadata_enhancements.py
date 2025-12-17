#!/usr/bin/env python3
"""
Test script to validate metadata extraction enhancements
"""

import sys
import os
import json

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'scripts'))

from shamela.metadata_scraper import MetadataScraper
from shamela.utils import ShamelaHTTPClient

def test_book_22():
    """Test metadata extraction for book 22 with all enhancements"""
    print("Testing metadata extraction for book 22...")
    print("=" * 80)

    # Create scraper with author enrichment enabled
    client = ShamelaHTTPClient(delay=1.5)
    scraper = MetadataScraper(http_client=client, enrich_authors=True)

    # Scrape book 22
    metadata = scraper.scrape_book("22")

    if not metadata:
        print("ERROR: Failed to scrape metadata for book 22")
        return False

    # Display results
    print("\n✓ Successfully scraped metadata for book 22")
    print("\nMETADATA SUMMARY:")
    print("-" * 80)

    # Title
    print(f"\n📖 Title: {metadata.title.get('arabic', 'N/A')}")

    # Author info
    author = metadata.author
    print(f"\n👤 Author: {author.name}")
    print(f"   - Shamela ID: {author.shamela_author_id}")
    print(f"   - Birth Date (Hijri): {author.birth_date_hijri or 'N/A'}")
    print(f"   - Death Date (Hijri): {author.death_date_hijri or 'N/A'}")
    print(f"   - Kunya: {author.kunya or 'N/A'}")
    print(f"   - Nasab: {author.nasab or 'N/A'}")
    print(f"   - Nisba: {author.nisba or 'N/A'}")
    print(f"   - Biography: {(author.biography[:100] + '...') if author.biography else 'N/A'}")
    print(f"   - Other Works: {len(author.other_works)} works")

    # Publication info
    pub = metadata.publication
    print(f"\n📚 Publication:")
    print(f"   - Publisher: {pub.publisher or 'N/A'}")
    print(f"   - Location: {pub.location or 'N/A'}")
    print(f"   - Edition: {pub.edition or 'N/A'}")
    print(f"   - Year (Hijri): {pub.year_hijri or 'N/A'}")
    print(f"   - Year (Gregorian): {pub.year_gregorian or 'N/A'}")
    print(f"   - ISBN: {pub.isbn or 'N/A'}")

    # Editorial info
    edit = metadata.editorial
    print(f"\n✍️  Editorial:")
    print(f"   - Editor: {edit.editor or 'N/A'}")
    print(f"   - Type: {edit.type or 'N/A'}")
    print(f"   - Verification Status: {edit.verification_status or 'N/A'}")
    print(f"   - Manuscript Source: {edit.manuscript_source or 'N/A'}")

    # Classification
    classif = metadata.classification
    print(f"\n🏷️  Classification:")
    print(f"   - Category: {classif.category or 'N/A'}")
    print(f"   - Keywords: {', '.join(classif.keywords) if classif.keywords else 'N/A'}")

    # Structure
    struct = metadata.structure
    print(f"\n📑 Structure:")
    print(f"   - Volumes: {struct.total_volumes}")
    print(f"   - Pages: {struct.total_pages or 'N/A'}")

    # Summary
    if metadata.summary:
        print(f"\n📝 Summary:")
        print(f"   {metadata.summary[:200]}...")

    # Save to file for inspection
    output_path = "data/e2e-test-22/metadata_enhanced.json"
    print(f"\n💾 Saving enhanced metadata to: {output_path}")
    metadata.to_json(output_path)

    # Show JSON for validation
    print("\n" + "=" * 80)
    print("FULL JSON OUTPUT:")
    print("=" * 80)
    print(json.dumps(metadata.to_dict(), ensure_ascii=False, indent=2))

    return True

if __name__ == "__main__":
    success = test_book_22()
    sys.exit(0 if success else 1)
