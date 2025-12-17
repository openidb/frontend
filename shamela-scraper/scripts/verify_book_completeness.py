#!/usr/bin/env python3
"""
Verify book completeness by comparing actual pages vs expected pages from TOC

This script:
1. Reads metadata files to get expected page counts
2. Counts actual HTML files for each book
3. Verifies that all pages exist
4. Generates a detailed completeness report
"""

import json
import logging
from pathlib import Path
from typing import Dict, List, Tuple

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def verify_book_completeness(books_dir: Path) -> Dict:
    """Verify completeness of all crawled books"""

    results = {
        'fully_complete': [],      # All pages present, no errors
        'complete_with_errors': [], # All pages present but has errors
        'incomplete': [],           # Missing pages
        'failed': [],               # Status is failed
        'no_metadata': []           # HTML files but no metadata
    }

    # Get all metadata files
    meta_files = sorted(books_dir.glob('book_*_meta.json'))

    logger.info(f"Analyzing {len(meta_files)} books...")

    for meta_file in meta_files:
        with open(meta_file) as f:
            metadata = json.load(f)

        book_id = metadata['book_id']
        title = metadata.get('title', 'Unknown')
        status = metadata.get('status', 'unknown')
        expected_pages = metadata.get('total_pages', 0)
        errors = metadata.get('errors', [])

        # Count actual HTML files
        html_files = list(books_dir.glob(f'book_{book_id}_section_*.html'))
        actual_pages = len(html_files)

        book_info = {
            'book_id': book_id,
            'title': title,
            'expected_pages': expected_pages,
            'actual_pages': actual_pages,
            'errors': errors,
            'status': status
        }

        # Categorize the book
        if status == 'failed':
            results['failed'].append(book_info)
        elif actual_pages == 0:
            results['no_metadata'].append(book_info)
        elif actual_pages != expected_pages:
            book_info['missing_pages'] = expected_pages - actual_pages
            results['incomplete'].append(book_info)
        elif len(errors) > 0:
            results['complete_with_errors'].append(book_info)
        else:
            results['fully_complete'].append(book_info)

    return results


def verify_page_sequence(books_dir: Path, book_id: str, expected_pages: int) -> Tuple[bool, List[int]]:
    """Verify that all page numbers exist in sequence"""

    html_files = sorted(books_dir.glob(f'book_{book_id}_section_*.html'))

    # Extract page numbers from filenames
    page_numbers = []
    for html_file in html_files:
        # Extract section number from filename: book_1_section_123.html -> 123
        section_num = html_file.stem.split('_')[-1]
        page_numbers.append(int(section_num))

    page_numbers.sort()

    # Check for gaps
    missing_pages = []
    if page_numbers:
        expected_range = range(page_numbers[0], page_numbers[0] + expected_pages)
        missing_pages = [p for p in expected_range if p not in page_numbers]

    is_complete = len(missing_pages) == 0 and len(page_numbers) == expected_pages

    return is_complete, missing_pages


def print_report(results: Dict):
    """Print a detailed completeness report"""

    print("\n" + "="*80)
    print("BOOK COMPLETENESS VERIFICATION REPORT")
    print("="*80)

    total = sum(len(results[cat]) for cat in results)
    fully_complete = len(results['fully_complete'])

    print(f"\nTotal books analyzed: {total}")
    print(f"\n✅ FULLY COMPLETE (no errors, all pages): {fully_complete}")
    print(f"⚠️  Complete but with errors: {len(results['complete_with_errors'])}")
    print(f"❌ Incomplete (missing pages): {len(results['incomplete'])}")
    print(f"❌ Failed crawls: {len(results['failed'])}")
    print(f"❓ No HTML files: {len(results['no_metadata'])}")

    # Success rate
    usable_books = fully_complete + len(results['complete_with_errors'])
    success_rate = (usable_books / total * 100) if total > 0 else 0
    print(f"\n📊 Usable books: {usable_books} ({success_rate:.1f}%)")

    # Show fully complete books
    print(f"\n{'='*80}")
    print("FULLY COMPLETE BOOKS (Perfect)")
    print("="*80)

    if results['fully_complete']:
        # Calculate total pages
        total_pages = sum(b['actual_pages'] for b in results['fully_complete'])
        print(f"Count: {len(results['fully_complete'])} books")
        print(f"Total pages: {total_pages:,}")
        print(f"\nFirst 20 books:")
        for i, book in enumerate(results['fully_complete'][:20], 1):
            print(f"  {i}. Book {book['book_id']}: {book['title'][:70]} ({book['actual_pages']} pages)")
        if len(results['fully_complete']) > 20:
            print(f"  ... and {len(results['fully_complete']) - 20} more")

    # Show complete with errors
    print(f"\n{'='*80}")
    print("COMPLETE WITH ERRORS (Usable but may have missing final pages)")
    print("="*80)

    if results['complete_with_errors']:
        total_pages = sum(b['actual_pages'] for b in results['complete_with_errors'])
        print(f"Count: {len(results['complete_with_errors'])} books")
        print(f"Total pages: {total_pages:,}")
        print(f"\nFirst 10 books:")
        for i, book in enumerate(results['complete_with_errors'][:10], 1):
            error_count = len(book['errors'])
            print(f"  {i}. Book {book['book_id']}: {book['title'][:60]} ({book['actual_pages']} pages, {error_count} errors)")
        if len(results['complete_with_errors']) > 10:
            print(f"  ... and {len(results['complete_with_errors']) - 10} more")

    # Show incomplete books
    print(f"\n{'='*80}")
    print("INCOMPLETE BOOKS (Missing pages)")
    print("="*80)

    if results['incomplete']:
        print(f"Count: {len(results['incomplete'])} books")
        print(f"\nFirst 10 books:")
        for i, book in enumerate(results['incomplete'][:10], 1):
            missing = book.get('missing_pages', book['expected_pages'] - book['actual_pages'])
            print(f"  {i}. Book {book['book_id']}: {book['title'][:50]} "
                  f"({book['actual_pages']}/{book['expected_pages']} pages, missing {missing})")
        if len(results['incomplete']) > 10:
            print(f"  ... and {len(results['incomplete']) - 10} more")

    # Show failed books
    if results['failed']:
        print(f"\n{'='*80}")
        print(f"FAILED BOOKS: {len(results['failed'])}")
        print("="*80)
        for i, book in enumerate(results['failed'][:5], 1):
            print(f"  {i}. Book {book['book_id']}: {book['title'][:70]}")
        if len(results['failed']) > 5:
            print(f"  ... and {len(results['failed']) - 5} more")

    print("\n" + "="*80)


def save_report_json(results: Dict, output_file: Path):
    """Save detailed report as JSON"""

    report = {
        'summary': {
            'total_books': sum(len(results[cat]) for cat in results),
            'fully_complete': len(results['fully_complete']),
            'complete_with_errors': len(results['complete_with_errors']),
            'incomplete': len(results['incomplete']),
            'failed': len(results['failed']),
            'usable_books': len(results['fully_complete']) + len(results['complete_with_errors'])
        },
        'fully_complete_books': [
            {
                'book_id': b['book_id'],
                'title': b['title'],
                'pages': b['actual_pages']
            }
            for b in results['fully_complete']
        ],
        'complete_with_errors_books': [
            {
                'book_id': b['book_id'],
                'title': b['title'],
                'pages': b['actual_pages'],
                'error_count': len(b['errors']),
                'errors': b['errors']
            }
            for b in results['complete_with_errors']
        ],
        'incomplete_books': [
            {
                'book_id': b['book_id'],
                'title': b['title'],
                'expected_pages': b['expected_pages'],
                'actual_pages': b['actual_pages'],
                'missing_pages': b['expected_pages'] - b['actual_pages']
            }
            for b in results['incomplete']
        ],
        'failed_books': [
            {
                'book_id': b['book_id'],
                'title': b['title']
            }
            for b in results['failed']
        ]
    }

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    logger.info(f"Saved detailed report to: {output_file}")


def main():
    # Setup paths
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    books_dir = project_root / 'data' / 'shamela' / 'raw' / 'books'

    if not books_dir.exists():
        logger.error(f"Books directory not found: {books_dir}")
        return

    # Verify completeness
    results = verify_book_completeness(books_dir)

    # Print report
    print_report(results)

    # Save JSON report
    report_file = project_root / 'COMPLETENESS_REPORT.json'
    save_report_json(results, report_file)

    # Save text summary
    summary_file = project_root / 'COMPLETENESS_SUMMARY.txt'
    with open(summary_file, 'w', encoding='utf-8') as f:
        f.write("FULLY COMPLETE BOOKS\n")
        f.write("="*80 + "\n\n")
        for book in results['fully_complete']:
            f.write(f"Book {book['book_id']}: {book['title']} ({book['actual_pages']} pages)\n")

    logger.info(f"Saved summary to: {summary_file}")


if __name__ == '__main__':
    main()
