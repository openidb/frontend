#!/usr/bin/env python3
"""
Crawl missing section 1 for books that don't have it

Many books started from section 2 because the TOC doesn't explicitly
link to section 1. This script fetches section 1 for all such books.
"""

import requests
import time
import json
import argparse
import logging
from pathlib import Path
from typing import List, Optional
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [%(threadName)s] - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class Section1Crawler:
    """Crawls missing section 1 for books"""

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
                    logger.warning(f"Error fetching {url} (attempt {attempt + 1}/{max_retries}): {e}. Retrying in {wait_time}s...")
                    time.sleep(wait_time)
                else:
                    logger.error(f"Error fetching {url} after {max_retries} attempts: {e}")
                    return None
        return None

    def crawl_section_1(self, book_id: str) -> bool:
        """Crawl section 1 for a book"""
        thread_id = threading.current_thread().name

        # Check if section 1 already exists
        book_dir = self.books_dir / book_id
        section_1_file = book_dir / f'book_{book_id}_section_1.html'

        if section_1_file.exists():
            logger.info(f"[Book {book_id}] Section 1 already exists, skipping")
            return True

        # Fetch section 1
        url = f"{self.base_url}/book/{book_id}/1"
        logger.info(f"[Book {book_id}] Fetching section 1")

        html = self._fetch_url(url, thread_id)

        if not html or len(html) < 500:
            logger.error(f"[Book {book_id}] Failed to fetch section 1")
            return False

        # Save section 1
        book_dir.mkdir(parents=True, exist_ok=True)

        with open(section_1_file, 'w', encoding='utf-8') as f:
            f.write(html)

        # Update metadata to increment total_pages
        meta_file = book_dir / f'book_{book_id}_meta.json'
        if meta_file.exists():
            with open(meta_file, 'r', encoding='utf-8') as f:
                metadata = json.load(f)

            metadata['total_pages'] += 1
            metadata['section_1_added'] = datetime.now().isoformat()

            with open(meta_file, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, ensure_ascii=False, indent=2)

        logger.info(f"[Book {book_id}] ✓ Section 1 saved")
        return True

    def crawl_all_missing_section_1(self, book_ids_file: Path):
        """Crawl section 1 for all books in the list"""

        # Load book IDs
        with open(book_ids_file, 'r') as f:
            book_ids = [line.strip() for line in f if line.strip()]

        logger.info(f"Fetching section 1 for {len(book_ids)} books")

        # Parallel processing
        with ThreadPoolExecutor(max_workers=self.workers, thread_name_prefix="Worker") as executor:
            future_to_book = {
                executor.submit(self.crawl_section_1, book_id): book_id
                for book_id in book_ids
            }

            completed = 0
            failed = 0

            for future in as_completed(future_to_book):
                book_id = future_to_book[future]
                try:
                    success = future.result()
                    if success:
                        completed += 1
                    else:
                        failed += 1

                    if (completed + failed) % 20 == 0:
                        logger.info(f"Progress: {completed} completed, {failed} failed, {len(book_ids) - completed - failed} remaining")

                except Exception as e:
                    logger.error(f"[Book {book_id}] Exception: {e}")
                    failed += 1

        logger.info(f"Section 1 crawl complete: {completed} successful, {failed} failed")


def main():
    parser = argparse.ArgumentParser(description='Crawl missing section 1 for books')
    parser.add_argument('--workers', type=int, default=10, help='Number of parallel workers')
    parser.add_argument('--delay', type=float, default=0.35, help='Delay between requests per worker (seconds)')
    parser.add_argument('--books-file', type=str, default='books_missing_section_1.txt',
                        help='File containing book IDs to crawl (default: books_missing_section_1.txt)')

    args = parser.parse_args()

    logger.info(f"Starting section 1 crawler with {args.workers} workers, {args.delay}s delay")

    # Get path to book IDs file
    project_root = Path(__file__).parent.parent
    books_file = project_root / args.books_file

    if not books_file.exists():
        logger.error(f"Book IDs file not found: {books_file}")
        logger.info("Run find_missing_section_1.py first to generate the list")
        return

    crawler = Section1Crawler(workers=args.workers, delay=args.delay)
    crawler.crawl_all_missing_section_1(books_file)


if __name__ == '__main__':
    main()
