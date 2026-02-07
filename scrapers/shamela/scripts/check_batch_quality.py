#!/usr/bin/env python3
"""
Check quality and completeness of crawled books

This script analyzes all crawled books and reports:
1. Books with errors that need recrawling
2. Books with missing sections (gaps)
3. Books that failed to crawl
4. Overall statistics

Usage:
    python3 scripts/check_batch_quality.py
"""

import json
import re
from pathlib import Path
from typing import Dict, List, Set
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


def analyze_book(book_dir: Path, book_id: str) -> Dict:
    """Analyze a single book for completeness and errors"""

    # Load metadata
    meta_file = book_dir / f'book_{book_id}_meta.json'
    if not meta_file.exists():
        return {
            'book_id': book_id,
            'status': 'no_metadata',
            'quality': 'unknown'
        }

    with open(meta_file, 'r', encoding='utf-8') as f:
        metadata = json.load(f)

    # Find actual sections
    sections = find_section_numbers(book_dir, book_id)

    if not sections:
        return {
            'book_id': book_id,
            'title': metadata.get('title', 'Unknown'),
            'status': metadata.get('status', 'unknown'),
            'quality': 'no_sections',
            'errors': metadata.get('errors', []),
            'error_count': len(metadata.get('errors', []))
        }

    min_section = min(sections)
    max_section = max(sections)
    total_sections = len(sections)

    # Find gaps
    expected_sections = set(range(min_section, max_section + 1))
    missing = sorted(expected_sections - sections)

    # Determine quality
    has_errors = len(metadata.get('errors', [])) > 0
    has_gaps = len(missing) > 0

    if metadata.get('status') == 'failed':
        quality = 'failed'
    elif has_errors and has_gaps:
        quality = 'poor'
    elif has_errors or has_gaps:
        quality = 'moderate'
    else:
        quality = 'excellent'

    return {
        'book_id': book_id,
        'title': metadata.get('title', 'Unknown'),
        'author': metadata.get('author_name', 'Unknown'),
        'status': metadata.get('status', 'unknown'),
        'quality': quality,
        'total_sections': total_sections,
        'min_section': min_section,
        'max_section': max_section,
        'missing_sections': missing,
        'missing_count': len(missing),
        'errors': metadata.get('errors', []),
        'error_count': len(metadata.get('errors', []))
    }


def main():
    project_root = Path(__file__).parent.parent
    books_dir = project_root / 'data' / 'shamela' / 'raw' / 'books'

    # Find all book directories
    book_dirs = sorted([d for d in books_dir.iterdir() if d.is_dir()],
                      key=lambda x: int(x.name) if x.name.isdigit() else 0)

    logger.info(f"Analyzing {len(book_dirs)} books...")

    # Analyze all books
    results = []
    for book_dir in book_dirs:
        book_id = book_dir.name
        result = analyze_book(book_dir, book_id)
        results.append(result)

    # Categorize by quality
    excellent = [r for r in results if r.get('quality') == 'excellent']
    moderate = [r for r in results if r.get('quality') == 'moderate']
    poor = [r for r in results if r.get('quality') == 'poor']
    failed = [r for r in results if r.get('quality') == 'failed']
    no_sections = [r for r in results if r.get('quality') == 'no_sections']

    # Print summary
    logger.info("\n" + "="*80)
    logger.info("QUALITY REPORT")
    logger.info("="*80)

    logger.info(f"\nTotal books: {len(results)}")
    logger.info(f"  ✅ Excellent (no errors, no gaps): {len(excellent)} ({len(excellent)/len(results)*100:.1f}%)")
    logger.info(f"  ⚠️  Moderate (minor errors or gaps): {len(moderate)} ({len(moderate)/len(results)*100:.1f}%)")
    logger.info(f"  ❌ Poor (errors AND gaps): {len(poor)} ({len(poor)/len(results)*100:.1f}%)")
    logger.info(f"  💀 Failed completely: {len(failed)} ({len(failed)/len(results)*100:.1f}%)")
    logger.info(f"  ❓ No sections: {len(no_sections)} ({len(no_sections)/len(results)*100:.1f}%)")

    # Books needing attention
    needs_attention = moderate + poor + failed

    if needs_attention:
        logger.info(f"\n" + "="*80)
        logger.info(f"BOOKS NEEDING ATTENTION: {len(needs_attention)}")
        logger.info("="*80)

        for book in needs_attention[:20]:  # Show first 20
            logger.info(f"\nBook {book['book_id']}: {book['title']}")
            logger.info(f"  Quality: {book['quality']}")
            if book.get('error_count', 0) > 0:
                logger.info(f"  Errors: {book['error_count']}")
                for error in book.get('errors', [])[:3]:
                    logger.info(f"    - {error}")
            if book.get('missing_count', 0) > 0:
                missing_preview = book['missing_sections'][:10]
                more = f" (+ {book['missing_count'] - 10} more)" if book['missing_count'] > 10 else ""
                logger.info(f"  Missing sections: {missing_preview}{more}")

        if len(needs_attention) > 20:
            logger.info(f"\n... and {len(needs_attention) - 20} more books needing attention")

    # Statistics
    total_sections = sum(r.get('total_sections', 0) for r in results if r.get('total_sections'))
    total_errors = sum(r.get('error_count', 0) for r in results)
    total_missing = sum(r.get('missing_count', 0) for r in results)

    logger.info(f"\n" + "="*80)
    logger.info("STATISTICS")
    logger.info("="*80)
    logger.info(f"Total sections crawled: {total_sections:,}")
    logger.info(f"Total errors logged: {total_errors:,}")
    logger.info(f"Total missing sections: {total_missing:,}")

    # Save detailed report
    report_file = project_root / 'quality_report.json'
    report = {
        'summary': {
            'total_books': len(results),
            'excellent': len(excellent),
            'moderate': len(moderate),
            'poor': len(poor),
            'failed': len(failed),
            'no_sections': len(no_sections),
            'total_sections_crawled': total_sections,
            'total_errors': total_errors,
            'total_missing_sections': total_missing
        },
        'books_needing_attention': needs_attention,
        'all_books': results
    }

    with open(report_file, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    logger.info(f"\n✅ Detailed report saved to: {report_file}")

    # Save list of books to recrawl
    if needs_attention:
        recrawl_file = project_root / 'books_to_recrawl_after_batch.txt'
        with open(recrawl_file, 'w') as f:
            for book in needs_attention:
                f.write(f"{book['book_id']}\n")
        logger.info(f"✅ Recrawl list saved to: {recrawl_file}")

    return report


if __name__ == '__main__':
    main()
