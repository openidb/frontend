#!/usr/bin/env python3
"""
Verify WARC files and CDX index

Checks that WARC files are readable and content can be extracted.
"""

import sys
import gzip
from pathlib import Path

try:
    from warcio.archiveiterator import ArchiveIterator
except ImportError:
    print("ERROR: warcio library not found")
    print("Please install it: pip install warcio")
    exit(1)


def verify_warc_file(warc_path: Path):
    """Verify a WARC file is readable and extract sample record"""
    print(f"\nVerifying: {warc_path.name}")
    print("=" * 60)

    record_count = 0
    sample_urls = []

    with gzip.open(warc_path, 'rb') as stream:
        for record in ArchiveIterator(stream):
            if record.rec_type == 'response':
                record_count += 1
                url = record.rec_headers.get_header('WARC-Target-URI')

                # Store first 5 URLs as samples
                if len(sample_urls) < 5:
                    sample_urls.append(url)

                    # Extract content for first record only
                    if record_count == 1:
                        content = record.content_stream().read()
                        content_text = content.decode('utf-8', errors='ignore')

                        print(f"\n✓ First record:")
                        print(f"  URL: {url}")
                        print(f"  Content length: {len(content):,} bytes")
                        print(f"  Content preview (first 200 chars):")
                        print(f"  {content_text[:200]}")

    print(f"\n✓ Total records: {record_count}")
    print(f"✓ Sample URLs:")
    for url in sample_urls:
        print(f"  - {url}")

    return record_count


def verify_cdx_index(cdx_path: Path):
    """Verify CDX index is readable"""
    print(f"\nVerifying CDX index: {cdx_path.name}")
    print("=" * 60)

    with open(cdx_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    # Skip header line
    entries = [line.strip() for line in lines[1:] if line.strip()]

    print(f"✓ Total CDX entries: {len(entries)}")
    print(f"✓ Sample entries (first 3):")
    for entry in entries[:3]:
        print(f"  {entry}")

    return len(entries)


def main():
    if len(sys.argv) > 1:
        warc_dir = Path(sys.argv[1])
    else:
        # Default to test directory
        warc_dir = Path(__file__).parent.parent / 'data' / 'shamela' / 'raw' / 'warc_test'

    if not warc_dir.exists():
        print(f"ERROR: Directory not found: {warc_dir}")
        exit(1)

    print(f"Verifying WARC files in: {warc_dir}")

    # Find all WARC files
    warc_files = sorted(warc_dir.glob('*.warc.gz'))

    if not warc_files:
        print("ERROR: No WARC files found")
        exit(1)

    total_records = 0
    for warc_file in warc_files:
        total_records += verify_warc_file(warc_file)

    # Verify CDX index
    cdx_file = warc_dir / 'shamela.cdx'
    if cdx_file.exists():
        cdx_entries = verify_cdx_index(cdx_file)

        # Verify counts match
        print(f"\n{'=' * 60}")
        print("VERIFICATION SUMMARY")
        print("=" * 60)
        print(f"WARC files:     {len(warc_files)}")
        print(f"Total records:  {total_records}")
        print(f"CDX entries:    {cdx_entries}")

        if total_records == cdx_entries:
            print(f"\n✅ SUCCESS: Record count matches CDX entries")
        else:
            print(f"\n⚠️  WARNING: Mismatch between WARC records and CDX entries")
    else:
        print(f"\n⚠️  WARNING: CDX index not found")


if __name__ == '__main__':
    main()
