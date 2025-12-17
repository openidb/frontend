#!/usr/bin/env python3
"""
Find books that are missing section 1

Many books may have started crawling from section 2 because the TOC
doesn't explicitly link to section 1.
"""

import json
from pathlib import Path
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def find_missing_section_1():
    """Find all books missing section 1"""

    project_root = Path(__file__).parent.parent
    books_dir = project_root / 'data' / 'shamela' / 'raw' / 'books'

    # Find all book directories
    book_dirs = [d for d in books_dir.iterdir() if d.is_dir()]

    logger.info(f"Checking {len(book_dirs)} books for missing section 1")

    missing_section_1 = []

    for book_dir in sorted(book_dirs, key=lambda x: int(x.name)):
        book_id = book_dir.name

        # Check if section 1 exists
        section_1 = book_dir / f'book_{book_id}_section_1.html'

        if not section_1.exists():
            # Check if book has any sections
            html_files = list(book_dir.glob(f'book_{book_id}_section_*.html'))

            if html_files:
                # Has sections but missing section 1
                missing_section_1.append(book_id)
                logger.info(f"Book {book_id}: Missing section 1 (has {len(html_files)} sections)")

    logger.info(f"\nTotal books missing section 1: {len(missing_section_1)}")

    # Save list
    output_file = project_root / 'books_missing_section_1.txt'
    with open(output_file, 'w') as f:
        f.write('\n'.join(missing_section_1))

    logger.info(f"Saved list to: {output_file}")

    # Print first 20
    if missing_section_1:
        logger.info("\nFirst 20 books missing section 1:")
        for book_id in missing_section_1[:20]:
            logger.info(f"  Book {book_id}")

    return missing_section_1


if __name__ == '__main__':
    find_missing_section_1()
