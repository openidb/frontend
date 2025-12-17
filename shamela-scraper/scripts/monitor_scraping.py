#!/usr/bin/env python3
"""
Real-time monitor for parallel scraping progress
"""

import os
import json
import time
import argparse
from pathlib import Path
from datetime import datetime


def get_scraping_stats(output_dir: str, data_dir: str) -> dict:
    """Get current scraping statistics"""
    stats = {
        'epubs_created': 0,
        'metadata_files': 0,
        'toc_files': 0,
        'page_directories': 0,
        'total_pages': 0,
        'last_modified': None
    }

    # Count EPUB files
    if os.path.exists(output_dir):
        epub_files = [f for f in os.listdir(output_dir) if f.endswith('.epub')]
        stats['epubs_created'] = len(epub_files)

        # Get last modified time
        if epub_files:
            latest_file = max([os.path.join(output_dir, f) for f in epub_files], key=os.path.getmtime)
            stats['last_modified'] = os.path.getmtime(latest_file)

    # Count metadata files
    metadata_dir = os.path.join(data_dir, 'metadata')
    if os.path.exists(metadata_dir):
        stats['metadata_files'] = len([f for f in os.listdir(metadata_dir) if f.endswith('.json')])

    # Count TOC files
    toc_dir = os.path.join(data_dir, 'toc')
    if os.path.exists(toc_dir):
        stats['toc_files'] = len([f for f in os.listdir(toc_dir) if f.endswith('.json')])

    # Count page directories and total pages
    pages_dir = os.path.join(data_dir, 'pages')
    if os.path.exists(pages_dir):
        book_dirs = [d for d in os.listdir(pages_dir) if os.path.isdir(os.path.join(pages_dir, d))]
        stats['page_directories'] = len(book_dirs)

        # Count total pages
        for book_dir in book_dirs:
            book_path = os.path.join(pages_dir, book_dir)
            page_files = [f for f in os.listdir(book_path) if f.startswith('page_') and f.endswith('.json')]
            stats['total_pages'] += len(page_files)

    return stats


def format_time_ago(timestamp: float) -> str:
    """Format timestamp as 'X minutes ago'"""
    if not timestamp:
        return "N/A"

    now = time.time()
    diff = now - timestamp

    if diff < 60:
        return f"{int(diff)} seconds ago"
    elif diff < 3600:
        return f"{int(diff/60)} minutes ago"
    else:
        return f"{diff/3600:.1f} hours ago"


def clear_screen():
    """Clear terminal screen"""
    os.system('clear' if os.name != 'nt' else 'cls')


def display_dashboard(stats: dict, total_books: int, start_time: float, prev_stats: dict = None):
    """Display real-time dashboard"""
    clear_screen()

    elapsed = time.time() - start_time
    completed = stats['epubs_created']

    print("=" * 80)
    print(" " * 20 + "SHAMELA SCRAPING PROGRESS MONITOR")
    print("=" * 80)
    print()

    # Basic stats
    print(f"Books Completed:     {completed:>6} / {total_books} ({completed/total_books*100:>5.1f}%)" if total_books else f"Books Completed:     {completed:>6}")
    print(f"Metadata Files:      {stats['metadata_files']:>6}")
    print(f"TOC Files:           {stats['toc_files']:>6}")
    print(f"Page Directories:    {stats['page_directories']:>6}")
    print(f"Total Pages Scraped: {stats['total_pages']:>6}")
    print()

    # Time statistics
    print(f"Elapsed Time:        {elapsed/3600:>6.1f} hours")
    if stats['last_modified']:
        print(f"Last Activity:       {format_time_ago(stats['last_modified'])}")
    print()

    # Rate calculations
    if elapsed > 0:
        books_per_hour = completed / (elapsed / 3600)
        pages_per_second = stats['total_pages'] / elapsed

        print(f"Books per Hour:      {books_per_hour:>6.1f}")
        print(f"Pages per Second:    {pages_per_second:>6.1f}")
        print()

        # ETA calculation
        if total_books and completed > 0:
            avg_time_per_book = elapsed / completed
            remaining = total_books - completed
            eta_seconds = remaining * avg_time_per_book
            eta_hours = eta_seconds / 3600

            print(f"Avg Time per Book:   {avg_time_per_book:>6.1f} seconds")
            print(f"Estimated Remaining: {eta_hours:>6.1f} hours")
            print()

    # Rate of change (if we have previous stats)
    if prev_stats and elapsed > 0:
        books_diff = completed - prev_stats['epubs_created']
        pages_diff = stats['total_pages'] - prev_stats['total_pages']

        if books_diff > 0 or pages_diff > 0:
            print("-" * 80)
            print(f"Recent Activity (last check):")
            print(f"  Books completed:   +{books_diff}")
            print(f"  Pages scraped:     +{pages_diff}")
            print()

    # Progress bar
    if total_books:
        progress = completed / total_books
        bar_width = 60
        filled = int(bar_width * progress)
        bar = '█' * filled + '░' * (bar_width - filled)
        print(f"Progress: [{bar}] {progress*100:.1f}%")
        print()

    print("=" * 80)
    print(f"Last updated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("Press Ctrl+C to stop monitoring")
    print("=" * 80)


def monitor(output_dir: str, data_dir: str, total_books: int = None, interval: int = 5):
    """Monitor scraping progress"""
    print(f"Starting scraping monitor...")
    print(f"Output directory: {output_dir}")
    print(f"Data directory:   {data_dir}")
    if total_books:
        print(f"Total books:      {total_books}")
    print(f"Update interval:  {interval} seconds")
    print()
    print("Press Ctrl+C to stop monitoring")
    print()

    start_time = time.time()
    prev_stats = None

    try:
        while True:
            stats = get_scraping_stats(output_dir, data_dir)
            display_dashboard(stats, total_books, start_time, prev_stats)

            prev_stats = stats.copy()
            time.sleep(interval)

    except KeyboardInterrupt:
        print("\n\nMonitoring stopped.")


def main():
    parser = argparse.ArgumentParser(description='Monitor parallel scraping progress')
    parser.add_argument('--output-dir', default='../output/shamela',
                       help='Output directory for EPUBs (default: ../output/shamela)')
    parser.add_argument('--data-dir', default='../data/shamela',
                       help='Data directory (default: ../data/shamela)')
    parser.add_argument('--total-books', type=int,
                       help='Total number of books to scrape (for ETA calculation)')
    parser.add_argument('--interval', type=int, default=5,
                       help='Update interval in seconds (default: 5)')

    args = parser.parse_args()

    # Try to auto-detect total books from discovery file
    if not args.total_books:
        discovery_file = os.path.join(args.data_dir, 'discovery', 'book_ids.txt')
        if os.path.exists(discovery_file):
            with open(discovery_file, 'r') as f:
                args.total_books = len([line for line in f if line.strip()])
            print(f"Auto-detected {args.total_books} total books from discovery file")

    monitor(args.output_dir, args.data_dir, args.total_books, args.interval)


if __name__ == '__main__':
    main()
