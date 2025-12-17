#!/usr/bin/env python3
"""Debug full biography extraction"""

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
            print(f"Biography length: {len(biography_text)} characters")
            print(f"\n{'='*80}")
            print("FULL BIOGRAPHY TEXT:")
            print(f"{'='*80}")
            print(biography_text[:5000])  # First 5000 chars
            print(f"\n{'='*80}")
            print(f"Total: {len(biography_text)} chars")
        else:
            print("No source citation found")
            print(f"Full section length: {len(full_section)}")
            print(full_section[:3000])
    else:
        print("Biography section not found")
else:
    print("Failed to fetch page")
