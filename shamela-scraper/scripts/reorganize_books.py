#!/usr/bin/env python3
"""
Reorganize books from flat structure to segmented folder structure

This script moves books from:
  books/book_100_section_1.html
  books/book_100_meta.json

To:
  books/100/book_100_section_1.html
  books/100/book_100_meta.json
"""

import re
from pathlib import Path
import logging
import shutil

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def reorganize_books():
    """Reorganize books into subdirectories"""

    project_root = Path(__file__).parent.parent
    books_dir = project_root / 'data' / 'shamela' / 'raw' / 'books'

    # Find all book files (not in subdirectories)
    book_files = list(books_dir.glob('book_*'))

    # Group files by book ID
    books_to_move = {}

    for filepath in book_files:
        if filepath.is_file():
            # Extract book ID from filename
            match = re.match(r'book_(\d+)_', filepath.name)
            if match:
                book_id = match.group(1)
                if book_id not in books_to_move:
                    books_to_move[book_id] = []
                books_to_move[book_id].append(filepath)

    logger.info(f"Found {len(books_to_move)} books to reorganize")

    # Move each book's files to its subdirectory
    for book_id, files in sorted(books_to_move.items()):
        book_subdir = books_dir / book_id
        book_subdir.mkdir(parents=True, exist_ok=True)

        moved_count = 0
        for filepath in files:
            target = book_subdir / filepath.name
            try:
                shutil.move(str(filepath), str(target))
                moved_count += 1
            except Exception as e:
                logger.error(f"Failed to move {filepath}: {e}")

        logger.info(f"Book {book_id}: Moved {moved_count} files to {book_id}/")

    logger.info("Reorganization complete!")


if __name__ == '__main__':
    reorganize_books()
