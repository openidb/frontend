"""
Metadata scraper for Shamela books
"""

import re
import logging
from bs4 import BeautifulSoup
from typing import Optional
from .schemas import (
    BookMetadata,
    Author,
    Publication,
    Editorial,
    Structure,
    Classification,
    TableOfContents,
    Volume,
    ChapterEntry
)
from .utils import (
    ShamelaHTTPClient,
    extract_death_date,
    parse_author_name,
    extract_author_id_from_url
)

logger = logging.getLogger(__name__)


class MetadataScraper:
    """Scraper for book metadata from Shamela book pages"""

    def __init__(self, http_client: Optional[ShamelaHTTPClient] = None):
        """
        Initialize metadata scraper

        Args:
            http_client: HTTP client for requests (creates new one if None)
        """
        self.client = http_client or ShamelaHTTPClient()

    def scrape_book(self, book_id: str) -> Optional[BookMetadata]:
        """
        Scrape complete book metadata

        Args:
            book_id: Shamela book ID

        Returns:
            BookMetadata object or None on failure
        """
        url = f"https://shamela.ws/book/{book_id}"
        soup = self.client.get(url)

        if not soup:
            logger.error(f"Failed to fetch book page for ID {book_id}")
            return None

        try:
            # Extract basic info
            title = self._extract_title(soup)
            author_info = self._extract_author_info(soup)
            publication = self._extract_publication_info(soup)
            editorial = self._extract_editorial_info(soup)
            structure = self._extract_structure_info(soup)
            classification = self._extract_classification(soup)
            description = self._extract_description(soup)

            # Create metadata object
            metadata = BookMetadata(
                shamela_id=book_id,
                title=title,
                author=author_info,
                publication=publication,
                editorial=editorial,
                structure=structure,
                classification=classification,
                description=description
            )

            logger.info(f"Successfully scraped metadata for book {book_id}: {title.get('arabic', '')}")
            return metadata

        except Exception as e:
            logger.error(f"Error scraping metadata for book {book_id}: {e}", exc_info=True)
            return None

    def scrape_toc(self, book_id: str) -> Optional[TableOfContents]:
        """
        Scrape table of contents

        Args:
            book_id: Shamela book ID

        Returns:
            TableOfContents object or None on failure
        """
        url = f"https://shamela.ws/book/{book_id}"
        soup = self.client.get(url)

        if not soup:
            logger.error(f"Failed to fetch TOC for book ID {book_id}")
            return None

        try:
            toc_div = soup.find('div', class_='betaka-index')
            if not toc_div:
                logger.warning(f"No TOC found for book {book_id}")
                return TableOfContents(volumes=[])

            volumes = self._parse_toc_structure(toc_div)
            toc = TableOfContents(volumes=volumes)

            logger.info(f"Successfully scraped TOC for book {book_id}: {len(volumes)} volume(s)")
            return toc

        except Exception as e:
            logger.error(f"Error scraping TOC for book {book_id}: {e}", exc_info=True)
            return None

    def _extract_title(self, soup: BeautifulSoup) -> dict:
        """Extract book title"""
        title = {}

        # Try multiple selectors for title
        title_elem = soup.find('h1') or soup.find('h2')
        if title_elem:
            title['arabic'] = title_elem.get_text(strip=True)
        else:
            # Fallback: look for "الكتاب:" pattern in text
            text = soup.get_text()
            match = re.search(r'الكتاب:\s*([^\n]+)', text)
            if match:
                title['arabic'] = match.group(1).strip()

        return title

    def _extract_author_info(self, soup: BeautifulSoup) -> Author:
        """Extract author information"""
        text = soup.get_text()

        # Extract full author name
        author_name = ""
        author_id = None

        # Try to find author link
        author_link = soup.find('a', href=re.compile(r'/author/\d+'))
        if author_link:
            author_name = author_link.get_text(strip=True)
            author_id = extract_author_id_from_url(author_link.get('href', ''))
        else:
            # Fallback: look for "المؤلف:" pattern
            match = re.search(r'المؤلف:\s*([^\n]+?)(?:\(|$)', text)
            if match:
                author_name = match.group(1).strip()

        # Parse name components
        name_components = parse_author_name(author_name)

        # Extract death date
        death_date = extract_death_date(text)

        return Author(
            name=author_name,
            shamela_author_id=author_id,
            death_date_hijri=death_date,
            **name_components
        )

    def _extract_publication_info(self, soup: BeautifulSoup) -> Publication:
        """Extract publication information"""
        text = soup.get_text()

        publisher = None
        location = None
        edition = None
        year_hijri = None
        year_gregorian = None

        # Extract publisher (الناشر:)
        pub_match = re.search(r'الناشر:\s*([^\n]+)', text)
        if pub_match:
            pub_text = pub_match.group(1).strip()
            # Split by dash if location included
            if ' - ' in pub_text:
                parts = pub_text.split(' - ')
                publisher = parts[0].strip()
                if len(parts) > 1:
                    location = parts[1].strip()
            else:
                publisher = pub_text

        # Extract edition (الطبعة:)
        edition_match = re.search(r'الطبعة:\s*([^\n،]+)', text)
        if edition_match:
            edition = edition_match.group(1).strip()

        # Extract Hijri year
        hijri_match = re.search(r'(\d{4})\s*هـ', text)
        if hijri_match:
            year_hijri = hijri_match.group(1)

        # Extract Gregorian year
        greg_match = re.search(r'(\d{4})\s*م', text)
        if greg_match:
            year_gregorian = greg_match.group(1)

        return Publication(
            publisher=publisher,
            location=location,
            edition=edition,
            year_hijri=year_hijri,
            year_gregorian=year_gregorian
        )

    def _extract_editorial_info(self, soup: BeautifulSoup) -> Editorial:
        """Extract editorial/scholarly information"""
        text = soup.get_text()

        editor = None
        doc_type = None
        institution = None
        supervisor = None

        # Extract editor/muhaqiq (تحقيق: or المحقق:)
        editor_match = re.search(r'(?:تحقيق|المحقق):\s*([^\n]+)', text)
        if editor_match:
            editor = editor_match.group(1).strip()

        # Extract document type
        if 'رسالة ماجستير' in text:
            doc_type = 'رسالة ماجستير'
        elif 'رسالة دكتوراه' in text or 'أطروحة دكتوراه' in text:
            doc_type = 'رسالة دكتوراه'
        elif 'بحث' in text:
            doc_type = 'بحث'

        # Extract institution
        inst_match = re.search(r'جامعة\s+[^\n،]+', text)
        if inst_match:
            institution = inst_match.group(0).strip()

        # Extract supervisor
        sup_match = re.search(r'(?:إشراف|المشرف):\s*([^\n]+)', text)
        if sup_match:
            supervisor = sup_match.group(1).strip()

        return Editorial(
            editor=editor,
            type=doc_type,
            institution=institution,
            supervisor=supervisor
        )

    def _extract_structure_info(self, soup: BeautifulSoup) -> Structure:
        """Extract book structure information"""
        text = soup.get_text()

        total_volumes = 1
        total_pages = None
        page_alignment = None

        # Extract volume count (عدد الأجزاء:)
        vol_match = re.search(r'عدد الأجزاء:\s*([٠-٩\d]+)', text)
        if vol_match:
            vol_num_str = vol_match.group(1)
            # Convert Arabic-Indic numerals to Western if needed
            vol_num_str = vol_num_str.replace('٠', '0').replace('١', '1').replace('٢', '2')
            vol_num_str = vol_num_str.replace('٣', '3').replace('٤', '4').replace('٥', '5')
            vol_num_str = vol_num_str.replace('٦', '6').replace('٧', '7').replace('٨', '8')
            vol_num_str = vol_num_str.replace('٩', '9')
            try:
                total_volumes = int(vol_num_str)
            except ValueError:
                pass

        # Extract page alignment note
        if 'ترقيم الكتاب موافق للمطبوع' in text:
            page_alignment = 'موافق للمطبوع'

        # Try to extract total page count
        page_match = re.search(r'(\d+)\s*صفحة', text)
        if page_match:
            try:
                total_pages = int(page_match.group(1))
            except ValueError:
                pass

        return Structure(
            total_volumes=total_volumes,
            total_pages=total_pages,
            page_alignment_note=page_alignment
        )

    def _extract_classification(self, soup: BeautifulSoup) -> Classification:
        """Extract book category/classification"""
        category = None
        category_id = None

        # Find category link (updated to use /category/ pattern)
        category_link = soup.find('a', href=re.compile(r'/category/\d+'))
        if category_link:
            category = category_link.get_text(strip=True)
            href = category_link.get('href', '')
            cat_match = re.search(r'/category/(\d+)', href)
            if cat_match:
                category_id = cat_match.group(1)

        return Classification(
            category=category,
            category_id=category_id
        )

    def _parse_toc_structure(self, toc_div) -> list:
        """Parse hierarchical TOC structure"""
        volumes = []

        # Find all top-level list items (volumes or main sections)
        main_ul = toc_div.find('ul', class_='betaka-index')
        if not main_ul:
            main_ul = toc_div.find('ul')

        if not main_ul:
            return volumes

        for li in main_ul.find_all('li', recursive=False):
            # Check if this is a volume heading
            strong = li.find('strong')
            if strong:
                volume_title = strong.get_text(strip=True)
                # Extract volume number
                vol_num_match = re.search(r'(\d+)', volume_title)
                vol_num = int(vol_num_match.group(1)) if vol_num_match else len(volumes) + 1

                volume = Volume(number=vol_num, title=volume_title)

                # Find chapters within this volume
                nested_ul = li.find('ul')
                if nested_ul:
                    volume.chapters = self._parse_chapters(nested_ul)

                volumes.append(volume)
            else:
                # No volume structure, treat as single volume with chapters
                if not volumes:
                    volumes.append(Volume(number=1, title='الجزء ١'))

                # Parse this item as a chapter
                chapter = self._parse_chapter_entry(li)
                if chapter:
                    volumes[0].chapters.append(chapter)

        # If no volumes found but we have items, create a default volume
        if not volumes:
            volumes.append(Volume(number=1, title='الجزء ١'))

        return volumes

    def _parse_chapters(self, ul_elem) -> list:
        """Parse chapter list from ul element"""
        chapters = []

        for li in ul_elem.find_all('li', recursive=False):
            chapter = self._parse_chapter_entry(li)
            if chapter:
                chapters.append(chapter)

        return chapters

    def _parse_chapter_entry(self, li_elem) -> Optional[ChapterEntry]:
        """Parse single chapter entry"""
        link = li_elem.find('a', href=re.compile(r'/book/\d+/\d+'))
        if not link:
            return None

        title = link.get_text(strip=True)
        href = link.get('href', '')

        # Extract page number from URL
        page_match = re.search(r'/book/\d+/(\d+)', href)
        page = int(page_match.group(1)) if page_match else 1

        # Check for subsections
        subsections = []
        nested_ul = li_elem.find('ul')
        if nested_ul:
            subsections = self._parse_chapters(nested_ul)

        return ChapterEntry(
            title=title,
            page=page,
            subsections=subsections
        )

    def _extract_description(self, soup: BeautifulSoup) -> Optional[str]:
        """
        Extract book description (book card and table of contents)

        This extracts the "بطاقة الكتاب وفهرس الموضوعات" section which includes:
        - Book card with metadata (الكتاب, المؤلف, المحقق, الناشر, etc.)
        - Full table of contents (فهرس الموضوعات)

        Returns:
            HTML string of the book description, or None if not found
        """
        try:
            # Look for the main content container
            nass_container = soup.find('div', class_='nass')
            if not nass_container:
                logger.warning("Could not find book description container (.nass)")
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
            description_html = str(nass)

            # Log success
            logger.info("Successfully extracted book description")
            return description_html

        except Exception as e:
            logger.warning(f"Could not extract book description: {e}")
            return None
