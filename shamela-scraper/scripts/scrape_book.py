#!/usr/bin/env python3
"""
Main script to scrape a Shamela book and generate EPUB
"""

import sys
import os
import argparse
import logging

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
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description='Scrape a Shamela book and generate EPUB')
    parser.add_argument('book_id', help='Shamela book ID')
    parser.add_argument('--start-page', type=int, default=1, help='Starting page number (default: 1)')
    parser.add_argument('--end-page', type=int, help='Ending page number (default: auto-detect)')
    parser.add_argument('--max-pages', type=int, help='Maximum number of pages to scrape')
    parser.add_argument('--output-dir', default='../output/shamela', help='Output directory for EPUB')
    parser.add_argument('--data-dir', default='../data/shamela', help='Directory to save JSON data')
    parser.add_argument('--save-json', action='store_true', help='Save intermediate JSON files')
    parser.add_argument('--delay', type=float, default=1.5, help='Delay between requests in seconds')
    parser.add_argument('--no-author-enrich', action='store_true', help='Skip enriching author data from author page')

    args = parser.parse_args()

    # Create output directories
    os.makedirs(args.output_dir, exist_ok=True)
    if args.save_json:
        os.makedirs(os.path.join(args.data_dir, 'metadata'), exist_ok=True)
        os.makedirs(os.path.join(args.data_dir, 'authors'), exist_ok=True)
        os.makedirs(os.path.join(args.data_dir, 'toc'), exist_ok=True)
        os.makedirs(os.path.join(args.data_dir, 'pages'), exist_ok=True)

    # Initialize HTTP client
    logger.info(f"Starting scraper for book {args.book_id}")
    http_client = ShamelaHTTPClient(delay=args.delay)

    # Initialize scrapers
    metadata_scraper = MetadataScraper(http_client)
    author_scraper = AuthorScraper(http_client)
    page_scraper = PageScraper(http_client)
    epub_generator = EPUBGenerator()

    # Step 1: Scrape metadata
    logger.info("Step 1: Scraping book metadata...")
    metadata = metadata_scraper.scrape_book(args.book_id)
    if not metadata:
        logger.error("Failed to scrape metadata. Exiting.")
        return 1

    # Save metadata if requested
    if args.save_json:
        metadata_path = os.path.join(args.data_dir, 'metadata', f'{args.book_id}.json')
        metadata.to_json(metadata_path)
        logger.info(f"Saved metadata to {metadata_path}")

    # Step 2: Scrape table of contents
    logger.info("Step 2: Scraping table of contents...")
    toc = metadata_scraper.scrape_toc(args.book_id)
    if not toc:
        logger.error("Failed to scrape TOC. Exiting.")
        return 1

    # Save TOC if requested
    if args.save_json:
        toc_path = os.path.join(args.data_dir, 'toc', f'{args.book_id}_toc.json')
        toc.to_json(toc_path)
        logger.info(f"Saved TOC to {toc_path}")

    # Step 3: Enrich author data (optional)
    if not args.no_author_enrich and metadata.author.shamela_author_id:
        logger.info("Step 3: Enriching author data...")
        enriched_author = author_scraper.enrich_author(metadata.author)
        metadata.author = enriched_author

        # Save enriched author if requested
        if args.save_json:
            author_path = os.path.join(args.data_dir, 'authors', f'{metadata.author.shamela_author_id}.json')
            # Save author data manually
            import json
            with open(author_path, 'w', encoding='utf-8') as f:
                json.dump(enriched_author.to_dict(), f, ensure_ascii=False, indent=2)
            logger.info(f"Saved author data to {author_path}")
    else:
        logger.info("Step 3: Skipping author enrichment")

    # Step 4: Scrape pages
    logger.info("Step 4: Scraping page content...")

    # Determine which pages to scrape
    if args.max_pages:
        # Scrape limited number of pages
        end_page = args.start_page + args.max_pages - 1
        logger.info(f"Scraping {args.max_pages} pages (from {args.start_page} to {end_page})")
        pages = page_scraper.scrape_book(
            args.book_id,
            start_page=args.start_page,
            end_page=end_page,
            output_dir=os.path.join(args.data_dir, 'pages') if args.save_json else None
        )
    elif args.end_page:
        # Scrape specific range
        logger.info(f"Scraping pages {args.start_page} to {args.end_page}")
        pages = page_scraper.scrape_book(
            args.book_id,
            start_page=args.start_page,
            end_page=args.end_page,
            output_dir=os.path.join(args.data_dir, 'pages') if args.save_json else None
        )
    else:
        # Scrape all pages (auto-detect end)
        logger.info("Scraping all pages (auto-detecting end page)...")
        pages = page_scraper.scrape_book(
            args.book_id,
            start_page=args.start_page,
            output_dir=os.path.join(args.data_dir, 'pages') if args.save_json else None
        )

    if not pages:
        logger.error("No pages scraped. Exiting.")
        return 1

    logger.info(f"Successfully scraped {len(pages)} pages")

    # Step 5: Generate EPUB
    logger.info("Step 5: Generating EPUB...")
    epub_filename = f"{args.book_id}_{metadata.title.get('arabic', 'book')}.epub"
    # Clean filename (remove invalid characters)
    epub_filename = epub_filename.replace('/', '_').replace('\\', '_').replace(':', '_')
    epub_path = os.path.join(args.output_dir, epub_filename)

    success = epub_generator.generate_epub(metadata, toc, pages, epub_path)

    if success:
        logger.info(f"✓ Successfully created EPUB: {epub_path}")
        logger.info(f"✓ Book: {metadata.title.get('arabic', '')}")
        logger.info(f"✓ Author: {metadata.author.name}")
        logger.info(f"✓ Pages: {len(pages)}")
        logger.info(f"✓ Volumes: {metadata.structure.total_volumes}")
        return 0
    else:
        logger.error("Failed to generate EPUB")
        return 1


if __name__ == '__main__':
    sys.exit(main())
