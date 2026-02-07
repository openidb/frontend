#!/bin/bash
# Script to extract Shamela database using Docker and Wine

set -e

echo "=== Shamela Database Extractor ==="
echo ""

# Paths
ISO_PATH="/Volumes/shamela.f.1446.1"
OUTPUT_DIR="$(pwd)/../data/shamela/raw/shamela_desktop"

# Create output directory
mkdir -p "$OUTPUT_DIR"

echo "Starting Docker container with Wine..."
docker run -it --rm \
    -v "$ISO_PATH:/shamela/iso:ro" \
    -v "$OUTPUT_DIR:/shamela/output" \
    -w /shamela \
    scottyhardy/docker-wine:stable-8.0.2 \
    bash -c "
        echo 'Copying Shamela files...'
        cp -r /shamela/iso/* /shamela/work/

        echo 'Running Shamela executable...'
        cd /shamela/work
        wine shamela.exe

        echo 'Waiting for extraction...'
        sleep 10

        echo 'Copying extracted databases...'
        find ~/.wine -name '*.db' -type f -exec cp {} /shamela/output/ \;

        echo 'Done!'
    "

echo ""
echo "Extraction complete! Databases saved to:"
echo "$OUTPUT_DIR"
