#!/usr/bin/env python3
"""
Final completeness verification using metadata as source of truth

Our metadata files contain the authoritative page count because we:
1. Followed the "next" button until there were no more pages
2. Recorded this as total_pages in metadata
3. This is the ground truth from Shamela itself

This script verifies that all expected pages actually exist as HTML files.
"""

import json
import logging
from pathlib import Path
from typing import Dict, List

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def verify_completeness(books_dir: Path) -> Dict:
    """Verify that we have all expected HTML files based on metadata"""

    results = {
        'perfect': [],           # All pages present, no errors
        'complete_with_errors': [], # All pages present but has errors
        'missing_pages': [],      # Some pages missing
        'failed': []              # Failed status
    }

    meta_files = sorted(books_dir.glob('book_*_meta.json'))

    logger.info(f"Verifying {len(meta_files)} books...")

    for meta_file in meta_files:
        with open(meta_file) as f:
            metadata = json.load(f)

        book_id = metadata['book_id']
        title = metadata.get('title', 'Unknown')
        status = metadata.get('status', 'unknown')
        expected_pages = metadata.get('total_pages', 0)
        errors = metadata.get('errors', [])

        # Skip failed books
        if status == 'failed':
            results['failed'].append({
                'book_id': book_id,
                'title': title
            })
            continue

        # Find all HTML files for this book
        html_files = list(books_dir.glob(f'book_{book_id}_section_*.html'))
        actual_pages = len(html_files)

        # Verify page sequence
        page_numbers = []
        for html_file in html_files:
            section_num = html_file.stem.split('_')[-1]
            page_numbers.append(int(section_num))

        page_numbers.sort()

        # Check for gaps in sequence
        missing_page_numbers = []
        if page_numbers and expected_pages > 0:
            min_page = page_numbers[0]
            max_page = page_numbers[-1]
            expected_range = set(range(min_page, min_page + expected_pages))
            actual_set = set(page_numbers)
            missing_page_numbers = sorted(expected_range - actual_set)

        book_info = {
            'book_id': book_id,
            'title': title,
            'expected_pages': expected_pages,
            'actual_pages': actual_pages,
            'errors': errors,
            'error_count': len(errors),
            'page_range': f"{page_numbers[0]}-{page_numbers[-1]}" if page_numbers else "none"
        }

        # Categorize
        if actual_pages == expected_pages and len(missing_page_numbers) == 0:
            if len(errors) == 0:
                results['perfect'].append(book_info)
            else:
                results['complete_with_errors'].append(book_info)
        else:
            book_info['missing_count'] = len(missing_page_numbers)
            book_info['missing_pages'] = missing_page_numbers[:10]  # Show first 10
            results['missing_pages'].append(book_info)

    return results


def print_report(results: Dict):
    """Print detailed verification report"""

    print("\n" + "="*80)
    print("FINAL COMPLETENESS VERIFICATION REPORT")
    print("="*80)

    total = sum(len(results[cat]) for cat in results)
    perfect = len(results['perfect'])
    complete_with_errors = len(results['complete_with_errors'])
    usable = perfect + complete_with_errors

    print(f"\nTotal books verified: {total}")
    print(f"\n✅ PERFECT (all pages, no errors): {perfect}")
    print(f"⚠️  COMPLETE WITH ERRORS (all pages, minor errors): {complete_with_errors}")
    print(f"❌ INCOMPLETE (missing pages): {len(results['missing_pages'])}")
    print(f"❌ FAILED: {len(results['failed'])}")

    print(f"\n{'='*80}")
    print(f"📊 TOTAL USABLE BOOKS: {usable} ({usable/total*100:.1f}%)")
    print(f"{'='*80}")

    # Calculate total pages
    perfect_pages = sum(b['actual_pages'] for b in results['perfect'])
    error_pages = sum(b['actual_pages'] for b in results['complete_with_errors'])
    total_pages = perfect_pages + error_pages

    print(f"\n📄 Total pages in usable books: {total_pages:,}")
    print(f"   - Perfect books: {perfect_pages:,} pages")
    print(f"   - Books with errors: {error_pages:,} pages")

    # Show perfect books summary
    if results['perfect']:
        print(f"\n{'='*80}")
        print("PERFECT BOOKS (First 20)")
        print(f"{'='*80}")
        print(f"Total: {len(results['perfect'])} books\n")

        for i, book in enumerate(results['perfect'][:20], 1):
            print(f"  {i:2d}. Book {book['book_id']:4s}: {book['title'][:60]:60s} ({book['actual_pages']:4d} pages)")

        if len(results['perfect']) > 20:
            print(f"  ... and {len(results['perfect']) - 20} more")

    # Show books with errors
    if results['complete_with_errors']:
        print(f"\n{'='*80}")
        print("COMPLETE WITH ERRORS (First 10)")
        print(f"{'='*80}")

        for i, book in enumerate(results['complete_with_errors'][:10], 1):
            error_desc = book['errors'][0] if book['errors'] else 'Unknown error'
            print(f"  {i:2d}. Book {book['book_id']:4s}: {book['title'][:45]:45s} "
                  f"({book['actual_pages']:4d} pages, {book['error_count']} errors)")

        if len(results['complete_with_errors']) > 10:
            print(f"  ... and {len(results['complete_with_errors']) - 10} more")

    # Show incomplete books
    if results['missing_pages']:
        print(f"\n{'='*80}")
        print("INCOMPLETE BOOKS")
        print(f"{'='*80}")

        for i, book in enumerate(results['missing_pages'][:10], 1):
            missing_count = book.get('missing_count', 0)
            print(f"  {i:2d}. Book {book['book_id']:4s}: {book['title'][:45]:45s} "
                  f"({book['actual_pages']}/{book['expected_pages']} pages, missing {missing_count})")
            if book.get('missing_pages'):
                print(f"      Missing page numbers: {book['missing_pages']}")

        if len(results['missing_pages']) > 10:
            print(f"  ... and {len(results['missing_pages']) - 10} more")

    print("\n" + "="*80)


def save_report(results: Dict, output_file: Path):
    """Save detailed report as JSON"""

    report = {
        'summary': {
            'total_books': sum(len(results[cat]) for cat in results),
            'perfect': len(results['perfect']),
            'complete_with_errors': len(results['complete_with_errors']),
            'usable_books': len(results['perfect']) + len(results['complete_with_errors']),
            'incomplete': len(results['missing_pages']),
            'failed': len(results['failed']),
            'total_pages_perfect': sum(b['actual_pages'] for b in results['perfect']),
            'total_pages_with_errors': sum(b['actual_pages'] for b in results['complete_with_errors']),
            'total_pages_usable': (
                sum(b['actual_pages'] for b in results['perfect']) +
                sum(b['actual_pages'] for b in results['complete_with_errors'])
            )
        },
        'perfect_books': results['perfect'],
        'complete_with_errors': results['complete_with_errors'],
        'incomplete_books': results['missing_pages'],
        'failed_books': results['failed']
    }

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    logger.info(f"Saved detailed report to: {output_file}")


def save_book_list(results: Dict, output_dir: Path):
    """Save lists of book IDs for different categories"""

    # Perfect books
    perfect_ids = [b['book_id'] for b in results['perfect']]
    with open(output_dir / 'perfect_books.txt', 'w') as f:
        f.write('\n'.join(perfect_ids))

    # All usable books
    usable_ids = (
        [b['book_id'] for b in results['perfect']] +
        [b['book_id'] for b in results['complete_with_errors']]
    )
    with open(output_dir / 'usable_books.txt', 'w') as f:
        f.write('\n'.join(usable_ids))

    logger.info(f"Saved book ID lists to: {output_dir}")


def main():
    # Setup paths
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    books_dir = project_root / 'data' / 'shamela' / 'raw' / 'books'

    if not books_dir.exists():
        logger.error(f"Books directory not found: {books_dir}")
        return

    # Verify completeness
    results = verify_completeness(books_dir)

    # Print report
    print_report(results)

    # Save reports
    save_report(results, project_root / 'FINAL_COMPLETENESS_REPORT.json')
    save_book_list(results, project_root)


if __name__ == '__main__':
    main()
