#!/usr/bin/env python3
"""
Discover all books on Shamela.ws by scraping the author index
"""

import sys
import os
import json
import logging
from typing import List, Dict, Set

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from shamela.utils import ShamelaHTTPClient

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def discover_authors(http_client: ShamelaHTTPClient) -> List[Dict]:
    """
    Discover all authors from the author index page

    Returns:
        List of author dictionaries with id, name, and book_count
    """
    logger.info("Discovering authors from https://shamela.ws/authors")

    url = "https://shamela.ws/authors"
    soup = http_client.get(url)

    if not soup:
        logger.error("Failed to fetch authors page")
        return []

    authors = []

    # Find all author links
    author_links = soup.find_all('a', href=lambda x: x and '/author/' in x)

    for link in author_links:
        href = link.get('href', '')

        # Extract author ID from URL
        if '/author/' in href:
            author_id = href.split('/author/')[-1].split('/')[0].split('?')[0]

            # Get author name
            author_name = link.get_text(strip=True)

            if author_id and author_name:
                authors.append({
                    'id': author_id,
                    'name': author_name,
                    'url': f"https://shamela.ws/author/{author_id}"
                })

    # Remove duplicates by author ID
    seen_ids = set()
    unique_authors = []
    for author in authors:
        if author['id'] not in seen_ids:
            seen_ids.add(author['id'])
            unique_authors.append(author)

    logger.info(f"Discovered {len(unique_authors)} unique authors")
    return unique_authors


def discover_books_for_author(http_client: ShamelaHTTPClient, author_id: str, author_name: str) -> List[Dict]:
    """
    Discover all books for a specific author

    Returns:
        List of book dictionaries with id, title, and author info
    """
    url = f"https://shamela.ws/author/{author_id}"
    soup = http_client.get(url)

    if not soup:
        logger.warning(f"Failed to fetch author page for {author_id}: {author_name}")
        return []

    books = []

    # Find all book links
    book_links = soup.find_all('a', href=lambda x: x and '/book/' in x)

    for link in book_links:
        href = link.get('href', '')

        # Extract book ID from URL
        if '/book/' in href:
            book_id = href.split('/book/')[-1].split('/')[0].split('?')[0]

            # Get book title
            book_title = link.get_text(strip=True)

            if book_id and book_id.isdigit():
                books.append({
                    'book_id': book_id,
                    'title': book_title,
                    'author_id': author_id,
                    'author_name': author_name,
                    'url': f"https://shamela.ws/book/{book_id}"
                })

    return books


def discover_all_books(output_dir: str, delay: float = 0.15):
    """
    Discover all books on Shamela.ws

    Args:
        output_dir: Directory to save discovery results
        delay: Delay between requests in seconds
    """
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)

    # Initialize HTTP client
    http_client = ShamelaHTTPClient(delay=delay)

    # Step 1: Discover all authors
    logger.info("Step 1: Discovering all authors...")
    authors = discover_authors(http_client)

    if not authors:
        logger.error("No authors discovered. Exiting.")
        return

    # Save authors list
    authors_file = os.path.join(output_dir, 'authors.json')
    with open(authors_file, 'w', encoding='utf-8') as f:
        json.dump(authors, f, ensure_ascii=False, indent=2)
    logger.info(f"Saved {len(authors)} authors to {authors_file}")

    # Step 2: Discover books for each author
    logger.info(f"Step 2: Discovering books for {len(authors)} authors...")

    all_books = []
    seen_book_ids = set()

    for i, author in enumerate(authors, 1):
        logger.info(f"Processing author {i}/{len(authors)}: {author['name']} (ID: {author['id']})")

        books = discover_books_for_author(http_client, author['id'], author['name'])

        # Add unique books
        for book in books:
            if book['book_id'] not in seen_book_ids:
                seen_book_ids.add(book['book_id'])
                all_books.append(book)

        logger.info(f"  Found {len(books)} books for this author (total unique: {len(all_books)})")

    # Sort books by book_id
    all_books.sort(key=lambda x: int(x['book_id']))

    # Save all books
    books_file = os.path.join(output_dir, 'all_books.json')
    with open(books_file, 'w', encoding='utf-8') as f:
        json.dump(all_books, f, ensure_ascii=False, indent=2)

    logger.info(f"✓ Discovery complete!")
    logger.info(f"✓ Total authors: {len(authors)}")
    logger.info(f"✓ Total unique books: {len(all_books)}")
    logger.info(f"✓ Saved to: {books_file}")

    # Create a simple book ID list for easy consumption
    book_ids_file = os.path.join(output_dir, 'book_ids.txt')
    with open(book_ids_file, 'w', encoding='utf-8') as f:
        for book in all_books:
            f.write(f"{book['book_id']}\n")

    logger.info(f"✓ Book IDs list saved to: {book_ids_file}")

    # Print statistics
    print("\n" + "="*60)
    print("DISCOVERY SUMMARY")
    print("="*60)
    print(f"Authors discovered:      {len(authors)}")
    print(f"Unique books discovered: {len(all_books)}")
    print(f"Book ID range:           {all_books[0]['book_id']} - {all_books[-1]['book_id']}")
    print(f"Output directory:        {output_dir}")
    print("="*60)


def main():
    import argparse

    parser = argparse.ArgumentParser(description='Discover all books on Shamela.ws')
    parser.add_argument('--output-dir', default='../data/shamela/discovery',
                       help='Output directory for discovery results')
    parser.add_argument('--delay', type=float, default=0.15,
                       help='Delay between requests in seconds (default: 0.15)')

    args = parser.parse_args()

    discover_all_books(args.output_dir, args.delay)


if __name__ == '__main__':
    main()
