#!/usr/bin/env python3
"""
Enhance catalog.json with category and timePeriod metadata
"""

import json
from pathlib import Path

def categorize_book(book):
    """Determine category based on filename and title patterns"""
    filename = book['filename']
    title = book['title']

    # Determine category
    if '.Diwan.' in filename or '.Mucallaqa.' in filename or 'ديوان' in title or 'معلقة' in title:
        category = 'poetry'
        subcategory = 'muallaqat' if 'Mucallaqa' in filename or 'معلقة' in title else 'diwan'
    elif 'LisanCarab' in filename or 'لسان العرب' in title:
        category = 'dictionary'
        subcategory = None
    elif 'Ajrumiyya' in filename or 'الآجرومية' in title or 'GhurarKhasais' in filename or 'غرر الخصائص' in title:
        category = 'language'
        if 'Ajrumiyya' in filename or 'الآجرومية' in title:
            subcategory = 'grammar'
        elif 'GhurarKhasais' in filename or 'غرر الخصائص' in title:
            subcategory = 'rhetoric'
        else:
            subcategory = None
    else:
        category = 'unknown'
        subcategory = None

    # Extract year from datePublished
    date_str = book['datePublished']
    try:
        year_ah = int(date_str.split()[0])
    except:
        year_ah = 0

    # Determine time period with more specific Islamic era names
    if year_ah == 0 or year_ah == 1:
        time_period = 'pre-islamic'
    elif 1 <= year_ah <= 40:
        time_period = 'early-islamic'
    elif 41 <= year_ah <= 132:
        time_period = 'umayyad'
    elif 133 <= year_ah <= 656:
        time_period = 'abbasid'
    elif 657 <= year_ah <= 923:
        time_period = 'post-abbasid'
    else:
        time_period = 'unknown'

    return {
        **book,
        'category': category,
        'subcategory': subcategory,
        'yearAH': year_ah,
        'timePeriod': time_period
    }

def main():
    # Paths
    catalog_path = Path(__file__).parent.parent.parent / 'book-viewer' / 'lib' / 'catalog.json'

    # Load catalog
    with open(catalog_path, 'r', encoding='utf-8') as f:
        catalog = json.load(f)

    # Enhance each book
    enhanced_catalog = [categorize_book(book) for book in catalog]

    # Stats
    categories = {}
    periods = {}
    for book in enhanced_catalog:
        cat = book['category']
        period = book['timePeriod']
        categories[cat] = categories.get(cat, 0) + 1
        periods[period] = periods.get(period, 0) + 1

    print("Enhanced Catalog Summary:")
    print(f"\nCategories:")
    for cat, count in sorted(categories.items()):
        print(f"  {cat}: {count}")

    print(f"\nTime Periods:")
    for period, count in sorted(periods.items()):
        print(f"  {period}: {count}")

    # Save enhanced catalog
    with open(catalog_path, 'w', encoding='utf-8') as f:
        json.dump(enhanced_catalog, f, ensure_ascii=False, indent=2)

    print(f"\n✓ Enhanced catalog saved to: {catalog_path}")
    print(f"✓ Total books: {len(enhanced_catalog)}")

if __name__ == "__main__":
    main()
