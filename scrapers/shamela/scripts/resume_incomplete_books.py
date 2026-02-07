#!/usr/bin/env python3
"""
Resume crawler for incomplete Shamela books

This script reads the list of incomplete books and resumes crawling from
the last section for each book.

Usage:
    python3 scripts/resume_incomplete_books.py [--workers N] [--delay SECONDS]
"""

import requests
import time
import json
import argparse
import logging
import re
from pathlib import Path
from typing import List, Dict, Optional, Set
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
from bs4 import BeautifulSoup

# Setup directories and logging
project_root = Path(__file__).parent.parent
raw_dir = project_root / 'data' / 'shamela' / 'raw'
raw_dir.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [%(threadName)s] - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(raw_dir / 'resume_crawl.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class ShamelaResumeCrawler:
    """Resumes crawling for incomplete Shamela books"""

    def __init__(self, workers: int = 10, delay: float = 0.35):
        self.workers = workers
        self.delay = delay
        self.base_url = "https://shamela.ws"

        # Setup directories
        self.project_root = Path(__file__).parent.parent
        self.raw_dir = self.project_root / 'data' / 'shamela' / 'raw'
        self.books_dir = self.raw_dir / 'books'
        self.discovery_dir = self.project_root / 'data' / 'shamela' / 'discovery'

        # Progress tracking with thread safety
        self.progress_file = self.raw_dir / 'resume_progress.json'
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
            'failed_books': [],
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

    def _find_last_section(self, book_dir: Path, book_id: str) -> Optional[int]:
        """Find the last section number that was crawled"""
        html_files = list(book_dir.glob(f'book_{book_id}_section_*.html'))

        if not html_files:
            return None

        section_numbers = []
        for filepath in html_files:
            # Extract section number from filename
            match = re.search(r'section_(\d+)\.html$', filepath.name)
            if match:
                section_numbers.append(int(match.group(1)))

        return max(section_numbers) if section_numbers else None

    def resume_book(self, book_id: str, book_info: Dict) -> bool:
        """
        Resume crawling a book from its last section

        Args:
            book_id: Shamela book ID
            book_info: Book info from discovery (title, author, etc.)

        Returns:
            True if successful, False otherwise
        """
        thread_id = threading.current_thread().name

        # Get book subdirectory
        book_dir = self.books_dir / book_id

        # Load existing metadata if it exists
        metadata_file = book_dir / f'book_{book_id}_meta.json'
        if metadata_file.exists():
            with open(metadata_file, 'r', encoding='utf-8') as f:
                metadata = json.load(f)
            logger.info(f"[Book {book_id}] Resuming: {metadata.get('title', 'Unknown')} (had {metadata['total_pages']} pages)")
        else:
            logger.warning(f"[Book {book_id}] No metadata found, starting fresh")
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

        # Find last section
        last_section = self._find_last_section(book_dir, book_id)

        if last_section is None:
            logger.warning(f"[Book {book_id}] No sections found, cannot resume")
            return False

        logger.info(f"[Book {book_id}] Last section: {last_section}, checking if there's a next page")

        # Load the last HTML file to find the next button
        last_file = book_dir / f'book_{book_id}_section_{last_section}.html'

        try:
            with open(last_file, 'r', encoding='utf-8') as f:
                last_html = f.read()
        except Exception as e:
            logger.error(f"[Book {book_id}] Failed to read last file: {e}")
            return False

        # Parse last page to find next button
        soup = BeautifulSoup(last_html, 'html.parser')
        next_button = None

        for link in soup.find_all('a', class_='btn'):
            link_html = str(link)
            # Check if it has single > (next) but not >> (last)
            if ('&gt;' in link_html or '>' in link.get_text()) and not ('&gt;&gt;' in link_html or '>>' in link.get_text()):
                if not link.get('disabled') and link.get('href'):
                    next_button = link
                    break

        if not next_button:
            logger.info(f"[Book {book_id}] Already complete (no next button on last page)")
            metadata['status'] = 'complete'
            self._save_metadata(metadata_file, metadata)
            return True

        # Get the next URL
        next_href = next_button['href']
        if next_href.startswith('/'):
            current_url = f"{self.base_url}{next_href.split('#')[0]}"
        elif next_href.startswith('http'):
            current_url = next_href.split('#')[0]
        else:
            logger.error(f"[Book {book_id}] Invalid next href: {next_href}")
            return False

        logger.info(f"[Book {book_id}] Resuming from section {last_section + 1}")

        # Continue crawling
        page_number = metadata['total_pages'] + 1
        visited_urls = set()

        while current_url and current_url not in visited_urls:
            # Fetch current page
            html = self._fetch_url(current_url, thread_id)

            if not html or len(html) < 500:
                metadata['errors'].append(f'Failed to fetch page at section {page_number}')
                break

            visited_urls.add(current_url)

            # Extract section ID from URL
            url_match = re.search(f'/book/{book_id}/(\\d+)', current_url)
            section_id = url_match.group(1) if url_match else 'unknown'
            filename = f'book_{book_id}_section_{section_id}.html'

            # Save page
            self._save_html(book_dir / filename, html)
            metadata['total_pages'] += 1

            # Find next button
            soup = BeautifulSoup(html, 'html.parser')
            next_button = None

            for link in soup.find_all('a', class_='btn'):
                link_html = str(link)
                if ('&gt;' in link_html or '>' in link.get_text()) and not ('&gt;&gt;' in link_html or '>>' in link.get_text()):
                    if not link.get('disabled') and link.get('href'):
                        next_button = link
                        break

            if next_button:
                next_href = next_button['href']
                if next_href.startswith('/'):
                    current_url = f"{self.base_url}{next_href.split('#')[0]}"
                elif next_href.startswith('http'):
                    current_url = next_href.split('#')[0]
                else:
                    current_url = None
            else:
                current_url = None

            page_number += 1

            # Progress logging
            if page_number % 100 == 0:
                logger.info(f"[Book {book_id}] Progress: {metadata['total_pages']} pages crawled")

        # Update metadata
        metadata['status'] = 'complete'
        metadata['resume_timestamp'] = datetime.now().isoformat()
        self._save_metadata(metadata_file, metadata)

        # Count actual HTML files
        html_files = list(book_dir.glob(f'book_{book_id}_section_*.html'))
        actual_count = len(html_files)

        logger.info(f"[Book {book_id}] ✓ Complete: {actual_count} pages (metadata: {metadata['total_pages']})")
        return True

    def resume_all_books(self, book_ids_file: Path):
        """Resume crawling all incomplete books"""

        # Load book IDs to resume
        with open(book_ids_file, 'r') as f:
            book_ids = [line.strip() for line in f if line.strip()]

        # Load book metadata
        all_books_file = self.discovery_dir / 'all_books.json'
        with open(all_books_file, 'r', encoding='utf-8') as f:
            all_books = json.load(f)

        # Create lookup dict
        books_dict = {b['book_id']: b for b in all_books}

        logger.info(f"Found {len(book_ids)} incomplete books to resume")

        # Filter out already completed in this run
        book_ids = [bid for bid in book_ids if bid not in self.progress['completed_books']]
        logger.info(f"Processing {len(book_ids)} books ({len(self.progress['completed_books'])} already completed)")

        # Parallel processing
        with ThreadPoolExecutor(max_workers=self.workers, thread_name_prefix="Worker") as executor:
            future_to_book = {
                executor.submit(self.resume_book, book_id, books_dict.get(book_id, {})): book_id
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
        logger.info(f"Resume crawl complete: {completed} successful, {failed} failed")


def main():
    parser = argparse.ArgumentParser(description='Resume incomplete Shamela books')
    parser.add_argument('--workers', type=int, default=10, help='Number of parallel workers')
    parser.add_argument('--delay', type=float, default=0.35, help='Delay between requests per worker (seconds)')
    parser.add_argument('--books-file', type=str, default='books_to_recrawl.txt',
                        help='File containing book IDs to resume (default: books_to_recrawl.txt)')

    args = parser.parse_args()

    logger.info(f"Starting resume crawler with {args.workers} workers, {args.delay}s delay")

    # Get path to book IDs file
    project_root = Path(__file__).parent.parent
    books_file = project_root / args.books_file

    if not books_file.exists():
        logger.error(f"Book IDs file not found: {books_file}")
        return

    crawler = ShamelaResumeCrawler(workers=args.workers, delay=args.delay)
    crawler.resume_all_books(books_file)


if __name__ == '__main__':
    main()
