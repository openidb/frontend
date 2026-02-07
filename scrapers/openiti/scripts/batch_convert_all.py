#!/usr/bin/env python3
"""
Batch convert all Shamela texts from OpenITI repositories (0025AH-1450AH)
"""

import os
import sys
import subprocess
import glob
from pathlib import Path

def find_shamela_texts(repo_base_path, min_year=25, max_year=1450):
    """
    Find all Shamela texts in OpenITI repositories within year range
    """
    print(f"Scanning for Shamela texts from {min_year}AH to {max_year}AH...")

    shamela_files = []

    # Pattern for Shamela files (both with and without extension)
    patterns = [
        os.path.join(repo_base_path, "**", "*Shamela*.mARkdown"),
        os.path.join(repo_base_path, "**", "*Shamela*-ara*"),
        os.path.join(repo_base_path, "**", "*Sham19*.mARkdown"),
        os.path.join(repo_base_path, "**", "*Sham19*-ara*"),
    ]

    # Find all matching files
    all_files = set()
    for pattern in patterns:
        files = glob.glob(pattern, recursive=True)
        all_files.update(files)

    # Filter by year and exclude .yml files
    for file_path in all_files:
        # Skip .yml files
        if file_path.endswith('.yml'):
            continue

        # Extract year from filename
        basename = os.path.basename(file_path)
        if len(basename) >= 4 and basename[:4].isdigit():
            year = int(basename[:4])
            if min_year <= year <= max_year:
                shamela_files.append(file_path)

    print(f"Found {len(shamela_files)} Shamela texts in range")
    return sorted(shamela_files)


def organize_by_century(epub_dir, library_dir):
    """
    Organize EPUB files by century folders for better Kavita organization
    """
    print(f"\nOrganizing EPUBs by century...")

    epub_files = glob.glob(os.path.join(epub_dir, "*.epub"))

    for epub_file in epub_files:
        basename = os.path.basename(epub_file)

        # Extract year (first 4 digits)
        if len(basename) >= 4 and basename[:4].isdigit():
            year = int(basename[:4])

            # Determine century folder
            century_start = (year // 100) * 100 + 1
            century_end = century_start + 99
            folder_name = f"{century_start:04d}-{century_end:04d}AH"

            # Create author subfolder based on filename
            # Format: 0718AbuIshaqWatwat.BookTitle...
            author_part = basename.split('.')[0]  # e.g., "0718AbuIshaqWatwat"
            author_name = author_part[4:]  # Remove year prefix

            # Create directory structure: century/author/
            target_dir = os.path.join(library_dir, folder_name, author_name)
            os.makedirs(target_dir, exist_ok=True)

            # Copy EPUB
            dest_file = os.path.join(target_dir, basename)
            import shutil
            shutil.copy2(epub_file, dest_file)
            print(f"  ✓ {basename} → {folder_name}/{author_name}/")


def main():
    if len(sys.argv) < 2:
        print("Usage: python batch_convert_all.py <openiti_repo_path> [output_dir] [library_dir]")
        print()
        print("Arguments:")
        print("  openiti_repo_path : Path to OpenITI RELEASE repository")
        print("  output_dir        : Directory for EPUB output (default: ../output)")
        print("  library_dir       : Kavita library directory (default: ../../kavita/library/openiti)")
        print()
        print("Example:")
        print("  python batch_convert_all.py workspace/RELEASE output ../kavita/library/openiti")
        sys.exit(1)

    repo_path = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else '../output'
    library_dir = sys.argv[3] if len(sys.argv) > 3 else '../../kavita/library/openiti'

    if not os.path.exists(repo_path):
        print(f"Error: Repository path not found: {repo_path}")
        sys.exit(1)

    # Create directories
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(library_dir, exist_ok=True)

    # Find all Shamela texts
    shamela_files = find_shamela_texts(repo_path, min_year=25, max_year=1450)

    if not shamela_files:
        print("No Shamela texts found in the specified range")
        sys.exit(1)

    # Create file list for batch conversion
    file_list_path = os.path.join(output_dir, 'shamela_files.txt')
    with open(file_list_path, 'w') as f:
        for file_path in shamela_files:
            f.write(file_path + '\n')

    print(f"\nFile list created: {file_list_path}")
    print(f"Total files to convert: {len(shamela_files)}")
    print()

    # Confirm before proceeding
    response = input(f"Convert all {len(shamela_files)} files? (y/n): ")
    if response.lower() != 'y':
        print("Cancelled")
        sys.exit(0)

    # Run batch conversion
    script_dir = os.path.dirname(os.path.abspath(__file__))
    convert_script = os.path.join(script_dir, 'convert_to_epub.py')

    print("\nStarting batch conversion...")
    print("This may take several hours depending on the number of files.")
    print()

    subprocess.run([
        sys.executable,
        convert_script,
        '--batch',
        file_list_path,
        output_dir
    ])

    # Organize by century
    organize_by_century(output_dir, library_dir)

    print("\n" + "="*60)
    print("Pipeline Complete!")
    print(f"  EPUBs organized in: {library_dir}")
    print(f"  Add this directory to your Kavita library")
    print("="*60)


if __name__ == "__main__":
    main()
