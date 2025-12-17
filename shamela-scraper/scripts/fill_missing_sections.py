#!/usr/bin/env python3
"""
Fill in missing sections for all books

This script:
1. Finds gaps in section numbers for each book
2. Attempts to crawl the missing sections
3. Only fills sections that actually exist on the website

Usage:
    python3 scripts/fill_missing_sections.py [--workers N] [--delay SECONDS]
"""

import requests
import time
import json
import argparse
import logging
import re
from pathlib import Path
from typing import List, Dict, Set, Optional
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
from bs4 import BeautifulSoup

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [%(threadName)s] - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class MissingSectionsFiller:
    """Fills in missing sections for books"""

    def __init__(self, workers: int = 10, delay: float = 0.35):
        self.workers = workers
        self.delay = delay
        self.base_url = "https://shamela.ws"

        # Setup directories
        self.project_root = Path(__file__).parent.parent
        self.raw_dir = self.project_root / 'data' / 'shamela' / 'raw'
        self.books_dir = self.raw_dir / 'books'

        # Rate limiting
        self.last_request_time = {}
        self.request_lock = threading.Lock()

    def _rate_limit(self, thread_id: str):
        """Enforce rate limiting per thread"""
        with self.request_lock:
            now = time.time()
            if thread_id in self.last_request_time:
                elapsed = now - self.last_request_time[thread_id]
                if elapsed < self.delay:
                    time.sleep(self.delay - elapsed)
            self.last_request_time[thread_id] = time.time()

    def _fetch_url(self, url: str, thread_id: str, max_retries: int = 3) -> Optional[str]:
        """Fetch URL with rate limiting and retry logic"""
        for attempt in range(max_retries):
            try:
                self._rate_limit(thread_id)
                response = requests.get(url, timeout=30, headers={
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                })
                response.raise_for_status()
                return response.text
            except requests.exceptions.RequestException as e:
                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt
                    logger.debug(f"Error fetching {url} (attempt {attempt + 1}/{max_retries}): {e}. Retrying in {wait_time}s...")
                    time.sleep(wait_time)
                else:
                    logger.debug(f"Failed to fetch {url} after {max_retries} attempts: {e}")
                    return None
        return None

    def _save_html(self, filepath: Path, content: str):
        """Save HTML content to file"""
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

    def _update_metadata(self, book_dir: Path, book_id: str, new_sections_count: int):
        """Update metadata with new sections count"""
        meta_file = book_dir / f'book_{book_id}_meta.json'
        if meta_file.exists():
            with open(meta_file, 'r', encoding='utf-8') as f:
                metadata = json.load(f)

            metadata['total_pages'] = metadata.get('total_pages', 0) + new_sections_count
            metadata['missing_sections_filled'] = datetime.now().isoformat()

            with open(meta_file, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, ensure_ascii=False, indent=2)

    def find_section_gaps(self, book_id: str) -> Dict:
        """Find gaps in section numbers for a book"""
        book_dir = self.books_dir / book_id

        if not book_dir.exists():
            return {'book_id': book_id, 'has_sections': False, 'missing_sections': []}

        # Find all existing sections
        sections = set()
        for html_file in book_dir.glob(f'book_{book_id}_section_*.html'):
            match = re.search(r'section_(\d+)\.html$', html_file.name)
            if match:
                sections.add(int(match.group(1)))

        if not sections:
            return {'book_id': book_id, 'has_sections': False, 'missing_sections': []}

        # Find gaps from 1 to max section
        min_section = min(sections)
        max_section = max(sections)

        # Check all sections from 1 to max
        expected_sections = set(range(1, max_section + 1))
        missing = sorted(expected_sections - sections)

        return {
            'book_id': book_id,
            'has_sections': True,
            'min_section': min_section,
            'max_section': max_section,
            'total_sections': len(sections),
            'missing_sections': missing,
            'missing_count': len(missing)
        }

    def fill_missing_sections(self, book_id: str, missing_sections: List[int]) -> Dict:
        """Fill in missing sections for a book"""
        thread_id = threading.current_thread().name
        book_dir = self.books_dir / book_id

        filled_count = 0
        failed_count = 0

        for section in missing_sections:
            url = f"{self.base_url}/book/{book_id}/{section}"
            html = self._fetch_url(url, thread_id)

            if html and len(html) > 500:  # Valid page
                # Check if it's actually a valid book page (not an error page)
                soup = BeautifulSoup(html, 'html.parser')

                # Simple check: valid pages usually have content
                if soup.find('div', class_='book-page') or soup.find('div', class_='nass'):
                    filename = f'book_{book_id}_section_{section}.html'
                    self._save_html(book_dir / filename, html)
                    filled_count += 1
                    logger.debug(f"[Book {book_id}] Filled section {section}")
                else:
                    failed_count += 1
                    logger.debug(f"[Book {book_id}] Section {section} doesn't exist (error page)")
            else:
                failed_count += 1
                logger.debug(f"[Book {book_id}] Section {section} doesn't exist or failed to fetch")

        # Update metadata if we filled any sections
        if filled_count > 0:
            self._update_metadata(book_dir, book_id, filled_count)

        return {
            'book_id': book_id,
            'filled': filled_count,
            'failed': failed_count,
            'total_attempted': len(missing_sections)
        }

    def process_book(self, book_id: str) -> Dict:
        """Find and fill missing sections for a single book"""
        # Find gaps
        gap_info = self.find_section_gaps(book_id)

        if not gap_info['has_sections'] or gap_info['missing_count'] == 0:
            return {
                'book_id': book_id,
                'status': 'no_gaps',
                'filled': 0
            }

        logger.info(f"[Book {book_id}] Found {gap_info['missing_count']} missing sections: {gap_info['missing_sections'][:10]}{'...' if gap_info['missing_count'] > 10 else ''}")

        # Fill missing sections
        result = self.fill_missing_sections(book_id, gap_info['missing_sections'])

        if result['filled'] > 0:
            logger.info(f"[Book {book_id}] ✓ Filled {result['filled']}/{result['total_attempted']} missing sections")

        return {
            'book_id': book_id,
            'status': 'processed',
            'filled': result['filled'],
            'failed': result['failed']
        }

    def process_all_books(self):
        """Process all books to fill missing sections"""
        # Find all book directories
        book_dirs = [d for d in self.books_dir.iterdir() if d.is_dir()]
        book_ids = [d.name for d in sorted(book_dirs, key=lambda x: int(x.name))]

        logger.info(f"Processing {len(book_ids)} books to fill missing sections")

        # Parallel processing
        with ThreadPoolExecutor(max_workers=self.workers, thread_name_prefix="Worker") as executor:
            future_to_book = {
                executor.submit(self.process_book, book_id): book_id
                for book_id in book_ids
            }

            total_filled = 0
            books_with_gaps = 0
            completed = 0

            for future in as_completed(future_to_book):
                book_id = future_to_book[future]
                try:
                    result = future.result()
                    completed += 1

                    if result['status'] == 'processed':
                        books_with_gaps += 1
                        total_filled += result['filled']

                    if completed % 50 == 0:
                        logger.info(f"Progress: {completed}/{len(book_ids)} books processed, {books_with_gaps} had gaps, {total_filled} sections filled")

                except Exception as e:
                    logger.error(f"[Book {book_id}] Exception: {e}")

        logger.info(f"\n=== SUMMARY ===")
        logger.info(f"Total books processed: {len(book_ids)}")
        logger.info(f"Books with gaps: {books_with_gaps}")
        logger.info(f"Total sections filled: {total_filled}")


def main():
    parser = argparse.ArgumentParser(description='Fill missing sections for all books')
    parser.add_argument('--workers', type=int, default=10, help='Number of parallel workers')
    parser.add_argument('--delay', type=float, default=0.35, help='Delay between requests per worker (seconds)')

    args = parser.parse_args()

    logger.info(f"Starting missing sections filler with {args.workers} workers, {args.delay}s delay")

    filler = MissingSectionsFiller(workers=args.workers, delay=args.delay)
    filler.process_all_books()


if __name__ == '__main__':
    main()
