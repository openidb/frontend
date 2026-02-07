#!/usr/bin/env python3
"""
Parallel batch scraper for Shamela books
"""

import sys
import os
import json
import logging
import argparse
import time
import signal
from multiprocessing import Process, Queue, Manager, cpu_count
from typing import List, Dict, Optional
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from shamela.metadata_scraper import MetadataScraper
from shamela.author_scraper import AuthorScraper
from shamela.page_scraper import PageScraper
from shamela.epub_generator import EPUBGenerator
from shamela.utils import ShamelaHTTPClient

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - Worker-%(process)d - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global flag for graceful shutdown
should_stop = False


def signal_handler(signum, frame):
    """Handle Ctrl+C gracefully"""
    global should_stop
    logger.info("Received interrupt signal. Finishing current books and shutting down...")
    should_stop = True


def scrape_single_book(book_id: str, output_dir: str, data_dir: str, delay: float = 0.05,
                       save_json: bool = True, skip_author_enrich: bool = False) -> Dict:
    """
    Scrape a single book

    Returns:
        Dictionary with scraping results
    """
    start_time = time.time()
    result = {
        'book_id': book_id,
        'success': False,
        'pages_scraped': 0,
        'error': None,
        'elapsed_time': 0
    }

    try:
        # Check if book is already completely scraped (resume logic)
        # A book is considered complete if the EPUB file exists
        # This is the most reliable indicator since EPUB generation is the final step

        epub_path = os.path.join(output_dir, f'{book_id}.epub')

        # Check for existing EPUB files with any naming pattern
        # (format could be: BOOKID.epub or BOOKID_title.epub)
        import glob
        epub_pattern = os.path.join(output_dir, f'{book_id}*.epub')
        existing_epubs = glob.glob(epub_pattern)

        if existing_epubs:
            logger.info(f"Book {book_id} already has EPUB: {existing_epubs[0]}. Skipping.")
            result['success'] = True
            result['skipped'] = True
            result['epub_path'] = existing_epubs[0]
            result['elapsed_time'] = time.time() - start_time
            return result
        # Initialize HTTP client and scrapers
        http_client = ShamelaHTTPClient(delay=delay)
        metadata_scraper = MetadataScraper(http_client)
        author_scraper = AuthorScraper(http_client)
        page_scraper = PageScraper(http_client)
        epub_generator = EPUBGenerator()

        # Step 1: Scrape metadata
        metadata = metadata_scraper.scrape_book(book_id)
        if not metadata:
            result['error'] = "Failed to scrape metadata"
            return result

        # Save metadata if requested
        if save_json:
            metadata_path = os.path.join(data_dir, 'metadata', f'{book_id}.json')
            os.makedirs(os.path.dirname(metadata_path), exist_ok=True)
            metadata.to_json(metadata_path)

        # Step 2: Scrape table of contents
        toc = metadata_scraper.scrape_toc(book_id)
        if not toc:
            result['error'] = "Failed to scrape TOC"
            return result

        # Save TOC if requested
        if save_json:
            toc_path = os.path.join(data_dir, 'toc', f'{book_id}_toc.json')
            os.makedirs(os.path.dirname(toc_path), exist_ok=True)
            toc.to_json(toc_path)

        # Step 3: Enrich author data (optional)
        if not skip_author_enrich and metadata.author.shamela_author_id:
            enriched_author = author_scraper.enrich_author(metadata.author)
            metadata.author = enriched_author

            if save_json:
                author_path = os.path.join(data_dir, 'authors', f'{metadata.author.shamela_author_id}.json')
                os.makedirs(os.path.dirname(author_path), exist_ok=True)
                with open(author_path, 'w', encoding='utf-8') as f:
                    json.dump(enriched_author.to_dict(), f, ensure_ascii=False, indent=2)

        # Step 4: Scrape pages
        pages_output_dir = os.path.join(data_dir, 'pages') if save_json else None
        book_title = metadata.title.get('arabic', '')
        author_name = metadata.author.name
        pages = page_scraper.scrape_book(
            book_id,
            start_page=1,
            output_dir=pages_output_dir,
            book_title=book_title,
            author_name=author_name
        )

        if not pages:
            result['error'] = "No pages scraped"
            return result

        result['pages_scraped'] = len(pages)
        result['title'] = metadata.title.get('arabic', '')
        result['author'] = metadata.author.name

        # Step 5: Generate EPUB
        epub_filename = f"{book_id}_{metadata.title.get('arabic', 'book')}.epub"
        # Clean filename
        epub_filename = epub_filename.replace('/', '_').replace('\\', '_').replace(':', '_')
        epub_path = os.path.join(output_dir, epub_filename)

        success = epub_generator.generate_epub(metadata, toc, pages, epub_path)

        if success:
            result['success'] = True
            result['epub_path'] = epub_path
        else:
            result['error'] = "EPUB generation failed"

    except Exception as e:
        result['error'] = str(e)
        logger.error(f"Error scraping book {book_id}: {e}", exc_info=True)

    result['elapsed_time'] = time.time() - start_time
    return result


def worker_process(worker_id: int, book_queue: Queue, results_queue: Queue,
                   output_dir: str, data_dir: str, delay: float,
                   save_json: bool, skip_author_enrich: bool, stats: Dict):
    """
    Worker process that scrapes books from the queue
    """
    logger.info(f"Worker {worker_id} started")

    while not should_stop:
        try:
            # Get next book from queue (timeout to check should_stop periodically)
            try:
                book_id = book_queue.get(timeout=1)
            except:
                continue

            if book_id is None:  # Poison pill to stop worker
                break

            # Update stats
            with stats['lock']:
                stats['active_workers'] += 1

            logger.info(f"Worker {worker_id} starting book {book_id}")

            # Scrape the book
            result = scrape_single_book(
                book_id, output_dir, data_dir, delay,
                save_json, skip_author_enrich
            )

            # Send result back
            results_queue.put(result)

            # Update stats
            with stats['lock']:
                stats['completed'] += 1
                stats['total_pages'] += result['pages_scraped']
                if result['success']:
                    stats['successful'] += 1
                else:
                    stats['failed'] += 1
                stats['active_workers'] -= 1

            if result['success']:
                logger.info(f"Worker {worker_id} completed book {book_id}: "
                          f"{result['pages_scraped']} pages in {result['elapsed_time']:.1f}s")
            else:
                logger.warning(f"Worker {worker_id} failed book {book_id}: {result['error']}")

        except Exception as e:
            logger.error(f"Worker {worker_id} error: {e}", exc_info=True)
            with stats['lock']:
                stats['active_workers'] -= 1

    logger.info(f"Worker {worker_id} stopped")


def load_book_list(book_list_file: str) -> List[str]:
    """Load list of book IDs from file"""
    if book_list_file.endswith('.json'):
        # Load from JSON (all_books.json format)
        with open(book_list_file, 'r', encoding='utf-8') as f:
            books_data = json.load(f)
            return [book['book_id'] for book in books_data]
    else:
        # Load from text file (one ID per line)
        with open(book_list_file, 'r', encoding='utf-8') as f:
            return [line.strip() for line in f if line.strip()]


def get_already_scraped_books(output_dir: str) -> set:
    """Get set of book IDs that have already been scraped"""
    scraped = set()

    if not os.path.exists(output_dir):
        return scraped

    for filename in os.listdir(output_dir):
        if filename.endswith('.epub'):
            # Extract book ID from filename (format: BOOKID_title.epub)
            book_id = filename.split('_')[0]
            if book_id.isdigit():
                scraped.add(book_id)

    return scraped


def print_progress(stats: Dict, start_time: float, total_books: int):
    """Print progress statistics"""
    elapsed = time.time() - start_time
    completed = stats['completed']

    if completed > 0:
        avg_time_per_book = elapsed / completed
        remaining = total_books - completed
        eta_seconds = remaining * avg_time_per_book
        eta_hours = eta_seconds / 3600

        pages_per_sec = stats['total_pages'] / elapsed if elapsed > 0 else 0

        print(f"\n{'='*70}")
        print(f"PROGRESS: {completed}/{total_books} books ({completed/total_books*100:.1f}%)")
        print(f"{'='*70}")
        print(f"Successful:      {stats['successful']}")
        print(f"Failed:          {stats['failed']}")
        print(f"Active workers:  {stats['active_workers']}")
        print(f"Total pages:     {stats['total_pages']}")
        print(f"Pages/sec:       {pages_per_sec:.1f}")
        print(f"Avg time/book:   {avg_time_per_book:.1f}s")
        print(f"Elapsed:         {elapsed/3600:.1f} hours")
        print(f"ETA:             {eta_hours:.1f} hours")
        print(f"{'='*70}\n")


def main():
    global should_stop

    parser = argparse.ArgumentParser(description='Parallel batch scraper for Shamela books')
    parser.add_argument('book_list', help='Path to book list file (JSON or text)')
    parser.add_argument('--workers', type=int, default=10, help='Number of parallel workers (default: 10)')
    parser.add_argument('--output-dir', default='../output/shamela', help='Output directory for EPUBs')
    parser.add_argument('--data-dir', default='../data/shamela', help='Directory to save JSON data')
    parser.add_argument('--save-json', action='store_true', help='Save intermediate JSON files')
    parser.add_argument('--delay', type=float, default=0.05, help='Delay between requests in seconds (default: 0.05)')
    parser.add_argument('--no-author-enrich', action='store_true', help='Skip enriching author data')
    parser.add_argument('--resume', action='store_true', help='Resume scraping (skip already-scraped books)')
    parser.add_argument('--limit', type=int, help='Limit number of books to scrape (for testing)')

    args = parser.parse_args()

    # Register signal handler for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)

    # Create output directories
    os.makedirs(args.output_dir, exist_ok=True)
    if args.save_json:
        os.makedirs(os.path.join(args.data_dir, 'metadata'), exist_ok=True)
        os.makedirs(os.path.join(args.data_dir, 'authors'), exist_ok=True)
        os.makedirs(os.path.join(args.data_dir, 'toc'), exist_ok=True)
        os.makedirs(os.path.join(args.data_dir, 'pages'), exist_ok=True)

    # Load book list
    logger.info(f"Loading book list from {args.book_list}")
    book_ids = load_book_list(args.book_list)
    logger.info(f"Loaded {len(book_ids)} books")

    # Filter out already-scraped books if resuming
    if args.resume:
        already_scraped = get_already_scraped_books(args.output_dir)
        logger.info(f"Found {len(already_scraped)} already-scraped books")
        book_ids = [bid for bid in book_ids if bid not in already_scraped]
        logger.info(f"{len(book_ids)} books remaining to scrape")

    # Apply limit if specified
    if args.limit:
        book_ids = book_ids[:args.limit]
        logger.info(f"Limited to {len(book_ids)} books")

    if not book_ids:
        logger.info("No books to scrape. Exiting.")
        return

    # Create queues
    manager = Manager()
    book_queue = manager.Queue()
    results_queue = manager.Queue()

    # Shared statistics
    stats = manager.dict()
    stats['lock'] = manager.Lock()
    stats['completed'] = 0
    stats['successful'] = 0
    stats['failed'] = 0
    stats['total_pages'] = 0
    stats['active_workers'] = 0

    # Fill book queue
    for book_id in book_ids:
        book_queue.put(book_id)

    # Add poison pills for workers
    for _ in range(args.workers):
        book_queue.put(None)

    # Start worker processes
    logger.info(f"Starting {args.workers} worker processes...")
    workers = []
    for i in range(args.workers):
        worker = Process(
            target=worker_process,
            args=(i+1, book_queue, results_queue, args.output_dir, args.data_dir,
                 args.delay, args.save_json, args.no_author_enrich, stats)
        )
        worker.start()
        workers.append(worker)

    # Monitor progress
    start_time = time.time()
    last_print_time = start_time
    results = []

    logger.info(f"Scraping {len(book_ids)} books with {args.workers} workers...")
    print_progress(stats, start_time, len(book_ids))

    # Collect results
    while stats['completed'] < len(book_ids) and not should_stop:
        try:
            result = results_queue.get(timeout=1)
            results.append(result)

            # Print progress every 30 seconds
            if time.time() - last_print_time > 30:
                print_progress(stats, start_time, len(book_ids))
                last_print_time = time.time()

        except:
            continue

    # Wait for all workers to finish
    logger.info("Waiting for workers to finish...")
    for worker in workers:
        worker.join(timeout=5)
        if worker.is_alive():
            worker.terminate()

    # Final statistics
    elapsed_time = time.time() - start_time

    print(f"\n{'='*70}")
    print("SCRAPING COMPLETE")
    print(f"{'='*70}")
    print(f"Total books processed: {stats['completed']}")
    print(f"Successful:            {stats['successful']}")
    print(f"Failed:                {stats['failed']}")
    print(f"Total pages scraped:   {stats['total_pages']}")
    print(f"Total time:            {elapsed_time/3600:.2f} hours")
    print(f"Average time per book: {elapsed_time/stats['completed']:.1f}s")
    print(f"Pages per second:      {stats['total_pages']/elapsed_time:.1f}")
    print(f"{'='*70}\n")

    # Save detailed results
    results_file = os.path.join(args.output_dir, 'scraping_results.json')
    with open(results_file, 'w', encoding='utf-8') as f:
        json.dump({
            'summary': {
                'total_books': len(book_ids),
                'completed': stats['completed'],
                'successful': stats['successful'],
                'failed': stats['failed'],
                'total_pages': stats['total_pages'],
                'elapsed_time_hours': elapsed_time / 3600,
                'pages_per_second': stats['total_pages'] / elapsed_time
            },
            'results': results
        }, f, ensure_ascii=False, indent=2)

    logger.info(f"Detailed results saved to {results_file}")


if __name__ == '__main__':
    main()
