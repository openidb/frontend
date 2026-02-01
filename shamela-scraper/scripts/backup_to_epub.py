#!/usr/bin/env python3
"""
Convert Shamela books from backup HTML to EPUB format

This script reads raw HTML files from a backup directory, extracts structured
content, generates EPUB files, and optionally imports metadata to the book-viewer
database.

Usage:
    python3 scripts/backup_to_epub.py --backup-path /Volumes/KIOXIA/shamela-backup/books \
                                      --output-dir ../book-viewer/public/books \
                                      --book-ids sample:20

Options:
    --backup-path PATH    Path to backup books directory
    --output-dir PATH     Output directory for EPUB files
    --book-ids IDS        Comma-separated book IDs or "sample:N" for N diverse books
    --import-db           Also import metadata to PostgreSQL via save-book-metadata.ts
    --book-viewer-path    Path to book-viewer directory (default: ../book-viewer)
    --dry-run             Show what would be done without executing
"""

import argparse
import json
import logging
import subprocess
import sys
import re
import unicodedata
from pathlib import Path
from typing import List, Dict, Optional

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from shamela.backup_parser import BackupHTMLParser, select_diverse_sample
from shamela.epub_generator import EPUBGenerator

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def slugify_arabic(text: str, max_length: int = 50) -> str:
    """
    Create a URL-safe slug from Arabic text.

    Keeps Arabic characters but removes diacritics and special characters.
    Falls back to hash if result is empty.

    Args:
        text: Arabic text to slugify
        max_length: Maximum length of slug

    Returns:
        URL-safe string
    """
    if not text:
        return "untitled"

    # Normalize unicode
    text = unicodedata.normalize('NFKC', text)

    # Remove diacritics (tashkeel)
    diacritics = re.compile(r'[\u064B-\u065F\u0670]')
    text = diacritics.sub('', text)

    # Keep Arabic letters, numbers, and spaces
    text = re.sub(r'[^\u0600-\u06FF\u0750-\u077F\w\s]', '', text)

    # Replace spaces with underscores
    text = re.sub(r'\s+', '_', text.strip())

    # Truncate
    if len(text) > max_length:
        text = text[:max_length]

    # Fallback if empty
    if not text:
        return f"book_{hash(text) % 100000}"

    return text


def convert_book(book_id: str, parser: BackupHTMLParser,
                 generator: EPUBGenerator, output_dir: Path) -> Dict:
    """
    Convert a single book from backup to EPUB.

    Args:
        book_id: The book ID to convert
        parser: BackupHTMLParser instance
        generator: EPUBGenerator instance
        output_dir: Directory to save EPUB files

    Returns:
        Dictionary with conversion result including:
        - book_id: The book ID
        - success: Whether conversion succeeded
        - error: Error message if failed
        - epub_path: Path to generated EPUB
        - filename: EPUB filename
        - page_count: Number of pages
        - metadata: Book metadata dict
    """
    result = {
        'book_id': book_id,
        'success': False,
        'error': None,
        'epub_path': None,
        'filename': None,
        'page_count': 0,
        'metadata': None
    }

    try:
        # Parse book from backup
        metadata, toc, pages = parser.parse_book(book_id)

        # Generate filename
        title = metadata.title.get('arabic', '')
        title_slug = slugify_arabic(title)
        filename = f"{book_id}_{title_slug}.epub"
        output_path = output_dir / filename

        # Generate EPUB
        success = generator.generate_epub(metadata, toc, pages, str(output_path))

        if success:
            result['success'] = True
            result['epub_path'] = str(output_path)
            result['filename'] = filename
            result['page_count'] = len(pages)
            result['metadata'] = metadata.to_dict()
            result['toc_entries'] = len(toc.volumes[0].chapters) if toc.volumes else 0
        else:
            result['error'] = "EPUB generation failed"

    except Exception as e:
        result['error'] = str(e)
        logger.error(f"Error converting book {book_id}: {e}")

    return result


def import_to_database(result: Dict, book_viewer_path: Path) -> bool:
    """
    Import book metadata to PostgreSQL via save-book-metadata.ts.

    Args:
        result: Conversion result from convert_book()
        book_viewer_path: Path to book-viewer directory

    Returns:
        True if import succeeded, False otherwise
    """
    if not result.get('success'):
        return False

    meta = result['metadata']

    # Get author info safely
    author_info = meta.get('author', {})
    author_name = author_info.get('name', '') or ''
    author_id = author_info.get('shamela_author_id')

    # Get publication info
    pub_info = meta.get('publication', {})

    # Build input for save-book-metadata.ts
    db_input = {
        "book": {
            "shamela_book_id": meta['shamela_id'],
            "title_arabic": meta['title'].get('arabic', ''),
            "title_latin": slugify_arabic(meta['title'].get('arabic', '')),
            "author_arabic": author_name,
            "author_latin": slugify_arabic(author_name) if author_name else '',
            "author_id": author_id,  # shamela_author_id is now the primary key 'id'
            "category_arabic": meta.get('classification', {}).get('category'),
            "total_pages": meta.get('structure', {}).get('total_pages'),
            "filename": result['filename'],
            "publisher_name": pub_info.get('publisher'),
            "edition": pub_info.get('edition'),
            "year_hijri": pub_info.get('year_hijri'),
            "year_gregorian": pub_info.get('year_gregorian')
        }
    }

    # Add author if we have author name and ID (with full enriched data)
    if author_name and author_id:
        db_input["author"] = {
            "id": author_id,  # shamela_author_id is now the primary key 'id'
            "name_arabic": author_name,
            "name_latin": slugify_arabic(author_name),
            "death_date_hijri": author_info.get('death_date_hijri'),
            "birth_date_hijri": author_info.get('birth_date_hijri'),
            "death_date_gregorian": author_info.get('death_date_gregorian'),
            "birth_date_gregorian": author_info.get('birth_date_gregorian'),
            "biography": author_info.get('biography'),
            "kunya": author_info.get('kunya'),
            "nasab": author_info.get('nasab'),
            "nisba": author_info.get('nisba'),
            "laqab": author_info.get('laqab')
        }

    # Call TypeScript import script via bun
    script_path = book_viewer_path / "scripts" / "save-book-metadata.ts"

    try:
        # Use bun to run the TypeScript script
        proc = subprocess.run(
            ["bun", "run", str(script_path)],
            input=json.dumps(db_input),
            capture_output=True,
            text=True,
            cwd=str(book_viewer_path),
            env={
                **dict(__import__('os').environ),
                'BUN_INSTALL': str(Path.home() / '.bun'),
                'PATH': f"{Path.home() / '.bun' / 'bin'}:{__import__('os').environ.get('PATH', '')}"
            }
        )

        if proc.returncode == 0:
            logger.info(f"Successfully imported book {meta['shamela_id']} to database")
            return True
        else:
            logger.error(f"Database import failed: {proc.stderr}")
            return False

    except FileNotFoundError:
        logger.error("bun not found. Please install bun to import to database.")
        return False
    except Exception as e:
        logger.error(f"Database import error: {e}")
        return False


def parse_book_ids(book_ids_arg: str, parser: BackupHTMLParser) -> List[str]:
    """
    Parse book IDs argument.

    Args:
        book_ids_arg: Either comma-separated IDs or "sample:N"
        parser: BackupHTMLParser for sample selection

    Returns:
        List of book IDs to process
    """
    if book_ids_arg.startswith('sample:'):
        count = int(book_ids_arg.split(':')[1])
        return select_diverse_sample(parser, count)
    else:
        return [bid.strip() for bid in book_ids_arg.split(',')]


def main():
    parser = argparse.ArgumentParser(
        description='Convert Shamela backup HTML to EPUB format',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
    # Dry run with 20 sample books
    python3 scripts/backup_to_epub.py \\
        --backup-path /Volumes/KIOXIA/shamela-backup/books \\
        --output-dir ../book-viewer/public/books \\
        --book-ids sample:20 \\
        --dry-run

    # Convert specific books
    python3 scripts/backup_to_epub.py \\
        --backup-path /Volumes/KIOXIA/shamela-backup/books \\
        --output-dir ../book-viewer/public/books \\
        --book-ids 1,10,100

    # Convert and import to database
    python3 scripts/backup_to_epub.py \\
        --backup-path /Volumes/KIOXIA/shamela-backup/books \\
        --output-dir ../book-viewer/public/books \\
        --book-ids sample:20 \\
        --import-db
        '''
    )

    parser.add_argument(
        '--backup-path',
        required=True,
        help='Path to backup books directory'
    )
    parser.add_argument(
        '--output-dir',
        required=True,
        help='Output directory for EPUB files'
    )
    parser.add_argument(
        '--book-ids',
        required=True,
        help='Comma-separated book IDs or "sample:N" for N diverse books'
    )
    parser.add_argument(
        '--import-db',
        action='store_true',
        help='Import metadata to PostgreSQL database'
    )
    parser.add_argument(
        '--book-viewer-path',
        default='../book-viewer',
        help='Path to book-viewer directory (default: ../book-viewer)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be done without executing'
    )

    args = parser.parse_args()

    # Initialize parser and generator
    try:
        backup_parser = BackupHTMLParser(args.backup_path)
    except ValueError as e:
        logger.error(str(e))
        sys.exit(1)

    epub_generator = EPUBGenerator()
    output_dir = Path(args.output_dir)

    # Create output directory if needed
    if not args.dry_run:
        output_dir.mkdir(parents=True, exist_ok=True)

    # Determine book IDs to process
    book_ids = parse_book_ids(args.book_ids, backup_parser)

    print(f"\n{'='*60}")
    print(f"Backup to EPUB Converter")
    print(f"{'='*60}")
    print(f"Backup path: {args.backup_path}")
    print(f"Output dir:  {args.output_dir}")
    print(f"Books:       {len(book_ids)}")
    print(f"Import DB:   {args.import_db}")
    print(f"Dry run:     {args.dry_run}")
    print(f"{'='*60}\n")

    # Show book info in dry run mode
    if args.dry_run:
        print("Books to be converted:\n")
        for book_id in book_ids:
            meta = backup_parser.get_book_info(book_id)
            if meta:
                title = (meta.get('title') or 'Unknown')[:50]
                pages = meta.get('total_pages', 0)
                author = (meta.get('author_name') or 'Unknown')[:30]
                print(f"  [{book_id:>5}] {title} - {author} ({pages} pages)")
            else:
                print(f"  [{book_id:>5}] (metadata not found)")
        print(f"\nDry run complete. Use without --dry-run to execute.")
        return

    # Process books
    results = {'successful': [], 'failed': []}
    book_viewer_path = Path(args.book_viewer_path)

    for i, book_id in enumerate(book_ids, 1):
        print(f"[{i}/{len(book_ids)}] Converting book {book_id}...")

        result = convert_book(book_id, backup_parser, epub_generator, output_dir)

        if result['success']:
            results['successful'].append(result)
            print(f"  ✓ {result['filename']}")
            print(f"    {result['page_count']} pages, {result.get('toc_entries', 0)} TOC entries")

            # Import to database if requested
            if args.import_db:
                if import_to_database(result, book_viewer_path):
                    print(f"    → Imported to database")
                else:
                    print(f"    ⚠ Database import failed")
        else:
            results['failed'].append(result)
            print(f"  ✗ Failed: {result['error']}")

    # Summary
    print(f"\n{'='*60}")
    print(f"Conversion Complete")
    print(f"{'='*60}")
    print(f"Successful: {len(results['successful'])}")
    print(f"Failed:     {len(results['failed'])}")

    if results['failed']:
        print(f"\nFailed books:")
        for r in results['failed']:
            print(f"  [{r['book_id']}] {r['error']}")

    if results['successful']:
        print(f"\nEPUB files saved to: {output_dir}")

        total_pages = sum(r['page_count'] for r in results['successful'])
        print(f"Total pages: {total_pages}")


if __name__ == '__main__':
    main()
