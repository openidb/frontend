#!/usr/bin/env python3
"""Debug Shamela author page"""

import sys
sys.path.insert(0, 'shamela-scraper/scripts')

from shamela.utils import ShamelaHTTPClient

client = ShamelaHTTPClient(delay=1.5)
soup = client.get("https://shamela.ws/author/51")

if soup:
    text = soup.get_text()

    # Find "تعريف" in the text
    if "تعريف" in text:
        pos = text.find("تعريف")
        # Show 500 chars around it
        snippet = text[max(0, pos-100):pos+800]
        print("FOUND 'تعريف' at position", pos)
        print("\n" + "="*80)
        print("TEXT AROUND 'تعريف':")
        print("="*80)
        print(snippet)
        print("="*80)
    else:
        print("'تعريف' NOT FOUND in page text")

    # Also check for the exact heading
    if "تعريف بالمؤلف" in text:
        print("\n✓ 'تعريف بالمؤلف' FOUND!")
    else:
        print("\n✗ 'تعريف بالمؤلف' NOT FOUND")
else:
    print("Failed to fetch page")
