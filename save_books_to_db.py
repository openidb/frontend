#!/usr/bin/env python3
"""
Transform and save scraped books to PostgreSQL database
"""
import json
import subprocess
import sys

def transform_book_metadata(scraped_data):
    """Transform scraped metadata to database format"""

    # Extract author info
    author_data = scraped_data.get('author', {})

    # Extract book title
    title = scraped_data.get('title', {})
    title_arabic = title.get('arabic', '')

    # Extract publication info
    publication = scraped_data.get('publication', {})

    # Extract classification
    classification = scraped_data.get('classification', {})

    # Extract editorial
    editorial = scraped_data.get('editorial', {})

    # Extract structure
    structure = scraped_data.get('structure', {})

    # Build the transformed data
    transformed = {
        "book": {
            "shamela_book_id": str(scraped_data.get('shamela_id', '')),
            "title_arabic": title_arabic,
            "title_latin": title_arabic,  # Use same for now
            "author_arabic": author_data.get('name', ''),
            "author_latin": author_data.get('name', ''),  # Use same for now
            "shamela_author_id": author_data.get('shamela_author_id'),
            "category_arabic": classification.get('category'),
            "category_english": classification.get('category'),
            "shamela_category_id": classification.get('category_id'),
            "publisher": publication.get('publisher'),
            "publisher_location": publication.get('location'),
            "editor": editorial.get('editor'),
            "publication_year_hijri": publication.get('year_hijri'),
            "publication_year_gregorian": publication.get('year_gregorian'),
            "publication_edition": publication.get('edition'),
            "publication_location": publication.get('location'),
            "isbn": publication.get('isbn'),
            "total_volumes": structure.get('total_volumes', 1),
            "editorial_type": editorial.get('type'),
            "institution": editorial.get('institution'),
            "supervisor": editorial.get('supervisor'),
            "description_html": scraped_data.get('description'),
            "summary": scraped_data.get('summary'),
            "filename": f"{scraped_data.get('shamela_id', 'unknown')}.epub"
        },
        "author": {
            "shamela_author_id": author_data.get('shamela_author_id'),
            "name_arabic": author_data.get('name', ''),
            "name_latin": author_data.get('name', ''),  # Use same for now
            "birth_date_hijri": author_data.get('birth_date_hijri'),
            "death_date_hijri": author_data.get('death_date_hijri'),
            "birth_date_gregorian": author_data.get('birth_date_gregorian'),
            "death_date_gregorian": author_data.get('death_date_gregorian'),
            "biography": author_data.get('biography'),
            "biography_source": author_data.get('biography_source')
        }
    }

    return transformed

def save_to_database(book_id):
    """Save a book to the database"""
    print(f"\n{'='*60}")
    print(f"Processing book {book_id}")
    print(f"{'='*60}")

    # Read scraped data
    with open(f'/tmp/book_{book_id}.json', 'r', encoding='utf-8') as f:
        scraped_data = json.load(f)

    # Transform data
    transformed_data = transform_book_metadata(scraped_data)

    # Save to database via TypeScript script
    json_input = json.dumps(transformed_data, ensure_ascii=False)

    try:
        result = subprocess.run(
            ['/Users/abdulrahman/.bun/bin/bun', 'run', 'book-viewer/scripts/save-book-metadata.ts'],
            input=json_input.encode('utf-8'),
            capture_output=True,
            check=True,
            cwd='/Users/abdulrahman/Documents/projects/arabic-texts-library'
        )

        print(f"✅ Successfully saved book {book_id}")
        print(result.stdout.decode('utf-8'))
        if result.stderr:
            print("Errors:", result.stderr.decode('utf-8'))

    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to save book {book_id}")
        print("STDOUT:", e.stdout.decode('utf-8'))
        print("STDERR:", e.stderr.decode('utf-8'))
        sys.exit(1)

if __name__ == '__main__':
    # Save both books
    save_to_database('7703')
    save_to_database('96250')

    print(f"\n{'='*60}")
    print("✅ All books saved successfully!")
    print(f"{'='*60}\n")
