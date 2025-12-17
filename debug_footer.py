#!/usr/bin/env python3
"""Debug full footer extraction"""

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

        # Look for the separator line before footnotes
        # The footnotes start after "كتبت سنة ٧٣٣ (١)._________"
        separator_match = re.search(r'_+', full_section)

        if separator_match:
            print(f"Found separator at position {separator_match.start()}")
            print(f"\nText around separator:")
            start = max(0, separator_match.start() - 200)
            end = min(len(full_section), separator_match.end() + 1500)
            print(full_section[start:end])
        else:
            print("No separator found")

            # Try to find the footnote marker
            footnote_match = re.search(r'\(١\)\.', full_section)
            if footnote_match:
                print(f"\nFound footnote marker at position {footnote_match.start()}")
                print(f"Text after footnote marker (2000 chars):")
                print(full_section[footnote_match.start():footnote_match.start()+2000])
