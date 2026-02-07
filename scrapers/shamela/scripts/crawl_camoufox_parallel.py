#!/usr/bin/env python3
"""
Parallel Camoufox crawler with 10 headed browsers
Crawls books from ID 700+ with manual Cloudflare solving per browser
"""

import asyncio
import time
import json
import argparse
import logging
from pathlib import Path
from typing import Dict, Optional, List
from datetime import datetime
import re
from bs4 import BeautifulSoup

from camoufox.async_api import AsyncCamoufox

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class ParallelCamoufoxCrawler:
    """Manages 10 parallel Camoufox browsers for book crawling"""

    def __init__(self, num_browsers: int = 10, delay: float = 0.3):
        self.num_browsers = num_browsers
        self.delay = delay
        self.base_url = "https://shamela.ws"

        # Setup directories - save directly to external drive
        self.project_root = Path(__file__).parent.parent
        self.raw_dir = Path('/Volumes/KIOXIA/shamela-backup')
        self.books_dir = self.raw_dir / 'books'
        self.discovery_dir = self.project_root / 'data' / 'shamela' / 'discovery'

        # Statistics
        self.total_requests = 0
        self.completed_books = 0
        self.failed_books = 0
        self.lock = asyncio.Lock()

    def _save_html(self, filepath: Path, content: str):
        """Save HTML content to file"""
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

    def _save_metadata(self, filepath: Path, metadata: Dict):
        """Save metadata to JSON file"""
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)

    def _get_book_info(self, book_id: str, all_books: List[Dict]) -> Optional[Dict]:
        """Get book info from discovery data"""
        for book in all_books:
            if str(book.get('book_id')) == book_id:
                return {
                    'book_id': book_id,
                    'title': book.get('title'),
                    'author_id': book.get('author_id'),
                    'author_name': book.get('author_name')
                }

        return {
            'book_id': book_id,
            'title': f'Book {book_id}',
            'author_id': None,
            'author_name': None
        }

    async def wait_for_user_to_solve_challenge(self, page, browser_id: int, initial_url: str):
        """Wait for user to manually solve Cloudflare challenge"""

        print(f"\n{'='*60}")
        print(f"⏳ BROWSER {browser_id}: WAITING FOR CLOUDFLARE SOLVE")
        print(f"{'='*60}")
        print(f"Browser {browser_id}: Look at the browser window")
        print(f"Browser {browser_id}: Click the Cloudflare checkbox")
        print(f"Browser {browser_id}: Wait for challenge to disappear")
        print(f"{'='*60}\n")

        # Check periodically if challenge is gone
        max_wait = 120  # 2 minutes max
        elapsed = 0

        while elapsed < max_wait:
            await asyncio.sleep(2)
            elapsed += 2

            content = await page.content()

            # Check if we have actual content (not challenge page)
            if 'الشمائل' in content or 'المكتبة' in content:
                print(f"✅ Browser {browser_id}: Challenge solved! (Detected Arabic content)")
                await asyncio.sleep(2)
                return True

            # Check if still on challenge
            if 'Just a moment' in content or 'challenges.cloudflare.com' in content:
                if elapsed % 10 == 0:  # Print every 10 seconds
                    print(f"⏳ Browser {browser_id}: Still waiting... ({elapsed}s elapsed)")
                continue
            else:
                # No challenge detected and has content
                print(f"✅ Browser {browser_id}: Challenge solved!")
                return True

        print(f"\n⏱️  Browser {browser_id}: Timeout waiting for challenge")
        return False

    async def crawl_book(self, book_id: str, page, browser_id: int, all_books: List[Dict]) -> bool:
        """Crawl a single book using established browser session and reused page"""

        book_info = self._get_book_info(book_id, all_books)

        book_dir = self.books_dir / book_id
        meta_file = book_dir / f'book_{book_id}_meta.json'

        # Check if book is already complete
        if meta_file.exists():
            with open(meta_file, 'r') as f:
                existing_meta = json.load(f)
            if existing_meta.get('status') == 'complete':
                logger.info(f"[Browser {browser_id}] [Book {book_id}] Already complete ({existing_meta.get('total_pages', 0)} pages), skipping")
                async with self.lock:
                    self.completed_books += 1
                return True

        logger.info(f"[Browser {browser_id}] [Book {book_id}] Starting: {book_info.get('title', 'Unknown')}")
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

        try:

            # Start from section 1
            current_section = 1
            first_page = True

            # For first page, check if we need to solve challenge
            url = f"{self.base_url}/book/{book_id}/1"
            logger.info(f"[Browser {browser_id}] [Book {book_id}] Loading first page: {url}")
            await page.goto(url, timeout=30000, wait_until='domcontentloaded')

            # Check for challenge
            content = await page.content()
            if 'Just a moment' in content or 'challenges.cloudflare.com' in content:
                solved = await self.wait_for_user_to_solve_challenge(page, browser_id, url)
                if not solved:
                    logger.error(f"[Browser {browser_id}] [Book {book_id}] Challenge not solved - aborting")
                    metadata['status'] = 'failed'
                    metadata['errors'].append('User did not solve Cloudflare challenge in time')
                    self._save_metadata(book_dir / f'book_{book_id}_meta.json', metadata)
                    return False

            # Save first page
            content = await page.content()
            if len(content) > 500 and '404 Page Not Found' not in content:
                section_filename = f'book_{book_id}_section_1.html'
                self._save_html(book_dir / section_filename, content)
                metadata['total_pages'] += 1
                logger.info(f"[Browser {browser_id}] [Book {book_id}] ✓ Saved section 1")
            else:
                logger.warning(f"[Browser {browser_id}] [Book {book_id}] Section 1 not valid")
                metadata['status'] = 'failed'
                metadata['errors'].append('Section 1 does not exist or is invalid')
                self._save_metadata(book_dir / f'book_{book_id}_meta.json', metadata)
                return False

            current_section = 2
            consecutive_failures = 0
            max_consecutive_failures = 5

            # Crawl remaining pages
            while consecutive_failures < max_consecutive_failures:
                # Check if section already exists
                section_filename = f'book_{book_id}_section_{current_section}.html'
                section_file_path = book_dir / section_filename
                if section_file_path.exists():
                    logger.debug(f"[Browser {browser_id}] [Book {book_id}] Section {current_section} exists, skipping")
                    metadata['total_pages'] += 1
                    current_section += 1
                    continue

                url = f"{self.base_url}/book/{book_id}/{current_section}"

                try:
                    # Rate limiting
                    await asyncio.sleep(self.delay)

                    # Navigate to page
                    await page.goto(url, timeout=30000, wait_until='domcontentloaded')

                    async with self.lock:
                        self.total_requests += 1

                    # Get content
                    content = await page.content()

                    # Check if we got valid content
                    if len(content) < 500:
                        logger.warning(f"[Browser {browser_id}] [Book {book_id}] Section {current_section} too small")
                        consecutive_failures += 1
                        current_section += 1
                        continue

                    # Check if section doesn't exist (404 page)
                    if '404 Page Not Found' in content or 'الصفحة غير موجودة' in content:
                        logger.debug(f"[Browser {browser_id}] [Book {book_id}] Section {current_section} 404")
                        consecutive_failures += 1
                        current_section += 1
                        continue

                    # Check if Cloudflare blocked us again
                    if 'Just a moment' in content or 'challenges.cloudflare.com' in content:
                        logger.warning(f"[Browser {browser_id}] [Book {book_id}] Cloudflare challenge on section {current_section}")
                        solved = await self.wait_for_user_to_solve_challenge(page, browser_id, url)
                        if not solved:
                            logger.error(f"[Browser {browser_id}] [Book {book_id}] Challenge not solved - stopping")
                            break
                        # Retry getting content
                        content = await page.content()

                    # Save the page
                    self._save_html(section_file_path, content)
                    metadata['total_pages'] += 1
                    consecutive_failures = 0  # Reset on success

                    if metadata['total_pages'] % 50 == 0:
                        logger.info(f"[Browser {browser_id}] [Book {book_id}] Progress: {metadata['total_pages']} pages")

                    # Move to next section
                    current_section += 1

                except asyncio.TimeoutError:
                    logger.warning(f"[Browser {browser_id}] [Book {book_id}] Timeout on section {current_section}")
                    consecutive_failures += 1
                    current_section += 1
                except Exception as e:
                    logger.error(f"[Browser {browser_id}] [Book {book_id}] Error on section {current_section}: {e}")
                    metadata['errors'].append(f'Error on section {current_section}: {str(e)}')
                    consecutive_failures += 1
                    current_section += 1

            metadata['status'] = 'complete'
            self._save_metadata(book_dir / f'book_{book_id}_meta.json', metadata)

            html_files = list(book_dir.glob(f'book_{book_id}_section_*.html'))
            actual_count = len(html_files)

            logger.info(f"[Browser {browser_id}] [Book {book_id}] ✓ Complete: {actual_count} pages")

            async with self.lock:
                self.completed_books += 1

            return True

        except Exception as e:
            logger.error(f"[Browser {browser_id}] [Book {book_id}] Failed: {e}")
            metadata['status'] = 'failed'
            metadata['errors'].append(f'Crawler exception: {str(e)}')
            self._save_metadata(book_dir / f'book_{book_id}_meta.json', metadata)

            async with self.lock:
                self.failed_books += 1

            return False

    async def browser_worker(self, browser_id: int, book_queue: asyncio.Queue, all_books: List[Dict]):
        """Worker that manages one browser and processes books from queue"""

        logger.info(f"[Browser {browser_id}] Starting browser...")

        async with AsyncCamoufox(
            headless=False,
            humanize=True
        ) as browser:

            logger.info(f"[Browser {browser_id}] ✓ Browser launched")

            # Create one page and reuse it for all books
            page = await browser.new_page()
            logger.info(f"[Browser {browser_id}] ✓ Page created, will be reused for all books")

            while True:
                try:
                    # Get next book from queue (with timeout to allow graceful shutdown)
                    book_id = await asyncio.wait_for(book_queue.get(), timeout=1.0)

                    if book_id is None:  # Poison pill to stop worker
                        logger.info(f"[Browser {browser_id}] Shutting down...")
                        break

                    # Crawl the book using the persistent page
                    await self.crawl_book(book_id, page, browser_id, all_books)

                    # Mark task as done
                    book_queue.task_done()

                except asyncio.TimeoutError:
                    # Check if queue is empty
                    if book_queue.empty():
                        logger.info(f"[Browser {browser_id}] No more books, shutting down...")
                        break
                    continue
                except Exception as e:
                    logger.error(f"[Browser {browser_id}] Worker error: {e}")
                    continue

            # Close the page when we're done with all books
            await page.close()

        logger.info(f"[Browser {browser_id}] Browser closed")

    async def crawl_books_parallel(self, books_file: Path, start_from_id: int = 700):
        """Crawl books in parallel with multiple browsers"""

        # Load all books
        with open(books_file, 'r', encoding='utf-8') as f:
            all_books = json.load(f)

        # Filter books >= start_from_id
        book_ids_to_crawl = [
            str(book['book_id'])
            for book in all_books
            if int(book['book_id']) >= start_from_id
        ]

        logger.info(f"\n{'='*60}")
        logger.info(f"Parallel Camoufox Crawler")
        logger.info(f"{'='*60}")
        logger.info(f"Browsers: {self.num_browsers}")
        logger.info(f"Delay: {self.delay}s between pages")
        logger.info(f"Books to crawl: {len(book_ids_to_crawl)} (starting from ID {start_from_id})")
        logger.info(f"{'='*60}\n")

        # Create queue and add all book IDs
        book_queue = asyncio.Queue()
        for book_id in book_ids_to_crawl:
            await book_queue.put(book_id)

        # Launch browser workers
        logger.info(f"Launching {self.num_browsers} browser workers...\n")

        workers = [
            asyncio.create_task(self.browser_worker(i, book_queue, all_books))
            for i in range(self.num_browsers)
        ]

        # Wait for all books to be processed
        await book_queue.join()

        # Send poison pills to stop workers
        for _ in range(self.num_browsers):
            await book_queue.put(None)

        # Wait for all workers to finish
        await asyncio.gather(*workers)

        logger.info(f"\n{'='*60}")
        logger.info(f"Crawl complete!")
        logger.info(f"Completed: {self.completed_books} books")
        logger.info(f"Failed: {self.failed_books} books")
        logger.info(f"Total requests: {self.total_requests}")
        logger.info(f"{'='*60}")


async def main_async(num_browsers: int, delay: float, start_from_id: int):
    """Async main function"""

    project_root = Path(__file__).parent.parent
    books_file = project_root / 'data' / 'shamela' / 'discovery' / 'all_books.json'

    crawler = ParallelCamoufoxCrawler(num_browsers=num_browsers, delay=delay)
    await crawler.crawl_books_parallel(books_file, start_from_id=start_from_id)


def main():
    parser = argparse.ArgumentParser(description='Parallel Camoufox crawler with 10 headed browsers')
    parser.add_argument('--browsers', type=int, default=10, help='Number of parallel browsers')
    parser.add_argument('--delay', type=float, default=0.3, help='Delay between requests (seconds)')
    parser.add_argument('--start-from', type=int, default=700, help='Start from book ID')

    args = parser.parse_args()

    # Run async crawler
    asyncio.run(main_async(args.browsers, args.delay, args.start_from))


if __name__ == '__main__':
    main()
