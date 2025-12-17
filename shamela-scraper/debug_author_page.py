#!/usr/bin/env python3
"""Debug author page HTML structure"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'scripts'))

from shamela.utils import ShamelaHTTPClient

def debug_author_page():
    """Debug the HTML structure of author page"""
    client = ShamelaHTTPClient(delay=1.5)
    soup = client.get("https://shamela.ws/author/51")

    if not soup:
        print("Failed to fetch page")
        return False

    # Get full text
    text = soup.get_text()

    # Find the "تعريف بالمؤلف" section in the text
    if "تعريف بالمؤلف" in text:
        print("✓ Found 'تعريف بالمؤلف' in page text")

        # Find its position
        pos = text.find("تعريف بالمؤلف")
        # Print surrounding context (500 chars before and 1000 after)
        context = text[max(0, pos-200):pos+1500]
        print("\nCONTEXT AROUND 'تعريف بالمؤلف':")
        print("=" * 80)
        print(context)
        print("=" * 80)

    # Try to find it in HTML
    print("\n\nSearching for H4 tags...")
    h4_tags = soup.find_all('h4')
    print(f"Found {len(h4_tags)} H4 tags")
    for h4 in h4_tags:
        print(f"  - {h4.get_text(strip=True)[:50]}")

    # Look for any tag containing this text
    print("\n\nSearching for tags containing 'تعريف'...")
    tags = soup.find_all(string=lambda text: text and 'تعريف' in text)
    for tag in tags[:5]:
        if tag.parent:
            print(f"  - Tag: {tag.parent.name}, Class: {tag.parent.get('class')}")
            print(f"    Text: {str(tag)[:100]}")

    return True

if __name__ == "__main__":
    debug_author_page()
