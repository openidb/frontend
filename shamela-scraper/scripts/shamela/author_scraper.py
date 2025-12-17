"""
Author scraper for Shamela author pages
"""

import re
import logging
from bs4 import BeautifulSoup
from typing import Optional
from .schemas import Author
from .utils import (
    ShamelaHTTPClient,
    extract_death_date,
    extract_birth_date,
    parse_author_name,
    extract_book_id_from_url
)

logger = logging.getLogger(__name__)


class AuthorScraper:
    """Scraper for author biographical information from Shamela author pages"""

    def __init__(self, http_client: Optional[ShamelaHTTPClient] = None):
        """
        Initialize author scraper

        Args:
            http_client: HTTP client for requests (creates new one if None)
        """
        self.client = http_client or ShamelaHTTPClient()

    def scrape_author(self, author_id: str) -> Optional[Author]:
        """
        Scrape complete author information

        Args:
            author_id: Shamela author ID

        Returns:
            Author object or None on failure
        """
        url = f"https://shamela.ws/author/{author_id}"
        soup = self.client.get(url)

        if not soup:
            logger.error(f"Failed to fetch author page for ID {author_id}")
            return None

        try:
            # Extract author name
            name = self._extract_name(soup)
            if not name:
                logger.error(f"Could not extract author name for ID {author_id}")
                return None

            # Parse name components
            name_components = parse_author_name(name)

            # Extract biographical data
            text = soup.get_text()
            death_date_hijri = extract_death_date(text)
            birth_date_hijri = extract_birth_date(text)

            # Extract Gregorian dates if available
            death_date_greg = self._extract_gregorian_death_date(text)
            birth_date_greg = self._extract_gregorian_birth_date(text)

            # Extract biography text and source citation
            biography, biography_source = self._extract_biography(soup)

            # Extract list of works
            other_works = self._extract_works_list(soup)

            # Create author object
            author = Author(
                name=name,
                shamela_author_id=author_id,
                death_date_hijri=death_date_hijri,
                birth_date_hijri=birth_date_hijri,
                death_date_gregorian=death_date_greg,
                birth_date_gregorian=birth_date_greg,
                biography=biography,
                biography_source=biography_source,
                other_works=other_works,
                **name_components
            )

            logger.info(f"Successfully scraped author {author_id}: {name}")
            return author

        except Exception as e:
            logger.error(f"Error scraping author {author_id}: {e}", exc_info=True)
            return None

    def _extract_name(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract author name"""
        # Try h1 or h2 heading
        heading = soup.find('h1') or soup.find('h2')
        if heading:
            return heading.get_text(strip=True)

        # Try to find in page title
        title = soup.find('title')
        if title:
            title_text = title.get_text()
            # Remove "Shamela" or site name
            name = re.sub(r'\s*-\s*المكتبة الشاملة.*', '', title_text)
            if name:
                return name.strip()

        return None

    def _extract_gregorian_death_date(self, text: str) -> Optional[str]:
        """Extract Gregorian death date (format: 1109 CE or 1109م)"""
        # Try the compact format first: (508 - 597 هـ = 1114 - 1201 م)
        compact_match = re.search(r'[\d٠-٩]+\s*-\s*[\d٠-٩]+\s*هـ\s*=\s*[\d٠-٩]+\s*-\s*([\d٠-٩]+)\s*م', text)
        if compact_match:
            return compact_match.group(1)

        # Fallback patterns
        patterns = [
            r'(?:وفاته|توفي|المتوفى).*?([\d٠-٩]{3,4})\s*(?:م|CE)',
            r'([\d٠-٩]{3,4})\s*(?:م|CE).*?(?:وفاته|توفي)'
        ]

        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(1)

        return None

    def _extract_gregorian_birth_date(self, text: str) -> Optional[str]:
        """Extract Gregorian birth date (format: 1030 CE or 1030م)"""
        # Try the compact format first: (508 - 597 هـ = 1114 - 1201 م)
        compact_match = re.search(r'[\d٠-٩]+\s*-\s*[\d٠-٩]+\s*هـ\s*=\s*([\d٠-٩]+)\s*-\s*[\d٠-٩]+\s*م', text)
        if compact_match:
            return compact_match.group(1)

        # Fallback patterns
        patterns = [
            r'(?:ولد|ولادته|مولده).*?([\d٠-٩]{3,4})\s*(?:م|CE)',
            r'([\d٠-٩]{3,4})\s*(?:م|CE).*?(?:ولد|ولادته)'
        ]

        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(1)

        return None

    def _extract_biography(self, soup: BeautifulSoup) -> tuple[Optional[str], Optional[str]]:
        """
        Extract biography text and source citation from author page

        Looks for the "تعريف بالمؤلف" (Author Introduction) section
        which contains biographical information on Shamela author pages

        Returns:
            Tuple of (biography_text, source_citation)
        """
        text = soup.get_text()

        # Primary: Look for "تعريف بالمؤلف" section
        # Pattern: Extract everything after this heading until end
        # Note: There may not be a newline after the heading, just spaces
        bio_match = re.search(
            r'تعريف بالمؤلف[:\s]+(.*?)$',
            text,
            re.MULTILINE | re.DOTALL
        )

        if bio_match:
            full_section = bio_match.group(1).strip()

            # Remove navigation/search UI elements from the end
            full_section = re.split(r'(?:×|البحث في|تنبيهات|افتراضيا)', full_section)[0].strip()

            biography_text = full_section
            source_citation = None

            # Clean up the biography text (including footer)
            lines = []
            for line in biography_text.split('\n'):
                line = line.strip()
                # Skip empty lines, navigation elements, and table of contents markers
                if line and not line.startswith('نسخ الرابط') and not line.startswith('نشر ') and not line.startswith('فهرس الكتب'):
                    lines.append(line)

            # Join lines
            full_bio = '\n'.join(lines)

            # Add formatting: insert newlines after bullet points and section breaks
            # Replace bullet points with newline + bullet for better readability
            full_bio = re.sub(r'•\s*', '\n• ', full_bio)

            # Add newlines after main header line (dates line)
            full_bio = re.sub(r'([\d٠-٩]+\s*م\))', r'\1\n', full_bio, count=1)

            # Add spacing after main name/title line
            full_bio = re.sub(r'(أبو\s+[\w\s]+)', r'\1\n', full_bio, count=1)

            # Format the footer section (if present)
            # Add newlines before and after the separator line
            full_bio = re.sub(r'(\.\)?)(_+)', r'\1\n\n\2', full_bio)
            full_bio = re.sub(r'(_+)\s*\(', r'\1\n(', full_bio)

            # Add spacing before the citation line
            full_bio = re.sub(r'([^\.\n])\s*نقلا عن:', r'\1\n\nنقلا عن:', full_bio)

            # Clean up multiple consecutive newlines
            full_bio = re.sub(r'\n{3,}', '\n\n', full_bio)

            # Clean up leading newlines on bullets
            full_bio = re.sub(r'\n+•', '\n•', full_bio)

            # Limit biography length (increased to 10000 chars to capture full biographies)
            if len(full_bio) > 10000:
                full_bio = full_bio[:10000] + '...'

            return (full_bio if full_bio else None, source_citation)

        # Fallback: Look for other common biography section headings
        fallback_patterns = [
            r'(?:نبذة عن المؤلف|ترجمة المؤلف|السيرة الذاتية)[:\s]*\n(.*?)$',
            r'(?:نبذة|ترجمة|السيرة|حياته)[:\s]*\n(.*?)$'
        ]

        for pattern in fallback_patterns:
            match = re.search(pattern, text, re.MULTILINE | re.DOTALL)
            if match:
                bio_text = match.group(1).strip()
                lines = [line.strip() for line in bio_text.split('\n')[:30] if line.strip()]
                return ('\n'.join(lines) if lines else None, None)

        return (None, None)

    def _extract_works_list(self, soup: BeautifulSoup) -> list:
        """Extract list of author's works"""
        works = []

        # Look for links to books
        book_links = soup.find_all('a', href=re.compile(r'/book/\d+'))

        for link in book_links:
            book_id = extract_book_id_from_url(link.get('href', ''))
            title = link.get_text(strip=True)

            if book_id and title:
                # Try to extract volume count if mentioned
                parent_text = link.parent.get_text() if link.parent else ''
                volume_match = re.search(r'(\d+)\s*(?:جزء|مجلد)', parent_text)
                volume_count = volume_match.group(1) if volume_match else None

                work_entry = {
                    'shamela_id': book_id,
                    'title': title
                }

                if volume_count:
                    work_entry['volumes'] = volume_count

                works.append(work_entry)

        # Remove duplicates (same book ID)
        seen_ids = set()
        unique_works = []
        for work in works:
            if work['shamela_id'] not in seen_ids:
                seen_ids.add(work['shamela_id'])
                unique_works.append(work)

        logger.info(f"Found {len(unique_works)} works for this author")
        return unique_works

    def enrich_author(self, author: Author) -> Author:
        """
        Enrich author object with data from author page

        Args:
            author: Author object (possibly with minimal info)

        Returns:
            Enriched Author object
        """
        if not author.shamela_author_id:
            logger.warning("Cannot enrich author without shamela_author_id")
            return author

        full_author = self.scrape_author(author.shamela_author_id)
        if not full_author:
            logger.warning(f"Failed to enrich author {author.shamela_author_id}")
            return author

        # Merge data, preferring scraped data when available
        return Author(
            name=full_author.name or author.name,
            shamela_author_id=author.shamela_author_id,
            death_date_hijri=full_author.death_date_hijri or author.death_date_hijri,
            birth_date_hijri=full_author.birth_date_hijri or author.birth_date_hijri,
            death_date_gregorian=full_author.death_date_gregorian or author.death_date_gregorian,
            birth_date_gregorian=full_author.birth_date_gregorian or author.birth_date_gregorian,
            kunya=full_author.kunya or author.kunya,
            nasab=full_author.nasab or author.nasab,
            nisba=full_author.nisba or author.nisba,
            laqab=full_author.laqab or author.laqab,
            biography=full_author.biography or author.biography,
            other_works=full_author.other_works or author.other_works
        )
