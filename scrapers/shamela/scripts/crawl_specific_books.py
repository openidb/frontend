#!/usr/bin/env python3
"""
Crawl specific books from a list

Usage:
    python3 scripts/crawl_specific_books.py --books-file books_to_crawl.txt [--workers N] [--delay SECONDS]
"""

import requests
import time
import json
import argparse
import logging
from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
from bs4 import BeautifulSoup
import re

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [%(threadName)s] - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class SpecificBooksCrawler:
    """Crawls specific books from a list"""

    def __init__(self, workers: int = 10, delay: float = 0.35):
        self.workers = workers
        self.delay = delay
        self.base_url = "https://shamela.ws"

        # Setup directories
        self.project_root = Path(__file__).parent.parent
        self.raw_dir = self.project_root / 'data' / 'shamela' / 'raw'
        self.books_dir = self.raw_dir / 'books'
        self.discovery_dir = self.project_root / 'data' / 'shamela' / 'discovery'

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

    def _save_html(self, filepath: Path, content: str):
        """Save HTML content to file"""
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

    def _save_metadata(self, filepath: Path, metadata: Dict):
        """Save metadata to JSON file"""
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)

    def _get_book_info(self, book_id: str) -> Optional[Dict]:
        """Get book info from discovery data or fetch from website"""
        # Try to load from all_books.json first
        all_books_file = self.discovery_dir / 'all_books.json'
        if all_books_file.exists():
            with open(all_books_file) as f:
                books = json.load(f)
                for book in books:
                    if str(book.get('book_id')) == book_id:
                        return {
                            'book_id': book_id,
                            'title': book.get('title'),
                            'author_id': book.get('author_id'),
                            'author_name': book.get('author_name')
                        }

        # Try books_catalog.json as fallback
        discovery_file = self.discovery_dir / 'books_catalog.json'
        if discovery_file.exists():
            with open(discovery_file) as f:
                catalog = json.load(f)
                for book in catalog.get('books', []):
                    if str(book.get('id')) == book_id:
                        return {
                            'book_id': book_id,
                            'title': book.get('title'),
                            'author_id': book.get('author_id'),
                            'author_name': book.get('author_name')
                        }

        # If not found, create minimal info
        return {
            'book_id': book_id,
            'title': f'Book {book_id}',
            'author_id': None,
            'author_name': None
        }

    def crawl_book(self, book_id: str) -> bool:
        """
        Crawl a single book by following next buttons from TOC

        Returns:
            True if successful, False otherwise
        """
        thread_id = threading.current_thread().name

        # Get book info
        book_info = self._get_book_info(book_id)
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

        # Always start from section 1 to avoid missing early sections
        # (TOC might link to section 5+, missing sections 2-4)
        current_url = f"{self.base_url}/book/{book_id}/1"

        # Verify section 1 exists
        test_html = self._fetch_url(current_url, thread_id)
        if not test_html or len(test_html) < 500:
            # Section 1 doesn't exist, try to find first valid section from TOC
            toc_url = f"{self.base_url}/book/{book_id}"
            toc_html = self._fetch_url(toc_url, thread_id)

            if not toc_html:
                metadata['status'] = 'failed'
                metadata['errors'].append('Failed to fetch TOC and section 1 does not exist')
                self._save_metadata(book_dir / f'book_{book_id}_meta.json', metadata)
                return False

            soup = BeautifulSoup(toc_html, 'html.parser')
            content_links = soup.find_all('a', href=re.compile(f'/book/{book_id}/\\d+'))

            if not content_links:
                metadata['status'] = 'failed'
                metadata['errors'].append('No content links found in TOC')
                self._save_metadata(book_dir / f'book_{book_id}_meta.json', metadata)
                return False

            first_href = content_links[0]['href']
            if first_href.startswith('/'):
                current_url = f"{self.base_url}{first_href.split('#')[0]}"
            else:
                current_url = first_href.split('#')[0]

        visited_urls = set()
        page_number = 1
        consecutive_failures = 0
        max_consecutive_failures = 5  # Stop after 5 consecutive failures

        while current_url and current_url not in visited_urls and consecutive_failures < max_consecutive_failures:
            # Extract current section ID FIRST
            url_match = re.search(f'/book/{book_id}/(\\d+)', current_url)
            current_section = int(url_match.group(1)) if url_match else None

            # Check if this section already exists - if so, skip HTTP request
            if current_section:
                section_filename = f'book_{book_id}_section_{current_section}.html'
                section_file_path = book_dir / section_filename
                if section_file_path.exists():
                    logger.debug(f"[Book {book_id}] Section {current_section} already exists, skipping download")
                    visited_urls.add(current_url)
                    metadata['total_pages'] += 1

                    # Move to next section
                    next_section = current_section + 1
                    current_url = f"{self.base_url}/book/{book_id}/{next_section}"
                    page_number += 1
                    continue

            html = self._fetch_url(current_url, thread_id)

            if not html or len(html) < 500:
                # Failed to fetch - log error and try next section
                metadata['errors'].append(f'Failed to fetch section {current_section}: {current_url}')
                visited_urls.add(current_url)
                consecutive_failures += 1

                # Try next sequential section
                if current_section:
                    next_section = current_section + 1
                    current_url = f"{self.base_url}/book/{book_id}/{next_section}"
                    logger.debug(f"[Book {book_id}] Section {current_section} failed, trying section {next_section}")
                else:
                    break
                continue

            # Successfully fetched - reset failure counter
            consecutive_failures = 0
            visited_urls.add(current_url)

            # Save page in book subdirectory
            section_id = url_match.group(1) if url_match else 'unknown'
            filename = f'book_{book_id}_section_{section_id}.html'
            file_path = book_dir / filename
            self._save_html(file_path, html)
            metadata['total_pages'] += 1

            # Find next button - look for link with ">" but not ">>"
            soup = BeautifulSoup(html, 'html.parser')
            next_button = None

            # Find all anchor tags in navigation areas
            for link in soup.find_all('a', class_='btn'):
                link_text = link.get_text(strip=True)
                # Look for single ">" (but not ">>", and handle Arabic ← vs <<)
                if link_text == '>' or link_text == '&gt;':
                    href = link.get('href')
                    # Check it has href and is not disabled
                    if href and 'disabled' not in link.get('class', []):
                        next_button = link
                        break

            if next_button:
                next_href = next_button.get('href')
                if next_href:
                    if next_href.startswith('/'):
                        current_url = f"{self.base_url}{next_href.split('#')[0]}"
                    else:
                        current_url = next_href.split('#')[0]
                else:
                    # No href in next button - try sequential
                    if current_section:
                        current_url = f"{self.base_url}/book/{book_id}/{current_section + 1}"
                    else:
                        current_url = None
            else:
                # No next button found - try sequential section before giving up
                if current_section:
                    next_section = current_section + 1
                    test_url = f"{self.base_url}/book/{book_id}/{next_section}"
                    test_html = self._fetch_url(test_url, thread_id)
                    if test_html and len(test_html) > 500:
                        current_url = test_url
                        logger.debug(f"[Book {book_id}] No next button, but section {next_section} exists")
                    else:
                        current_url = None
                else:
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

    def crawl_books_from_file(self, books_file: Path):
        """Crawl all books from a file with book IDs (txt or json)"""

        # Load book IDs from file
        if books_file.suffix == '.json':
            # Load from JSON file (all_books.json format)
            with open(books_file, 'r', encoding='utf-8') as f:
                books = json.load(f)
                book_ids = [str(book['book_id']) for book in books]
            logger.info(f"Loaded {len(book_ids)} books from JSON: {books_file}")
        else:
            # Load from text file (one ID per line)
            with open(books_file, 'r') as f:
                book_ids = [line.strip() for line in f if line.strip()]
            logger.info(f"Loaded {len(book_ids)} books from text file: {books_file}")

        logger.info(f"Crawling {len(book_ids)} books...")

        # Parallel processing
        with ThreadPoolExecutor(max_workers=self.workers, thread_name_prefix="Worker") as executor:
            future_to_book = {
                executor.submit(self.crawl_book, book_id): book_id
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

        logger.info(f"Crawl complete: {completed} successful, {failed} failed")


def main():
    parser = argparse.ArgumentParser(description='Crawl specific books from a list')
    parser.add_argument('--books-file', type=str, required=True, help='File containing book IDs to crawl (one per line)')
    parser.add_argument('--workers', type=int, default=10, help='Number of parallel workers')
    parser.add_argument('--delay', type=float, default=0.35, help='Delay between requests per worker (seconds)')

    args = parser.parse_args()

    logger.info(f"Starting crawler with {args.workers} workers, {args.delay}s delay")

    # Get path to book IDs file
    books_file = Path(args.books_file)
    if not books_file.is_absolute():
        # If relative path, make it relative to project root
        project_root = Path(__file__).parent.parent
        books_file = project_root / args.books_file

    if not books_file.exists():
        logger.error(f"Book IDs file not found: {books_file}")
        return

    crawler = SpecificBooksCrawler(workers=args.workers, delay=args.delay)
    crawler.crawl_books_from_file(books_file)


if __name__ == '__main__':
    main()
