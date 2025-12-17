"""
Page content scraper for Shamela books
"""

import re
import os
import json
import logging
from bs4 import BeautifulSoup
from typing import Optional, List
from .schemas import PageContent, Footnote, FormattingHints
from .utils import (
    ShamelaHTTPClient,
    detect_content_type,
    separate_footnotes,
    clean_arabic_text,
    extract_printed_page_numbers
)

logger = logging.getLogger(__name__)


class PageScraper:
    """Scraper for page content from Shamela books"""

    def __init__(self, http_client: Optional[ShamelaHTTPClient] = None):
        """
        Initialize page scraper

        Args:
            http_client: HTTP client for requests (creates new one if None)
        """
        self.client = http_client or ShamelaHTTPClient()

    @staticmethod
    def extract_pdf_url(soup: BeautifulSoup) -> Optional[str]:
        """
        Extract PDF URL from page HTML if available

        Args:
            soup: BeautifulSoup parsed HTML

        Returns:
            PDF URL if found, None otherwise

        Examples of PDF URL patterns:
            - https://ready.shamela.ws/pdf/pdfjs.html?file=...
            - Direct PDF links
        """
        # Look for PDF.js viewer links
        pdf_link = soup.find('a', href=re.compile(r'ready\.shamela\.ws/pdf'))
        if pdf_link:
            return pdf_link.get('href')

        # Look for iframe with PDF
        pdf_iframe = soup.find('iframe', src=re.compile(r'ready\.shamela\.ws/pdf'))
        if pdf_iframe:
            return pdf_iframe.get('src')

        # Look for any link/button containing "pdf" in Arabic or English
        pdf_button = soup.find('a', text=re.compile(r'(PDF|pdf|بي دي إف)', re.IGNORECASE))
        if pdf_button:
            href = pdf_button.get('href')
            if href and 'pdf' in href.lower():
                return href

        return None

    def scrape_page(self, book_id: str, page_number: int, volume_number: int = 1,
                    book_title: Optional[str] = None, author_name: Optional[str] = None) -> Optional[PageContent]:
        """
        Scrape content from a single page

        Args:
            book_id: Shamela book ID
            page_number: Page number to scrape
            volume_number: Volume number (for multi-volume works)
            book_title: Optional book title to include in page metadata
            author_name: Optional author name to include in page metadata

        Returns:
            PageContent object or None on failure
        """
        url = f"https://shamela.ws/book/{book_id}/{page_number}"
        # 404s are expected when reaching end of book
        soup = self.client.get(url, is_404_expected=True)

        if not soup:
            logger.debug(f"Failed to fetch page {page_number} of book {book_id} (likely end of book)")
            return None

        try:
            # Extract PDF URL if available (before any modifications)
            pdf_url = self.extract_pdf_url(soup)

            # Extract printed page number from page title (format: "ص10 - Book Title")
            printed_page_number = None
            title_tag = soup.find('title')
            if title_tag:
                title_text = title_tag.get_text()
                # Match pattern like "ص10" at the start of title
                page_match = re.match(r'ص(\d+)', title_text)
                if page_match:
                    printed_page_number = int(page_match.group(1))

            # Extract main content from .nass div
            content_div = soup.find('div', class_='nass')
            if not content_div:
                logger.warning(f"No .nass div found on page {page_number} of book {book_id}")
                return None

            # Separate footnotes from main content using HTML structure
            # Shamela uses <p class="hamesh"> for footnotes, usually after <hr/>
            footnotes = []
            footnotes_html_parts = []

            # Find footnote paragraphs (class="hamesh")
            footnote_paragraphs = content_div.find_all('p', class_='hamesh')

            for fn_para in footnote_paragraphs:
                fn_text = fn_para.get_text(strip=True)
                # Extract marker (pattern: (1) or (١) at start)
                marker_match = re.match(r'^\(([٠-٩\d]+)\)\s*', fn_text)
                if marker_match:
                    marker = f"({marker_match.group(1)})"
                    content = fn_text[marker_match.end():].strip()
                    footnotes.append(Footnote(marker=marker, content=content))

                    # Store formatted HTML for footnote
                    footnotes_html_parts.append(str(fn_para))

                # Remove footnote paragraphs from content_div
                fn_para.decompose()

            # Store footnotes HTML
            footnotes_html = '\n'.join(footnotes_html_parts) if footnotes_html_parts else None

            # Remove <hr/> separators (they just mark footnote boundary)
            hr_tags = content_div.find_all('hr')
            for hr in hr_tags:
                hr.decompose()

            # Remove anchor spans and copy buttons (not needed in extracted content)
            for elem in content_div.find_all(['span'], class_=['anchor', 'fa', 'fa-copy', 'text-gray']):
                elem.decompose()
            for elem in content_div.find_all('a', class_='btn_tag'):
                elem.decompose()

            # Extract paragraphs individually to preserve structure
            paragraphs = []
            html_paragraphs = []
            for p_tag in content_div.find_all('p'):
                # Use '\n' separator to preserve line breaks within paragraphs
                p_text = p_tag.get_text('\n', strip=True)
                if p_text:  # Only include non-empty paragraphs
                    paragraphs.append(p_text)
                    html_paragraphs.append(str(p_tag))

            # Join paragraphs with double newlines
            raw_content = '\n\n'.join(paragraphs)

            # Try to extract printed page numbers from content markers [ص: XX] if not already found in title
            if printed_page_number is None:
                printed_page_numbers = extract_printed_page_numbers(raw_content)
                if printed_page_numbers:
                    printed_page_number = printed_page_numbers[0]
                else:
                    # Fallback: if no printed page number found, default to 0
                    printed_page_number = 0

            # Clean the text (preserving paragraph breaks)
            main_content = clean_arabic_text(raw_content, preserve_paragraphs=True)

            # Store HTML with formatting (wrap in div for consistency)
            main_content_html = '\n'.join(html_paragraphs) if html_paragraphs else None

            # Detect content type for formatting hints
            content_types = detect_content_type(main_content)
            formatting_hints = FormattingHints(**content_types)

            # Create page content object
            page_content = PageContent(
                page_number=page_number,
                volume_number=volume_number,
                main_content=main_content,
                main_content_html=main_content_html,
                footnotes=footnotes,
                footnotes_html=footnotes_html,
                formatting_hints=formatting_hints,
                book_id=book_id,
                book_title=book_title,
                author_name=author_name,
                url_page_index=page_number,
                printed_page_number=printed_page_number,
                source_url=url,
                pdf_url=pdf_url
            )

            logger.info(f"Successfully scraped page {page_number} of book {book_id} "
                       f"(footnotes: {len(footnotes)}, content types: {content_types})")
            return page_content

        except Exception as e:
            logger.error(f"Error scraping page {page_number} of book {book_id}: {e}", exc_info=True)
            return None

    def scrape_overview_page(self, book_id: str, book_title: Optional[str] = None,
                            author_name: Optional[str] = None) -> Optional[PageContent]:
        """
        Scrape the book overview page (https://shamela.ws/book/{book_id}) as page 0

        This extracts the complete book card and table of contents from the overview page
        and treats it as the first page of content.

        Args:
            book_id: Shamela book ID
            book_title: Optional book title to include in page metadata
            author_name: Optional author name to include in page metadata

        Returns:
            PageContent object for page 0, or None on failure
        """
        url = f"https://shamela.ws/book/{book_id}"
        logger.info(f"Scraping overview page for book {book_id}: {url}")

        try:
            soup = self.client.get(url)
            if not soup:
                logger.error(f"Failed to fetch overview page for book {book_id}")
                return None

            # Extract the .nass container which contains the book card and TOC
            nass_container = soup.find('div', class_='nass')
            if not nass_container:
                logger.warning(f"Could not find .nass container on overview page for book {book_id}")
                return None

            # Clone the container to avoid modifying the original
            from copy import copy
            nass = copy(nass_container)

            # Remove unwanted elements
            for elem in nass.find_all(['button', 'input']):
                elem.decompose()

            # Remove div with class text-left (contains buttons and search)
            for elem in nass.find_all('div', class_='text-left'):
                elem.decompose()

            # Remove div with id cont_srchBook
            for elem in nass.find_all('div', id='cont_srchBook'):
                elem.decompose()

            # Clean up betaka-index: remove expand buttons
            betaka_index = nass.find('div', class_='betaka-index')
            if betaka_index:
                for button in betaka_index.find_all('a', class_='exp_bu'):
                    button.decompose()

            # Extract the clean HTML
            overview_html = str(nass)

            # Convert Shamela links to EPUB internal links
            import re
            from bs4 import BeautifulSoup
            soup_html = BeautifulSoup(overview_html, 'html.parser')
            for link in soup_html.find_all('a', href=True):
                href = link['href']
                match = re.search(r'/book/\d+/(\d+)', href)
                if match:
                    page_num = int(match.group(1))
                    link['href'] = f"page_{page_num:04d}.xhtml"
            overview_html = str(soup_html)

            # Get plain text version
            plain_text = nass.get_text(separator='\n', strip=True)

            # Create PageContent for overview page (page 'i')
            page_content = PageContent(
                page_number='i',  # This is the overview page (Roman numeral for front matter)
                volume_number=1,
                main_content=plain_text,
                main_content_html=overview_html,
                footnotes=[],
                formatting_hints=FormattingHints(),
                book_id=book_id,
                book_title=book_title,
                author_name=author_name,
                url_page_index='i',
                printed_page_number=None,  # Overview page has no printed page number
                source_url=url,
                pdf_url=None  # Overview page has no PDF
            )

            logger.info(f"Successfully scraped overview page for book {book_id}")
            return page_content

        except Exception as e:
            logger.error(f"Error scraping overview page for book {book_id}: {e}", exc_info=True)
            return None

    def scrape_book(self, book_id: str, start_page: int = 1, end_page: Optional[int] = None,
                    output_dir: Optional[str] = None, book_title: Optional[str] = None,
                    author_name: Optional[str] = None, resume: bool = True) -> List[PageContent]:
        """
        Scrape all pages of a book with resume capability

        Args:
            book_id: Shamela book ID
            start_page: Starting page number
            end_page: Ending page number (None = scrape until 404)
            output_dir: Directory to save JSON files (None = don't save)
            book_title: Optional book title to include in page metadata
            author_name: Optional author name to include in page metadata
            resume: If True, skip pages that already exist as JSON files (default: True)

        Returns:
            List of PageContent objects
        """
        pages = []

        # First, scrape the overview page as page 'i'
        logger.info(f"Scraping overview page as page 'i' for book {book_id}")
        overview_page = self.scrape_overview_page(book_id, book_title, author_name)
        if overview_page:
            pages.append(overview_page)
            # Save overview page if output_dir provided
            if output_dir:
                self._save_page(overview_page, book_id, output_dir)
            logger.info(f"Added overview page as page 'i'")
        else:
            logger.warning(f"Failed to scrape overview page for book {book_id}, continuing without it")

        current_page = start_page
        consecutive_failures = 0
        max_failures = 3  # Stop after 3 consecutive failures
        max_iterations = 10000  # Safety limit to prevent infinite loops

        # Get set of existing pages if resume is enabled and output_dir is provided
        existing_pages = set()
        if resume and output_dir:
            existing_pages = self._get_existing_pages(book_id, output_dir)
            if existing_pages:
                logger.info(f"Found {len(existing_pages)} existing pages for book {book_id}")
                logger.info(f"Existing pages: {sorted(list(existing_pages))[:10]}..." if len(existing_pages) > 10 else f"Existing pages: {sorted(list(existing_pages))}")

        logger.info(f"Starting to scrape book {book_id} from page {start_page}")

        iterations = 0
        while iterations < max_iterations:
            iterations += 1

            # Safety check: prevent infinite loops
            if iterations >= max_iterations:
                logger.error(f"Reached maximum iterations ({max_iterations}). Stopping to prevent infinite loop.")
                break

            if end_page and current_page > end_page:
                logger.info(f"Reached end page {end_page}")
                break

            # Check if page already exists (resume logic)
            if resume and output_dir and current_page in existing_pages:
                logger.debug(f"Page {current_page} already exists, loading from disk...")
                existing_page = self._load_existing_page(book_id, current_page, output_dir)
                if existing_page:
                    pages.append(existing_page)
                    consecutive_failures = 0  # Reset failure counter
                    current_page += 1
                    continue
                else:
                    logger.warning(f"Failed to load existing page {current_page}, will re-scrape")
                    # Fall through to scrape the page

            # Scrape the page
            page_content = self.scrape_page(book_id, current_page, book_title=book_title, author_name=author_name)

            if page_content:
                pages.append(page_content)
                consecutive_failures = 0

                # Save to JSON if output directory provided
                if output_dir:
                    self._save_page(page_content, book_id, output_dir)

                logger.info(f"Progress: {len(pages)} pages scraped (current: {current_page})")

            else:
                consecutive_failures += 1
                logger.warning(f"Failed to scrape page {current_page} "
                              f"(consecutive failures: {consecutive_failures}/{max_failures})")

                if consecutive_failures >= max_failures:
                    logger.info(f"Stopping after {max_failures} consecutive failures")
                    break

            current_page += 1

        logger.info(f"Completed scraping book {book_id}: {len(pages)} pages total ({iterations} iterations)")
        return pages

    def scrape_page_range(self, book_id: str, page_numbers: List[int],
                         output_dir: Optional[str] = None) -> List[PageContent]:
        """
        Scrape specific pages of a book

        Args:
            book_id: Shamela book ID
            page_numbers: List of page numbers to scrape
            output_dir: Directory to save JSON files (None = don't save)

        Returns:
            List of PageContent objects
        """
        pages = []

        logger.info(f"Scraping {len(page_numbers)} specific pages from book {book_id}")

        for page_num in page_numbers:
            page_content = self.scrape_page(book_id, page_num)

            if page_content:
                pages.append(page_content)

                # Save to JSON if output directory provided
                if output_dir:
                    self._save_page(page_content, book_id, output_dir)

                logger.info(f"Progress: {len(pages)}/{len(page_numbers)} pages scraped")

        logger.info(f"Completed scraping {len(pages)}/{len(page_numbers)} pages from book {book_id}")
        return pages

    def _save_page(self, page_content: PageContent, book_id: str, output_dir: str):
        """Save page content to JSON file"""
        try:
            # Create book directory
            book_dir = os.path.join(output_dir, book_id)
            os.makedirs(book_dir, exist_ok=True)

            # Save page
            filename = f"page_{page_content.page_number}.json"
            filepath = os.path.join(book_dir, filename)
            page_content.to_json(filepath)

        except Exception as e:
            logger.error(f"Failed to save page {page_content.page_number} of book {book_id}: {e}")

    def _load_existing_page(self, book_id: str, page_number: int, output_dir: str) -> Optional[PageContent]:
        """
        Load existing page from JSON file if it exists

        Args:
            book_id: Shamela book ID
            page_number: Page number to load
            output_dir: Directory where JSON files are saved

        Returns:
            PageContent object if file exists and is valid, None otherwise
        """
        try:
            book_dir = os.path.join(output_dir, book_id)
            filename = f"page_{page_number}.json"
            filepath = os.path.join(book_dir, filename)

            if os.path.exists(filepath):
                logger.debug(f"Found existing page {page_number} for book {book_id}")
                with open(filepath, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    # Create PageContent from dict
                    return PageContent(
                        page_number=data.get('page_number', page_number),
                        volume_number=data.get('volume_number', 1),
                        main_content=data.get('main_content', ''),
                        main_content_html=data.get('main_content_html'),
                        footnotes=[Footnote(**fn) for fn in data.get('footnotes', [])],
                        footnotes_html=data.get('footnotes_html'),
                        formatting_hints=FormattingHints(**data.get('formatting_hints', {})),
                        book_id=data.get('book_id'),
                        book_title=data.get('book_title'),
                        author_name=data.get('author_name'),
                        url_page_index=data.get('url_page_index'),
                        printed_page_number=data.get('printed_page_number'),
                        source_url=data.get('source_url'),
                        pdf_url=data.get('pdf_url')
                    )
        except Exception as e:
            logger.warning(f"Failed to load existing page {page_number} for book {book_id}: {e}")
            return None

        return None

    def _get_existing_pages(self, book_id: str, output_dir: str) -> set:
        """
        Get set of page numbers that already exist as JSON files

        Args:
            book_id: Shamela book ID
            output_dir: Directory where JSON files are saved

        Returns:
            Set of page numbers that exist
        """
        existing_pages = set()
        try:
            book_dir = os.path.join(output_dir, book_id)
            if os.path.exists(book_dir):
                for filename in os.listdir(book_dir):
                    if filename.startswith('page_') and filename.endswith('.json'):
                        # Extract page number from filename
                        page_num_str = filename[5:-5]  # Remove 'page_' prefix and '.json' suffix
                        # Skip non-numeric pages like 'page_i.json' (overview page)
                        if page_num_str == 'i':
                            continue  # Always rescrape overview page
                        try:
                            existing_pages.add(int(page_num_str))
                        except ValueError:
                            logger.warning(f"Invalid page filename: {filename}")
        except Exception as e:
            logger.warning(f"Failed to scan existing pages for book {book_id}: {e}")

        return existing_pages

    def detect_last_page(self, book_id: str, max_search: int = 1000) -> Optional[int]:
        """
        Detect last page of a book using binary search

        Args:
            book_id: Shamela book ID
            max_search: Maximum page number to search

        Returns:
            Last valid page number or None
        """
        logger.info(f"Detecting last page of book {book_id} (max search: {max_search})")

        # Binary search for last page
        left = 1
        right = max_search
        last_valid = None
        max_iterations = 20  # Safety limit for binary search (log2(10000) ~= 13)

        iterations = 0
        while left <= right and iterations < max_iterations:
            iterations += 1
            mid = (left + right) // 2

            # Test if page exists
            url = f"https://shamela.ws/book/{book_id}/{mid}"
            soup = self.client.get(url, is_404_expected=True)

            if soup and soup.find('div', class_='nass'):
                # Page exists
                last_valid = mid
                left = mid + 1
                logger.info(f"Page {mid} exists, searching higher...")
            else:
                # Page doesn't exist
                right = mid - 1
                logger.info(f"Page {mid} doesn't exist, searching lower...")

        if iterations >= max_iterations:
            logger.warning(f"Binary search hit iteration limit ({max_iterations}) for book {book_id}")

        if last_valid:
            logger.info(f"Detected last page of book {book_id}: {last_valid}")
        else:
            logger.warning(f"Could not detect last page of book {book_id}")

        return last_valid

    def scrape_toc_pages(self, book_id: str, toc, output_dir: Optional[str] = None) -> List[PageContent]:
        """
        Scrape pages mentioned in table of contents

        Args:
            book_id: Shamela book ID
            toc: TableOfContents object
            output_dir: Directory to save JSON files (None = don't save)

        Returns:
            List of PageContent objects
        """
        # Collect all page numbers from TOC
        page_numbers = set()

        for volume in toc.volumes:
            for chapter in volume.chapters:
                page_numbers.add(chapter.page)
                # Add subsection pages
                self._collect_subsection_pages(chapter, page_numbers)

        # Sort page numbers
        sorted_pages = sorted(page_numbers)

        logger.info(f"Found {len(sorted_pages)} pages in TOC for book {book_id}")

        return self.scrape_page_range(book_id, sorted_pages, output_dir)

    def _collect_subsection_pages(self, chapter, page_numbers: set):
        """Recursively collect page numbers from subsections"""
        for subsection in chapter.subsections:
            page_numbers.add(subsection.page)
            if subsection.subsections:
                self._collect_subsection_pages(subsection, page_numbers)
