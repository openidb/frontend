"""
Shamela scraper package
"""

from .schemas import (
    BookMetadata,
    Author,
    Publication,
    Editorial,
    Structure,
    Classification,
    TableOfContents,
    Volume,
    ChapterEntry,
    PageContent,
    Footnote,
    FormattingHints
)

from .utils import (
    ShamelaHTTPClient,
    extract_text_from_metadata,
    extract_death_date,
    extract_birth_date,
    parse_author_name,
    detect_content_type,
    separate_footnotes,
    clean_arabic_text,
    extract_page_number_from_url,
    extract_book_id_from_url,
    extract_author_id_from_url
)

__all__ = [
    'BookMetadata',
    'Author',
    'Publication',
    'Editorial',
    'Structure',
    'Classification',
    'TableOfContents',
    'Volume',
    'ChapterEntry',
    'PageContent',
    'Footnote',
    'FormattingHints',
    'ShamelaHTTPClient',
    'extract_text_from_metadata',
    'extract_death_date',
    'extract_birth_date',
    'parse_author_name',
    'detect_content_type',
    'separate_footnotes',
    'clean_arabic_text',
    'extract_page_number_from_url',
    'extract_book_id_from_url',
    'extract_author_id_from_url'
]
