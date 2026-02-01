# Shamela Database Extractor

This directory contains Docker-based tools to extract the Shamela database from the encrypted ISO.

## Problem

The Shamela ISO contains an encrypted 7z archive (`shamela.bin`) with password protection (7zAES).
The password is embedded in the Windows application and cannot be easily extracted.

## Solution

Run the Shamela Windows application in a Docker container with Wine, which will:
1. Automatically decrypt the archive using the embedded password
2. Extract the database files to a location we can access
3. Copy the extracted SQLite databases to our project

## Usage

### Option 1: Run Shamela Application (Recommended)

```bash
cd shamela-scraper/docker-shamela
./run_shamela.sh
```

This will:
- Start a Windows container with Wine and GUI support
- Mount the ISO files
- Run the Shamela application
- Allow the app to extract databases
- Copy databases to `../data/shamela/raw/shamela_desktop/`

### Option 2: Manual Docker Run

```bash
docker run -it --rm \
    -v /Volumes/shamela.f.1446.1:/shamela/iso:ro \
    -v $(pwd)/../data/shamela/raw/shamela_desktop:/shamela/output \
    scottyhardy/docker-wine:stable-8.0.2 \
    bash
```

Then inside the container:
```bash
cd /shamela/iso
wine shamela.exe
# Wait for application to extract databases
# Look for extracted .db files and copy to /shamela/output
```

## Alternative: Try to Find Password

The password might be discoverable by:
1. Decompiling the Windows executable
2. Checking Shamela forums/communities
3. Reverse engineering the launcher script

## Database Structure

Once extracted, the databases are organized as:
- `database/book/001/1.db` - Book ID 1
- `database/book/003/3.db` - Book ID 3
- etc.

Each `.db` file is a SQLite database containing the book's complete text and metadata.
