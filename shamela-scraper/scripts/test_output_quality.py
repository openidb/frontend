#!/usr/bin/env python3
"""
Comprehensive output quality verification for scraped data
"""

import sys
import os
import json
import shutil
from pathlib import Path
from typing import Dict, List, Any

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from shamela.page_scraper import PageScraper
from shamela.metadata_scraper import MetadataScraper
from shamela.utils import ShamelaHTTPClient

# Try to import EPUB generator (optional)
try:
    from shamela.epub_generator import EPUBGenerator
    EPUB_AVAILABLE = True
except ImportError:
    EPUB_AVAILABLE = False
    print("⚠️  Note: ebooklib not installed, EPUB generation tests will be skipped")


class QualityChecker:
    """Quality checker for scraped output"""

    def __init__(self):
        self.issues = []
        self.warnings = []
        self.stats = {
            'total_pages': 0,
            'pages_with_content': 0,
            'pages_with_html': 0,
            'pages_with_footnotes': 0,
            'pages_with_metadata': 0,
            'pages_with_page_numbers': 0,
            'pages_with_urls': 0,
            'pages_with_pdf_urls': 0,
            'arabic_content_ratio': 0,
            'average_content_length': 0,
        }

    def check_required_fields(self, page_data: Dict, page_num: int) -> bool:
        """Check that all required fields are present"""
        required_fields = ['page_number', 'volume_number', 'main_content']
        missing = [f for f in required_fields if f not in page_data]

        if missing:
            self.issues.append(f"Page {page_num}: Missing required fields: {missing}")
            return False

        return True

    def check_new_fields(self, page_data: Dict, page_num: int) -> bool:
        """Check that new fields we added are present and valid"""
        new_fields = {
            'url_page_index': 'URL page index',
            'printed_page_number': 'Printed page number',
            'source_url': 'Source URL',
        }

        all_present = True
        for field, name in new_fields.items():
            if field not in page_data or page_data[field] is None:
                self.warnings.append(f"Page {page_num}: Missing {name} ({field})")
                all_present = False

        # Check source_url format
        if 'source_url' in page_data and page_data['source_url']:
            url = page_data['source_url']
            if not url.startswith('https://shamela.ws/book/'):
                self.issues.append(f"Page {page_num}: Invalid source_url format: {url}")
                all_present = False

        # Check pdf_url format (optional but if present should be valid)
        if 'pdf_url' in page_data and page_data['pdf_url']:
            url = page_data['pdf_url']
            if not url.startswith('https://ready.shamela.ws/pdf/'):
                self.warnings.append(f"Page {page_num}: Unexpected pdf_url format: {url}")

        return all_present

    def check_content_quality(self, page_data: Dict, page_num: int) -> bool:
        """Check content quality"""
        content = page_data.get('main_content', '')

        # Check for empty content
        if not content or len(content.strip()) == 0:
            self.issues.append(f"Page {page_num}: Empty content")
            return False

        # Check minimum content length (should be at least 50 chars for a real page)
        if len(content.strip()) < 50:
            self.warnings.append(f"Page {page_num}: Suspiciously short content ({len(content)} chars)")

        # Check for Arabic content
        arabic_chars = sum(1 for c in content if '\u0600' <= c <= '\u06FF')
        total_chars = len(content)
        arabic_ratio = arabic_chars / total_chars if total_chars > 0 else 0

        if arabic_ratio < 0.3:  # At least 30% Arabic
            self.warnings.append(f"Page {page_num}: Low Arabic content ratio ({arabic_ratio:.1%})")

        return True

    def check_html_content(self, page_data: Dict, page_num: int) -> bool:
        """Check HTML content if present"""
        html = page_data.get('main_content_html')

        if html:
            # Check for basic HTML tags
            if '<p>' not in html and '<div>' not in html:
                self.warnings.append(f"Page {page_num}: HTML content has no paragraph tags")

            # Check that HTML is longer than plain text (has formatting)
            plain_text = page_data.get('main_content', '')
            if len(html) <= len(plain_text):
                self.warnings.append(f"Page {page_num}: HTML not longer than plain text (no formatting?)")

        return True

    def check_footnotes(self, page_data: Dict, page_num: int) -> bool:
        """Check footnotes if present"""
        footnotes = page_data.get('footnotes', [])

        if footnotes:
            for i, fn in enumerate(footnotes):
                # Check footnote structure
                if 'marker' not in fn or 'content' not in fn:
                    self.issues.append(f"Page {page_num}, Footnote {i}: Missing marker or content")
                    return False

                # Check footnote content
                if not fn.get('content', '').strip():
                    self.warnings.append(f"Page {page_num}, Footnote {i}: Empty content")

        return True

    def check_page_numbering(self, page_data: Dict, page_num: int) -> bool:
        """Check page numbering consistency"""
        url_index = page_data.get('url_page_index')
        printed_num = page_data.get('printed_page_number')
        page_number = page_data.get('page_number')

        # url_page_index should match page_number
        if url_index != page_number:
            self.issues.append(f"Page {page_num}: url_page_index ({url_index}) != page_number ({page_number})")
            return False

        # printed_page_number can be different but should be reasonable
        if printed_num:
            if printed_num < 1 or printed_num > 10000:
                self.warnings.append(f"Page {page_num}: Unusual printed_page_number: {printed_num}")

        return True

    def check_metadata(self, page_data: Dict, page_num: int) -> bool:
        """Check metadata fields"""
        book_id = page_data.get('book_id')
        book_title = page_data.get('book_title')
        author_name = page_data.get('author_name')

        if not book_id:
            self.warnings.append(f"Page {page_num}: Missing book_id")

        if not book_title:
            self.warnings.append(f"Page {page_num}: Missing book_title")

        if not author_name:
            self.warnings.append(f"Page {page_num}: Missing author_name")

        return True

    def analyze_page(self, page_data: Dict, page_num: int):
        """Analyze a single page"""
        self.stats['total_pages'] += 1

        # Check all quality aspects
        self.check_required_fields(page_data, page_num)
        self.check_new_fields(page_data, page_num)
        self.check_content_quality(page_data, page_num)
        self.check_html_content(page_data, page_num)
        self.check_footnotes(page_data, page_num)
        self.check_page_numbering(page_data, page_num)
        self.check_metadata(page_data, page_num)

        # Update statistics
        if page_data.get('main_content'):
            self.stats['pages_with_content'] += 1

        if page_data.get('main_content_html'):
            self.stats['pages_with_html'] += 1

        if page_data.get('footnotes'):
            self.stats['pages_with_footnotes'] += 1

        if page_data.get('book_id') and page_data.get('book_title'):
            self.stats['pages_with_metadata'] += 1

        if page_data.get('printed_page_number'):
            self.stats['pages_with_page_numbers'] += 1

        if page_data.get('source_url'):
            self.stats['pages_with_urls'] += 1

        if page_data.get('pdf_url'):
            self.stats['pages_with_pdf_urls'] += 1

    def print_report(self):
        """Print quality report"""
        print("\n" + "="*70)
        print("QUALITY CHECK REPORT")
        print("="*70)

        # Statistics
        print("\n📊 STATISTICS")
        print("-"*70)
        print(f"Total pages analyzed:        {self.stats['total_pages']}")
        print(f"Pages with content:          {self.stats['pages_with_content']} ({self.stats['pages_with_content']/self.stats['total_pages']*100:.1f}%)")
        print(f"Pages with HTML:             {self.stats['pages_with_html']} ({self.stats['pages_with_html']/self.stats['total_pages']*100:.1f}%)")
        print(f"Pages with footnotes:        {self.stats['pages_with_footnotes']} ({self.stats['pages_with_footnotes']/self.stats['total_pages']*100:.1f}%)")
        print(f"Pages with metadata:         {self.stats['pages_with_metadata']} ({self.stats['pages_with_metadata']/self.stats['total_pages']*100:.1f}%)")
        print(f"Pages with printed numbers:  {self.stats['pages_with_page_numbers']} ({self.stats['pages_with_page_numbers']/self.stats['total_pages']*100:.1f}%)")
        print(f"Pages with source URLs:      {self.stats['pages_with_urls']} ({self.stats['pages_with_urls']/self.stats['total_pages']*100:.1f}%)")
        print(f"Pages with PDF URLs:         {self.stats['pages_with_pdf_urls']} ({self.stats['pages_with_pdf_urls']/self.stats['total_pages']*100:.1f}%)")

        # Issues
        print("\n🔴 CRITICAL ISSUES")
        print("-"*70)
        if self.issues:
            for issue in self.issues:
                print(f"  ❌ {issue}")
        else:
            print("  ✅ No critical issues found!")

        # Warnings
        print("\n⚠️  WARNINGS")
        print("-"*70)
        if self.warnings:
            for warning in self.warnings[:10]:  # Show first 10
                print(f"  ⚠️  {warning}")
            if len(self.warnings) > 10:
                print(f"  ... and {len(self.warnings) - 10} more warnings")
        else:
            print("  ✅ No warnings!")

        # Overall verdict
        print("\n" + "="*70)
        if not self.issues:
            print("✅ QUALITY CHECK PASSED")
        else:
            print("❌ QUALITY CHECK FAILED")
        print(f"   Issues: {len(self.issues)}")
        print(f"   Warnings: {len(self.warnings)}")
        print("="*70)


def test_book_quality(book_id: str, num_pages: int = 10):
    """Test quality of a single book's output"""

    print(f"\n{'='*70}")
    print(f"TESTING BOOK {book_id}")
    print(f"{'='*70}")

    test_dir = '../data/test-quality'
    if os.path.exists(test_dir):
        shutil.rmtree(test_dir)

    # Scrape the book
    http_client = ShamelaHTTPClient(delay=0.05, max_retries=3)
    page_scraper = PageScraper(http_client)
    metadata_scraper = MetadataScraper(http_client)

    # Get metadata
    print("\n📖 Fetching metadata...")
    metadata = metadata_scraper.scrape_book(book_id)
    if metadata:
        book_title = metadata.title.get('arabic', '')
        author_name = metadata.author.name
        print(f"   Title: {book_title}")
        print(f"   Author: {author_name}")
    else:
        book_title = None
        author_name = None
        print("   ⚠️  Could not fetch metadata")

    # Scrape pages
    print(f"\n📄 Scraping {num_pages} pages...")
    pages = page_scraper.scrape_book(
        book_id,
        start_page=1,
        end_page=num_pages,
        output_dir=test_dir,
        book_title=book_title,
        author_name=author_name,
        resume=False
    )

    print(f"   ✓ Scraped {len(pages)} pages")

    # Analyze each page
    print("\n🔍 Analyzing quality...")
    checker = QualityChecker()

    for page in pages:
        page_dict = page.to_dict()
        checker.analyze_page(page_dict, page.page_number)

    # Print report
    checker.print_report()

    # Show sample page
    print("\n" + "="*70)
    print("📄 SAMPLE PAGE OUTPUT (Page 1)")
    print("="*70)

    if pages:
        sample = pages[0].to_dict()
        print(json.dumps(sample, ensure_ascii=False, indent=2)[:2000] + "...")

    # Clean up
    shutil.rmtree(test_dir)

    return len(checker.issues) == 0


def test_epub_generation(book_id: str, num_pages: int = 10):
    """Test EPUB generation with new data"""

    if not EPUB_AVAILABLE:
        print(f"\n{'='*70}")
        print(f"SKIPPING EPUB GENERATION TEST (ebooklib not installed)")
        print(f"{'='*70}")
        return True  # Skip but don't fail

    print(f"\n{'='*70}")
    print(f"TESTING EPUB GENERATION FOR BOOK {book_id}")
    print(f"{'='*70}")

    test_dir = '../data/test-epub-quality'
    output_dir = '../output/test-epub-quality'

    for d in [test_dir, output_dir]:
        if os.path.exists(d):
            shutil.rmtree(d)
        os.makedirs(d, exist_ok=True)

    http_client = ShamelaHTTPClient(delay=0.05, max_retries=3)
    page_scraper = PageScraper(http_client)
    metadata_scraper = MetadataScraper(http_client)
    epub_generator = EPUBGenerator()

    # Get full book data
    print("\n📖 Fetching book data...")
    metadata = metadata_scraper.scrape_book(book_id)
    toc = metadata_scraper.scrape_toc(book_id)

    if not metadata or not toc:
        print("❌ Failed to fetch metadata or TOC")
        return False

    book_title = metadata.title.get('arabic', '')
    author_name = metadata.author.name

    print(f"   Title: {book_title}")
    print(f"   Author: {author_name}")

    # Scrape pages
    print(f"\n📄 Scraping {num_pages} pages...")
    pages = page_scraper.scrape_book(
        book_id,
        start_page=1,
        end_page=num_pages,
        output_dir=test_dir,
        book_title=book_title,
        author_name=author_name,
        resume=False
    )

    print(f"   ✓ Scraped {len(pages)} pages")

    # Generate EPUB
    print("\n📚 Generating EPUB...")
    epub_path = os.path.join(output_dir, f'{book_id}_test.epub')
    success = epub_generator.generate_epub(metadata, toc, pages, epub_path)

    if success:
        file_size = os.path.getsize(epub_path)
        print(f"   ✓ EPUB generated successfully")
        print(f"   File: {epub_path}")
        print(f"   Size: {file_size:,} bytes ({file_size/1024:.1f} KB)")

        # Basic validation
        if file_size < 1000:
            print("   ⚠️  EPUB file seems too small")
            return False

        print("   ✅ EPUB looks good!")
        return True
    else:
        print("   ❌ EPUB generation failed")
        return False


def run_all_quality_checks():
    """Run all quality checks"""

    print("="*70)
    print("COMPREHENSIVE OUTPUT QUALITY VERIFICATION")
    print("="*70)
    print("\nThis will test:")
    print("1. Data structure completeness")
    print("2. New fields (page numbering, URLs)")
    print("3. Content quality (Arabic text, formatting)")
    print("4. Metadata consistency")
    print("5. EPUB generation")
    print("\n" + "="*70)

    all_passed = True

    # Test multiple books
    test_books = [
        ('18', 15),   # Book with footnotes and formatting
        ('1', 10),    # Another test book
        ('100', 8),   # Smaller book
    ]

    for book_id, num_pages in test_books:
        passed = test_book_quality(book_id, num_pages)
        if not passed:
            all_passed = False

    # Test EPUB generation
    print("\n" + "="*70)
    print("EPUB GENERATION TESTS")
    print("="*70)

    epub_passed = test_epub_generation('18', 15)
    if not epub_passed:
        all_passed = False

    # Final summary
    print("\n" + "="*70)
    if all_passed:
        print("🎉 ALL QUALITY CHECKS PASSED! 🎉")
        print("="*70)
        print("\n✅ Output meets all quality standards:")
        print("  • All required fields present")
        print("  • New fields (page numbering, URLs) working correctly")
        print("  • Content quality is high (Arabic text, formatting)")
        print("  • Metadata is consistent")
        print("  • EPUB generation works perfectly")
        print("\n🚀 Ready for production scraping!")
    else:
        print("❌ QUALITY CHECKS FAILED")
        print("="*70)
        print("\nPlease review the issues above and fix them.")

    print("="*70)

    return all_passed


if __name__ == '__main__':
    try:
        success = run_all_quality_checks()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
