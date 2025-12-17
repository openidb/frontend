"""
EPUB generator for Shamela books
"""

import os
import logging
from typing import List, Optional
from ebooklib import epub
from .schemas import BookMetadata, TableOfContents, PageContent

logger = logging.getLogger(__name__)


class EPUBGenerator:
    """Generate EPUB3 files from Shamela book data"""

    def __init__(self):
        """Initialize EPUB generator"""
        self.css_style = self._create_css_style()

    def generate_epub(self, metadata: BookMetadata, toc: TableOfContents,
                     pages: List[PageContent], output_path: str) -> bool:
        """
        Generate EPUB file from book data

        Args:
            metadata: Book metadata
            toc: Table of contents
            pages: List of page content
            output_path: Output file path for EPUB

        Returns:
            True if successful, False otherwise
        """
        try:
            logger.info(f"Generating EPUB for {metadata.title.get('arabic', '')}")

            # Create EPUB book
            book = epub.EpubBook()

            # Set metadata
            self._set_metadata(book, metadata)

            # Add CSS
            css = epub.EpubItem(
                uid="style_default",
                file_name="style/default.css",
                media_type="text/css",
                content=self.css_style
            )
            book.add_item(css)

            # Build page-to-title mapping from TOC (maps url_page_index to title)
            page_to_title = self._build_page_to_title_mapping(toc)

            # Create chapters from pages
            # Page 'i' is the overview page (book card and TOC)
            chapters = []
            url_to_chapter = {}  # Map url_page_index to chapter for TOC building

            # Sort pages: 'i' first, then numeric pages
            def page_sort_key(p):
                if p.page_number == 'i':
                    return (-1, 0)  # 'i' comes first
                return (0, p.page_number)  # numeric pages follow

            for page in sorted(pages, key=page_sort_key):
                # Get chapter title from TOC if available
                # Page 'i' (overview) gets a special title
                if page.page_number == 'i':
                    chapter_title = "بطاقة الكتاب"
                else:
                    # TOC uses url_page_index, not page_number
                    chapter_title = page_to_title.get(page.url_page_index)

                chapter = self._create_chapter(page, metadata, chapter_title)
                book.add_item(chapter)
                chapters.append(chapter)

                # Build mapping from url_page_index to chapter for TOC
                url_to_chapter[page.url_page_index] = chapter

            # Create table of contents using url_page_index mapping
            book_toc = self._create_toc_structure(toc, chapters, url_to_chapter)
            book.toc = book_toc

            # Create page list for page navigation (EPUB 3 page-list)
            page_list_data = self._create_page_list(pages, chapters)

            # Add navigation files
            book.add_item(epub.EpubNcx())
            book.add_item(epub.EpubNav())

            # Define spine (reading order)
            # Start with page 0 (overview/book card) as the first page
            # Do NOT include 'nav' in spine - it should only be in manifest for navigation
            book.spine = chapters

            # Write EPUB file (initial write)
            epub.write_epub(output_path, book)

            # Post-process to add page-list to nav.xhtml
            if page_list_data:
                self._inject_page_list(output_path, page_list_data)

            logger.info(f"Successfully generated EPUB: {output_path}")
            return True

        except Exception as e:
            logger.error(f"Error generating EPUB: {e}", exc_info=True)
            return False

    def _set_metadata(self, book: epub.EpubBook, metadata: BookMetadata):
        """Set EPUB metadata"""
        # Set identifier
        book.set_identifier(f"shamela_{metadata.shamela_id}")

        # Set title
        title = metadata.title.get('arabic', 'Untitled')
        book.set_title(title)

        # Set language
        book.set_language('ar')

        # Set author
        book.add_author(metadata.author.name)

        # Add metadata fields
        book.add_metadata('DC', 'description', f"Shamela Book ID: {metadata.shamela_id}")

        # Add publisher
        if metadata.publication.publisher:
            book.add_metadata('DC', 'publisher', metadata.publication.publisher)

        # Add publication date
        if metadata.publication.year_gregorian:
            book.add_metadata('DC', 'date', metadata.publication.year_gregorian)
        elif metadata.publication.year_hijri:
            book.add_metadata('DC', 'date', f"{metadata.publication.year_hijri} هـ")

        # Add custom metadata for Shamela-specific fields
        if metadata.author.death_date_hijri:
            book.add_metadata(
                None,
                'meta',
                '',
                {'property': 'shamela:author-death-date-hijri', 'content': metadata.author.death_date_hijri}
            )

        if metadata.structure.page_alignment_note:
            book.add_metadata(
                None,
                'meta',
                '',
                {'property': 'shamela:page-alignment', 'content': metadata.structure.page_alignment_note}
            )

    def _create_chapter(self, page: PageContent, metadata: BookMetadata, title: Optional[str] = None) -> epub.EpubHtml:
        """Create chapter from page content"""
        # Chapter filename - use page number (string 'i' for overview, or padded int for regular pages)
        # Format as 4-digit padded number for integers, or as-is for strings like 'i'
        if isinstance(page.page_number, int):
            filename = f"page_{page.page_number:04d}.xhtml"
        else:
            filename = f"page_{page.page_number}.xhtml"

        # Chapter title - use provided title from TOC, or default to printed page number
        if not title:
            # Use printed page number if available for the default title
            if page.printed_page_number is not None:
                title = f"صفحة {page.printed_page_number}"
            else:
                # For pages without printed page number (like page 'i' overview)
                title = f"صفحة {page.page_number}"

        # Build HTML content
        html_content = self._build_page_html(page, metadata)

        # Create chapter
        chapter = epub.EpubHtml(
            title=title,
            file_name=filename,
            lang='ar',
            content=html_content
        )

        chapter.add_item(epub.EpubItem(uid="style_default", file_name="style/default.css"))

        return chapter

    def _build_page_html(self, page: PageContent, metadata: BookMetadata) -> str:
        """Build HTML content for a page"""
        # Page 'i' is the overview page - handle it specially with inline CSS
        if page.page_number == 'i':
            # For page 'i', use the HTML directly with inline CSS styling
            return f'''<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="ar" dir="rtl">
<head>
    <meta charset="utf-8"/>
    <title>بطاقة الكتاب</title>
    <style>
        body {{
            font-family: "Amiri", "Scheherazade New", "Traditional Arabic", serif;
            padding: 20px;
            line-height: 1.8;
            direction: rtl;
            text-align: right;
        }}
        h3 {{
            text-align: center;
            font-size: 1.5em;
            margin-bottom: 1em;
            color: #333;
        }}
        h4 {{
            font-size: 1.2em;
            margin-top: 1.5em;
            margin-bottom: 0.5em;
            color: #444;
        }}
        .nass {{
            max-width: 800px;
            margin: 0 auto;
        }}
        .betaka-index ul {{
            list-style-type: none;
            padding-right: 0;
        }}
        .betaka-index li {{
            margin: 0.5em 0;
            padding-right: 1em;
        }}
        .betaka-index a {{
            color: #0066cc;
            text-decoration: none;
        }}
        .betaka-index a:hover {{
            text-decoration: underline;
        }}
        .betaka-index > ul > li {{
            margin-top: 1em;
        }}
        .betaka-index ul ul {{
            padding-right: 2em;
        }}
    </style>
</head>
<body>
    {page.main_content_html or page.main_content}
</body>
</html>'''

        # For regular pages, build standard HTML
        # Start HTML
        html_parts = []

        # Add page wrapper (no header - viewer has its own page counter)
        html_parts.append(f'<div class="page" id="page_{page.page_number}">')

        # Add main content
        html_parts.append('<div class="page-content">')

        # Use pre-formatted HTML if available, otherwise format from plain text
        if page.main_content_html:
            # Content is already HTML-formatted, use it directly
            html_parts.append(page.main_content_html)
        else:
            # Process content based on formatting hints
            content = page.main_content

            if page.formatting_hints.has_poetry:
                # Format poetry sections
                content = self._format_poetry(content)
            if page.formatting_hints.has_hadith:
                # Format hadith sections
                content = self._format_hadith(content)

            # Split into paragraphs and add
            paragraphs = content.split('\n\n')
            for para in paragraphs:
                if para.strip():
                    html_parts.append(f'<p>{self._escape_html(para.strip())}</p>')

        html_parts.append('</div>')

        # Add footnotes if present
        if page.footnotes_html:
            # Use pre-formatted footnotes HTML
            html_parts.append(page.footnotes_html)
        elif page.footnotes:
            # Format footnotes from plain text
            html_parts.append('<div class="footnotes">')
            html_parts.append('<hr/>')
            html_parts.append('<h3 class="footnotes-title">الحواشي</h3>')

            for footnote in page.footnotes:
                html_parts.append(
                    f'<p class="footnote">'
                    f'<span class="footnote-marker">{self._escape_html(footnote.marker)}</span> '
                    f'{self._escape_html(footnote.content)}'
                    f'</p>'
                )

            html_parts.append('</div>')

        html_parts.append('</div>')

        return '\n'.join(html_parts)

    def _format_poetry(self, content: str) -> str:
        """Format poetry sections with special styling"""
        # Poetry lines often have pattern: number - verse
        import re
        lines = content.split('\n')
        formatted_lines = []

        for line in lines:
            # Check if line is poetry (has number and dash)
            if re.match(r'\d+\s*-\s*.+', line):
                # Wrap in poetry class
                formatted_lines.append(f'<div class="poetry-line">{line}</div>')
            else:
                formatted_lines.append(line)

        return '\n'.join(formatted_lines)

    def _format_hadith(self, content: str) -> str:
        """Format hadith sections with special styling"""
        # Hadith is typically wrapped in guillemets « »
        import re
        # Wrap hadith text in special class
        # Use Unicode characters directly instead of escape sequences
        content = re.sub(
            r'«([^»]+)»',
            r'<span class="hadith">«\1»</span>',
            content
        )
        return content

    def _escape_html(self, text: str) -> str:
        """Escape HTML special characters"""
        return (text
                .replace('&', '&amp;')
                .replace('<', '&lt;')
                .replace('>', '&gt;')
                .replace('"', '&quot;')
                .replace("'", '&#39;'))

    def _build_page_to_title_mapping(self, toc: TableOfContents) -> dict:
        """
        Build a mapping from page numbers to chapter titles from TOC

        Args:
            toc: Table of contents structure

        Returns:
            Dictionary mapping page numbers to chapter titles
        """
        page_to_title = {}

        def extract_titles_recursive(chapter_entries):
            """Recursively extract page-to-title mappings"""
            for entry in chapter_entries:
                # Handle both object and dict access for flexibility
                if isinstance(entry, dict):
                    page = entry.get('page')
                    title = entry.get('title')
                    subsections = entry.get('subsections', [])
                else:
                    page = entry.page
                    title = entry.title
                    subsections = getattr(entry, 'subsections', [])

                if page and title:
                    page_to_title[page] = title

                # Process subsections recursively
                if subsections:
                    extract_titles_recursive(subsections)

        # Extract from all volumes
        for volume in toc.volumes:
            extract_titles_recursive(volume.chapters)

        return page_to_title

    def _create_toc_structure(self, toc: TableOfContents, chapters: List[epub.EpubHtml], url_to_chapter: dict) -> list:
        """Create EPUB table of contents from TableOfContents object

        Args:
            toc: TableOfContents object with chapter structure
            chapters: List of EPUB chapters
            url_to_chapter: Mapping from url_page_index to chapter
        """
        epub_toc = []

        # Add page 'i' (overview/book card) as first TOC entry if it exists
        if 'i' in url_to_chapter:
            epub_toc.append(url_to_chapter['i'])

        for volume in toc.volumes:
            if len(toc.volumes) > 1:
                # Multi-volume work: create volume sections
                volume_items = []
                for chapter_entry in volume.chapters:
                    # Handle both object and dict access
                    if isinstance(chapter_entry, dict):
                        url_page_index = chapter_entry.get('page')  # This is actually url_page_index from TOC
                        entry_subsections = chapter_entry.get('subsections', [])
                    else:
                        url_page_index = chapter_entry.page
                        entry_subsections = getattr(chapter_entry, 'subsections', [])

                    chapter = url_to_chapter.get(url_page_index)
                    if chapter:
                        if entry_subsections:
                            # Has subsections
                            subsections = self._create_subsections(entry_subsections, url_to_chapter)
                            volume_items.append((chapter, subsections))
                        else:
                            volume_items.append(chapter)

                epub_toc.append((
                    epub.Section(volume.title),
                    volume_items
                ))
            else:
                # Single volume: add chapters directly
                for chapter_entry in volume.chapters:
                    # Handle both object and dict access
                    if isinstance(chapter_entry, dict):
                        url_page_index = chapter_entry.get('page')  # This is actually url_page_index from TOC
                        entry_subsections = chapter_entry.get('subsections', [])
                    else:
                        url_page_index = chapter_entry.page
                        entry_subsections = getattr(chapter_entry, 'subsections', [])

                    chapter = url_to_chapter.get(url_page_index)
                    if chapter:
                        if entry_subsections:
                            subsections = self._create_subsections(entry_subsections, url_to_chapter)
                            epub_toc.append((chapter, subsections))
                        else:
                            epub_toc.append(chapter)

        return epub_toc

    def _create_subsections(self, subsection_entries, url_to_chapter) -> list:
        """Recursively create subsections for TOC

        Args:
            subsection_entries: List of subsection entries from TOC
            url_to_chapter: Mapping from url_page_index to chapter
        """
        subsections = []

        for entry in subsection_entries:
            # Handle both object and dict access
            if isinstance(entry, dict):
                url_page_index = entry.get('page')  # This is actually url_page_index from TOC
                entry_subsections = entry.get('subsections', [])
            else:
                url_page_index = entry.page
                entry_subsections = getattr(entry, 'subsections', [])

            chapter = url_to_chapter.get(url_page_index)
            if chapter:
                if entry_subsections:
                    nested = self._create_subsections(entry_subsections, url_to_chapter)
                    subsections.append((chapter, nested))
                else:
                    subsections.append(chapter)

        return subsections

    def _create_page_list(self, pages: List[PageContent], chapters: List[epub.EpubHtml]) -> Optional[List]:
        """
        Create EPUB page list for actual page numbers

        This maps the printed page numbers to their corresponding chapters,
        allowing readers to navigate by actual page number (e.g., page 3, 5, 7)
        instead of just spine section index.
        """
        try:
            page_list = []

            # Sort pages: 'i' first, then numeric pages (same logic as in generate_epub)
            def page_sort_key(p):
                if p.page_number == 'i':
                    return (-1, 0)  # 'i' comes first
                return (0, p.page_number)  # numeric pages follow

            for i, page in enumerate(sorted(pages, key=page_sort_key)):
                if i < len(chapters):
                    # Determine the page label:
                    # 1. For page 'i' (overview), use "i"
                    # 2. For all other pages, use printed_page_number (set by scraper with fallback)
                    if page.page_number == 'i':
                        page_label = 'i'
                    else:
                        page_label = str(page.printed_page_number)

                    page_list.append({
                        'label': page_label,
                        'href': chapters[i].file_name
                    })

            return page_list if page_list else None

        except Exception as e:
            logger.warning(f"Could not create page list: {e}")
            return None

    def _inject_page_list(self, epub_path: str, page_list_data: List[dict]):
        """
        Post-process EPUB to inject page-list into nav.xhtml

        Since ebooklib doesn't support custom nav content, we manually
        inject the page-list section after the EPUB is generated.
        """
        import zipfile
        import tempfile
        import shutil
        from lxml import etree

        try:
            # Create temp directory
            with tempfile.TemporaryDirectory() as temp_dir:
                # Extract EPUB
                with zipfile.ZipFile(epub_path, 'r') as zip_ref:
                    zip_ref.extractall(temp_dir)

                # Find and modify nav.xhtml
                nav_path = os.path.join(temp_dir, 'EPUB', 'nav.xhtml')
                if not os.path.exists(nav_path):
                    logger.warning("nav.xhtml not found, skipping page-list injection")
                    return

                # Parse nav.xhtml
                parser = etree.XMLParser(remove_blank_text=True)
                tree = etree.parse(nav_path, parser)
                root = tree.getroot()

                # Get namespaces
                nsmap = root.nsmap
                if None in nsmap:
                    ns = {'html': nsmap[None]}
                else:
                    ns = {'html': 'http://www.w3.org/1999/xhtml'}

                if 'epub' not in nsmap:
                    ns['epub'] = 'http://www.idpf.org/2007/ops'

                # Find body element
                body = root.find('.//html:body', ns)
                if body is None:
                    logger.warning("Body element not found in nav.xhtml")
                    return

                # Create page-list nav element
                page_nav = etree.SubElement(body, '{http://www.w3.org/1999/xhtml}nav')
                page_nav.set('{http://www.idpf.org/2007/ops}type', 'page-list')
                page_nav.set('id', 'page-list')

                # Add page list items
                ol = etree.SubElement(page_nav, '{http://www.w3.org/1999/xhtml}ol')
                for page_info in page_list_data:
                    li = etree.SubElement(ol, '{http://www.w3.org/1999/xhtml}li')
                    a = etree.SubElement(li, '{http://www.w3.org/1999/xhtml}a')
                    a.set('href', page_info['href'])
                    a.text = page_info['label']

                # Write modified nav.xhtml
                tree.write(nav_path, encoding='utf-8', xml_declaration=True, pretty_print=True)

                # Re-zip the EPUB
                with zipfile.ZipFile(epub_path, 'w', zipfile.ZIP_DEFLATED) as zip_out:
                    # Write mimetype first (uncompressed)
                    mimetype_path = os.path.join(temp_dir, 'mimetype')
                    if os.path.exists(mimetype_path):
                        zip_out.write(mimetype_path, 'mimetype', compress_type=zipfile.ZIP_STORED)

                    # Write other files
                    for root_dir, dirs, files in os.walk(temp_dir):
                        for file in files:
                            if file == 'mimetype':
                                continue
                            file_path = os.path.join(root_dir, file)
                            arc_name = os.path.relpath(file_path, temp_dir)
                            zip_out.write(file_path, arc_name)

                logger.info(f"Successfully injected page-list with {len(page_list_data)} pages")

        except Exception as e:
            logger.warning(f"Failed to inject page-list: {e}")

    def _create_nav_content(self, toc, chapters, page_list_data) -> str:
        """Create custom NAV document content with page-list"""
        nav_html = []
        nav_html.append('<?xml version="1.0" encoding="utf-8"?>')
        nav_html.append('<!DOCTYPE html>')
        nav_html.append('<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">')
        nav_html.append('<head>')
        nav_html.append('<title>Table of Contents</title>')
        nav_html.append('</head>')
        nav_html.append('<body>')

        # Table of Contents
        nav_html.append('<nav epub:type="toc" id="toc">')
        nav_html.append('<h1>Table of Contents</h1>')
        nav_html.append('<ol>')

        def add_toc_items(items, level=0):
            for item in items:
                if isinstance(item, tuple):
                    # Has subsections
                    chapter, subsections = item
                    nav_html.append(f'<li><a href="{chapter.file_name}">{self._escape_html(chapter.title)}</a>')
                    if subsections:
                        nav_html.append('<ol>')
                        add_toc_items(subsections, level + 1)
                        nav_html.append('</ol>')
                    nav_html.append('</li>')
                else:
                    # Simple chapter
                    nav_html.append(f'<li><a href="{item.file_name}">{self._escape_html(item.title)}</a></li>')

        add_toc_items(toc)
        nav_html.append('</ol>')
        nav_html.append('</nav>')

        # Page List - Use printed page numbers for accurate page navigation
        # This allows readers to jump to specific printed page numbers
        # and keeps page numbers synchronized with PDFs and the website
        if page_list_data:
            nav_html.append('<nav epub:type="page-list" id="page-list">')
            nav_html.append('<ol>')
            for page_info in page_list_data:
                nav_html.append(f'<li><a href="{page_info["href"]}">{page_info["label"]}</a></li>')
            nav_html.append('</ol>')
            nav_html.append('</nav>')

        nav_html.append('</body>')
        nav_html.append('</html>')

        return '\n'.join(nav_html)

    def _create_css_style(self) -> str:
        """Create CSS stylesheet for EPUB"""
        return """
@import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap');

body {
    font-family: 'Amiri', 'Scheherazade New', 'Traditional Arabic', serif;
    direction: rtl;
    text-align: right;
    line-height: 2.0;
    font-size: 1.1em;
    margin: 2em;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}

.page {
    margin-bottom: 3em;
}

.page-content {
    margin: 2em 0;
}

p {
    margin: 1em 0;
    line-height: 2.0;
    text-align: justify;
}

.poetry-line {
    font-style: italic;
    margin: 0.8em 2em;
    direction: rtl;
}

.hadith {
    font-weight: bold;
    color: #2c5282;
}

.footnotes {
    margin-top: 2em;
    padding-top: 1.5em;
    font-size: 0.9em;
    border-top: 1px solid #ddd;
}

.footnotes hr {
    display: none;
}

.footnotes-title {
    font-size: 1.1em;
    font-weight: bold;
    margin-bottom: 1em;
    text-align: center;
}

.footnote {
    margin: 0.8em 0;
    padding-right: 2em;
    text-indent: -2em;
}

.footnote-marker {
    font-weight: bold;
    color: #c05621;
}

/* Shamela footnotes (hamesh) - add separator line above */
p.hamesh {
    margin-top: 2em;
    padding-top: 1.5em;
    font-size: 0.9em;
    border-top: 1px solid #ddd;
    color: #555;
}

h1, h2, h3 {
    font-weight: bold;
    text-align: center;
    margin: 1.5em 0 1em 0;
}

h1 {
    font-size: 1.8em;
}

h2 {
    font-size: 1.5em;
}

h3 {
    font-size: 1.2em;
}
"""

    def _inject_page_list(self, epub_path: str, page_list_data: List):
        """Inject page-list into existing EPUB NAV document"""
        import zipfile
        import tempfile
        import shutil
        from xml.etree import ElementTree as ET

        try:
            # Create temp directory
            with tempfile.TemporaryDirectory() as temp_dir:
                # Extract EPUB
                with zipfile.ZipFile(epub_path, 'r') as zip_ref:
                    zip_ref.extractall(temp_dir)

                # Modify nav.xhtml
                nav_path = f"{temp_dir}/EPUB/nav.xhtml"

                # Parse the NAV document
                ET.register_namespace('', 'http://www.w3.org/1999/xhtml')
                ET.register_namespace('epub', 'http://www.idpf.org/2007/ops')

                tree = ET.parse(nav_path)
                root = tree.getroot()

                # Find the body element
                ns = {'xhtml': 'http://www.w3.org/1999/xhtml', 'epub': 'http://www.idpf.org/2007/ops'}
                body = root.find('.//xhtml:body', ns)

                if body is not None:
                    # Create page-list nav element
                    page_nav = ET.SubElement(body, '{http://www.w3.org/1999/xhtml}nav')
                    page_nav.set('{http://www.idpf.org/2007/ops}type', 'page-list')
                    page_nav.set('id', 'page-list')

                    # Add title
                    h2 = ET.SubElement(page_nav, '{http://www.w3.org/1999/xhtml}h2')
                    h2.text = 'Pages'

                    # Add ordered list
                    ol = ET.SubElement(page_nav, '{http://www.w3.org/1999/xhtml}ol')

                    for page_info in page_list_data:
                        li = ET.SubElement(ol, '{http://www.w3.org/1999/xhtml}li')
                        a = ET.SubElement(li, '{http://www.w3.org/1999/xhtml}a')
                        a.set('href', page_info['href'])
                        a.text = page_info['label']

                    # Write back
                    tree.write(nav_path, encoding='utf-8', xml_declaration=True)

                    # Recreate the EPUB
                    with zipfile.ZipFile(epub_path, 'w', zipfile.ZIP_DEFLATED) as zip_out:
                        # Add mimetype first (uncompressed)
                        mimetype_path = f"{temp_dir}/mimetype"
                        zip_out.write(mimetype_path, 'mimetype', compress_type=zipfile.ZIP_STORED)

                        # Add all other files
                        for root_dir, dirs, files in os.walk(temp_dir):
                            for file in files:
                                if file == 'mimetype':
                                    continue
                                file_path = os.path.join(root_dir, file)
                                arc_name = os.path.relpath(file_path, temp_dir)
                                zip_out.write(file_path, arc_name)

                    logger.info(f"Injected page-list with {len(page_list_data)} entries into EPUB")

        except Exception as e:
            logger.warning(f"Could not inject page-list: {e}")

