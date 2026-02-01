#!/bin/bash
# Non-interactive Shamela extraction script

set -e

echo "=== Shamela Database Extractor (Non-Interactive) ==="
echo ""

# Check if ISO is mounted
if [ ! -d "/Volumes/shamela.f.1446.1" ]; then
    echo "ERROR: Shamela ISO not mounted!"
    echo "Please mount the ISO first:"
    echo "  open /Users/abdulrahman/Downloads/shamela.full.1446.1.iso"
    exit 1
fi

# Create output directory
OUTPUT_DIR="$(cd .. && pwd)/data/shamela/raw/shamela_desktop"
mkdir -p "$OUTPUT_DIR"

echo "Output directory: $OUTPUT_DIR"
echo ""
echo "Running extraction in Docker (non-interactive)..."
echo ""

# Run Docker container without -it flags
docker run --rm \
    -v "/Volumes/shamela.f.1446.1:/shamela/iso:ro" \
    -v "$OUTPUT_DIR:/shamela/output" \
    -w /shamela \
    scottyhardy/docker-wine:stable-8.0.2 \
    bash -c '
        echo "=== Setting up Wine environment ==="
        export WINEDEBUG=-all
        wineboot -u 2>/dev/null || true
        sleep 5

        echo ""
        echo "=== Creating work directory ==="
        mkdir -p /shamela/work
        cd /shamela/work

        echo "=== Copying Shamela files ==="
        cp /shamela/iso/shamela.exe .
        cp -r /shamela/iso/data .
        ls -lh

        echo ""
        echo "=== Attempting to run Shamela executable ==="
        echo "This will try to launch shamela.exe..."
        wine shamela.exe &
        WINE_PID=$!

        echo "Wine PID: $WINE_PID"
        echo "Waiting 30 seconds for extraction..."
        sleep 30

        echo ""
        echo "=== Checking for Wine processes ==="
        ps aux | grep -i wine || true

        echo ""
        echo "=== Searching for database files ==="
        find ~/.wine -name "*.db" -type f 2>/dev/null | head -30 || echo "No .db files found yet"

        echo ""
        echo "=== Searching for Shamela directories ==="
        find ~/.wine -type d -iname "*shamela*" 2>/dev/null || echo "No shamela directories found"

        echo ""
        echo "=== Looking for 7z extraction ==="
        find ~/.wine -name "*.db" -o -name "database" -type d 2>/dev/null | head -30 || true

        echo ""
        echo "=== Checking if 7za.exe was used ==="
        ls -la /shamela/work/data/ || true

        echo ""
        echo "=== Attempting manual extraction with 7z ==="
        cd /shamela/work/data
        echo "Trying to extract shamela.bin..."
        7z l shamela.bin | head -50 || echo "Cannot list archive (encrypted)"

        echo ""
        echo "=== Summary ==="
        echo "Extraction attempt completed."
        echo "The archive is password-protected and requires the Windows application to decrypt it."
        echo ""
        echo "Next steps:"
        echo "1. The application needs to run properly to decrypt the archive"
        echo "2. Or we need to find the decryption password"
        echo "3. Or use a Windows VM to run the full application"
    '

echo ""
echo "=== Extraction Process Complete ==="
echo ""
echo "Check output directory:"
ls -lh "$OUTPUT_DIR" || echo "Directory is empty"
echo ""
