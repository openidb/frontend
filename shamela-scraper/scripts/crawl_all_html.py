#!/usr/bin/env python3
"""
Crawl all Shamela books and save raw HTML for offline processing

Usage:
    python3 scripts/crawl_all_html.py [options]

Options:
    --books-only         Only crawl books (skip authors)
    --authors-only       Only crawl authors (skip books)
    --start-from <id>    Start from specific book ID
    --limit <N>          Limit to N books (for testing)
    --delay <seconds>    Delay between requests (default: 1.5)
"""

import requests
import time
import json
import argparse
import logging
from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime

# Setup directories and logging
project_root = Path(__file__).parent.parent
raw_dir = project_root / 'data' / 'shamela' / 'raw'
raw_dir.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(raw_dir / 'crawl.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class ShamelaHTMLCrawler:
    """Crawls Shamela website and saves raw HTML files"""

    def __init__(self, delay: float = 1.5):
        self.delay = delay
        self.base_url = "https://shamela.ws"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })

        # Setup directories
        self.project_root = Path(__file__).parent.parent
        self.raw_dir = self.project_root / 'data' / 'shamela' / 'raw'
        self.books_dir = self.raw_dir / 'books'
        self.authors_dir = self.raw_dir / 'authors'
        self.discovery_dir = self.project_root / 'data' / 'shamela' / 'discovery'

        # Create directories
        self.books_dir.mkdir(parents=True, exist_ok=True)
        self.authors_dir.mkdir(parents=True, exist_ok=True)

        # Progress tracking
        self.progress_file = self.raw_dir / 'crawl_progress.json'
        self.progress = self._load_progress()

    def _load_progress(self) -> Dict:
        """Load progress from file"""
        if self.progress_file.exists():
            with open(self.progress_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        return {
            'completed_books': [],
            'completed_authors': [],
            'failed_books': [],
            'failed_authors': [],
            'last_updated': None
        }

    def _save_progress(self):
        """Save progress to file"""
        self.progress['last_updated'] = datetime.now().isoformat()
        with open(self.progress_file, 'w', encoding='utf-8') as f:
            json.dump(self.progress, f, ensure_ascii=False, indent=2)

    def _fetch_url(self, url: str) -> Optional[str]:
        """Fetch URL with error handling and rate limiting"""
        try:
            time.sleep(self.delay)
            response = self.session.get(url, timeout=30)
            response.raise_for_status()
            return response.text
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching {url}: {e}")
            return None

    def _save_html(self, filepath: Path, html: str):
        """Save HTML to file"""
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(html)

    def _save_metadata(self, filepath: Path, metadata: Dict):
        """Save metadata JSON"""
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)

    def crawl_book(self, book_id: str) -> bool:
        """
        Crawl a single book and all its pages

        Returns:
            True if successful, False otherwise
        """
        logger.info(f"Crawling book {book_id}")

        metadata = {
            'book_id': book_id,
            'crawl_timestamp': datetime.now().isoformat(),
            'status': 'in_progress',
            'total_pages': 0,
            'errors': []
        }

        # Fetch main book page
        main_url = f"{self.base_url}/book/{book_id}"
        main_html = self._fetch_url(main_url)

        if not main_html:
            metadata['status'] = 'failed'
            metadata['errors'].append('Failed to fetch main page')
            self._save_metadata(self.books_dir / f'book_{book_id}_meta.json', metadata)
            return False

        # Save main page
        self._save_html(self.books_dir / f'book_{book_id}.html', main_html)
        logger.info(f"  ✓ Saved main page for book {book_id}")

        # Crawl all content pages
        page_num = 1
        consecutive_failures = 0
        max_consecutive_failures = 3

        while consecutive_failures < max_consecutive_failures:
            page_url = f"{self.base_url}/book/{book_id}/{page_num}"
            page_html = self._fetch_url(page_url)

            if not page_html or len(page_html) < 100:  # Empty or very small page
                consecutive_failures += 1
                logger.debug(f"  Empty/missing page {page_num} (attempt {consecutive_failures}/{max_consecutive_failures})")
                page_num += 1
                continue

            # Save page
            self._save_html(self.books_dir / f'book_{book_id}_page_{page_num}.html', page_html)
            metadata['total_pages'] = page_num
            consecutive_failures = 0

            if page_num % 50 == 0:
                logger.info(f"  Progress: {page_num} pages scraped for book {book_id}")

            page_num += 1

        metadata['status'] = 'complete'
        metadata['total_pages'] = metadata['total_pages']
        self._save_metadata(self.books_dir / f'book_{book_id}_meta.json', metadata)

        logger.info(f"  ✓ Completed book {book_id}: {metadata['total_pages']} pages")
        return True

    def crawl_author(self, author_id: str, author_name: str) -> bool:
        """
        Crawl a single author page

        Returns:
            True if successful, False otherwise
        """
        logger.info(f"Crawling author {author_id}: {author_name}")

        metadata = {
            'author_id': author_id,
            'author_name': author_name,
            'crawl_timestamp': datetime.now().isoformat(),
            'status': 'in_progress'
        }

        # Fetch author page
        author_url = f"{self.base_url}/author/{author_id}"
        author_html = self._fetch_url(author_url)

        if not author_html:
            metadata['status'] = 'failed'
            self._save_metadata(self.authors_dir / f'author_{author_id}_meta.json', metadata)
            return False

        # Save author page
        self._save_html(self.authors_dir / f'author_{author_id}.html', author_html)
        metadata['status'] = 'complete'
        self._save_metadata(self.authors_dir / f'author_{author_id}_meta.json', metadata)

        logger.info(f"  ✓ Saved author page for {author_name}")
        return True

    def crawl_all_books(self, start_from: Optional[str] = None, limit: Optional[int] = None):
        """Crawl all books from book_ids.txt"""

        # Load book IDs
        book_ids_file = self.discovery_dir / 'book_ids.txt'
        with open(book_ids_file, 'r') as f:
            book_ids = [line.strip() for line in f if line.strip()]

        logger.info(f"Found {len(book_ids)} books to crawl")

        # Apply start_from filter
        if start_from:
            try:
                start_idx = book_ids.index(start_from)
                book_ids = book_ids[start_idx:]
                logger.info(f"Starting from book {start_from} (index {start_idx})")
            except ValueError:
                logger.warning(f"Book ID {start_from} not found, starting from beginning")

        # Apply limit
        if limit:
            book_ids = book_ids[:limit]
            logger.info(f"Limiting to {limit} books")

        # Crawl each book
        total = len(book_ids)
        success_count = 0
        fail_count = 0

        for idx, book_id in enumerate(book_ids, 1):
            # Skip if already completed
            if book_id in self.progress['completed_books']:
                logger.info(f"[{idx}/{total}] Skipping book {book_id} (already completed)")
                continue

            logger.info(f"[{idx}/{total}] Processing book {book_id}")

            # Crawl book
            success = self.crawl_book(book_id)

            if success:
                self.progress['completed_books'].append(book_id)
                success_count += 1
            else:
                self.progress['failed_books'].append(book_id)
                fail_count += 1

            # Save progress every 10 books
            if idx % 10 == 0:
                self._save_progress()
                logger.info(f"Progress: {success_count} successful, {fail_count} failed")

        # Final progress save
        self._save_progress()
        logger.info(f"Completed: {success_count} books successful, {fail_count} failed")

    def crawl_all_authors(self):
        """Crawl all authors from authors.json"""

        # Load authors
        authors_file = self.discovery_dir / 'authors.json'
        with open(authors_file, 'r', encoding='utf-8') as f:
            authors = json.load(f)

        logger.info(f"Found {len(authors)} authors to crawl")

        # Crawl each author
        total = len(authors)
        success_count = 0
        fail_count = 0

        for idx, author in enumerate(authors, 1):
            author_id = author['id']
            author_name = author['name']

            # Skip if already completed
            if author_id in self.progress['completed_authors']:
                logger.info(f"[{idx}/{total}] Skipping author {author_id} (already completed)")
                continue

            logger.info(f"[{idx}/{total}] Processing author {author_id}: {author_name}")

            # Crawl author
            success = self.crawl_author(author_id, author_name)

            if success:
                self.progress['completed_authors'].append(author_id)
                success_count += 1
            else:
                self.progress['failed_authors'].append(author_id)
                fail_count += 1

            # Save progress every 50 authors
            if idx % 50 == 0:
                self._save_progress()
                logger.info(f"Progress: {success_count} successful, {fail_count} failed")

        # Final progress save
        self._save_progress()
        logger.info(f"Completed: {success_count} authors successful, {fail_count} failed")


def main():
    parser = argparse.ArgumentParser(description='Crawl Shamela and save raw HTML')
    parser.add_argument('--books-only', action='store_true', help='Only crawl books')
    parser.add_argument('--authors-only', action='store_true', help='Only crawl authors')
    parser.add_argument('--start-from', type=str, help='Start from specific book ID')
    parser.add_argument('--limit', type=int, help='Limit number of books to crawl')
    parser.add_argument('--delay', type=float, default=1.5, help='Delay between requests (seconds)')

    args = parser.parse_args()

    crawler = ShamelaHTMLCrawler(delay=args.delay)

    if args.authors_only:
        crawler.crawl_all_authors()
    elif args.books_only:
        crawler.crawl_all_books(start_from=args.start_from, limit=args.limit)
    else:
        # Crawl both books and authors
        crawler.crawl_all_books(start_from=args.start_from, limit=args.limit)
        crawler.crawl_all_authors()


if __name__ == '__main__':
    main()
