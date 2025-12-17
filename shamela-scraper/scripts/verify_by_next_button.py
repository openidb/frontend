#!/usr/bin/env python3
"""
Verify book completeness by checking if last page has clickable next button

This script provides definitive proof of completeness by checking the actual
HTML of the last page. If the next button is clickable (has href), the book
is incomplete. If it's disabled or missing, the book is complete.
"""

import json
import logging
from pathlib import Path
from typing import Dict, List
from bs4 import BeautifulSoup

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def has_clickable_next_button(html_content: str) -> bool:
    """
    Check if page has a clickable next button

    Returns:
        True = Has clickable next button (book incomplete)
        False = Next button disabled or missing (book complete)
    """
    soup = BeautifulSoup(html_content, 'html.parser')

    for link in soup.find_all('a', class_='btn'):
        link_html = str(link)
        # Is this a "next" button (single >)?
        is_next = ('&gt;' in link_html or '>' in link.get_text()) and \
                  not ('&gt;&gt;' in link_html or '>>' in link.get_text())

        if is_next:
            # Is it clickable (has href and not disabled)?
            if not link.get('disabled') and link.get('href'):
                return True  # ❌ Incomplete - has more pages

    return False  # ✅ Complete - last page reached


def verify_book(book_id: str, books_dir: Path) -> Dict:
    """
    Verify if a single book is complete by checking its last page

    Returns dict with verification results
    """
    # Check if book has a subdirectory
    book_dir = books_dir / book_id

    if not book_dir.exists():
        return {
            'book_id': book_id,
            'status': 'no_html_files',
            'error': 'Book directory not found'
        }

    # Find all HTML files for this book in its subdirectory
    html_files = sorted(book_dir.glob(f'book_{book_id}_section_*.html'))

    if not html_files:
        return {
            'book_id': book_id,
            'status': 'no_html_files',
            'error': 'No HTML files found'
        }

    # Get last file
    last_file = html_files[-1]
    last_section = last_file.stem.split('_')[-1]

    try:
        # Read and check last page
        with open(last_file, 'r', encoding='utf-8') as f:
            html_content = f.read()

        has_next = has_clickable_next_button(html_content)

        return {
            'book_id': book_id,
            'status': 'incomplete' if has_next else 'verified_complete',
            'last_section': last_section,
            'total_sections': len(html_files),
            'has_clickable_next': has_next,
            'last_file': str(last_file.name)
        }

    except Exception as e:
        logger.error(f"Book {book_id}: Error reading last page - {e}")
        return {
            'book_id': book_id,
            'status': 'error',
            'error': str(e),
            'last_section': last_section
        }


def verify_all_books(books_dir: Path, status_filter: str = 'complete') -> Dict:
    """
    Verify all books with given status

    Args:
        books_dir: Directory containing book HTML files
        status_filter: Only verify books with this status (default: 'complete')

    Returns:
        Dict with categorized results
    """
    results = {
        'verified_complete': [],    # ✅ Next button disabled, truly complete
        'incomplete': [],            # ❌ Next button clickable, needs more pages
        'no_html_files': [],         # ⚠️ No HTML files (archived?)
        'errors': []                 # ⚠️ Errors during verification
    }

    # Load all metadata files from book subdirectories
    meta_files = sorted(books_dir.glob('*/book_*_meta.json'))

    logger.info(f"Found {len(meta_files)} books with metadata")

    # Filter by status if specified
    books_to_verify = []
    for meta_file in meta_files:
        with open(meta_file) as f:
            metadata = json.load(f)

        if status_filter is None or metadata.get('status') == status_filter:
            books_to_verify.append(metadata['book_id'])

    logger.info(f"Verifying {len(books_to_verify)} books with status='{status_filter}'")

    # Verify each book
    for i, book_id in enumerate(books_to_verify, 1):
        if i % 50 == 0:
            logger.info(f"Progress: {i}/{len(books_to_verify)} books verified")

        result = verify_book(book_id, books_dir)

        # Categorize result
        status = result['status']
        if status == 'verified_complete':
            results['verified_complete'].append(result)
        elif status == 'incomplete':
            results['incomplete'].append(result)
        elif status == 'no_html_files':
            results['no_html_files'].append(result)
        elif status == 'error':
            results['errors'].append(result)

    return results


def print_report(results: Dict):
    """Print detailed verification report"""

    print("\n" + "="*80)
    print("BOOK COMPLETENESS VERIFICATION REPORT")
    print("(Based on Next Button Check)")
    print("="*80)

    total = sum(len(results[cat]) for cat in results)
    verified = len(results['verified_complete'])
    incomplete = len(results['incomplete'])

    print(f"\nTotal books checked: {total}")
    print(f"\n✅ VERIFIED COMPLETE: {verified}")
    print(f"   (Next button disabled on last page)")

    print(f"\n❌ INCOMPLETE: {incomplete}")
    print(f"   (Next button clickable on last page - more pages exist)")

    print(f"\n⚠️  NO HTML FILES: {len(results['no_html_files'])}")
    print(f"   (Books 1-6 archived?)")

    print(f"\n⚠️  ERRORS: {len(results['errors'])}")

    # Success rate
    if total > 0:
        success_rate = (verified / total) * 100
        print(f"\n📊 Verification rate: {success_rate:.1f}%")

    # Show incomplete books
    if results['incomplete']:
        print(f"\n{'='*80}")
        print(f"INCOMPLETE BOOKS (Need Re-crawling)")
        print("="*80)
        print(f"\nFound {len(results['incomplete'])} books that stopped early:\n")

        for i, book in enumerate(results['incomplete'][:20], 1):
            print(f"  {i:2d}. Book {book['book_id']:>4s}: "
                  f"{book['total_sections']:4d} sections, "
                  f"last={book['last_section']:>4s}, "
                  f"has next button ❌")

        if len(results['incomplete']) > 20:
            print(f"\n  ... and {len(results['incomplete']) - 20} more")

    # Show some verified complete books
    if results['verified_complete']:
        print(f"\n{'='*80}")
        print(f"VERIFIED COMPLETE BOOKS (Sample - First 20)")
        print("="*80)
        print(f"\nTotal: {len(results['verified_complete'])} books\n")

        for i, book in enumerate(results['verified_complete'][:20], 1):
            print(f"  {i:2d}. Book {book['book_id']:>4s}: "
                  f"{book['total_sections']:4d} sections, "
                  f"last={book['last_section']:>4s} ✅")

        if len(results['verified_complete']) > 20:
            print(f"\n  ... and {len(results['verified_complete']) - 20} more")

    # Show no HTML files
    if results['no_html_files']:
        print(f"\n{'='*80}")
        print(f"NO HTML FILES (Archived?)")
        print("="*80)

        for book in results['no_html_files']:
            print(f"  Book {book['book_id']}: {book.get('error', 'No files')}")

    print("\n" + "="*80)


def save_report(results: Dict, output_file: Path):
    """Save verification report as JSON"""

    summary = {
        'summary': {
            'total_checked': sum(len(results[cat]) for cat in results),
            'verified_complete': len(results['verified_complete']),
            'incomplete': len(results['incomplete']),
            'no_html_files': len(results['no_html_files']),
            'errors': len(results['errors']),
            'verification_rate': (len(results['verified_complete']) /
                                 sum(len(results[cat]) for cat in results) * 100
                                 if sum(len(results[cat]) for cat in results) > 0 else 0)
        },
        'verified_complete_books': results['verified_complete'],
        'incomplete_books': results['incomplete'],
        'no_html_files': results['no_html_files'],
        'errors': results['errors']
    }

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    logger.info(f"Saved verification report to: {output_file}")


def save_incomplete_list(results: Dict, output_file: Path):
    """Save list of incomplete book IDs for re-crawling"""

    incomplete_ids = [book['book_id'] for book in results['incomplete']]

    with open(output_file, 'w') as f:
        f.write('\n'.join(incomplete_ids))

    logger.info(f"Saved {len(incomplete_ids)} incomplete book IDs to: {output_file}")


def main():
    import argparse

    parser = argparse.ArgumentParser(description='Verify book completeness by checking next button')
    parser.add_argument('--status', default='complete',
                       help='Only verify books with this status (default: complete)')
    parser.add_argument('--all', action='store_true',
                       help='Verify all books regardless of status')

    args = parser.parse_args()

    # Setup paths
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    books_dir = project_root / 'data' / 'shamela' / 'raw' / 'books'

    if not books_dir.exists():
        logger.error(f"Books directory not found: {books_dir}")
        return

    # Verify books
    status_filter = None if args.all else args.status
    results = verify_all_books(books_dir, status_filter)

    # Print report
    print_report(results)

    # Save reports
    report_file = project_root / 'NEXT_BUTTON_VERIFICATION.json'
    save_report(results, report_file)

    # Save incomplete book list for re-crawling
    if results['incomplete']:
        incomplete_file = project_root / 'books_to_recrawl.txt'
        save_incomplete_list(results, incomplete_file)

    # Summary
    print(f"\n📝 Reports saved:")
    print(f"   - Detailed report: {report_file}")
    if results['incomplete']:
        print(f"   - Incomplete books: {project_root / 'books_to_recrawl.txt'}")


if __name__ == '__main__':
    main()
