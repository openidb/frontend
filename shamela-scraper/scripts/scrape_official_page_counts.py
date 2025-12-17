#!/usr/bin/env python3
"""
Scrape official page counts from Shamela book overview pages

This script:
1. Fetches each book's overview page from shamela.ws/book/{book_id}
2. Extracts the official "عدد الصفحات" (page count) field
3. Compares with our crawled metadata
4. Generates comprehensive comparison report
"""

import requests
import json
import time
import logging
import re
from pathlib import Path
from bs4 import BeautifulSoup
from typing import Dict, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def arabic_to_english_numbers(text: str) -> str:
    """Convert Arabic-Indic numerals to English numerals"""
    arabic_numerals = '٠١٢٣٤٥٦٧٨٩'
    english_numerals = '0123456789'

    translation_table = str.maketrans(arabic_numerals, english_numerals)
    return text.translate(translation_table)


class PageCountScraper:
    def __init__(self, delay: float = 0.5):
        self.delay = delay
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })

    def fetch_official_page_count(self, book_id: str) -> Optional[Dict]:
        """Fetch official page count from book overview page"""

        url = f"https://shamela.ws/book/{book_id}"

        try:
            response = self.session.get(url, timeout=10)
            response.raise_for_status()

            soup = BeautifulSoup(response.text, 'html.parser')

            # Get book title
            title_tag = soup.find('h1') or soup.find('title')
            title = title_tag.get_text(strip=True) if title_tag else 'Unknown'

            # Get author
            author_tag = soup.find('a', href=lambda x: x and '/author/' in x)
            author = author_tag.get_text(strip=True) if author_tag else 'Unknown'

            # Find the "عدد الصفحات" field
            # It's usually in a div or span with the text containing "عدد الصفحات"
            official_page_count = None

            # Look for all text containing "عدد الصفحات"
            for element in soup.find_all(text=re.compile(r'عدد الصفحات')):
                parent = element.parent
                text = parent.get_text(strip=True)

                # Extract the number after "عدد الصفحات:"
                # Pattern: "عدد الصفحات: ٩٩" or "عدد الصفحات:٩٩"
                match = re.search(r'عدد الصفحات\s*[:：]\s*([٠-٩0-9,]+)', text)
                if match:
                    # Convert Arabic numerals to English and remove commas
                    page_count_str = arabic_to_english_numbers(match.group(1))
                    page_count_str = page_count_str.replace(',', '')
                    official_page_count = int(page_count_str)
                    break

            if official_page_count is None:
                logger.warning(f"Book {book_id}: Could not find page count in overview")
                return None

            result = {
                'book_id': book_id,
                'title': title,
                'author': author,
                'official_page_count': official_page_count,
                'scraped_at': time.strftime('%Y-%m-%d %H:%M:%S')
            }

            logger.info(f"Book {book_id}: Found {official_page_count} pages")
            return result

        except requests.RequestException as e:
            logger.error(f"Book {book_id}: Failed to fetch overview - {e}")
            return None
        except Exception as e:
            logger.error(f"Book {book_id}: Error parsing overview - {e}")
            return None

    def scrape_page_count(self, book_id: str, output_dir: Path) -> Optional[Dict]:
        """Scrape page count for a single book with delay"""

        # Check if already scraped
        output_file = output_dir / f'book_{book_id}_official.json'
        if output_file.exists():
            logger.info(f"Book {book_id}: Official count already scraped, skipping")
            with open(output_file) as f:
                return json.load(f)

        # Fetch page count
        result = self.fetch_official_page_count(book_id)

        if result:
            # Save to file
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(result, f, ensure_ascii=False, indent=2)

            time.sleep(self.delay)  # Rate limiting
            return result

        return None

    def scrape_multiple_books(self, book_ids: list, output_dir: Path, workers: int = 3):
        """Scrape page counts for multiple books in parallel"""

        output_dir.mkdir(parents=True, exist_ok=True)

        results = {
            'success': [],
            'failed': []
        }

        with ThreadPoolExecutor(max_workers=workers) as executor:
            future_to_book = {
                executor.submit(self.scrape_page_count, book_id, output_dir): book_id
                for book_id in book_ids
            }

            for future in as_completed(future_to_book):
                book_id = future_to_book[future]
                try:
                    result = future.result()
                    if result:
                        results['success'].append(book_id)
                    else:
                        results['failed'].append(book_id)
                except Exception as e:
                    logger.error(f"Book {book_id}: Exception - {e}")
                    results['failed'].append(book_id)

        return results


def compare_page_counts(official_dir: Path, books_dir: Path) -> Dict:
    """Compare official page counts with our crawled data"""

    logger.info("Comparing official page counts with crawled data...")

    results = {
        'perfect_match': [],        # Official == metadata == actual HTML
        'metadata_matches_official': [],  # Metadata == official, but HTML different
        'metadata_matches_html': [],     # Metadata == HTML, but official different
        'all_different': [],         # All three counts are different
        'no_official_data': [],      # Have crawled book but no official count
        'no_crawled_data': []        # Have official count but no crawled data
    }

    # Load all official page count files
    official_files = list(official_dir.glob('book_*_official.json'))

    for official_file in official_files:
        with open(official_file) as f:
            official_data = json.load(f)

        book_id = official_data['book_id']
        official_pages = official_data['official_page_count']

        # Check if we have crawled metadata
        meta_file = books_dir / f'book_{book_id}_meta.json'

        if not meta_file.exists():
            results['no_crawled_data'].append({
                'book_id': book_id,
                'title': official_data['title'],
                'official_pages': official_pages
            })
            continue

        # Load metadata
        with open(meta_file) as f:
            metadata = json.load(f)

        # Count actual HTML files
        html_files = list(books_dir.glob(f'book_{book_id}_section_*.html'))
        actual_pages = len(html_files)

        metadata_pages = metadata.get('total_pages', 0)
        status = metadata.get('status', 'unknown')

        comparison = {
            'book_id': book_id,
            'title': official_data['title'],
            'official_pages': official_pages,
            'metadata_pages': metadata_pages,
            'actual_html_pages': actual_pages,
            'status': status
        }

        # Skip failed books
        if status == 'failed':
            continue

        # Categorize based on matches
        if official_pages == metadata_pages == actual_pages:
            results['perfect_match'].append(comparison)
        elif official_pages == metadata_pages and actual_pages != official_pages:
            comparison['html_difference'] = actual_pages - official_pages
            results['metadata_matches_official'].append(comparison)
        elif metadata_pages == actual_pages and official_pages != metadata_pages:
            comparison['official_difference'] = official_pages - metadata_pages
            results['metadata_matches_html'].append(comparison)
        else:
            comparison['metadata_vs_official'] = metadata_pages - official_pages
            comparison['html_vs_official'] = actual_pages - official_pages
            comparison['html_vs_metadata'] = actual_pages - metadata_pages
            results['all_different'].append(comparison)

    # Check for crawled books without official data
    meta_files = list(books_dir.glob('book_*_meta.json'))
    for meta_file in meta_files:
        book_id = meta_file.stem.split('_')[1]
        official_file = official_dir / f'book_{book_id}_official.json'

        if not official_file.exists():
            with open(meta_file) as f:
                metadata = json.load(f)

            if metadata.get('status') != 'failed':
                html_files = list(books_dir.glob(f'book_{book_id}_section_*.html'))
                results['no_official_data'].append({
                    'book_id': book_id,
                    'title': metadata.get('title', 'Unknown'),
                    'metadata_pages': metadata.get('total_pages', 0),
                    'actual_html_pages': len(html_files)
                })

    return results


def print_comparison_report(results: Dict):
    """Print detailed comparison report"""

    print("\n" + "="*80)
    print("OFFICIAL PAGE COUNT COMPARISON REPORT")
    print("="*80)

    total_compared = (len(results['perfect_match']) +
                     len(results['metadata_matches_official']) +
                     len(results['metadata_matches_html']) +
                     len(results['all_different']))

    print(f"\nBooks compared: {total_compared}")
    print(f"\n✅ PERFECT MATCH (official == metadata == HTML): {len(results['perfect_match'])}")
    print(f"📊 Metadata matches official (HTML different): {len(results['metadata_matches_official'])}")
    print(f"📊 Metadata matches HTML (official different): {len(results['metadata_matches_html'])}")
    print(f"❓ All three different: {len(results['all_different'])}")
    print(f"📝 No official data: {len(results['no_official_data'])}")
    print(f"📝 No crawled data: {len(results['no_crawled_data'])}")

    # Perfect matches
    if results['perfect_match']:
        print(f"\n{'='*80}")
        print("PERFECT MATCHES (First 20)")
        print("="*80)
        total_pages = sum(b['official_pages'] for b in results['perfect_match'])
        print(f"Total: {len(results['perfect_match'])} books, {total_pages:,} pages\n")

        for i, book in enumerate(results['perfect_match'][:20], 1):
            print(f"  {i:2d}. Book {book['book_id']:>4s}: {book['title'][:60]:60s} ({book['official_pages']:4d} pages)")

        if len(results['perfect_match']) > 20:
            print(f"  ... and {len(results['perfect_match']) - 20} more")

    # Metadata matches HTML but different from official
    if results['metadata_matches_html']:
        print(f"\n{'='*80}")
        print("METADATA MATCHES HTML (Official count different) - First 20")
        print("="*80)
        print("These are likely cases where printed page count != digital section count\n")

        for i, book in enumerate(results['metadata_matches_html'][:20], 1):
            diff = book['official_difference']
            sign = '+' if diff > 0 else ''
            print(f"  {i:2d}. Book {book['book_id']:>4s}: {book['title'][:45]:45s}")
            print(f"      Official: {book['official_pages']:4d} pages | "
                  f"Metadata/HTML: {book['metadata_pages']:4d} pages | "
                  f"Diff: {sign}{diff}")

        if len(results['metadata_matches_html']) > 20:
            print(f"  ... and {len(results['metadata_matches_html']) - 20} more")

    # All three different
    if results['all_different']:
        print(f"\n{'='*80}")
        print("ALL THREE COUNTS DIFFERENT - First 10")
        print("="*80)

        for i, book in enumerate(results['all_different'][:10], 1):
            print(f"  {i:2d}. Book {book['book_id']:>4s}: {book['title'][:40]:40s}")
            print(f"      Official: {book['official_pages']:4d} | "
                  f"Metadata: {book['metadata_pages']:4d} | "
                  f"HTML: {book['actual_html_pages']:4d}")

        if len(results['all_different']) > 10:
            print(f"  ... and {len(results['all_different']) - 10} more")

    print("\n" + "="*80)


def main():
    import argparse

    parser = argparse.ArgumentParser(description='Scrape official page counts from Shamela')
    parser.add_argument('--workers', type=int, default=3, help='Number of parallel workers')
    parser.add_argument('--delay', type=float, default=0.5, help='Delay between requests')
    parser.add_argument('--book-ids', nargs='+', help='Specific book IDs to scrape')
    parser.add_argument('--compare-only', action='store_true', help='Only compare existing data')

    args = parser.parse_args()

    # Setup paths
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    official_dir = project_root / 'data' / 'shamela' / 'official_page_counts'
    books_dir = project_root / 'data' / 'shamela' / 'raw' / 'books'

    if args.compare_only:
        # Just compare existing data
        results = compare_page_counts(official_dir, books_dir)
        print_comparison_report(results)

        # Save results
        report_file = project_root / 'OFFICIAL_PAGE_COUNT_COMPARISON.json'
        with open(report_file, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        logger.info(f"Saved comparison report to: {report_file}")
        return

    # Scrape official page counts
    scraper = PageCountScraper(delay=args.delay)

    if args.book_ids:
        # Scrape specific books
        book_ids = args.book_ids
    else:
        # Scrape all books that we have metadata for
        meta_files = list(books_dir.glob('book_*_meta.json'))
        book_ids = [f.stem.split('_')[1] for f in meta_files]
        logger.info(f"Found {len(book_ids)} books to scrape official page counts for")

    # Scrape
    scrape_results = scraper.scrape_multiple_books(book_ids, official_dir, workers=args.workers)

    logger.info(f"Scraping complete: {len(scrape_results['success'])} success, {len(scrape_results['failed'])} failed")

    # Now compare
    comparison_results = compare_page_counts(official_dir, books_dir)
    print_comparison_report(comparison_results)

    # Save results
    report_file = project_root / 'OFFICIAL_PAGE_COUNT_COMPARISON.json'
    with open(report_file, 'w', encoding='utf-8') as f:
        json.dump(comparison_results, f, ensure_ascii=False, indent=2)
    logger.info(f"Saved comparison report to: {report_file}")


if __name__ == '__main__':
    main()
