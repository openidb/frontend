#!/usr/bin/env python3
"""
Parallel crawler for Shamela - downloads all books and authors with 10 concurrent workers

Usage:
    python3 scripts/crawl_all_html_parallel.py [--workers N] [--delay SECONDS] [--limit N]
"""

import requests
import time
import json
import argparse
import logging
from pathlib import Path
from typing import List, Dict, Optional, Set
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

# Setup directories and logging
project_root = Path(__file__).parent.parent
raw_dir = project_root / 'data' / 'shamela' / 'raw'
raw_dir.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [%(threadName)s] - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(raw_dir / 'crawl_parallel.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class ShamelaParallelCrawler:
    """Crawls Shamela with multiple parallel workers"""

    def __init__(self, workers: int = 10, delay: float = 0.3):
        self.workers = workers
        self.delay = delay
        self.base_url = "https://shamela.ws"

        # Setup directories
        self.project_root = Path(__file__).parent.parent
        self.raw_dir = self.project_root / 'data' / 'shamela' / 'raw'
        self.books_dir = self.raw_dir / 'books'
        self.authors_dir = self.raw_dir / 'authors'
        self.discovery_dir = self.project_root / 'data' / 'shamela' / 'discovery'

        # Create directories
        self.books_dir.mkdir(parents=True, exist_ok=True)
        self.authors_dir.mkdir(parents=True, exist_ok=True)

        # Progress tracking with thread safety
        self.progress_file = self.raw_dir / 'crawl_progress.json'
        self.progress_lock = threading.Lock()
        self.progress = self._load_progress()

        # Rate limiting
        self.last_request_time = {}
        self.request_lock = threading.Lock()

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
        """Save progress to file (thread-safe)"""
        with self.progress_lock:
            self.progress['last_updated'] = datetime.now().isoformat()
            with open(self.progress_file, 'w', encoding='utf-8') as f:
                json.dump(self.progress, f, ensure_ascii=False, indent=2)

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
        """Fetch URL with rate limiting, error handling, and retry logic"""
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
                    # Exponential backoff: wait 1s, 2s, 4s
                    wait_time = 2 ** attempt
                    logger.warning(f"Error fetching {url} (attempt {attempt + 1}/{max_retries}): {e}. Retrying in {wait_time}s...")
                    time.sleep(wait_time)
                else:
                    logger.error(f"Error fetching {url} after {max_retries} attempts: {e}")
                    return None
        return None

    def _save_html(self, filepath: Path, html: str):
        """Save HTML to file"""
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(html)

    def _save_metadata(self, filepath: Path, metadata: Dict):
        """Save metadata JSON"""
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)

    def crawl_book(self, book_id: str, book_info: Dict) -> bool:
        """
        Crawl a single book by following the "next" button

        This approach ensures complete coverage by navigating through all pages
        sequentially, avoiding any pages that might not be in the TOC.

        Args:
            book_id: Shamela book ID
            book_info: Book info from discovery (title, author, etc.)

        Returns:
            True if successful, False otherwise
        """
        from bs4 import BeautifulSoup
        import re

        thread_id = threading.current_thread().name
        logger.info(f"[Book {book_id}] Starting crawl: {book_info.get('title', 'Unknown')}")

        # Create book subdirectory
        book_dir = self.books_dir / book_id
        book_dir.mkdir(parents=True, exist_ok=True)

        metadata = {
            'book_id': book_id,
            'title': book_info.get('title'),
            'author_id': book_info.get('author_id'),
            'author_name': book_info.get('author_name'),
            'crawl_timestamp': datetime.now().isoformat(),
            'status': 'in_progress',
            'total_pages': 0,
            'errors': []
        }

        # Fetch TOC page to find first content link
        toc_url = f"{self.base_url}/book/{book_id}"
        toc_html = self._fetch_url(toc_url, thread_id)

        if not toc_html:
            metadata['status'] = 'failed'
            metadata['errors'].append('Failed to fetch TOC')
            self._save_metadata(book_dir / f'book_{book_id}_meta.json', metadata)
            return False

        # Parse first content link from TOC
        soup = BeautifulSoup(toc_html, 'html.parser')
        content_links = soup.find_all('a', href=re.compile(f'/book/{book_id}/\\d+'))

        if not content_links:
            metadata['status'] = 'failed'
            metadata['errors'].append('No content links found in TOC')
            self._save_metadata(book_dir / f'book_{book_id}_meta.json', metadata)
            return False

        # Start from first content page
        first_href = content_links[0]['href']
        if first_href.startswith('/'):
            current_url = f"{self.base_url}{first_href.split('#')[0]}"
        else:
            current_url = first_href.split('#')[0]

        page_number = 1
        visited_urls = set()

        while current_url and current_url not in visited_urls:
            # Fetch current page
            html = self._fetch_url(current_url, thread_id)

            if not html or len(html) < 500:
                metadata['errors'].append(f'Failed to fetch page {page_number}')
                break

            visited_urls.add(current_url)

            # Extract section ID from URL for filename
            url_match = re.search(f'/book/{book_id}/(\\d+)', current_url)
            section_id = url_match.group(1) if url_match else 'unknown'
            filename = f'book_{book_id}_section_{section_id}.html'

            # Save page in book subdirectory
            self._save_html(book_dir / filename, html)
            metadata['total_pages'] += 1

            # Find next button - look for link with ">" but not ">>"
            soup = BeautifulSoup(html, 'html.parser')
            next_button = None

            # Find all anchor tags in navigation areas
            for link in soup.find_all('a', class_='btn'):
                link_html = str(link)
                # Check if it has single > (next) but not >> (last)
                if ('&gt;' in link_html or '>' in link.get_text()) and not ('&gt;&gt;' in link_html or '>>' in link.get_text()):
                    # Make sure it's not disabled and has an href
                    if not link.get('disabled') and link.get('href'):
                        next_button = link
                        break

            if next_button:
                next_href = next_button['href']
                # Handle relative URLs
                if next_href.startswith('/'):
                    current_url = f"{self.base_url}{next_href.split('#')[0]}"
                elif next_href.startswith('http'):
                    current_url = next_href.split('#')[0]
                else:
                    current_url = None
            else:
                # No next button found, we're done
                current_url = None

            page_number += 1

            # Progress logging
            if page_number % 100 == 0:
                logger.info(f"[Book {book_id}] Progress: {page_number} pages crawled")

        metadata['status'] = 'complete'
        self._save_metadata(book_dir / f'book_{book_id}_meta.json', metadata)

        # Count actual HTML files to verify
        html_files = list(book_dir.glob(f'book_{book_id}_section_*.html'))
        actual_count = len(html_files)

        logger.info(f"[Book {book_id}] ✓ Complete: {actual_count} pages (metadata: {metadata['total_pages']})")
        return True

    def crawl_author(self, author_id: str, author_name: str) -> bool:
        """Crawl a single author page"""
        thread_id = threading.current_thread().name
        logger.info(f"[Author {author_id}] Crawling: {author_name}")

        metadata = {
            'author_id': author_id,
            'author_name': author_name,
            'crawl_timestamp': datetime.now().isoformat(),
            'status': 'in_progress'
        }

        # Fetch author page
        author_url = f"{self.base_url}/author/{author_id}"
        author_html = self._fetch_url(author_url, thread_id)

        if not author_html:
            metadata['status'] = 'failed'
            self._save_metadata(self.authors_dir / f'author_{author_id}_meta.json', metadata)
            return False

        # Save author page
        self._save_html(self.authors_dir / f'author_{author_id}.html', author_html)
        metadata['status'] = 'complete'
        self._save_metadata(self.authors_dir / f'author_{author_id}_meta.json', metadata)

        logger.info(f"[Author {author_id}] ✓ Complete")
        return True

    def crawl_books_parallel(self, start_from: Optional[str] = None, limit: Optional[int] = None):
        """Crawl all books using parallel workers"""

        # Load book IDs and metadata
        book_ids_file = self.discovery_dir / 'book_ids.txt'
        all_books_file = self.discovery_dir / 'all_books.json'

        with open(book_ids_file, 'r') as f:
            book_ids = [line.strip() for line in f if line.strip()]

        with open(all_books_file, 'r', encoding='utf-8') as f:
            all_books = json.load(f)

        # Create lookup dict
        books_dict = {b['book_id']: b for b in all_books}

        logger.info(f"Found {len(book_ids)} books to crawl")

        # Apply filters
        if start_from:
            try:
                start_idx = book_ids.index(start_from)
                book_ids = book_ids[start_idx:]
                logger.info(f"Starting from book {start_from}")
            except ValueError:
                logger.warning(f"Book ID {start_from} not found")

        if limit:
            book_ids = book_ids[:limit]
            logger.info(f"Limiting to {limit} books")

        # Filter out already completed
        book_ids = [bid for bid in book_ids if bid not in self.progress['completed_books']]
        logger.info(f"Processing {len(book_ids)} books ({len(self.progress['completed_books'])} already completed)")

        # Parallel processing
        with ThreadPoolExecutor(max_workers=self.workers, thread_name_prefix="Worker") as executor:
            future_to_book = {
                executor.submit(self.crawl_book, book_id, books_dict.get(book_id, {})): book_id
                for book_id in book_ids
            }

            completed = 0
            failed = 0

            for future in as_completed(future_to_book):
                book_id = future_to_book[future]
                try:
                    success = future.result()
                    with self.progress_lock:
                        if success:
                            self.progress['completed_books'].append(book_id)
                            completed += 1
                        else:
                            self.progress['failed_books'].append(book_id)
                            failed += 1

                        # Save progress every 10 books
                        if (completed + failed) % 10 == 0:
                            self._save_progress()
                            logger.info(f"Progress: {completed} completed, {failed} failed, {len(book_ids) - completed - failed} remaining")

                except Exception as e:
                    logger.error(f"[Book {book_id}] Exception: {e}")
                    with self.progress_lock:
                        self.progress['failed_books'].append(book_id)
                        failed += 1

        # Final save
        self._save_progress()
        logger.info(f"Crawl complete: {completed} successful, {failed} failed")

    def crawl_authors_parallel(self):
        """Crawl all authors using parallel workers"""

        authors_file = self.discovery_dir / 'authors.json'
        with open(authors_file, 'r', encoding='utf-8') as f:
            authors = json.load(f)

        logger.info(f"Found {len(authors)} authors to crawl")

        # Filter out already completed
        authors = [a for a in authors if a['id'] not in self.progress['completed_authors']]
        logger.info(f"Processing {len(authors)} authors")

        # Parallel processing
        with ThreadPoolExecutor(max_workers=self.workers, thread_name_prefix="AuthorWorker") as executor:
            future_to_author = {
                executor.submit(self.crawl_author, author['id'], author['name']): author['id']
                for author in authors
            }

            completed = 0
            failed = 0

            for future in as_completed(future_to_author):
                author_id = future_to_author[future]
                try:
                    success = future.result()
                    with self.progress_lock:
                        if success:
                            self.progress['completed_authors'].append(author_id)
                            completed += 1
                        else:
                            self.progress['failed_authors'].append(author_id)
                            failed += 1

                        if (completed + failed) % 50 == 0:
                            self._save_progress()

                except Exception as e:
                    logger.error(f"[Author {author_id}] Exception: {e}")
                    with self.progress_lock:
                        self.progress['failed_authors'].append(author_id)
                        failed += 1

        self._save_progress()
        logger.info(f"Authors complete: {completed} successful, {failed} failed")


def main():
    parser = argparse.ArgumentParser(description='Parallel Shamela crawler')
    parser.add_argument('--workers', type=int, default=10, help='Number of parallel workers')
    parser.add_argument('--delay', type=float, default=0.3, help='Delay between requests per worker (seconds)')
    parser.add_argument('--limit', type=int, help='Limit number of books')
    parser.add_argument('--start-from', type=str, help='Start from specific book ID')
    parser.add_argument('--books-only', action='store_true', help='Only crawl books')
    parser.add_argument('--authors-only', action='store_true', help='Only crawl authors')

    args = parser.parse_args()

    logger.info(f"Starting parallel crawler with {args.workers} workers, {args.delay}s delay")

    crawler = ShamelaParallelCrawler(workers=args.workers, delay=args.delay)

    if args.authors_only:
        crawler.crawl_authors_parallel()
    elif args.books_only:
        crawler.crawl_books_parallel(start_from=args.start_from, limit=args.limit)
    else:
        # Crawl both
        crawler.crawl_books_parallel(start_from=args.start_from, limit=args.limit)
        crawler.crawl_authors_parallel()


if __name__ == '__main__':
    main()
