"""
Utility functions for Shamela scraping
"""

import time
import re
import requests
from bs4 import BeautifulSoup
from typing import Optional, List
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class ShamelaHTTPClient:
    """HTTP client with rate limiting and retry logic with exponential backoff"""

    def __init__(self, delay: float = 1.5, max_retries: int = 5, max_backoff: float = 30.0):
        """
        Initialize HTTP client

        Args:
            delay: Delay in seconds between requests
            max_retries: Maximum number of retries on failure (default: 5)
            max_backoff: Maximum backoff time in seconds (default: 30.0)
        """
        self.delay = delay
        self.max_retries = max_retries
        self.max_backoff = max_backoff
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })
        self.last_request_time = 0

    def get(self, url: str, is_404_expected: bool = False) -> Optional[BeautifulSoup]:
        """
        Get URL with rate limiting and exponential backoff retry logic

        Args:
            url: URL to fetch
            is_404_expected: If True, don't retry on 404 errors (used for page detection)

        Returns:
            BeautifulSoup object or None on failure
        """
        for attempt in range(self.max_retries):
            try:
                # Rate limiting
                elapsed = time.time() - self.last_request_time
                if elapsed < self.delay:
                    time.sleep(self.delay - elapsed)

                logger.debug(f"Fetching: {url} (attempt {attempt + 1}/{self.max_retries})")
                response = self.session.get(url, timeout=30)
                self.last_request_time = time.time()

                # Handle 404s specially - don't retry if expected (end of book detection)
                if response.status_code == 404:
                    if is_404_expected:
                        logger.debug(f"Got expected 404 for {url}")
                        return None
                    else:
                        logger.warning(f"Got unexpected 404 for {url}")
                        response.raise_for_status()

                response.raise_for_status()
                return BeautifulSoup(response.content, 'lxml')

            except requests.exceptions.Timeout as e:
                logger.warning(f"Timeout fetching {url}: {e}")
                if attempt == self.max_retries - 1:
                    logger.error(f"Failed to fetch {url} after {self.max_retries} timeout attempts")
                    return None
                # Exponential backoff with cap
                backoff = min(self.delay * (2 ** attempt), self.max_backoff)
                logger.info(f"Retrying after {backoff:.1f}s backoff...")
                time.sleep(backoff)

            except requests.exceptions.ConnectionError as e:
                logger.warning(f"Connection error fetching {url}: {e}")
                if attempt == self.max_retries - 1:
                    logger.error(f"Failed to fetch {url} after {self.max_retries} connection attempts")
                    return None
                # Exponential backoff with cap
                backoff = min(self.delay * (2 ** attempt), self.max_backoff)
                logger.info(f"Retrying after {backoff:.1f}s backoff...")
                time.sleep(backoff)

            except requests.exceptions.HTTPError as e:
                # Don't retry on client errors (4xx) except 404 which we handle above
                if 400 <= e.response.status_code < 500 and e.response.status_code != 404:
                    logger.error(f"Client error {e.response.status_code} for {url}: {e}")
                    return None

                logger.warning(f"HTTP error fetching {url}: {e}")
                if attempt == self.max_retries - 1:
                    logger.error(f"Failed to fetch {url} after {self.max_retries} attempts")
                    return None
                # Exponential backoff with cap
                backoff = min(self.delay * (2 ** attempt), self.max_backoff)
                logger.info(f"Retrying after {backoff:.1f}s backoff...")
                time.sleep(backoff)

            except requests.exceptions.RequestException as e:
                logger.warning(f"Request failed for {url}: {e}")
                if attempt == self.max_retries - 1:
                    logger.error(f"Failed to fetch {url} after {self.max_retries} attempts")
                    return None
                # Exponential backoff with cap
                backoff = min(self.delay * (2 ** attempt), self.max_backoff)
                logger.info(f"Retrying after {backoff:.1f}s backoff...")
                time.sleep(backoff)

        return None


def extract_text_from_metadata(text: str, pattern: str) -> Optional[str]:
    """
    Extract metadata value using regex pattern

    Args:
        text: Text to search in
        pattern: Regex pattern with one capture group

    Returns:
        Extracted text or None
    """
    match = re.search(pattern, text, re.MULTILINE)
    if match:
        return match.group(1).strip()
    return None


def extract_death_date(text: str) -> Optional[str]:
    """
    Extract death date from text (format: ت XXXهـ or المتوفى: XXXهـ)

    Args:
        text: Text containing death date

    Returns:
        Death date in Hijri (numeric string) or None
    """
    patterns = [
        r'ت\s*[:]?\s*(\d+)\s*هـ',
        r'المتوفى[:]?\s*(\d+)\s*هـ',
        r'وفاته[:]?\s*(\d+)\s*هـ'
    ]

    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(1)

    return None


def extract_birth_date(text: str) -> Optional[str]:
    """
    Extract birth date from text (format: ولد XXXهـ or من مواليد عام XXXهـ)

    Args:
        text: Text containing birth date

    Returns:
        Birth date in Hijri (numeric string) or None
    """
    # Try compact format first: (508 - 597 هـ = 1114 - 1201 م)
    compact_match = re.search(r'\(?([\d٠-٩]+)\s*-\s*[\d٠-٩]+\s*هـ\s*=', text)
    if compact_match:
        return compact_match.group(1)

    patterns = [
        r'ولد\s+(?:عام|سنة)?\s*([\d٠-٩]+)\s*هـ',
        r'من مواليد عام\s+([\d٠-٩]+)\s*هـ',
        r'ولادته[:]?\s*([\d٠-٩]+)\s*هـ'
    ]

    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(1)

    return None


def parse_author_name(full_name: str) -> dict:
    """
    Parse Arabic author name into components

    Args:
        full_name: Full author name (e.g., "يحيى بن علي بن محمد الشيباني التبريزي، أبو زكريا")

    Returns:
        Dict with keys: kunya, nasab, nisba
    """
    components = {
        'kunya': None,
        'nasab': None,
        'nisba': None
    }

    # Extract kunya (أبو/أم followed by name)
    kunya_match = re.search(r'([أا]بو\s+\w+|[أا]م\s+\w+)', full_name)
    if kunya_match:
        components['kunya'] = kunya_match.group(1).strip()

    # Extract nasab (chain of "بن")
    nasab_match = re.search(r'((?:\w+\s+)?بن\s+\w+(?:\s+بن\s+\w+)*)', full_name)
    if nasab_match:
        components['nasab'] = nasab_match.group(1).strip()

    # Extract nisba (al-X pattern at end, but not kunya)
    # Remove kunya first to avoid confusion
    name_without_kunya = re.sub(r'،?\s*[أا]بو\s+\w+|،?\s*[أا]م\s+\w+', '', full_name)
    nisba_match = re.search(r'ال\w+(?:\s+ال\w+)*', name_without_kunya)
    if nisba_match:
        components['nisba'] = nisba_match.group(0).strip()

    return components


def detect_content_type(text: str) -> dict:
    """
    Detect content type (poetry, hadith, Quran) from text

    Args:
        text: Text content to analyze

    Returns:
        Dict with boolean flags for content types
    """
    return {
        'has_poetry': bool(re.search(r'\d+\s*-\s*.+\s*\.{3}', text)),  # Numbered verses
        'has_hadith': bool(re.search(r'[«»]', text)),  # Guillemets for hadith
        'has_quran': bool(re.search(r'[﴿﴾]', text)),  # Quran ornamental brackets
        'has_dialogue': bool(re.search(r'قال|قلت|فقال', text))  # Dialogue markers
    }


def separate_footnotes(content: str) -> tuple:
    """
    Separate main content from footnotes

    Args:
        content: Page content with potential footnotes

    Returns:
        Tuple of (main_content, footnotes_list)
    """
    footnotes = []

    # Look for footnote separator patterns
    separators = [
        r'\n\s*\*\s*\*\s*\*\s*\n',  # * * *
        r'\n\s*__+\s*\n',            # ______
        r'\n\s*-{3,}\s*\n'           # ---
    ]

    split_content = content
    separator_pos = -1

    for sep_pattern in separators:
        match = re.search(sep_pattern, content)
        if match:
            separator_pos = match.start()
            break

    if separator_pos > -1:
        main_content = content[:separator_pos].strip()
        footnotes_section = content[separator_pos:].strip()

        # Extract individual footnotes (format: (١) text)
        footnote_pattern = r'\(([٠-٩\d]+)\)\s*([^()]+?)(?=\(\d+\)|$)'
        for match in re.finditer(footnote_pattern, footnotes_section, re.DOTALL):
            marker = match.group(1)
            text = match.group(2).strip()
            footnotes.append({'marker': f'({marker})', 'content': text})
    else:
        main_content = content

    return main_content, footnotes


def extract_printed_page_numbers(text: str) -> List[int]:
    """
    Extract actual printed page numbers from [ص: XX] markers in the text

    Args:
        text: Text containing page markers

    Returns:
        List of page numbers found (may be empty if no markers)

    Example:
        >>> extract_printed_page_numbers("Some text [ص: 42] more text [ص: 43]")
        [42, 43]
    """
    matches = re.findall(r'\[ص:\s*(\d+)\]', text)
    return [int(num) for num in matches]


def clean_arabic_text(text: str, preserve_paragraphs: bool = False) -> str:
    """
    Clean Arabic text (normalize whitespace, remove excess marks)

    Args:
        text: Text to clean
        preserve_paragraphs: If True, preserve paragraph breaks (double newlines)

    Returns:
        Cleaned text
    """
    # NOTE: Page number markers are now extracted before cleaning (see extract_printed_page_numbers)
    # Remove page number markers that might be embedded
    text = re.sub(r'\[ص:\s*\d+\]', '', text)

    if preserve_paragraphs:
        # Preserve paragraph breaks but clean within paragraphs
        # Split by double newlines (paragraph separator)
        paragraphs = text.split('\n\n')

        # Clean each paragraph individually
        cleaned_paragraphs = []
        for para in paragraphs:
            # Normalize whitespace within paragraph (but not between paragraphs)
            para = re.sub(r'[ \t]+', ' ', para)  # Multiple spaces/tabs → single space
            para = re.sub(r'\n[ \t]*', '\n', para)  # Remove spaces at start of lines
            para = para.strip()
            if para:  # Only include non-empty paragraphs
                cleaned_paragraphs.append(para)

        # Join with double newlines
        return '\n\n'.join(cleaned_paragraphs)
    else:
        # Original behavior: collapse all whitespace
        text = re.sub(r'\s+', ' ', text)
        text = re.sub(r'\n\s*\n\s*\n+', '\n\n', text)
        return text.strip()


def extract_page_number_from_url(url: str) -> Optional[int]:
    """
    Extract page number from Shamela URL

    Args:
        url: URL like https://shamela.ws/book/6907/42

    Returns:
        Page number or None
    """
    match = re.search(r'/book/\d+/(\d+)', url)
    if match:
        return int(match.group(1))
    return None


def extract_book_id_from_url(url: str) -> Optional[str]:
    """
    Extract book ID from Shamela URL

    Args:
        url: URL like https://shamela.ws/book/6907 or https://shamela.ws/book/6907/42

    Returns:
        Book ID or None
    """
    match = re.search(r'/book/(\d+)', url)
    if match:
        return match.group(1)
    return None


def extract_author_id_from_url(url: str) -> Optional[str]:
    """
    Extract author ID from Shamela URL

    Args:
        url: URL like https://shamela.ws/author/1759

    Returns:
        Author ID or None
    """
    match = re.search(r'/author/(\d+)', url)
    if match:
        return match.group(1)
    return None
