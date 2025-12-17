#!/usr/bin/env python3
"""Test resume logic"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from batch_scrape_parallel import scrape_single_book

# Test on book 1 (already scraped)
print("Testing book 1 (already scraped)...")
result = scrape_single_book('1', '../output/shamela-full', '../data/shamela-full', delay=0.0, save_json=True, skip_author_enrich=True)
print(f'Book 1 result: {result}')
print(f'Was skipped: {result.get("skipped", False)}')
print()

# Test on book 1000 (not scraped)
print("Testing book 1000 (not scraped yet)...")
result2 = scrape_single_book('1000', '../output/shamela-full', '../data/shamela-full', delay=0.0, save_json=True, skip_author_enrich=True)
print(f'Book 1000 result: {result2}')
print(f'Was skipped: {result2.get("skipped", False)}')
