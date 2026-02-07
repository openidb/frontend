"""
Data schemas for Shamela book data
"""

from dataclasses import dataclass, field, asdict
from typing import List, Optional, Dict, Union
import json


@dataclass
class Author:
    """Author biographical information"""
    name: str
    shamela_author_id: Optional[str] = None
    death_date_hijri: Optional[str] = None
    birth_date_hijri: Optional[str] = None
    death_date_gregorian: Optional[str] = None
    birth_date_gregorian: Optional[str] = None
    kunya: Optional[str] = None
    nasab: Optional[str] = None
    nisba: Optional[str] = None
    laqab: Optional[str] = None
    biography: Optional[str] = None
    biography_source: Optional[str] = None  # Citation/source for biography
    other_works: List[Dict[str, str]] = field(default_factory=list)

    def to_dict(self):
        return {k: v for k, v in asdict(self).items() if v is not None}


@dataclass
class Publication:
    """Publication information"""
    publisher: Optional[str] = None
    location: Optional[str] = None
    edition: Optional[str] = None
    year_hijri: Optional[str] = None
    year_gregorian: Optional[str] = None
    isbn: Optional[str] = None

    def to_dict(self):
        return {k: v for k, v in asdict(self).items() if v is not None}


@dataclass
class Editorial:
    """Editorial and scholarly information"""
    editor: Optional[str] = None
    type: Optional[str] = None
    institution: Optional[str] = None
    supervisor: Optional[str] = None
    verification_status: Optional[str] = None  # تحقيق/authentication status
    manuscript_source: Optional[str] = None  # Original manuscript details

    def to_dict(self):
        return {k: v for k, v in asdict(self).items() if v is not None}


@dataclass
class Structure:
    """Book structure information"""
    total_volumes: int = 1
    total_pages: Optional[int] = None
    page_alignment_note: Optional[str] = None

    def to_dict(self):
        return {k: v for k, v in asdict(self).items() if v is not None}


@dataclass
class Classification:
    """Book classification/categorization"""
    category: Optional[str] = None
    category_id: Optional[str] = None
    keywords: List[str] = field(default_factory=list)  # Subject tags/keywords

    def to_dict(self):
        result = {k: v for k, v in asdict(self).items() if v is not None}
        # Don't include empty keywords list
        if 'keywords' in result and not result['keywords']:
            del result['keywords']
        return result


@dataclass
class BookMetadata:
    """Complete book metadata"""
    shamela_id: str
    title: Dict[str, str]
    author: Author
    publication: Publication = field(default_factory=Publication)
    structure: Structure = field(default_factory=Structure)
    classification: Classification = field(default_factory=Classification)
    editorial: Editorial = field(default_factory=Editorial)
    description: Optional[str] = None  # Book card and TOC from description page (HTML)
    summary: Optional[str] = None  # Plain text summary/description

    def to_dict(self):
        result = {
            "shamela_id": self.shamela_id,
            "title": self.title,
            "author": self.author.to_dict(),
            "publication": self.publication.to_dict(),
            "structure": self.structure.to_dict(),
            "classification": self.classification.to_dict(),
            "editorial": self.editorial.to_dict()
        }
        if self.description:
            result["description"] = self.description
        if self.summary:
            result["summary"] = self.summary
        return result

    def to_json(self, filepath: str):
        """Save metadata to JSON file"""
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(self.to_dict(), f, ensure_ascii=False, indent=2)

    @classmethod
    def from_json(cls, filepath: str):
        """Load metadata from JSON file"""
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)

        return cls(
            shamela_id=data['shamela_id'],
            title=data['title'],
            author=Author(**data['author']),
            publication=Publication(**data.get('publication', {})),
            structure=Structure(**data.get('structure', {})),
            classification=Classification(**data.get('classification', {})),
            editorial=Editorial(**data.get('editorial', {})),
            description=data.get('description'),
            summary=data.get('summary')
        )


@dataclass
class ChapterEntry:
    """Table of contents chapter entry"""
    title: str
    page: int
    subsections: List['ChapterEntry'] = field(default_factory=list)

    def to_dict(self):
        return {
            "title": self.title,
            "page": self.page,
            "subsections": [s.to_dict() for s in self.subsections]
        }


@dataclass
class Volume:
    """Volume in multi-volume work"""
    number: int
    title: str
    chapters: List[ChapterEntry] = field(default_factory=list)

    def to_dict(self):
        return {
            "number": self.number,
            "title": self.title,
            "chapters": [c.to_dict() for c in self.chapters]
        }


@dataclass
class TableOfContents:
    """Complete table of contents"""
    volumes: List[Volume] = field(default_factory=list)

    def to_dict(self):
        return {
            "volumes": [v.to_dict() for v in self.volumes]
        }

    def to_json(self, filepath: str):
        """Save TOC to JSON file"""
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(self.to_dict(), f, ensure_ascii=False, indent=2)

    @classmethod
    def from_json(cls, filepath: str):
        """Load TOC from JSON file"""
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)

        volumes = []
        for vol_data in data['volumes']:
            chapters = []
            for ch_data in vol_data['chapters']:
                chapters.append(ChapterEntry(**ch_data))
            volumes.append(Volume(
                number=vol_data['number'],
                title=vol_data['title'],
                chapters=chapters
            ))

        return cls(volumes=volumes)


@dataclass
class Footnote:
    """Single footnote"""
    marker: str
    content: str

    def to_dict(self):
        return asdict(self)


@dataclass
class FormattingHints:
    """Content type hints for formatting"""
    has_poetry: bool = False
    has_hadith: bool = False
    has_quran: bool = False
    has_dialogue: bool = False

    def to_dict(self):
        return asdict(self)


@dataclass
class PageContent:
    """Single page content"""
    page_number: Union[int, str]  # Sequential URL index for compatibility, or 'i' for overview page
    volume_number: int = 1
    main_content: str = ""
    main_content_html: Optional[str] = None  # Formatted HTML with styling
    footnotes: List[Footnote] = field(default_factory=list)
    footnotes_html: Optional[str] = None  # Formatted HTML for footnotes
    formatting_hints: FormattingHints = field(default_factory=FormattingHints)
    # Book metadata
    book_id: Optional[str] = None
    book_title: Optional[str] = None
    author_name: Optional[str] = None
    # Page numbering and source info
    url_page_index: Union[int, str, None] = None  # Sequential URL index (same as page_number), or 'i' for overview page
    printed_page_number: Optional[int] = None  # Actual printed page number from [ص: XX]
    source_url: Optional[str] = None  # Full Shamela URL for reference
    pdf_url: Optional[str] = None  # PDF URL if available

    def to_dict(self):
        result = {
            "page_number": self.page_number,
            "volume_number": self.volume_number,
            "main_content": self.main_content,
            "footnotes": [f.to_dict() for f in self.footnotes],
            "formatting_hints": self.formatting_hints.to_dict()
        }
        # Include optional fields only if they exist
        if self.main_content_html:
            result["main_content_html"] = self.main_content_html
        if self.footnotes_html:
            result["footnotes_html"] = self.footnotes_html
        if self.book_id:
            result["book_id"] = self.book_id
        if self.book_title:
            result["book_title"] = self.book_title
        if self.author_name:
            result["author_name"] = self.author_name
        if self.url_page_index is not None:
            result["url_page_index"] = self.url_page_index
        if self.printed_page_number is not None:
            result["printed_page_number"] = self.printed_page_number
        if self.source_url:
            result["source_url"] = self.source_url
        if self.pdf_url:
            result["pdf_url"] = self.pdf_url
        return result

    def to_json(self, filepath: str):
        """Save page content to JSON file"""
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(self.to_dict(), f, ensure_ascii=False, indent=2)

    @classmethod
    def from_json(cls, filepath: str):
        """Load page content from JSON file"""
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)

        footnotes = [Footnote(**f) for f in data.get('footnotes', [])]
        formatting_hints = FormattingHints(**data.get('formatting_hints', {}))

        return cls(
            page_number=data['page_number'],
            volume_number=data.get('volume_number', 1),
            main_content=data.get('main_content', ''),
            footnotes=footnotes,
            formatting_hints=formatting_hints
        )
