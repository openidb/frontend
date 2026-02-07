#!/usr/bin/env python3
"""
Aggregate author metadata from book catalog and enrich with Shamela author pages

Creates authors-metadata.json for the book viewer with biographical information
"""

import sys
import os
import json
import logging
from pathlib import Path
from typing import Dict, Set

# Add shamela scripts to path
sys.path.insert(0, os.path.dirname(__file__))

from shamela.author_scraper import AuthorScraper
from shamela.utils import ShamelaHTTPClient

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def load_catalog(catalog_path: str) -> list:
    """Load book catalog JSON"""
    with open(catalog_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def extract_unique_authors(catalog: list) -> Dict[str, Dict]:
    """
    Extract unique authors from catalog

    Returns dict: {authorLatin: {author, authorLatin, books_count}}
    """
    authors = {}

    for book in catalog:
        author_latin = book.get('authorLatin', '')
        author_arabic = book.get('author', '')

        if not author_latin or not author_arabic:
            continue

        if author_latin not in authors:
            authors[author_latin] = {
                'name_arabic': author_arabic,
                'name_latin': author_latin,
                'books': []
            }

        authors[author_latin]['books'].append({
            'id': book.get('id'),
            'title': book.get('title')
        })

    logger.info(f"Found {len(authors)} unique authors in catalog")
    return authors


def enrich_author_metadata(authors: Dict, scraper: AuthorScraper) -> Dict:
    """
    Enrich author metadata by scraping author pages

    For now, we'll use author ID from book metadata if available
    """
    enriched = {}

    for author_latin, author_data in authors.items():
        logger.info(f"Processing author: {author_data['name_arabic']} ({author_latin})")

        # Create base author entry
        author_entry = {
            'name_arabic': author_data['name_arabic'],
            'name_latin': author_latin,
            'books_count': len(author_data['books']),
            'books': author_data['books']
        }

        # TODO: We need to map catalog authors to Shamela author IDs
        # For now, we'll include basic info from catalog
        # In a future enhancement, we can:
        # 1. Scrape each book's metadata to get shamela_author_id
        # 2. Use that ID to scrape author page
        # 3. Add biography, dates, etc.

        enriched[author_latin] = author_entry

    return enriched


def save_authors_metadata(authors: Dict, output_path: str):
    """Save authors metadata to JSON file"""
    output_dir = os.path.dirname(output_path)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(authors, f, ensure_ascii=False, indent=2)

    logger.info(f"Saved authors metadata to {output_path}")


def main():
    """Main execution"""
    # Paths
    project_root = Path(__file__).parent.parent.parent
    catalog_path = project_root / "book-viewer" / "public" / "books" / "catalog.json"
    output_path = project_root / "book-viewer" / "lib" / "authors-metadata.json"

    logger.info("Starting author metadata aggregation...")

    # Load catalog
    logger.info(f"Loading catalog from {catalog_path}")
    catalog = load_catalog(str(catalog_path))
    logger.info(f"Loaded {len(catalog)} books from catalog")

    # Extract unique authors
    authors = extract_unique_authors(catalog)

    # Create HTTP client and scraper
    client = ShamelaHTTPClient(delay=1.5)
    scraper = AuthorScraper(http_client=client)

    # Enrich metadata
    enriched_authors = enrich_author_metadata(authors, scraper)

    # Save output
    save_authors_metadata(enriched_authors, str(output_path))

    logger.info(f"✓ Completed! Processed {len(enriched_authors)} authors")
    logger.info(f"✓ Output saved to {output_path}")


if __name__ == "__main__":
    main()
