#!/usr/bin/env python3
"""
Parallel Camoufox crawler to enrich backup data with book overviews and author pages.

Scrapes:
1. Book overview pages (shamela.ws/book/{id}) - metadata, TOC, description
2. Author pages (shamela.ws/author/{id}) - biography, death dates, works list

Uses 10 parallel headed browsers with manual Cloudflare solving.

Usage:
    python3 scripts/enrich_backup_parallel.py \
        --backup-path /Volumes/KIOXIA/shamela-backup \
        --browsers 10 \
        --delay 0.5
"""

import asyncio
import argparse
import json
import logging
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple
from datetime import datetime
from bs4 import BeautifulSoup

from camoufox.async_api import AsyncCamoufox

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from shamela.schemas import (
    Author,
    Publication,
    Editorial,
    Structure,
    Classification,
    BookMetadata,
    TableOfContents,
    Volume,
    ChapterEntry
)
from shamela.utils import (
    extract_death_date,
    extract_birth_date,
    parse_author_name,
    extract_author_id_from_url,
    extract_book_id_from_url
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class ParallelEnrichmentCrawler:
    """Parallel crawler to enrich backup with book overviews and author pages"""

    def __init__(self, backup_path: Path, num_browsers: int = 10, delay: float = 0.5,
                 skip_existing: bool = False):
        self.backup_path = Path(backup_path)
        self.books_dir = self.backup_path / 'books'
        self.authors_dir = self.backup_path / 'authors'
        self.num_browsers = num_browsers
        self.delay = delay
        self.skip_existing = skip_existing
        self.base_url = "https://shamela.ws"

        # Statistics
        self.books_completed = 0
        self.books_failed = 0
        self.authors_completed = 0
        self.authors_failed = 0
        self.total_requests = 0
        self.lock = asyncio.Lock()

        # Validate backup path
        if not self.books_dir.exists():
            raise ValueError(f"Books directory not found: {self.books_dir}")

    def get_complete_book_ids(self) -> List[str]:
        """Scan backup for complete books"""
        complete_books = []

        for meta_file in self.books_dir.glob('*/book_*_meta.json'):
            try:
                with open(meta_file, 'r', encoding='utf-8') as f:
                    meta = json.load(f)
                if meta.get('status') == 'complete':
                    book_id = meta.get('book_id')
                    if book_id:
                        complete_books.append(str(book_id))
            except Exception as e:
                logger.warning(f"Error reading {meta_file}: {e}")

        return sorted(complete_books, key=lambda x: int(x) if x.isdigit() else 0)

    def get_unique_author_ids(self) -> Set[str]:
        """Extract unique author IDs from backup metadata"""
        author_ids = set()

        for meta_file in self.books_dir.glob('*/book_*_meta.json'):
            try:
                with open(meta_file, 'r', encoding='utf-8') as f:
                    meta = json.load(f)
                author_id = meta.get('author_id')
                if author_id:
                    author_ids.add(str(author_id))
            except Exception as e:
                logger.warning(f"Error reading {meta_file}: {e}")

        return author_ids

    def _save_html(self, filepath: Path, content: str):
        """Save HTML content to file"""
        filepath.parent.mkdir(parents=True, exist_ok=True)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

    def _save_json(self, filepath: Path, data: Dict):
        """Save JSON data to file"""
        filepath.parent.mkdir(parents=True, exist_ok=True)
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    # ===== Book Overview Parsing (adapted from metadata_scraper.py) =====

    def _extract_title(self, soup: BeautifulSoup) -> dict:
        """Extract book title"""
        title = {}
        title_elem = soup.find('h1') or soup.find('h2')
        if title_elem:
            title['arabic'] = title_elem.get_text(strip=True)
        else:
            text = soup.get_text()
            match = re.search(r'الكتاب:\s*([^\n]+)', text)
            if match:
                title['arabic'] = match.group(1).strip()
        return title

    def _extract_author_info(self, soup: BeautifulSoup) -> Author:
        """Extract author information"""
        text = soup.get_text()
        author_name = ""
        author_id = None

        author_link = soup.find('a', href=re.compile(r'/author/\d+'))
        if author_link:
            author_name = author_link.get_text(strip=True)
            author_id = extract_author_id_from_url(author_link.get('href', ''))
        else:
            match = re.search(r'المؤلف:\s*([^\n]+?)(?:\(|$)', text)
            if match:
                author_name = match.group(1).strip()

        name_components = parse_author_name(author_name)

        birth_date = None
        death_date = None
        author_section_match = re.search(r'المؤلف:.*?\((\d+)\s*هـ\s*-\s*(\d+)\s*هـ\)', text)
        if author_section_match:
            birth_date = author_section_match.group(1)
            death_date = author_section_match.group(2)
        else:
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

        pub_match = re.search(r'الناشر:\s*([^،\n]+?)(?:\s*(?:الطبعة|عدد|ترقيم)|،|$)', text)
        if pub_match:
            pub_text = pub_match.group(1).strip()
            if ' - ' in pub_text:
                parts = pub_text.split(' - ', 1)
                publisher = parts[0].strip()
                if len(parts) > 1:
                    location_part = parts[1].strip()
                    location = re.split(r'(?:الطبعة|عدد|ترقيم)', location_part)[0].strip()
            elif '،' in pub_text:
                parts = pub_text.split('،', 1)
                publisher = parts[0].strip()
                if len(parts) > 1:
                    location = parts[1].strip()
            else:
                publisher = pub_text

        edition_match = re.search(r'الطبعة:\s*([^\n،]+)', text)
        if edition_match:
            edition = edition_match.group(1).strip()

        hijri_match = re.search(r'(\d{4})\s*هـ', text)
        if hijri_match:
            year_hijri = hijri_match.group(1)

        greg_match = re.search(r'(\d{4})\s*م', text)
        if greg_match:
            year_gregorian = greg_match.group(1)

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

        editor_match = re.search(r'(?:تحقيق|المحقق):\s*([^،\n]+?)(?:\s*(?:الناشر|الطبعة|عدد|ترقيم)|$)', text)
        if editor_match:
            editor = editor_match.group(1).strip()

        if 'رسالة ماجستير' in text:
            doc_type = 'رسالة ماجستير'
        elif 'رسالة دكتوراه' in text or 'أطروحة دكتوراه' in text:
            doc_type = 'رسالة دكتوراه'
        elif 'بحث' in text:
            doc_type = 'بحث'

        inst_match = re.search(r'جامعة\s+[^\n،]+', text)
        if inst_match:
            institution = inst_match.group(0).strip()

        sup_match = re.search(r'(?:إشراف|المشرف):\s*([^\n]+)', text)
        if sup_match:
            supervisor = sup_match.group(1).strip()

        verification_status = None
        if 'محقق' in text or 'التحقيق' in text:
            verification_status = 'محقق'
        elif 'غير محقق' in text:
            verification_status = 'غير محقق'

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

        vol_match = re.search(r'عدد الأجزاء:\s*([٠-٩\d]+)', text)
        if vol_match:
            vol_num_str = vol_match.group(1)
            vol_num_str = vol_num_str.replace('٠', '0').replace('١', '1').replace('٢', '2')
            vol_num_str = vol_num_str.replace('٣', '3').replace('٤', '4').replace('٥', '5')
            vol_num_str = vol_num_str.replace('٦', '6').replace('٧', '7').replace('٨', '8')
            vol_num_str = vol_num_str.replace('٩', '9')
            try:
                total_volumes = int(vol_num_str)
            except ValueError:
                pass

        if 'ترقيم الكتاب موافق للمطبوع' in text:
            page_alignment = 'موافق للمطبوع'

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

        category_link = soup.find('a', href=re.compile(r'/category/\d+'))
        if category_link:
            category = category_link.get_text(strip=True)
            href = category_link.get('href', '')
            cat_match = re.search(r'/category/(\d+)', href)
            if cat_match:
                category_id = cat_match.group(1)

        if category:
            keywords.append(category)

        return Classification(
            category=category,
            category_id=category_id,
            keywords=keywords
        )

    def _extract_description(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract book description HTML"""
        try:
            nass_container = soup.find('div', class_='nass')
            if not nass_container:
                return None

            from copy import copy
            nass = copy(nass_container)

            for elem in nass.find_all(['button', 'input']):
                elem.decompose()
            for elem in nass.find_all('div', class_='text-left'):
                elem.decompose()
            for elem in nass.find_all('div', id='cont_srchBook'):
                elem.decompose()

            betaka_index = nass.find('div', class_='betaka-index')
            if betaka_index:
                for button in betaka_index.find_all('a', class_='exp_bu'):
                    button.decompose()

            return str(nass)
        except Exception as e:
            logger.warning(f"Could not extract book description: {e}")
            return None

    def _parse_toc_structure(self, toc_div) -> List[Volume]:
        """Parse hierarchical TOC structure"""
        volumes = []

        main_ul = toc_div.find('ul', class_='betaka-index')
        if not main_ul:
            main_ul = toc_div.find('ul')

        if not main_ul:
            return volumes

        for li in main_ul.find_all('li', recursive=False):
            strong = li.find('strong')
            if strong:
                volume_title = strong.get_text(strip=True)
                vol_num_match = re.search(r'(\d+)', volume_title)
                vol_num = int(vol_num_match.group(1)) if vol_num_match else len(volumes) + 1

                volume = Volume(number=vol_num, title=volume_title)

                nested_ul = li.find('ul')
                if nested_ul:
                    volume.chapters = self._parse_chapters(nested_ul)

                volumes.append(volume)
            else:
                if not volumes:
                    volumes.append(Volume(number=1, title='الجزء ١'))

                chapter = self._parse_chapter_entry(li)
                if chapter:
                    volumes[0].chapters.append(chapter)

        if not volumes:
            volumes.append(Volume(number=1, title='الجزء ١'))

        return volumes

    def _parse_chapters(self, ul_elem) -> List[ChapterEntry]:
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

        page_match = re.search(r'/book/\d+/(\d+)', href)
        page = int(page_match.group(1)) if page_match else 1

        subsections = []
        nested_ul = li_elem.find('ul')
        if nested_ul:
            subsections = self._parse_chapters(nested_ul)

        return ChapterEntry(
            title=title,
            page=page,
            subsections=subsections
        )

    def parse_book_overview(self, html_content: str, book_id: str) -> Tuple[Dict, Dict]:
        """Parse book overview HTML and return (metadata_dict, toc_dict)"""
        soup = BeautifulSoup(html_content, 'lxml')

        title = self._extract_title(soup)
        author = self._extract_author_info(soup)
        publication = self._extract_publication_info(soup)
        editorial = self._extract_editorial_info(soup)
        structure = self._extract_structure_info(soup)
        classification = self._extract_classification(soup)
        description = self._extract_description(soup)

        metadata = BookMetadata(
            shamela_id=book_id,
            title=title,
            author=author,
            publication=publication,
            editorial=editorial,
            structure=structure,
            classification=classification,
            description=description
        )

        # Parse TOC
        toc_div = soup.find('div', class_='betaka-index')
        if toc_div:
            volumes = self._parse_toc_structure(toc_div)
            toc = TableOfContents(volumes=volumes)
        else:
            toc = TableOfContents(volumes=[])

        return metadata.to_dict(), toc.to_dict()

    # ===== Author Page Parsing (adapted from author_scraper.py) =====

    def _extract_author_name(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract author name"""
        heading = soup.find('h1') or soup.find('h2')
        if heading:
            return heading.get_text(strip=True)

        title = soup.find('title')
        if title:
            title_text = title.get_text()
            name = re.sub(r'\s*-\s*المكتبة الشاملة.*', '', title_text)
            if name:
                return name.strip()
        return None

    def _extract_gregorian_death_date(self, text: str) -> Optional[str]:
        """Extract Gregorian death date"""
        compact_match = re.search(r'[\d٠-٩]+\s*-\s*[\d٠-٩]+\s*هـ\s*=\s*[\d٠-٩]+\s*-\s*([\d٠-٩]+)\s*م', text)
        if compact_match:
            return compact_match.group(1)

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
        """Extract Gregorian birth date"""
        compact_match = re.search(r'[\d٠-٩]+\s*-\s*[\d٠-٩]+\s*هـ\s*=\s*([\d٠-٩]+)\s*-\s*[\d٠-٩]+\s*م', text)
        if compact_match:
            return compact_match.group(1)

        patterns = [
            r'(?:ولد|ولادته|مولده).*?([\d٠-٩]{3,4})\s*(?:م|CE)',
            r'([\d٠-٩]{3,4})\s*(?:م|CE).*?(?:ولد|ولادته)'
        ]
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(1)
        return None

    def _extract_biography(self, soup: BeautifulSoup) -> Tuple[Optional[str], Optional[str]]:
        """Extract biography text and source citation"""
        text = soup.get_text()

        bio_match = re.search(
            r'تعريف بالمؤلف[:\s]+(.*?)$',
            text,
            re.MULTILINE | re.DOTALL
        )

        if bio_match:
            full_section = bio_match.group(1).strip()
            full_section = re.split(r'(?:×|البحث في|تنبيهات|افتراضيا)', full_section)[0].strip()

            lines = []
            for line in full_section.split('\n'):
                line = line.strip()
                if line and not line.startswith('نسخ الرابط') and not line.startswith('نشر ') and not line.startswith('فهرس الكتب'):
                    lines.append(line)

            full_bio = '\n'.join(lines)
            full_bio = re.sub(r'•\s*', '\n• ', full_bio)
            full_bio = re.sub(r'([\d٠-٩]+\s*م\))', r'\1\n', full_bio, count=1)
            full_bio = re.sub(r'(أبو\s+[\w\s]+)', r'\1\n', full_bio, count=1)
            full_bio = re.sub(r'(\.\)?)(_+)', r'\1\n\n\2', full_bio)
            full_bio = re.sub(r'(_+)\s*\(', r'\1\n(', full_bio)
            full_bio = re.sub(r'([^\.\n])\s*نقلا عن:', r'\1\n\nنقلا عن:', full_bio)
            full_bio = re.sub(r'\n{3,}', '\n\n', full_bio)
            full_bio = re.sub(r'\n+•', '\n•', full_bio)

            if len(full_bio) > 10000:
                full_bio = full_bio[:10000] + '...'

            return (full_bio if full_bio else None, None)

        return (None, None)

    def _extract_works_list(self, soup: BeautifulSoup) -> List[Dict]:
        """Extract list of author's works"""
        works = []
        book_links = soup.find_all('a', href=re.compile(r'/book/\d+'))

        for link in book_links:
            book_id = extract_book_id_from_url(link.get('href', ''))
            title = link.get_text(strip=True)

            if book_id and title:
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

        seen_ids = set()
        unique_works = []
        for work in works:
            if work['shamela_id'] not in seen_ids:
                seen_ids.add(work['shamela_id'])
                unique_works.append(work)

        return unique_works

    def parse_author_page(self, html_content: str, author_id: str) -> Dict:
        """Parse author page HTML and return author data dict"""
        soup = BeautifulSoup(html_content, 'lxml')

        name = self._extract_author_name(soup)
        if not name:
            name = f"Author {author_id}"

        name_components = parse_author_name(name)
        text = soup.get_text()

        death_date_hijri = extract_death_date(text)
        birth_date_hijri = extract_birth_date(text)
        death_date_greg = self._extract_gregorian_death_date(text)
        birth_date_greg = self._extract_gregorian_birth_date(text)
        biography, biography_source = self._extract_biography(soup)
        other_works = self._extract_works_list(soup)

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

        return author.to_dict()

    # ===== Browser and Crawling =====

    async def wait_for_cloudflare(self, page, browser_id: int, url: str) -> bool:
        """Wait for user to manually solve Cloudflare challenge"""
        print(f"\n{'='*60}")
        print(f"BROWSER {browser_id}: WAITING FOR CLOUDFLARE SOLVE")
        print(f"{'='*60}")
        print(f"Browser {browser_id}: Click the Cloudflare checkbox in the browser window")
        print(f"{'='*60}\n")

        max_wait = 180  # 3 minutes max
        elapsed = 0

        while elapsed < max_wait:
            await asyncio.sleep(2)
            elapsed += 2

            content = await page.content()

            # Check for actual book/author page content markers (not just domain name)
            # These elements only exist on real Shamela pages, not Cloudflare challenge
            has_book_content = any([
                'betaka' in content,           # Book card class
                'class="nass"' in content,     # Content div
                'بطاقة الكتاب' in content,      # Book card text
                'فهرس الموضوعات' in content,   # TOC text
                'تعريف بالمؤلف' in content,    # Author bio text
                'المؤلف:' in content,          # Author label
                'الناشر:' in content,          # Publisher label
            ])

            if has_book_content:
                print(f"Browser {browser_id}: Challenge solved! (detected page content)")
                await asyncio.sleep(1)
                return True

            # Still on challenge page
            if 'Just a moment' in content or 'challenges.cloudflare.com' in content:
                if elapsed % 10 == 0:
                    print(f"Browser {browser_id}: Still waiting... ({elapsed}s)")
                continue

        print(f"Browser {browser_id}: Timeout waiting for challenge")
        return False

    async def scrape_book_overview(self, book_id: str, page, browser_id: int) -> bool:
        """Scrape and save book overview page"""
        book_dir = self.books_dir / book_id
        overview_html_file = book_dir / f'book_{book_id}_overview.html'
        overview_json_file = book_dir / f'book_{book_id}_overview.json'
        toc_json_file = book_dir / f'book_{book_id}_toc.json'

        # Skip if already exists
        if self.skip_existing and overview_json_file.exists():
            logger.debug(f"[Browser {browser_id}] [Book {book_id}] Overview exists, skipping")
            async with self.lock:
                self.books_completed += 1
            return True

        url = f"{self.base_url}/book/{book_id}"

        try:
            await asyncio.sleep(self.delay)
            await page.goto(url, timeout=30000, wait_until='domcontentloaded')

            async with self.lock:
                self.total_requests += 1

            content = await page.content()

            # Check for Cloudflare
            if 'Just a moment' in content or 'challenges.cloudflare.com' in content:
                solved = await self.wait_for_cloudflare(page, browser_id, url)
                if not solved:
                    logger.error(f"[Browser {browser_id}] [Book {book_id}] Challenge not solved")
                    async with self.lock:
                        self.books_failed += 1
                    return False
                content = await page.content()

            # Check for valid content - must have actual book markers
            is_valid = any([
                'betaka' in content,
                'class="nass"' in content,
                'بطاقة الكتاب' in content,
                'المؤلف:' in content,
            ])

            if not is_valid or len(content) < 1000:
                logger.warning(f"[Browser {browser_id}] [Book {book_id}] Invalid response (no book content)")
                async with self.lock:
                    self.books_failed += 1
                return False

            # Save raw HTML
            self._save_html(overview_html_file, content)

            # Parse and save structured data
            metadata_dict, toc_dict = self.parse_book_overview(content, book_id)
            self._save_json(overview_json_file, metadata_dict)
            self._save_json(toc_json_file, toc_dict)

            logger.info(f"[Browser {browser_id}] [Book {book_id}] Overview saved")

            async with self.lock:
                self.books_completed += 1

            return True

        except Exception as e:
            logger.error(f"[Browser {browser_id}] [Book {book_id}] Error: {e}")
            async with self.lock:
                self.books_failed += 1
            return False

    async def scrape_author_page(self, author_id: str, page, browser_id: int) -> bool:
        """Scrape and save author page"""
        author_dir = self.authors_dir / author_id
        author_html_file = author_dir / f'author_{author_id}_page.html'
        author_json_file = author_dir / f'author_{author_id}_data.json'

        # Skip if already exists
        if self.skip_existing and author_json_file.exists():
            logger.debug(f"[Browser {browser_id}] [Author {author_id}] Page exists, skipping")
            async with self.lock:
                self.authors_completed += 1
            return True

        url = f"{self.base_url}/author/{author_id}"

        try:
            await asyncio.sleep(self.delay)
            await page.goto(url, timeout=30000, wait_until='domcontentloaded')

            async with self.lock:
                self.total_requests += 1

            content = await page.content()

            # Check for Cloudflare
            if 'Just a moment' in content or 'challenges.cloudflare.com' in content:
                solved = await self.wait_for_cloudflare(page, browser_id, url)
                if not solved:
                    logger.error(f"[Browser {browser_id}] [Author {author_id}] Challenge not solved")
                    async with self.lock:
                        self.authors_failed += 1
                    return False
                content = await page.content()

            # Check for valid content - must have actual author page markers
            is_valid = any([
                'تعريف بالمؤلف' in content,    # Author bio section
                'كتب المؤلف' in content,       # Author's books
                'مؤلفاته' in content,          # His works
            ])

            if not is_valid or len(content) < 1000:
                logger.warning(f"[Browser {browser_id}] [Author {author_id}] Invalid response (no author content)")
                async with self.lock:
                    self.authors_failed += 1
                return False

            # Save raw HTML
            self._save_html(author_html_file, content)

            # Parse and save structured data
            author_dict = self.parse_author_page(content, author_id)
            self._save_json(author_json_file, author_dict)

            logger.info(f"[Browser {browser_id}] [Author {author_id}] Page saved ({author_dict.get('name', 'Unknown')})")

            async with self.lock:
                self.authors_completed += 1

            return True

        except Exception as e:
            logger.error(f"[Browser {browser_id}] [Author {author_id}] Error: {e}")
            async with self.lock:
                self.authors_failed += 1
            return False

    async def browser_worker(self, browser_id: int, book_queue: asyncio.Queue,
                             author_queue: asyncio.Queue):
        """Worker that processes both book and author queues"""
        logger.info(f"[Browser {browser_id}] Starting browser...")

        async with AsyncCamoufox(
            headless=False,
            humanize=True
        ) as browser:
            logger.info(f"[Browser {browser_id}] Browser launched")

            page = await browser.new_page()
            logger.info(f"[Browser {browser_id}] Page created")

            # Process book queue first
            while True:
                try:
                    book_id = await asyncio.wait_for(book_queue.get(), timeout=0.5)
                    if book_id is None:
                        break
                    await self.scrape_book_overview(book_id, page, browser_id)
                    book_queue.task_done()
                except asyncio.TimeoutError:
                    if book_queue.empty():
                        break
                    continue
                except Exception as e:
                    logger.error(f"[Browser {browser_id}] Book worker error: {e}")
                    continue

            logger.info(f"[Browser {browser_id}] Finished books, starting authors...")

            # Process author queue
            while True:
                try:
                    author_id = await asyncio.wait_for(author_queue.get(), timeout=0.5)
                    if author_id is None:
                        break
                    await self.scrape_author_page(author_id, page, browser_id)
                    author_queue.task_done()
                except asyncio.TimeoutError:
                    if author_queue.empty():
                        break
                    continue
                except Exception as e:
                    logger.error(f"[Browser {browser_id}] Author worker error: {e}")
                    continue

            await page.close()

        logger.info(f"[Browser {browser_id}] Browser closed")

    async def run_enrichment(self, books_only: bool = False, authors_only: bool = False):
        """Main entry point for enrichment"""
        # Create authors directory
        self.authors_dir.mkdir(parents=True, exist_ok=True)

        # Collect work items
        book_ids = [] if authors_only else self.get_complete_book_ids()
        author_ids = set() if books_only else self.get_unique_author_ids()

        print(f"\n{'='*60}")
        print(f"Parallel Enrichment Crawler")
        print(f"{'='*60}")
        print(f"Backup path: {self.backup_path}")
        print(f"Browsers: {self.num_browsers}")
        print(f"Delay: {self.delay}s")
        print(f"Skip existing: {self.skip_existing}")
        print(f"Books to scrape: {len(book_ids)}")
        print(f"Authors to scrape: {len(author_ids)}")
        print(f"{'='*60}\n")

        # Create queues
        book_queue = asyncio.Queue()
        author_queue = asyncio.Queue()

        for book_id in book_ids:
            await book_queue.put(book_id)

        for author_id in sorted(author_ids, key=lambda x: int(x) if x.isdigit() else 0):
            await author_queue.put(author_id)

        # Launch workers
        logger.info(f"Launching {self.num_browsers} browser workers...\n")

        workers = [
            asyncio.create_task(self.browser_worker(i, book_queue, author_queue))
            for i in range(self.num_browsers)
        ]

        # Wait for queues to be processed
        await book_queue.join()
        await author_queue.join()

        # Send poison pills
        for _ in range(self.num_browsers):
            await book_queue.put(None)
            await author_queue.put(None)

        # Wait for workers to finish
        await asyncio.gather(*workers)

        print(f"\n{'='*60}")
        print(f"Enrichment Complete!")
        print(f"{'='*60}")
        print(f"Books completed: {self.books_completed}")
        print(f"Books failed: {self.books_failed}")
        print(f"Authors completed: {self.authors_completed}")
        print(f"Authors failed: {self.authors_failed}")
        print(f"Total requests: {self.total_requests}")
        print(f"{'='*60}")


def dry_run(backup_path: Path, skip_existing: bool = False):
    """Show what would be scraped without executing"""
    crawler = ParallelEnrichmentCrawler(backup_path, skip_existing=skip_existing)

    book_ids = crawler.get_complete_book_ids()
    author_ids = crawler.get_unique_author_ids()

    # Count existing
    books_with_overview = 0
    for book_id in book_ids:
        if (crawler.books_dir / book_id / f'book_{book_id}_overview.json').exists():
            books_with_overview += 1

    authors_with_data = 0
    for author_id in author_ids:
        if (crawler.authors_dir / author_id / f'author_{author_id}_data.json').exists():
            authors_with_data += 1

    print(f"\n{'='*60}")
    print(f"DRY RUN - Enrichment Plan")
    print(f"{'='*60}")
    print(f"Backup path: {backup_path}")
    print(f"\nBooks:")
    print(f"  Complete books in backup: {len(book_ids)}")
    print(f"  Already have overview: {books_with_overview}")
    print(f"  Need to scrape: {len(book_ids) - books_with_overview if skip_existing else len(book_ids)}")
    print(f"\nAuthors:")
    print(f"  Unique authors: {len(author_ids)}")
    print(f"  Already have data: {authors_with_data}")
    print(f"  Need to scrape: {len(author_ids) - authors_with_data if skip_existing else len(author_ids)}")
    print(f"\nTotal pages to scrape: {(len(book_ids) - books_with_overview if skip_existing else len(book_ids)) + (len(author_ids) - authors_with_data if skip_existing else len(author_ids))}")
    print(f"{'='*60}")


async def main_async(args):
    """Async main function"""
    crawler = ParallelEnrichmentCrawler(
        backup_path=args.backup_path,
        num_browsers=args.browsers,
        delay=args.delay,
        skip_existing=args.skip_existing
    )
    await crawler.run_enrichment(
        books_only=args.books_only,
        authors_only=args.authors_only
    )


def main():
    parser = argparse.ArgumentParser(
        description='Enrich backup data with book overviews and author pages',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
    # Dry run
    python3 scripts/enrich_backup_parallel.py \\
        --backup-path /Volumes/KIOXIA/shamela-backup \\
        --dry-run

    # Run with 10 browsers
    python3 scripts/enrich_backup_parallel.py \\
        --backup-path /Volumes/KIOXIA/shamela-backup \\
        --browsers 10 \\
        --delay 0.5

    # Only scrape missing data
    python3 scripts/enrich_backup_parallel.py \\
        --backup-path /Volumes/KIOXIA/shamela-backup \\
        --skip-existing
        '''
    )

    parser.add_argument(
        '--backup-path',
        required=True,
        help='Path to backup directory (e.g., /Volumes/KIOXIA/shamela-backup)'
    )
    parser.add_argument(
        '--browsers',
        type=int,
        default=10,
        help='Number of parallel browsers (default: 10)'
    )
    parser.add_argument(
        '--delay',
        type=float,
        default=0.5,
        help='Delay between requests per browser (default: 0.5s)'
    )
    parser.add_argument(
        '--skip-existing',
        action='store_true',
        help='Skip books/authors that already have enriched data'
    )
    parser.add_argument(
        '--books-only',
        action='store_true',
        help='Only scrape book overviews, skip authors'
    )
    parser.add_argument(
        '--authors-only',
        action='store_true',
        help='Only scrape author pages, skip books'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be scraped without executing'
    )

    args = parser.parse_args()

    backup_path = Path(args.backup_path)
    if not backup_path.exists():
        logger.error(f"Backup path not found: {backup_path}")
        sys.exit(1)

    if args.dry_run:
        dry_run(backup_path, args.skip_existing)
    else:
        asyncio.run(main_async(args))


if __name__ == '__main__':
    main()
