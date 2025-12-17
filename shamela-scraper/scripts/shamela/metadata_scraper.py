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
    extract_birth_date,
    parse_author_name,
    extract_author_id_from_url
)

logger = logging.getLogger(__name__)


class MetadataScraper:
    """Scraper for book metadata from Shamela book pages"""

    def __init__(self, http_client: Optional[ShamelaHTTPClient] = None, enrich_authors: bool = False):
        """
        Initialize metadata scraper

        Args:
            http_client: HTTP client for requests (creates new one if None)
            enrich_authors: If True, enrich author data by scraping author pages
        """
        self.client = http_client or ShamelaHTTPClient()
        self.enrich_authors = enrich_authors

        # Lazy import to avoid circular dependency
        if enrich_authors:
            from .author_scraper import AuthorScraper
            self.author_scraper = AuthorScraper(http_client=self.client)
        else:
            self.author_scraper = None

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
            summary = self._extract_summary(soup)

            # Enrich author data if enabled and author ID is available
            if self.enrich_authors and self.author_scraper and author_info.shamela_author_id:
                logger.info(f"Enriching author data for author ID {author_info.shamela_author_id}")
                enriched_author = self.author_scraper.scrape_author(author_info.shamela_author_id)

                if enriched_author:
                    # Merge enriched data with book page data
                    # Book page data takes precedence for name and name components
                    # Author page provides biography and other works
                    author_info.biography = enriched_author.biography
                    author_info.other_works = enriched_author.other_works

                    # Use author page dates if book page didn't have them
                    if not author_info.birth_date_hijri:
                        author_info.birth_date_hijri = enriched_author.birth_date_hijri
                    if not author_info.death_date_hijri:
                        author_info.death_date_hijri = enriched_author.death_date_hijri
                    if not author_info.birth_date_gregorian:
                        author_info.birth_date_gregorian = enriched_author.birth_date_gregorian
                    if not author_info.death_date_gregorian:
                        author_info.death_date_gregorian = enriched_author.death_date_gregorian

                    logger.info(f"Successfully enriched author data")
                else:
                    logger.warning(f"Could not enrich author data for ID {author_info.shamela_author_id}")

            # Create metadata object
            metadata = BookMetadata(
                shamela_id=book_id,
                title=title,
                author=author_info,
                publication=publication,
                editorial=editorial,
                structure=structure,
                classification=classification,
                description=description,
                summary=summary
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

        # Extract birth and death dates from the "المؤلف:" section
        # Pattern: المؤلف: Name (510 هـ - 597 هـ)
        birth_date = None
        death_date = None

        # Look for date range pattern (birth - death)
        author_section_match = re.search(r'المؤلف:.*?\((\d+)\s*هـ\s*-\s*(\d+)\s*هـ\)', text)
        if author_section_match:
            birth_date = author_section_match.group(1)
            death_date = author_section_match.group(2)
        else:
            # Fallback to individual date extraction
            birth_date = extract_birth_date(text)
            death_date = extract_death_date(text)

        return Author(
            name=author_name,
            shamela_author_id=author_id,
            birth_date_hijri=birth_date,
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

        # Extract publisher (الناشر:) - stop at common delimiters
        pub_match = re.search(r'الناشر:\s*([^،\n]+?)(?:\s*(?:الطبعة|عدد|ترقيم)|،|$)', text)
        if pub_match:
            pub_text = pub_match.group(1).strip()
            # Split by dash if location included (format: "Publisher - Location")
            if ' - ' in pub_text or '،' in pub_text:
                # Try dash separator first
                if ' - ' in pub_text:
                    parts = pub_text.split(' - ', 1)
                    publisher = parts[0].strip()
                    if len(parts) > 1:
                        # Location might have more text, clean it
                        location_part = parts[1].strip()
                        # Stop at first field marker or comma
                        location = re.split(r'(?:الطبعة|عدد|ترقيم)', location_part)[0].strip()
                # Try comma separator
                elif '،' in pub_text:
                    parts = pub_text.split('،', 1)
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

        # Extract ISBN if available
        isbn = None
        isbn_match = re.search(r'ISBN:?\s*([\d-]+)', text, re.IGNORECASE)
        if isbn_match:
            isbn = isbn_match.group(1).strip()

        return Publication(
            publisher=publisher,
            location=location,
            edition=edition,
            year_hijri=year_hijri,
            year_gregorian=year_gregorian,
            isbn=isbn
        )

    def _extract_editorial_info(self, soup: BeautifulSoup) -> Editorial:
        """Extract editorial/scholarly information"""
        text = soup.get_text()

        editor = None
        doc_type = None
        institution = None
        supervisor = None

        # Extract editor/muhaqiq (تحقيق: or المحقق:)
        # Stop at common delimiters: newline, "الناشر:", "الطبعة:", or start of next field
        editor_match = re.search(r'(?:تحقيق|المحقق):\s*([^،\n]+?)(?:\s*(?:الناشر|الطبعة|عدد|ترقيم)|$)', text)
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

        # Extract verification status
        verification_status = None
        if 'محقق' in text or 'التحقيق' in text:
            verification_status = 'محقق'
        elif 'غير محقق' in text:
            verification_status = 'غير محقق'

        # Extract manuscript source
        manuscript_source = None
        ms_patterns = [
            r'نسخة خطية:\s*([^\n]+)',
            r'المخطوط:\s*([^\n]+)',
            r'من نسخة\s+([^\n،]+)'
        ]
        for pattern in ms_patterns:
            ms_match = re.search(pattern, text)
            if ms_match:
                manuscript_source = ms_match.group(1).strip()
                break

        return Editorial(
            editor=editor,
            type=doc_type,
            institution=institution,
            supervisor=supervisor,
            verification_status=verification_status,
            manuscript_source=manuscript_source
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
        keywords = []

        # Find category link (updated to use /category/ pattern)
        category_link = soup.find('a', href=re.compile(r'/category/\d+'))
        if category_link:
            category = category_link.get_text(strip=True)
            href = category_link.get('href', '')
            cat_match = re.search(r'/category/(\d+)', href)
            if cat_match:
                category_id = cat_match.group(1)

        # Extract keywords/tags if available
        # Look for meta keywords or structured tags
        text = soup.get_text()

        # Try to find keywords from the description or title
        # Use category as first keyword
        if category:
            keywords.append(category)

        # Extract common subject keywords from text
        # This is a simple extraction - can be improved
        subject_patterns = [
            r'(?:موضوع|مجال):\s*([^\n،]+)',
            r'(?:كلمات مفتاحية|الكلمات الدالة):\s*([^\n]+)'
        ]
        for pattern in subject_patterns:
            match = re.search(pattern, text)
            if match:
                tags = match.group(1).strip().split('،')
                keywords.extend([tag.strip() for tag in tags if tag.strip()])

        return Classification(
            category=category,
            category_id=category_id,
            keywords=keywords
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

    def _extract_summary(self, soup: BeautifulSoup) -> Optional[str]:
        """
        Extract book summary/description as plain text

        This extracts the text content from the book card (بطاقة الكتاب)

        Returns:
            Plain text summary or None if not found
        """
        try:
            # Get the book card content
            nass_container = soup.find('div', class_='nass')
            if not nass_container:
                return None

            # Extract text content, ignoring TOC
            text_parts = []

            # Get the book card section (before TOC)
            for element in nass_container.children:
                if hasattr(element, 'get') and element.get('class'):
                    # Stop at TOC section
                    if 'betaka-index' in element.get('class', []):
                        break

                # Extract text from this element
                if hasattr(element, 'get_text'):
                    text = element.get_text(strip=True)
                    if text:
                        text_parts.append(text)

            # Combine and clean
            if text_parts:
                summary = '\n'.join(text_parts)
                # Limit length to reasonable summary size
                if len(summary) > 1000:
                    summary = summary[:1000] + '...'
                return summary

            return None

        except Exception as e:
            logger.warning(f"Could not extract book summary: {e}")
            return None
