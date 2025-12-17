#!/usr/bin/env python3
"""
Find books that may be incomplete due to crawling stopping prematurely.

This checks for books where:
1. The crawler stopped early (few sections despite errors)
2. Sections exist beyond the max section we have
3. Books have errors in metadata

Usage:
    python3 scripts/find_incomplete_books.py
"""

import json
import requests
import time
from pathlib import Path
import logging
import re

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def check_book_completeness(book_id: str, book_dir: Path, base_url: str = "https://shamela.ws") -> dict:
    """Check if a book might have more sections than we crawled"""

    # Find all sections we have
    sections = set()
    for html_file in book_dir.glob(f'book_{book_id}_section_*.html'):
        match = re.search(r'section_(\d+)\.html$', html_file.name)
        if match:
            sections.add(int(match.group(1)))

    if not sections:
        return {
            'book_id': book_id,
            'status': 'no_sections',
            'needs_recrawl': False
        }

    max_section = max(sections)
    min_section = min(sections)
    total_sections = len(sections)

    # Load metadata
    meta_file = book_dir / f'book_{book_id}_meta.json'
    has_errors = False
    if meta_file.exists():
        with open(meta_file) as f:
            metadata = json.load(f)
            has_errors = len(metadata.get('errors', [])) > 0

    # Check if sections exist beyond max_section (sample a few)
    sections_beyond = []
    for test_section in range(max_section + 1, max_section + 11):
        try:
            url = f"{base_url}/book/{book_id}/{test_section}"
            response = requests.head(url, timeout=5, headers={
                'User-Agent': 'Mozilla/5.0'
            })
            if response.status_code == 200:
                sections_beyond.append(test_section)
            time.sleep(0.3)  # Rate limit
        except Exception:
            pass

    # Determine if book needs recrawl
    needs_recrawl = False
    reason = []

    if has_errors:
        reason.append(f"has {len(metadata.get('errors', []))} errors")
        needs_recrawl = True

    if sections_beyond:
        reason.append(f"sections {sections_beyond} exist beyond max {max_section}")
        needs_recrawl = True

    if total_sections < 5 and sections_beyond:
        reason.append(f"only {total_sections} sections crawled but more exist")
        needs_recrawl = True

    return {
        'book_id': book_id,
        'status': 'incomplete' if needs_recrawl else 'complete',
        'needs_recrawl': needs_recrawl,
        'min_section': min_section,
        'max_section': max_section,
        'total_sections': total_sections,
        'sections_beyond': sections_beyond,
        'has_errors': has_errors,
        'reason': '; '.join(reason) if reason else 'appears complete'
    }


def main():
    project_root = Path(__file__).parent.parent
    books_dir = project_root / 'data' / 'shamela' / 'raw' / 'books'

    book_dirs = sorted([d for d in books_dir.iterdir() if d.is_dir()],
                      key=lambda x: int(x.name))

    logger.info(f"Checking {len(book_dirs)} books for completeness...")

    incomplete_books = []

    for i, book_dir in enumerate(book_dirs, 1):
        book_id = book_dir.name
        result = check_book_completeness(book_id, book_dir)

        if result['needs_recrawl']:
            incomplete_books.append(result)
            logger.info(f"[{i}/{len(book_dirs)}] Book {book_id}: {result['reason']}")

        if i % 50 == 0:
            logger.info(f"Progress: {i}/{len(book_dirs)} books checked")

    logger.info(f"\n=== SUMMARY ===")
    logger.info(f"Total books checked: {len(book_dirs)}")
    logger.info(f"Incomplete books found: {len(incomplete_books)}")

    # Save list of books to recrawl
    if incomplete_books:
        output_file = project_root / 'books_to_recrawl_resilient.txt'
        with open(output_file, 'w') as f:
            for book in incomplete_books:
                f.write(f"{book['book_id']}\n")

        logger.info(f"Book IDs saved to: {output_file}")

        # Save detailed report
        report_file = project_root / 'incomplete_books_report.json'
        with open(report_file, 'w', encoding='utf-8') as f:
            json.dump({
                'summary': {
                    'total_books': len(book_dirs),
                    'incomplete_books': len(incomplete_books)
                },
                'books': incomplete_books
            }, f, ensure_ascii=False, indent=2)

        logger.info(f"Detailed report saved to: {report_file}")


if __name__ == '__main__':
    main()
