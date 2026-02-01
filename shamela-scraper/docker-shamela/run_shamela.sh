#!/bin/bash
# Run Shamela Windows application in Docker with Wine

set -e

echo "=== Shamela Database Extractor via Docker + Wine ==="
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
echo "Starting Docker container with Wine..."
echo "This will download the Wine Docker image (~1GB) if not already cached."
echo ""

# Pull the image first
docker pull scottyhardy/docker-wine:stable-8.0.2

echo ""
echo "Running Shamela in Docker..."
echo ""
echo "INSTRUCTIONS:"
echo "1. The Shamela launcher will run"
echo "2. It should auto-extract the databases"
echo "3. Look for extracted .db files in Wine's directory"
echo "4. We'll copy them to the output directory"
echo ""

# Run Docker container interactively
docker run -it --rm \
    -v "/Volumes/shamela.f.1446.1:/shamela/iso:ro" \
    -v "$OUTPUT_DIR:/shamela/output" \
    -e DISPLAY=:0 \
    -w /shamela \
    scottyhardy/docker-wine:stable-8.0.2 \
    bash -c '
        echo "Setting up Wine environment..."
        wineboot -u
        sleep 2

        echo "Creating work directory..."
        mkdir -p /shamela/work
        cd /shamela/work

        echo "Copying Shamela files..."
        cp /shamela/iso/shamela.exe .
        cp -r /shamela/iso/data .

        echo "Running Shamela application..."
        echo "(This may open a GUI window or run in background)"
        wine shamela.exe &
        WINE_PID=$!

        echo "Waiting for extraction (60 seconds)..."
        sleep 60

        echo "Searching for extracted database files..."
        find ~/.wine -name "*.db" -type f 2>/dev/null | head -20

        echo ""
        echo "Copying any found database files to output..."
        find ~/.wine -name "*.db" -type f -exec cp -v {} /shamela/output/ \; 2>/dev/null || true

        echo ""
        echo "Checking Wine drive_c for Shamela installation..."
        find ~/.wine/drive_c -type d -iname "*shamela*" 2>/dev/null || true

        echo ""
        echo "You can explore the container manually now."
        echo "Type '\''exit'\'' when done."
        bash
    '

echo ""
echo "=== Extraction Process Complete ==="
echo ""
echo "Check the output directory for extracted databases:"
echo "  ls -lh $OUTPUT_DIR"
echo ""
