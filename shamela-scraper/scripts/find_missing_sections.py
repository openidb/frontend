#!/usr/bin/env python3
"""
Find all missing sections (gaps) in books

This script checks for missing sections between the first and last section
of each book, not just section 1.
"""

import re
import json
from pathlib import Path
from typing import List, Set, Dict
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def find_section_numbers(book_dir: Path, book_id: str) -> Set[int]:
    """Find all section numbers that exist for a book"""
    section_numbers = set()

    for html_file in book_dir.glob(f'book_{book_id}_section_*.html'):
        match = re.search(r'section_(\d+)\.html$', html_file.name)
        if match:
            section_numbers.add(int(match.group(1)))

    return section_numbers


def find_missing_sections(book_dir: Path, book_id: str) -> Dict:
    """Find missing sections for a book"""

    section_numbers = find_section_numbers(book_dir, book_id)

    if not section_numbers:
        return {
            'book_id': book_id,
            'has_sections': False,
            'missing_sections': []
        }

    min_section = min(section_numbers)
    max_section = max(section_numbers)
    total_sections = len(section_numbers)

    # Find gaps
    expected_sections = set(range(min_section, max_section + 1))
    missing = sorted(expected_sections - section_numbers)

    return {
        'book_id': book_id,
        'has_sections': True,
        'min_section': min_section,
        'max_section': max_section,
        'total_sections': total_sections,
        'expected_sections': len(expected_sections),
        'missing_sections': missing,
        'missing_count': len(missing),
        'missing_section_1': 1 not in section_numbers and min_section > 1
    }


def analyze_all_books():
    """Analyze all books for missing sections"""

    project_root = Path(__file__).parent.parent
    books_dir = project_root / 'data' / 'shamela' / 'raw' / 'books'

    # Find all book directories
    book_dirs = [d for d in books_dir.iterdir() if d.is_dir()]

    logger.info(f"Analyzing {len(book_dirs)} books for missing sections")

    books_with_gaps = []
    books_missing_section_1 = []
    books_starting_after_1 = []

    for book_dir in sorted(book_dirs, key=lambda x: int(x.name)):
        book_id = book_dir.name
        result = find_missing_sections(book_dir, book_id)

        if not result['has_sections']:
            continue

        # Books with any missing sections
        if result['missing_count'] > 0:
            books_with_gaps.append(result)
            logger.info(f"Book {book_id}: Missing {result['missing_count']} sections "
                       f"(range: {result['min_section']}-{result['max_section']})")

        # Books missing section 1 specifically
        if result['missing_section_1']:
            books_missing_section_1.append(result)

        # Books starting from section other than 1
        if result['min_section'] > 1:
            books_starting_after_1.append(result)

    # Summary
    logger.info(f"\n=== SUMMARY ===")
    logger.info(f"Total books with gaps: {len(books_with_gaps)}")
    logger.info(f"Books missing section 1: {len(books_missing_section_1)}")
    logger.info(f"Books starting after section 1: {len(books_starting_after_1)}")

    total_missing = sum(b['missing_count'] for b in books_with_gaps)
    logger.info(f"Total missing sections across all books: {total_missing}")

    # Save detailed report
    output_file = project_root / 'missing_sections_report.json'
    report = {
        'summary': {
            'total_books_analyzed': len(book_dirs),
            'books_with_gaps': len(books_with_gaps),
            'books_missing_section_1': len(books_missing_section_1),
            'books_starting_after_1': len(books_starting_after_1),
            'total_missing_sections': total_missing
        },
        'books_with_gaps': books_with_gaps,
        'books_missing_section_1': books_missing_section_1,
        'books_starting_after_1': books_starting_after_1
    }

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    logger.info(f"\nDetailed report saved to: {output_file}")

    # Save list of all missing sections for crawling
    missing_sections_list = []
    for book in books_with_gaps:
        for section in book['missing_sections']:
            missing_sections_list.append(f"{book['book_id']},{section}")

    sections_file = project_root / 'missing_sections_to_crawl.txt'
    with open(sections_file, 'w') as f:
        f.write('\n'.join(missing_sections_list))

    logger.info(f"Missing sections list saved to: {sections_file}")
    logger.info(f"Format: book_id,section_number (one per line)")

    # Show worst offenders
    if books_with_gaps:
        logger.info(f"\n=== TOP 10 BOOKS WITH MOST MISSING SECTIONS ===")
        sorted_gaps = sorted(books_with_gaps, key=lambda x: x['missing_count'], reverse=True)
        for i, book in enumerate(sorted_gaps[:10], 1):
            logger.info(f"{i:2d}. Book {book['book_id']:>4s}: Missing {book['missing_count']:>4d} sections "
                       f"(has {book['total_sections']}, expected {book['expected_sections']})")

    return report


if __name__ == '__main__':
    analyze_all_books()
