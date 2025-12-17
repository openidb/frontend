#!/usr/bin/env python3
"""
Crawl Shamela book TOCs to get authoritative expected page counts

This script:
1. Fetches the TOC page for each book from shamela.ws
2. Extracts the actual number of sections/pages from the TOC
3. Saves this as ground truth for completeness verification
4. Compares with our crawled data
"""

import requests
import json
import time
import logging
from pathlib import Path
from bs4 import BeautifulSoup
from typing import Dict, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class TOCCrawler:
    def __init__(self, output_dir: Path, delay: float = 0.5):
        self.output_dir = output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.delay = delay
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })

    def fetch_toc(self, book_id: str) -> Optional[Dict]:
        """Fetch and parse TOC for a book"""

        url = f"https://shamela.ws/book/{book_id}"

        try:
            response = self.session.get(url, timeout=10)
            response.raise_for_status()

            soup = BeautifulSoup(response.text, 'html.parser')

            # Find the TOC section - it's usually in a div with class "book-page-list" or similar
            # Let's look for all links that point to pages
            page_links = soup.find_all('a', href=lambda x: x and f'/book/{book_id}/' in x)

            # Extract unique page IDs
            page_ids = set()
            for link in page_links:
                href = link.get('href', '')
                # Extract page ID from URL like /book/123/456
                parts = href.split('/')
                if len(parts) >= 4:
                    page_id = parts[3]
                    if page_id.isdigit():
                        page_ids.add(int(page_id))

            # Get book title
            title_tag = soup.find('h1') or soup.find('title')
            title = title_tag.get_text(strip=True) if title_tag else 'Unknown'

            # Get author
            author_tag = soup.find('a', href=lambda x: x and '/author/' in x)
            author = author_tag.get_text(strip=True) if author_tag else 'Unknown'

            toc_data = {
                'book_id': book_id,
                'title': title,
                'author': author,
                'expected_pages_from_toc': len(page_ids),
                'page_ids': sorted(list(page_ids)),
                'crawled_at': time.strftime('%Y-%m-%d %H:%M:%S')
            }

            logger.info(f"Book {book_id}: Found {len(page_ids)} pages in TOC")
            return toc_data

        except requests.RequestException as e:
            logger.error(f"Book {book_id}: Failed to fetch TOC - {e}")
            return None
        except Exception as e:
            logger.error(f"Book {book_id}: Error parsing TOC - {e}")
            return None

    def save_toc(self, toc_data: Dict):
        """Save TOC data to file"""
        book_id = toc_data['book_id']
        output_file = self.output_dir / f'book_{book_id}_toc.json'

        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(toc_data, f, ensure_ascii=False, indent=2)

    def crawl_toc(self, book_id: str) -> Optional[Dict]:
        """Crawl TOC for a single book with delay"""

        # Check if already crawled
        toc_file = self.output_dir / f'book_{book_id}_toc.json'
        if toc_file.exists():
            logger.info(f"Book {book_id}: TOC already exists, skipping")
            with open(toc_file) as f:
                return json.load(f)

        # Fetch TOC
        toc_data = self.fetch_toc(book_id)

        if toc_data:
            self.save_toc(toc_data)
            time.sleep(self.delay)  # Rate limiting
            return toc_data

        return None

    def crawl_multiple_tocs(self, book_ids: list, workers: int = 5):
        """Crawl TOCs for multiple books in parallel"""

        results = {
            'success': [],
            'failed': []
        }

        with ThreadPoolExecutor(max_workers=workers) as executor:
            future_to_book = {
                executor.submit(self.crawl_toc, book_id): book_id
                for book_id in book_ids
            }

            for future in as_completed(future_to_book):
                book_id = future_to_book[future]
                try:
                    toc_data = future.result()
                    if toc_data:
                        results['success'].append(book_id)
                    else:
                        results['failed'].append(book_id)
                except Exception as e:
                    logger.error(f"Book {book_id}: Exception - {e}")
                    results['failed'].append(book_id)

        return results


def compare_with_crawled_data(toc_dir: Path, books_dir: Path):
    """Compare TOC data with crawled data to verify completeness"""

    logger.info("Comparing TOC data with crawled books...")

    results = {
        'perfect_match': [],        # TOC pages == actual pages, no errors
        'match_with_errors': [],    # TOC pages == actual pages, but has errors
        'missing_pages': [],         # actual < expected
        'extra_pages': [],           # actual > expected (weird)
        'no_toc_data': [],           # Have crawled book but no TOC
        'no_crawled_data': []        # Have TOC but book not crawled
    }

    # Load all TOC files
    toc_files = list(toc_dir.glob('book_*_toc.json'))

    for toc_file in toc_files:
        with open(toc_file) as f:
            toc_data = json.load(f)

        book_id = toc_data['book_id']
        expected_pages = toc_data['expected_pages_from_toc']

        # Check if we have crawled data
        meta_file = books_dir / f'book_{book_id}_meta.json'

        if not meta_file.exists():
            results['no_crawled_data'].append({
                'book_id': book_id,
                'title': toc_data['title'],
                'expected_pages': expected_pages
            })
            continue

        # Load metadata
        with open(meta_file) as f:
            metadata = json.load(f)

        # Count actual HTML files
        html_files = list(books_dir.glob(f'book_{book_id}_section_*.html'))
        actual_pages = len(html_files)

        status = metadata.get('status', 'unknown')
        errors = metadata.get('errors', [])

        comparison = {
            'book_id': book_id,
            'title': toc_data['title'],
            'expected_pages': expected_pages,
            'actual_pages': actual_pages,
            'status': status,
            'error_count': len(errors)
        }

        # Categorize
        if status == 'failed':
            continue  # Skip failed books

        if actual_pages == expected_pages:
            if len(errors) == 0:
                results['perfect_match'].append(comparison)
            else:
                results['match_with_errors'].append(comparison)
        elif actual_pages < expected_pages:
            comparison['missing_count'] = expected_pages - actual_pages
            results['missing_pages'].append(comparison)
        else:  # actual > expected
            comparison['extra_count'] = actual_pages - expected_pages
            results['extra_pages'].append(comparison)

    # Check for books we crawled but have no TOC
    meta_files = list(books_dir.glob('book_*_meta.json'))
    for meta_file in meta_files:
        book_id = meta_file.stem.split('_')[1]
        toc_file = toc_dir / f'book_{book_id}_toc.json'

        if not toc_file.exists():
            with open(meta_file) as f:
                metadata = json.load(f)

            if metadata.get('status') != 'failed':
                html_files = list(books_dir.glob(f'book_{book_id}_section_*.html'))
                results['no_toc_data'].append({
                    'book_id': book_id,
                    'title': metadata.get('title', 'Unknown'),
                    'actual_pages': len(html_files)
                })

    return results


def print_comparison_report(results: Dict):
    """Print detailed comparison report"""

    print("\n" + "="*80)
    print("TOC COMPARISON REPORT")
    print("="*80)

    total_verified = (len(results['perfect_match']) +
                     len(results['match_with_errors']) +
                     len(results['missing_pages']) +
                     len(results['extra_pages']))

    print(f"\nBooks verified against TOC: {total_verified}")
    print(f"\n✅ PERFECT MATCH (TOC pages == actual, no errors): {len(results['perfect_match'])}")
    print(f"⚠️  MATCH WITH ERRORS (TOC pages == actual, but has errors): {len(results['match_with_errors'])}")
    print(f"❌ MISSING PAGES (actual < expected): {len(results['missing_pages'])}")
    print(f"❓ EXTRA PAGES (actual > expected): {len(results['extra_pages'])}")
    print(f"📝 NO TOC DATA: {len(results['no_toc_data'])}")
    print(f"📝 NO CRAWLED DATA: {len(results['no_crawled_data'])}")

    # Perfect matches
    if results['perfect_match']:
        print(f"\n{'='*80}")
        print("PERFECT MATCHES (First 20)")
        print("="*80)
        total_pages = sum(b['actual_pages'] for b in results['perfect_match'])
        print(f"Total: {len(results['perfect_match'])} books, {total_pages:,} pages\n")

        for i, book in enumerate(results['perfect_match'][:20], 1):
            print(f"  {i}. Book {book['book_id']}: {book['title'][:60]} ({book['actual_pages']} pages)")

        if len(results['perfect_match']) > 20:
            print(f"  ... and {len(results['perfect_match']) - 20} more")

    # Missing pages
    if results['missing_pages']:
        print(f"\n{'='*80}")
        print("MISSING PAGES (First 10)")
        print("="*80)

        for i, book in enumerate(results['missing_pages'][:10], 1):
            print(f"  {i}. Book {book['book_id']}: {book['title'][:50]} "
                  f"(has {book['actual_pages']}/{book['expected_pages']}, missing {book['missing_count']})")

        if len(results['missing_pages']) > 10:
            print(f"  ... and {len(results['missing_pages']) - 10} more")

    print("\n" + "="*80)


def main():
    import argparse

    parser = argparse.ArgumentParser(description='Crawl Shamela book TOCs')
    parser.add_argument('--workers', type=int, default=5, help='Number of parallel workers')
    parser.add_argument('--delay', type=float, default=0.5, help='Delay between requests')
    parser.add_argument('--book-ids', nargs='+', help='Specific book IDs to crawl')
    parser.add_argument('--compare-only', action='store_true', help='Only compare existing TOCs')

    args = parser.parse_args()

    # Setup paths
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    toc_dir = project_root / 'data' / 'shamela' / 'toc'
    books_dir = project_root / 'data' / 'shamela' / 'raw' / 'books'

    if args.compare_only:
        # Just compare existing data
        results = compare_with_crawled_data(toc_dir, books_dir)
        print_comparison_report(results)

        # Save results
        report_file = project_root / 'TOC_COMPARISON_REPORT.json'
        with open(report_file, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        logger.info(f"Saved comparison report to: {report_file}")
        return

    # Crawl TOCs
    crawler = TOCCrawler(toc_dir, delay=args.delay)

    if args.book_ids:
        # Crawl specific books
        book_ids = args.book_ids
    else:
        # Crawl all books that we have metadata for
        meta_files = list(books_dir.glob('book_*_meta.json'))
        book_ids = [f.stem.split('_')[1] for f in meta_files]
        logger.info(f"Found {len(book_ids)} books to crawl TOCs for")

    # Crawl
    results = crawler.crawl_multiple_tocs(book_ids, workers=args.workers)

    logger.info(f"TOC crawl complete: {len(results['success'])} success, {len(results['failed'])} failed")

    # Now compare
    comparison_results = compare_with_crawled_data(toc_dir, books_dir)
    print_comparison_report(comparison_results)

    # Save results
    report_file = project_root / 'TOC_COMPARISON_REPORT.json'
    with open(report_file, 'w', encoding='utf-8') as f:
        json.dump(comparison_results, f, ensure_ascii=False, indent=2)
    logger.info(f"Saved comparison report to: {report_file}")


if __name__ == '__main__':
    main()
