#!/usr/bin/env python3
"""Debug biography formatting and dates"""

import sys
import re
sys.path.insert(0, 'shamela-scraper/scripts')

from shamela.utils import ShamelaHTTPClient

client = ShamelaHTTPClient(delay=1.5)
soup = client.get("https://shamela.ws/author/51")

if soup:
    text = soup.get_text()

    # Find the biography section
    bio_match = re.search(
        r'تعريف بالمؤلف[:\s]+(.*?)$',
        text,
        re.MULTILINE | re.DOTALL
    )

    if bio_match:
        full_section = bio_match.group(1).strip()

        # Find where the source citation starts
        source_match = re.search(r'(نقلا عن|المصدر|المرجع)[:«\s]+', full_section)

        if source_match:
            source_pos = source_match.start()
            biography_text = full_section[:source_pos].strip()
            source_text = full_section[source_pos:].strip()

            # Clean source citation
            source_text = re.split(r'(?:×|البحث في|تنبيهات|افتراضيا)', source_text)[0].strip()

            print("="*80)
            print("BIOGRAPHY (first 1000 chars):")
            print("="*80)
            print(biography_text[:1000])
            print("\n" + "="*80)
            print("SOURCE CITATION:")
            print("="*80)
            print(source_text)
            print("\n" + "="*80)

            # Check if text has newlines
            if '\n' in biography_text[:500]:
                print("✓ Biography has newlines")
            else:
                print("✗ Biography missing newlines - needs formatting")

            # Show character at position where first bullet should be
            print(f"\nFirst 200 chars repr: {repr(biography_text[:200])}")
