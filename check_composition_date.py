#!/usr/bin/env python3
"""Check if Shamela book pages include composition/writing date"""

import sys
sys.path.insert(0, 'shamela-scraper/scripts')

from shamela.utils import ShamelaHTTPClient

client = ShamelaHTTPClient(delay=1.5)
soup = client.get("https://shamela.ws/book/22")

if soup:
    text = soup.get_text()

    print("Searching for composition/writing date patterns...")
    print("="*60)

    # Look for various patterns that might indicate composition date
    import re

    patterns = [
        (r'تاريخ التأليف:\s*([^\n]+)', 'تاريخ التأليف (Composition date)'),
        (r'كتب في:\s*([^\n]+)', 'كتب في (Written in)'),
        (r'ألف في:\s*([^\n]+)', 'ألف في (Composed in)'),
        (r'تم تأليفه:\s*([^\n]+)', 'تم تأليفه (Was composed)'),
        (r'صنف في:\s*([^\n]+)', 'صنف في (Compiled in)'),
        (r'وفاة المؤلف:\s*([^\n]+)', 'وفاة المؤلف (Author\'s death)'),
    ]

    found_any = False
    for pattern, description in patterns:
        matches = re.findall(pattern, text)
        if matches:
            print(f"\n✓ Found {description}:")
            for match in matches:
                print(f"  {match.strip()}")
            found_any = True

    if not found_any:
        print("\n✗ No composition date patterns found")
        print("\nFallback: Use author's death date from metadata")

    # Show the relevant section around المؤلف
    print("\n" + "="*60)
    print("المؤلف section:")
    print("="*60)
    author_match = re.search(r'المؤلف:([^\n]{100})', text)
    if author_match:
        print(author_match.group(0))
