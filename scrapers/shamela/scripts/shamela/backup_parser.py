"""
Parser for Shamela backup HTML files

Extracts structured content from raw Shamela.ws HTML pages stored in backup.
Supports enriched data from book overview and author pages when available.
"""

import json
import re
import logging
from pathlib import Path
from typing import List, Tuple, Optional, Dict
from bs4 import BeautifulSoup

from .schemas import (
    BookMetadata, Author, Publication, Structure, Classification, Editorial,
    TableOfContents, Volume, ChapterEntry, PageContent, Footnote, FormattingHints
)
from .utils import clean_arabic_text, detect_content_type, extract_printed_page_numbers

logger = logging.getLogger(__name__)


class BackupHTMLParser:
    """Parse Shamela backup HTML files into structured data for EPUB generation"""

    def __init__(self, backup_base_path: str):
        """
        Initialize parser with backup directory path.

        Args:
            backup_base_path: Path to the backup books directory
                              (e.g., /Volumes/KIOXIA/shamela-backup/books)
        """
        self.backup_path = Path(backup_base_path)
        if not self.backup_path.exists():
            raise ValueError(f"Backup path does not exist: {backup_base_path}")

        # Authors directory is sibling to books directory
        self.authors_path = self.backup_path.parent / 'authors'

    def get_complete_books(self) -> List[str]:
        """
        Get list of book IDs with status='complete'.

        Returns:
            List of book ID strings sorted numerically
        """
        complete_books = []

        for book_dir in self.backup_path.iterdir():
            if not book_dir.is_dir():
                continue

            meta_file = book_dir / f"book_{book_dir.name}_meta.json"
            if not meta_file.exists():
                continue

            try:
                with open(meta_file, 'r', encoding='utf-8') as f:
                    meta = json.load(f)
                    if meta.get('status') == 'complete':
                        complete_books.append(meta['book_id'])
            except (json.JSONDecodeError, KeyError) as e:
                logger.warning(f"Error reading metadata for book {book_dir.name}: {e}")
                continue

        return sorted(complete_books, key=lambda x: int(x) if x.isdigit() else 0)

    def get_book_info(self, book_id: str) -> Optional[Dict]:
        """
        Get basic book info from metadata JSON.

        Args:
            book_id: The book ID

        Returns:
            Dictionary with book metadata or None if not found
        """
        meta = self._load_backup_metadata(book_id)
        return meta

    def parse_book(self, book_id: str) -> Tuple[BookMetadata, TableOfContents, List[PageContent]]:
        """
        Parse complete book from backup files.

        Uses enriched data from book overview and author pages when available,
        falling back to extracting from section HTML if not.

        Args:
            book_id: The book ID to parse

        Returns:
            Tuple of (BookMetadata, TableOfContents, List[PageContent])
        """
        logger.info(f"Parsing book {book_id} from backup")

        # Load backup metadata JSON
        backup_meta = self._load_backup_metadata(book_id)
        if not backup_meta:
            raise ValueError(f"No metadata found for book {book_id}")

        # Try to load enriched data first
        enriched_overview = self._load_enriched_overview(book_id)
        enriched_toc = self._load_enriched_toc(book_id)

        if enriched_overview:
            logger.debug(f"Using enriched overview data for book {book_id}")

        if enriched_toc:
            logger.debug(f"Using enriched TOC data for book {book_id}")
            toc = self._build_toc_from_enriched(enriched_toc)
        else:
            # Fallback: Load first section to extract TOC from navigation
            first_section_html = self._load_section_html(book_id, 1)
            if not first_section_html:
                raise ValueError(f"No HTML sections found for book {book_id}")
            first_soup = BeautifulSoup(first_section_html, 'lxml')
            toc = self._extract_toc_from_html(first_soup, book_id)

        if enriched_overview:
            # Build metadata from enriched overview
            metadata = self._build_metadata_from_enriched(enriched_overview, backup_meta)
        else:
            # Fallback: Extract from HTML
            if not 'first_soup' in dir():
                first_section_html = self._load_section_html(book_id, 1)
                if not first_section_html:
                    raise ValueError(f"No HTML sections found for book {book_id}")
                first_soup = BeautifulSoup(first_section_html, 'lxml')

            category, category_id = self._extract_category_from_breadcrumb(first_soup)
            html_title, html_author, html_author_id = self._extract_title_and_author_from_html(first_soup)

            metadata = self._build_metadata(
                backup_meta, category, category_id,
                html_title=html_title,
                html_author=html_author,
                html_author_id=html_author_id
            )

        # Parse all section HTML files
        total_pages = backup_meta.get('total_pages', 0)
        title_for_pages = metadata.title.get('arabic', backup_meta.get('title', ''))
        author_for_pages = metadata.author.name if metadata.author else backup_meta.get('author_name', '')

        pages = self._parse_all_sections(
            book_id,
            total_pages,
            title_for_pages,
            author_for_pages
        )

        # Create overview page (page 'i') from enriched data if available
        if enriched_overview and enriched_overview.get('description'):
            overview_page = self._create_overview_page(
                enriched_overview,
                metadata,
                book_id
            )
            # Insert at the beginning so it becomes the first page
            pages.insert(0, overview_page)
            logger.info(f"Added overview page for book {book_id}")

        logger.info(f"Parsed book {book_id}: {len(pages)} pages, {len(toc.volumes[0].chapters) if toc.volumes else 0} TOC entries")

        return metadata, toc, pages

    def _create_overview_page(self, enriched: Dict, metadata: BookMetadata, book_id: str) -> PageContent:
        """
        Create an overview page (page 'i') from enriched overview data.

        This creates the book card page with metadata and TOC that appears
        at the beginning of the EPUB.

        Args:
            enriched: Enriched overview data from book_{id}_overview.json
            metadata: Book metadata
            book_id: The book ID

        Returns:
            PageContent object for the overview page
        """
        description_html = enriched.get('description', '')

        # Clean up the description HTML - remove external links and scripts
        if description_html:
            soup = BeautifulSoup(description_html, 'lxml')

            # Remove any script tags
            for script in soup.find_all('script'):
                script.decompose()

            # Convert shamela.ws links to internal EPUB links
            for link in soup.find_all('a', href=True):
                href = link.get('href', '')
                # Convert /book/{id}/{page} links to internal page links
                page_match = re.search(rf'/book/{book_id}/(\d+)', href)
                if page_match:
                    page_num = int(page_match.group(1))
                    link['href'] = f'page_{page_num:04d}.xhtml'
                elif 'shamela.ws' in href or href.startswith('/'):
                    # Remove external Shamela links (author pages, etc.)
                    link.replace_with(link.get_text())

            description_html = str(soup)

        # Extract plain text for main_content
        plain_text = BeautifulSoup(description_html, 'lxml').get_text(separator='\n', strip=True)

        return PageContent(
            page_number='i',
            volume_number=1,
            main_content=plain_text,
            main_content_html=description_html,
            footnotes=[],
            footnotes_html=None,
            formatting_hints=FormattingHints(),
            book_id=book_id,
            book_title=metadata.title.get('arabic', ''),
            author_name=metadata.author.name if metadata.author else '',
            url_page_index='i',
            printed_page_number=None,
            source_url=f"https://shamela.ws/book/{book_id}"
        )

    def _build_toc_from_enriched(self, enriched_toc: Dict) -> TableOfContents:
        """Build TableOfContents from enriched TOC JSON data."""
        volumes = []

        for vol_data in enriched_toc.get('volumes', []):
            chapters = self._build_chapters_from_enriched(vol_data.get('chapters', []))
            volumes.append(Volume(
                number=vol_data.get('number', 1),
                title=vol_data.get('title', 'المجلد الأول'),
                chapters=chapters
            ))

        if not volumes:
            volumes = [Volume(number=1, title="المجلد الأول", chapters=[])]

        return TableOfContents(volumes=volumes)

    def _build_chapters_from_enriched(self, chapters_data: List[Dict]) -> List[ChapterEntry]:
        """Recursively build ChapterEntry list from enriched TOC data."""
        chapters = []

        for ch_data in chapters_data:
            subsections = self._build_chapters_from_enriched(ch_data.get('subsections', []))
            chapters.append(ChapterEntry(
                title=ch_data.get('title', ''),
                page=ch_data.get('page', 1),
                subsections=subsections
            ))

        return chapters

    def _build_metadata_from_enriched(self, enriched: Dict, backup_meta: Dict) -> BookMetadata:
        """Build BookMetadata from enriched overview JSON data."""
        # Get author info and try to enrich with author page data
        author_data = enriched.get('author', {})
        author_id = author_data.get('shamela_author_id')

        # Try to load full author data from author page
        full_author = None
        if author_id:
            full_author = self._load_author_data(author_id)

        # Build author object
        if full_author:
            author = Author(
                name=full_author.get('name', author_data.get('name', '')),
                shamela_author_id=author_id,
                death_date_hijri=full_author.get('death_date_hijri'),
                birth_date_hijri=full_author.get('birth_date_hijri'),
                death_date_gregorian=full_author.get('death_date_gregorian'),
                birth_date_gregorian=full_author.get('birth_date_gregorian'),
                kunya=full_author.get('kunya'),
                nasab=full_author.get('nasab'),
                nisba=full_author.get('nisba'),
                laqab=full_author.get('laqab'),
                biography=full_author.get('biography'),
                other_works=full_author.get('other_works', [])
            )
        else:
            author = Author(
                name=author_data.get('name', ''),
                shamela_author_id=author_id
            )

        # Build publication info
        pub_data = enriched.get('publication', {})
        publication = Publication(
            publisher=pub_data.get('publisher'),
            edition=pub_data.get('edition'),
            year_hijri=pub_data.get('year_hijri'),
            year_gregorian=pub_data.get('year_gregorian'),
            isbn=pub_data.get('isbn')
        )

        # Build structure info
        struct_data = enriched.get('structure', {})
        structure = Structure(
            total_volumes=struct_data.get('total_volumes', 1),
            total_pages=backup_meta.get('total_pages', 0),
            page_alignment_note=struct_data.get('page_alignment_note')
        )

        # Build classification info
        class_data = enriched.get('classification', {})
        classification = Classification(
            category=class_data.get('category'),
            category_id=class_data.get('category_id'),
            keywords=class_data.get('keywords', [])
        )

        # Build editorial info
        edit_data = enriched.get('editorial', {})
        editorial = Editorial(
            type=edit_data.get('type'),
            editor=edit_data.get('editor')
        )

        return BookMetadata(
            shamela_id=enriched.get('shamela_id', backup_meta.get('book_id')),
            title=enriched.get('title', {'arabic': backup_meta.get('title', '')}),
            author=author,
            publication=publication,
            structure=structure,
            classification=classification,
            editorial=editorial,
            description=enriched.get('description')
        )

    def _load_backup_metadata(self, book_id: str) -> Optional[Dict]:
        """Load book metadata from JSON file."""
        meta_file = self.backup_path / book_id / f"book_{book_id}_meta.json"

        if not meta_file.exists():
            return None

        try:
            with open(meta_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except json.JSONDecodeError as e:
            logger.error(f"Error parsing metadata for book {book_id}: {e}")
            return None

    def _load_enriched_overview(self, book_id: str) -> Optional[Dict]:
        """Load enriched book overview from JSON file (from overview page scraping)."""
        overview_file = self.backup_path / book_id / f"book_{book_id}_overview.json"

        if not overview_file.exists():
            return None

        try:
            with open(overview_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except json.JSONDecodeError as e:
            logger.error(f"Error parsing overview for book {book_id}: {e}")
            return None

    def _load_enriched_toc(self, book_id: str) -> Optional[Dict]:
        """Load enriched TOC from JSON file (from overview page scraping)."""
        toc_file = self.backup_path / book_id / f"book_{book_id}_toc.json"

        if not toc_file.exists():
            return None

        try:
            with open(toc_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except json.JSONDecodeError as e:
            logger.error(f"Error parsing TOC for book {book_id}: {e}")
            return None

    def _load_author_data(self, author_id: str) -> Optional[Dict]:
        """Load author data from JSON file (from author page scraping)."""
        if not self.authors_path.exists():
            return None

        author_file = self.authors_path / author_id / f"author_{author_id}_data.json"

        if not author_file.exists():
            return None

        try:
            with open(author_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except json.JSONDecodeError as e:
            logger.error(f"Error parsing author {author_id}: {e}")
            return None

    def _load_section_html(self, book_id: str, section_num: int) -> Optional[str]:
        """Load HTML content from a section file."""
        section_file = self.backup_path / book_id / f"book_{book_id}_section_{section_num}.html"

        if not section_file.exists():
            return None

        try:
            with open(section_file, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception as e:
            logger.error(f"Error reading section {section_num} for book {book_id}: {e}")
            return None

    def _build_metadata(self, backup_meta: Dict, category: Optional[str],
                        category_id: Optional[str],
                        html_title: Optional[str] = None,
                        html_author: Optional[str] = None,
                        html_author_id: Optional[str] = None) -> BookMetadata:
        """Build BookMetadata object from backup metadata and HTML extracted data."""
        # Prefer HTML-extracted data over backup metadata for title and author
        title = html_title or backup_meta.get('title', '')
        author_name = html_author or backup_meta.get('author_name', '') or ''
        author_id = html_author_id or backup_meta.get('author_id')

        return BookMetadata(
            shamela_id=backup_meta['book_id'],
            title={'arabic': title},
            author=Author(
                name=author_name,
                shamela_author_id=author_id
            ),
            publication=Publication(),
            structure=Structure(
                total_pages=backup_meta.get('total_pages', 0)
            ),
            classification=Classification(
                category=category,
                category_id=category_id
            ),
            editorial=Editorial()
        )

    def _extract_title_and_author_from_html(self, soup: BeautifulSoup) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        """
        Extract book title and author from HTML page.

        Returns:
            Tuple of (title, author_name, author_id)
        """
        title = None
        author_name = None
        author_id = None

        # Extract title from h1 > a.text-primary
        title_link = soup.find('h1', class_='size-20')
        if title_link:
            title_a = title_link.find('a', class_='text-primary')
            if title_a:
                title = title_a.get_text(strip=True)

        # Extract author from a[href*="/author/"]
        author_link = soup.find('a', href=re.compile(r'/author/\d+'))
        if author_link:
            author_name = author_link.get_text(strip=True)
            # Extract author ID from href
            href = author_link.get('href', '')
            id_match = re.search(r'/author/(\d+)', href)
            if id_match:
                author_id = id_match.group(1)

        return title, author_name, author_id

    def _extract_toc_from_html(self, soup: BeautifulSoup, book_id: str) -> TableOfContents:
        """
        Extract table of contents from navigation div.

        The TOC is in: div.s-nav > ul > li > a[href*="/book/{id}/"]
        """
        toc = TableOfContents(volumes=[Volume(number=1, title="المجلد الأول", chapters=[])])

        nav_div = soup.find('div', class_='s-nav')
        if not nav_div:
            logger.warning(f"No navigation div found for book {book_id}")
            return toc

        nav_ul = nav_div.find('ul')
        if not nav_ul:
            logger.warning(f"No navigation list found for book {book_id}")
            return toc

        toc.volumes[0].chapters = self._parse_toc_list(nav_ul, book_id)
        return toc

    def _parse_toc_list(self, ul_element, book_id: str) -> List[ChapterEntry]:
        """Recursively parse TOC <ul> structure into ChapterEntry list."""
        chapters = []

        for li in ul_element.find_all('li', recursive=False):
            # Find the main link (links to /book/{id}/{page})
            link = li.find('a', href=re.compile(rf'shamela\.ws/book/{book_id}/\d+'))
            if not link:
                # Try without domain
                link = li.find('a', href=re.compile(rf'/book/{book_id}/\d+'))
            if not link:
                continue

            # Extract page number from href
            href = link.get('href', '')
            page_match = re.search(r'/book/\d+/(\d+)', href)
            if not page_match:
                continue

            page_num = int(page_match.group(1))
            title = link.get_text(strip=True)

            # Clean up title (remove leading dash or bullet)
            title = re.sub(r'^[-–—•]\s*', '', title)

            # Check for nested subsections
            subsections = []
            nested_ul = li.find('ul')
            if nested_ul:
                subsections = self._parse_toc_list(nested_ul, book_id)

            chapters.append(ChapterEntry(
                title=title,
                page=page_num,
                subsections=subsections
            ))

        return chapters

    def _extract_category_from_breadcrumb(self, soup: BeautifulSoup) -> Tuple[Optional[str], Optional[str]]:
        """
        Extract category from breadcrumb navigation.

        Breadcrumb structure: ol.breadcrumb > li > a[href*="category"]
        """
        breadcrumb = soup.find('ol', class_='breadcrumb')
        if not breadcrumb:
            return None, None

        # Find category link
        category_link = breadcrumb.find('a', href=re.compile(r'/category/\d+'))
        if not category_link:
            return None, None

        category_name = category_link.get_text(strip=True)

        # Extract category ID from href
        href = category_link.get('href', '')
        id_match = re.search(r'/category/(\d+)', href)
        category_id = id_match.group(1) if id_match else None

        return category_name, category_id

    def _parse_all_sections(self, book_id: str, total_pages: int,
                            book_title: str, author_name: str) -> List[PageContent]:
        """Parse all HTML section files for a book."""
        pages = []

        for page_num in range(1, total_pages + 1):
            html_content = self._load_section_html(book_id, page_num)
            if not html_content:
                logger.warning(f"Missing section {page_num} for book {book_id}")
                continue

            soup = BeautifulSoup(html_content, 'lxml')
            page_content = self._extract_page_content(
                soup, page_num, book_id, book_title, author_name
            )

            if page_content:
                pages.append(page_content)

        return pages

    def _extract_page_content(self, soup: BeautifulSoup, page_number: int,
                              book_id: str, book_title: str,
                              author_name: str) -> Optional[PageContent]:
        """
        Extract page content from HTML.

        Content is in: div.nass > p
        Footnotes are in: p.hamesh
        """
        content_div = soup.find('div', class_='nass')
        if not content_div:
            logger.warning(f"No content div found for book {book_id} page {page_number}")
            return None

        # Extract printed page number from title
        printed_page_number = self._extract_printed_page_from_title(soup)

        # Extract footnotes first (p.hamesh elements)
        footnotes = []
        footnotes_html_parts = []

        for fn_para in content_div.find_all('p', class_='hamesh'):
            fn_text = fn_para.get_text(strip=True)

            # Parse footnote marker like (1) or (٢)
            marker_match = re.match(r'^\(([٠-٩\d]+)\)\s*', fn_text)
            if marker_match:
                marker = f"({marker_match.group(1)})"
                content = fn_text[marker_match.end():].strip()
                footnotes.append(Footnote(marker=marker, content=content))
            else:
                # No marker, use the whole text
                footnotes.append(Footnote(marker="", content=fn_text))

            # Store HTML for later
            footnotes_html_parts.append(str(fn_para))

            # Remove from content div so it's not duplicated
            fn_para.decompose()

        # Remove UI elements (copy buttons, anchors, etc.)
        for elem in content_div.find_all('a', class_='btn_tag'):
            elem.decompose()
        for elem in content_div.find_all('span', class_='anchor'):
            elem.decompose()

        # Remove hr tags
        for hr in content_div.find_all('hr'):
            hr.decompose()

        # Extract paragraphs
        paragraphs = []
        html_paragraphs = []

        for p_tag in content_div.find_all('p'):
            # Skip empty paragraphs
            p_text = p_tag.get_text(strip=True)
            if not p_text:
                continue

            paragraphs.append(p_text)

            # Clean up paragraph HTML (remove copy buttons, etc.)
            for btn in p_tag.find_all('a', class_='btn_tag'):
                btn.decompose()
            for anchor in p_tag.find_all('span', class_='anchor'):
                anchor.decompose()

            html_paragraphs.append(f'<p>{p_tag.decode_contents()}</p>')

        raw_content = '\n\n'.join(paragraphs)

        # Fallback for printed page number
        if printed_page_number is None:
            nums = extract_printed_page_numbers(raw_content)
            printed_page_number = nums[0] if nums else page_number

        # Clean content
        main_content = clean_arabic_text(raw_content, preserve_paragraphs=True)

        # Detect content types
        content_types = detect_content_type(main_content)

        # Build footnotes HTML
        footnotes_html = None
        if footnotes_html_parts:
            footnotes_html = '\n'.join(footnotes_html_parts)

        return PageContent(
            page_number=page_number,
            volume_number=1,
            main_content=main_content,
            main_content_html='\n'.join(html_paragraphs),
            footnotes=footnotes,
            footnotes_html=footnotes_html,
            formatting_hints=FormattingHints(**content_types),
            book_id=book_id,
            book_title=book_title,
            author_name=author_name,
            url_page_index=page_number,
            printed_page_number=printed_page_number,
            source_url=f"https://shamela.ws/book/{book_id}/{page_number}"
        )

    def _extract_printed_page_from_title(self, soup: BeautifulSoup) -> Optional[int]:
        """Extract printed page number from page title."""
        title_tag = soup.find('title')
        if not title_tag:
            return None

        title_text = title_tag.get_text()

        # Pattern: "صXX - Book Title"
        page_match = re.match(r'ص(\d+)', title_text)
        if page_match:
            return int(page_match.group(1))

        return None


def select_diverse_sample(parser: BackupHTMLParser, count: int = 20) -> List[str]:
    """
    Select a diverse sample of complete books.

    Selects books with different page counts to ensure variety:
    - ~25% small books (<50 pages)
    - ~50% medium books (50-200 pages)
    - ~25% large books (200+ pages)

    Args:
        parser: BackupHTMLParser instance
        count: Number of books to select

    Returns:
        List of book IDs
    """
    complete_books = parser.get_complete_books()

    if len(complete_books) <= count:
        return complete_books

    # Categorize by page count
    small = []  # < 50 pages
    medium = []  # 50-200 pages
    large = []  # > 200 pages

    for book_id in complete_books:
        meta = parser._load_backup_metadata(book_id)
        if not meta:
            continue

        pages = meta.get('total_pages', 0)
        if pages < 50:
            small.append((book_id, pages))
        elif pages <= 200:
            medium.append((book_id, pages))
        else:
            large.append((book_id, pages))

    # Sort each category by page count
    small.sort(key=lambda x: x[1])
    medium.sort(key=lambda x: x[1])
    large.sort(key=lambda x: x[1])

    # Take proportional samples
    sample = []

    # Take ~25% small
    small_count = max(1, count // 4)
    for i in range(min(small_count, len(small))):
        idx = i * len(small) // small_count if small_count > 0 else 0
        if idx < len(small):
            sample.append(small[idx][0])

    # Take ~50% medium
    medium_count = count // 2
    for i in range(min(medium_count, len(medium))):
        idx = i * len(medium) // medium_count if medium_count > 0 else 0
        if idx < len(medium):
            sample.append(medium[idx][0])

    # Take ~25% large
    large_count = count - len(sample)
    for i in range(min(large_count, len(large))):
        idx = i * len(large) // large_count if large_count > 0 else 0
        if idx < len(large):
            sample.append(large[idx][0])

    return sample[:count]
