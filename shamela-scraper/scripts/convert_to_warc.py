#!/usr/bin/env python3
"""
Convert Shamela HTML files to WARC format

Processes books sequentially, stops at first gap/incomplete book,
and creates size-based WARC chunks (~100 MB) respecting book boundaries.

Usage:
    # Test mode (no archival)
    python3 scripts/convert_to_warc.py --test-mode --limit 6

    # Dry run (preview only)
    python3 scripts/convert_to_warc.py --dry-run

    # Production mode (with archival)
    python3 scripts/convert_to_warc.py --archive
"""

import json
import logging
import argparse
import gzip
import shutil
from io import BytesIO
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional, Tuple

try:
    from warcio.warcwriter import WARCWriter
    from warcio.statusandheaders import StatusAndHeaders
except ImportError:
    print("ERROR: warcio library not found")
    print("Please install it: pip install warcio")
    exit(1)

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ShamelaWARCConverter:
    """Converts Shamela HTML files to WARC format"""

    def __init__(self, test_mode: bool = False, archive: bool = False):
        self.test_mode = test_mode
        self.archive = archive

        # Setup directories
        self.project_root = Path(__file__).parent.parent
        self.raw_dir = self.project_root / 'data' / 'shamela' / 'raw'
        self.books_dir = self.raw_dir / 'books'
        self.archive_dir = self.raw_dir / 'books_archive'

        # WARC directory (test or production)
        if test_mode:
            self.warc_dir = self.raw_dir / 'warc_test'
        else:
            self.warc_dir = self.raw_dir / 'warc'

        self.warc_dir.mkdir(parents=True, exist_ok=True)

        if archive:
            self.archive_dir.mkdir(parents=True, exist_ok=True)

        # WARC file management
        self.max_warc_size = 1000 * 1024 * 1024  # 1 GB (Common Crawl standard)
        self.current_warc_file = None
        self.current_warc_writer = None
        self.current_warc_size = 0
        self.warc_counter = 1
        self.current_warc_path = None

        # CDX index
        self.cdx_entries = []

        # WARC manifest tracking
        self.current_manifest = {
            'books': [],
            'total_pages': 0,
            'created': None
        }

        # Progress tracking
        self.progress_file = self.warc_dir / 'progress.json'
        self.progress = self._load_progress()

        # Statistics
        self.stats = {
            'books_converted': 0,
            'total_pages': 0,
            'warc_files_created': 0,
            'books_archived': 0
        }

    def _load_progress(self) -> Dict:
        """Load progress from file"""
        if self.progress_file.exists():
            with open(self.progress_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        return {
            'last_processed_book_id': 0,
            'last_updated': None
        }

    def _save_progress(self):
        """Save progress to file"""
        self.progress['last_updated'] = datetime.now().isoformat()
        with open(self.progress_file, 'w', encoding='utf-8') as f:
            json.dump(self.progress, f, ensure_ascii=False, indent=2)

    def _open_new_warc_file(self):
        """Open a new WARC file for writing"""
        # Save manifest for previous WARC file
        if self.current_warc_path and self.current_manifest['books']:
            self._save_manifest()

        # Create new WARC file
        filename = f'shamela-{self.warc_counter:05d}.warc.gz'
        self.current_warc_path = self.warc_dir / filename

        logger.info(f"Creating WARC file: {filename}")

        self.current_warc_file = gzip.open(self.current_warc_path, 'wb')
        self.current_warc_writer = WARCWriter(self.current_warc_file, gzip=False)
        self.current_warc_size = 0
        self.warc_counter += 1
        self.stats['warc_files_created'] += 1

        # Reset manifest
        self.current_manifest = {
            'warc_file': filename,
            'created': datetime.now().isoformat(),
            'books': [],
            'total_pages': 0,
            'total_books': 0
        }

    def _save_manifest(self):
        """Save manifest for current WARC file"""
        if not self.current_warc_path:
            return

        manifest_path = self.current_warc_path.with_suffix('.warc.gz.manifest.json')

        # Add file size
        self.current_manifest['file_size_mb'] = round(
            self.current_warc_path.stat().st_size / (1024 * 1024), 2
        )

        with open(manifest_path, 'w', encoding='utf-8') as f:
            json.dump(self.current_manifest, f, ensure_ascii=False, indent=2)

        logger.info(f"Saved manifest: {manifest_path.name}")

    def _write_warc_record(self, url: str, html: str, timestamp: str, warc_filename: str) -> int:
        """Write a single HTML page as WARC record and return record offset"""

        # Get current offset before writing
        offset = self.current_warc_file.tell()

        # Create HTTP response headers
        html_bytes = html.encode('utf-8')
        headers_list = [
            ('Content-Type', 'text/html; charset=utf-8'),
            ('Content-Length', str(len(html_bytes)))
        ]

        http_headers = StatusAndHeaders('200 OK', headers_list, protocol='HTTP/1.1')

        # Create BytesIO stream from bytes
        payload_stream = BytesIO(html_bytes)

        # Write WARC record
        record = self.current_warc_writer.create_warc_record(
            uri=url,
            record_type='response',
            payload=payload_stream,
            http_headers=http_headers,
            warc_headers_dict={
                'WARC-Date': timestamp
            }
        )

        self.current_warc_writer.write_record(record)
        self.current_warc_size += len(html_bytes)

        # Create CDX entry
        # Format: url timestamp original_url content_type status checksum warc_file offset length
        self.cdx_entries.append({
            'url': url,
            'timestamp': timestamp.replace('-', '').replace(':', '').split('.')[0],
            'warc_file': warc_filename,
            'offset': offset,
            'length': len(html_bytes)
        })

        return offset

    def _get_book_size_estimate(self, book_id: str, metadata: Dict) -> int:
        """Estimate total size of a book's HTML files"""
        total_size = 0
        html_files = sorted(self.books_dir.glob(f'book_{book_id}_section_*.html'))

        for html_file in html_files:
            total_size += html_file.stat().st_size

        return total_size

    def convert_book(self, book_id: str, metadata: Dict) -> bool:
        """Convert a single book to WARC format"""

        # Find all HTML files for this book
        html_files = sorted(self.books_dir.glob(f'book_{book_id}_section_*.html'))

        if not html_files:
            logger.warning(f"Book {book_id}: No HTML files found")
            return False

        # Verify page count matches metadata
        if len(html_files) != metadata['total_pages']:
            logger.error(
                f"Book {book_id}: Page count mismatch! "
                f"Metadata says {metadata['total_pages']}, found {len(html_files)} files"
            )
            return False

        # Estimate book size
        book_size = self._get_book_size_estimate(book_id, metadata)

        # Check if we need a new WARC file (respecting book boundaries)
        if self.current_warc_writer is None:
            self._open_new_warc_file()
        elif self.current_warc_size + book_size > self.max_warc_size:
            # Book won't fit in current WARC, start new one
            logger.info(
                f"Book {book_id} ({book_size / 1024 / 1024:.2f} MB) won't fit in current WARC, "
                f"starting new file"
            )
            self._open_new_warc_file()

        logger.info(
            f"Converting book {book_id}: {metadata['title']} ({len(html_files)} pages, "
            f"{book_size / 1024 / 1024:.2f} MB)"
        )

        # Track book in manifest
        book_entry = {
            'book_id': book_id,
            'title': metadata['title'],
            'author_name': metadata.get('author_name'),
            'pages': len(html_files),
            'size_mb': round(book_size / (1024 * 1024), 2)
        }

        # Convert each page
        timestamp = metadata.get('crawl_timestamp', datetime.now().isoformat())

        for html_file in html_files:
            # Extract section ID from filename
            section_id = html_file.stem.split('_')[-1]
            url = f"https://shamela.ws/book/{book_id}/{section_id}"

            # Read HTML content
            with open(html_file, 'r', encoding='utf-8') as f:
                html_content = f.read()

            # Write to WARC
            self._write_warc_record(
                url,
                html_content,
                timestamp,
                self.current_manifest['warc_file']
            )

        # Update manifest
        self.current_manifest['books'].append(book_entry)
        self.current_manifest['total_pages'] += len(html_files)
        self.current_manifest['total_books'] = len(self.current_manifest['books'])

        # Update statistics
        self.stats['books_converted'] += 1
        self.stats['total_pages'] += len(html_files)

        # Archive HTML files if requested
        if self.archive and not self.test_mode:
            self._archive_book_files(book_id, html_files)

        logger.info(f"✓ Book {book_id} converted successfully")
        return True

    def _archive_book_files(self, book_id: str, html_files: List[Path]):
        """Move HTML files to archive directory"""
        book_archive_dir = self.archive_dir / f'book_{book_id}'
        book_archive_dir.mkdir(parents=True, exist_ok=True)

        for html_file in html_files:
            dest = book_archive_dir / html_file.name
            shutil.move(str(html_file), str(dest))

        self.stats['books_archived'] += 1
        logger.info(f"Archived book {book_id} HTML files to {book_archive_dir}")

    def _save_cdx_index(self):
        """Save CDX index file"""
        cdx_path = self.warc_dir / 'shamela.cdx'

        with open(cdx_path, 'w', encoding='utf-8') as f:
            f.write('CDX N b a m s k r M S V g\n')  # CDX header

            for entry in sorted(self.cdx_entries, key=lambda x: x['url']):
                # Format: url timestamp original content-type status checksum warc offset length
                line = (
                    f"{entry['url']} {entry['timestamp']} {entry['url']} "
                    f"text/html 200 - {entry['warc_file']} {entry['offset']} {entry['length']}\n"
                )
                f.write(line)

        logger.info(f"Saved CDX index: {cdx_path} ({len(self.cdx_entries)} entries)")

    def find_sequential_books(self, start_id: int = 1, limit: Optional[int] = None) -> List[Tuple[str, Dict]]:
        """Find complete books in order, respecting natural gaps in book IDs"""

        # Load the actual book IDs from discovery
        all_books_file = self.project_root / 'data' / 'shamela' / 'discovery' / 'all_books.json'

        if all_books_file.exists():
            with open(all_books_file, 'r', encoding='utf-8') as f:
                all_books = json.load(f)

            # Extract and sort book IDs (they're strings)
            all_book_ids = sorted([int(book['book_id']) for book in all_books])
            logger.info(f"Loaded {len(all_book_ids)} book IDs from discovery (with natural gaps)")
        else:
            # Fallback to sequential numbering if discovery file not found
            logger.warning("Discovery file not found, using sequential numbering")
            all_book_ids = list(range(start_id, start_id + 10000))  # arbitrary large range

        sequential_books = []

        # Filter to books >= start_id
        book_ids_to_process = [bid for bid in all_book_ids if bid >= start_id]

        for book_id in book_ids_to_process:
            # Check for metadata file
            meta_file = self.books_dir / f'book_{book_id}_meta.json'

            if not meta_file.exists():
                # Skip this book (natural gap or not yet crawled)
                continue

            # Load metadata
            with open(meta_file, 'r', encoding='utf-8') as f:
                metadata = json.load(f)

            # Check if complete
            if metadata.get('status') != 'complete':
                # Skip incomplete books, continue to next
                logger.debug(f"Skipping book {book_id}: status is '{metadata.get('status')}'")
                continue

            # Add to sequential list
            sequential_books.append((str(book_id), metadata))

            # Check limit
            if limit and len(sequential_books) >= limit:
                logger.info(f"Reached limit of {limit} books")
                break

        return sequential_books

    def convert_all(self, start_id: int = 1, limit: Optional[int] = None, dry_run: bool = False):
        """Convert all complete books to WARC (respecting natural gaps)"""

        # Find complete books
        logger.info(f"Scanning for complete books starting from ID {start_id}...")
        sequential_books = self.find_sequential_books(start_id, limit)

        if not sequential_books:
            logger.warning("No complete books found")
            return

        first_id = sequential_books[0][0]
        last_id = sequential_books[-1][0]
        logger.info(f"Found {len(sequential_books)} complete books (IDs {first_id} to {last_id}, respecting natural gaps)")

        # Calculate total size
        total_size = sum(
            self._get_book_size_estimate(book_id, metadata)
            for book_id, metadata in sequential_books
        )
        estimated_warcs = max(1, int(total_size / self.max_warc_size) + 1)

        logger.info(f"Total size: {total_size / 1024 / 1024 / 1024:.2f} GB")
        logger.info(f"Estimated WARC files: {estimated_warcs}")

        if dry_run:
            logger.info("DRY RUN - No files will be created or modified")
            for book_id, metadata in sequential_books[:10]:  # Show first 10
                logger.info(f"  Would convert: Book {book_id} - {metadata['title']} ({metadata['total_pages']} pages)")
            if len(sequential_books) > 10:
                logger.info(f"  ... and {len(sequential_books) - 10} more books")
            return

        # Convert each book
        for book_id, metadata in sequential_books:
            success = self.convert_book(book_id, metadata)

            if not success:
                logger.error(f"Failed to convert book {book_id}, stopping")
                break

            # Update progress
            self.progress['last_processed_book_id'] = int(book_id)
            self._save_progress()

        # Close final WARC file and save manifest
        if self.current_warc_file:
            self.current_warc_file.close()
            self._save_manifest()

        # Save CDX index
        if self.cdx_entries:
            self._save_cdx_index()

        # Print summary
        self.print_summary()

    def print_summary(self):
        """Print conversion summary"""
        logger.info("\n" + "="*60)
        logger.info("CONVERSION SUMMARY")
        logger.info("="*60)
        logger.info(f"Books converted:    {self.stats['books_converted']}")
        logger.info(f"Total pages:        {self.stats['total_pages']}")
        logger.info(f"WARC files created: {self.stats['warc_files_created']}")
        logger.info(f"Books archived:     {self.stats['books_archived']}")
        logger.info(f"Output directory:   {self.warc_dir}")
        logger.info("="*60)


def main():
    parser = argparse.ArgumentParser(description='Convert Shamela HTML to WARC format')
    parser.add_argument('--test-mode', action='store_true',
                       help='Test mode: output to warc_test/, no archival')
    parser.add_argument('--archive', action='store_true',
                       help='Archive HTML files after conversion')
    parser.add_argument('--limit', type=int,
                       help='Limit number of books to convert')
    parser.add_argument('--dry-run', action='store_true',
                       help='Preview what would be converted without making changes')
    parser.add_argument('--start-id', type=int, default=1,
                       help='Starting book ID (default: 1)')

    args = parser.parse_args()

    if args.test_mode:
        logger.info("Running in TEST MODE - output to warc_test/, no archival")

    converter = ShamelaWARCConverter(test_mode=args.test_mode, archive=args.archive)
    converter.convert_all(
        start_id=args.start_id,
        limit=args.limit,
        dry_run=args.dry_run
    )


if __name__ == '__main__':
    main()
