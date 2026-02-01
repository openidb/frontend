#!/bin/bash
# Try passwords commonly shared in Shamela community

ARCHIVE="/tmp/shamela_mount/data/shamela.bin"
OUTPUT_DIR="/Users/abdulrahman/Documents/projects/arabic-texts-library/shamela-scraper/data/shamela/iso_extract/test"

mkdir -p "$OUTPUT_DIR"

# Extended list of potential passwords based on Shamela community
PASSWORDS=(
    ""                          # Empty
    "shamela"
    "Shamela"
    "SHAMELA"
    "shamela.ws"
    "shamelaws"
    "الشاملة"
    "المكتبة"
    "المكتبة_الشاملة"
    "almaktaba"
    "alshamela"
    "shamila"
    "1446"
    "14461"
    "1446.1"
    "shamela1446"
    "shamela_1446"
    "sh@m3l@"
    "Sham3la"
    "shamela123"
    "123456"
    "password"
    "admin"
    "shamela2024"
    "shamela2023"
    "maktaba"
    "alkitab"
)

echo "Trying $(echo ${#PASSWORDS[@]}) potential passwords..."
echo ""

for password in "${PASSWORDS[@]}"; do
    if [ -z "$password" ]; then
        echo -n "Trying: (empty) ... "
        7z t "$ARCHIVE" -p &>/dev/null
    else
        echo -n "Trying: $password ... "
        7z t "$ARCHIVE" -p"$password" &>/dev/null
    fi
    
    if [ $? -eq 0 ]; then
        echo ""
        echo ""
        echo "✓✓✓ SUCCESS! Password found: '$password' ✓✓✓"
        echo ""
        echo "Extracting sample files to verify..."
        cd "$OUTPUT_DIR"
        7z e "$ARCHIVE" -p"$password" "database/book/001/1.db" "database/book/016/16.db" "database/book/022/22.db" -y
        
        if [ $? -eq 0 ]; then
            echo ""
            echo "✓ Sample files extracted successfully!"
            echo "Password: $password"
            echo ""
            ls -lh *.db 2>/dev/null
        fi
        exit 0
    else
        echo "✗"
    fi
done

echo ""
echo "None of the passwords worked."
echo ""
echo "Next steps:"
echo "1. Check where you downloaded the ISO for password information"
echo "2. Search 'shamela.full.1446.1 password' online"
echo "3. Check Shamela forums or Telegram groups"
