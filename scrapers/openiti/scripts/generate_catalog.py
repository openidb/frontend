#!/usr/bin/env python3
"""
Generate catalog.json for book viewer from EPUB files
"""

import os
import json
import re
from pathlib import Path

# Simplified transliteration rules for catalog
TRANS_MAP = {
    'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'a',
    'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh',
    'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
    'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z',
    'ع': '', 'غ': 'gh',
    'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
    'ه': 'h', 'ة': 'a', 'و': 'w', 'ي': 'y', 'ى': 'a',
    'ء': '', 'ئ': '', 'ؤ': 'w',
    'ال': 'al-', ' ': ' '
}

def simple_transliterate(text):
    """Simple transliteration of Arabic to Latin"""
    if not text:
        return ""

    # Replace common article
    text = text.replace('ال', 'al-')

    result = []
    for char in text:
        result.append(TRANS_MAP.get(char, char))

    # Clean up and capitalize
    trans = ''.join(result).strip()
    # Remove multiple spaces and dashes
    trans = re.sub(r'\s+', ' ', trans)
    trans = re.sub(r'-+', '-', trans)
    # Capitalize first letter and after spaces
    trans = ' '.join(word.capitalize() for word in trans.split())

    return trans

def extract_death_year(filename):
    """Extract death year from filename (first 4 digits)"""
    match = re.match(r'(\d{4})', filename)
    return match.group(1) + " AH" if match else "Unknown"

def main():
    # Paths
    script_dir = Path(__file__).parent
    epub_dir = script_dir.parent.parent / 'book-viewer' / 'public' / 'books'
    metadata_file = script_dir / 'arabic_metadata.json'
    output_file = script_dir.parent.parent / 'book-viewer' / 'lib' / 'catalog.json'

    # Load Arabic metadata
    with open(metadata_file, 'r', encoding='utf-8') as f:
        metadata = json.load(f)

    # Process EPUB files
    catalog = []
    epub_files = sorted(epub_dir.glob('*.epub'))

    for epub_path in epub_files:
        filename = epub_path.name
        basename = filename.replace('.epub', '')

        # Get Arabic metadata
        arabic_title = metadata.get(basename, {}).get('title', basename)
        arabic_author = metadata.get(basename, {}).get('author', 'Unknown')

        # Transliterate
        latin_title = simple_transliterate(arabic_title)
        latin_author = simple_transliterate(arabic_author)

        # Extract death year
        date_published = extract_death_year(basename)

        # Create entry
        entry = {
            "id": basename,
            "title": arabic_title,
            "titleLatin": latin_title,
            "author": arabic_author,
            "authorLatin": latin_author,
            "datePublished": date_published,
            "filename": filename
        }

        catalog.append(entry)
        print(f"✓ {arabic_title} - {arabic_author}")

    # Write catalog
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)

    print(f"\n✓ Generated catalog with {len(catalog)} books")
    print(f"✓ Saved to: {output_file}")

if __name__ == "__main__":
    main()
