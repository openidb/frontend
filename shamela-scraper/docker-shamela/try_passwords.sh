#!/bin/bash
# Try common passwords for Shamela archive

ARCHIVE="/Volumes/shamela.f.1446.1/data/shamela.bin"
OUTPUT_DIR="shamela-scraper/data/shamela/raw/shamela_desktop_test"

mkdir -p "$OUTPUT_DIR"
cd "$OUTPUT_DIR"

# Common passwords to try
PASSWORDS=(
    ""                    # Empty password
    "shamela"
    "Shamela"
    "SHAMELA"
    "shamela.ws"
    "1446"
    "14461"
    "1446.1"
    "المكتبة الشاملة"
    "almaktaba"
    "alshamela"
    "password"
    "123456"
)

echo "Trying common passwords..."
echo ""

for password in "${PASSWORDS[@]}"; do
    if [ -z "$password" ]; then
        echo "Trying: (empty password)"
        7z t "$ARCHIVE" -p &>/dev/null
    else
        echo "Trying: $password"
        7z t "$ARCHIVE" -p"$password" &>/dev/null
    fi

    if [ $? -eq 0 ]; then
        echo ""
        echo "✓ SUCCESS! Password found: '$password'"
        echo ""
        echo "Extracting database files..."
        7z e "$ARCHIVE" -p"$password" "database/book/001/1.db" "database/book/003/3.db" "database/book/006/6.db" -y
        exit 0
    fi
done

echo ""
echo "✗ None of the common passwords worked."
echo "The password might be hardcoded in the application."
