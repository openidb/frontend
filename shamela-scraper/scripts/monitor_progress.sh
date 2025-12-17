#!/bin/bash
# Monitor Shamela scraper progress

echo "==== SHAMELA SCRAPER STATUS ===="
echo

echo "Process Status:"
ps aux | grep "[p]ython batch_scrape_parallel.py" | awk '{print "  PID: " $2 " | CPU: " $3"% | Memory: " $4"% | Runtime: " $10}'
if [ $? -ne 0 ]; then
    echo "  ⚠️  Scraper is NOT running!"
fi
echo

echo "Progress:"
METADATA_COUNT=$(ls ../data/shamela-full/metadata/ 2>/dev/null | wc -l | tr -d ' ')
PAGE_COUNT=$(find ../data/shamela-full/pages -name '*.json' 2>/dev/null | wc -l | tr -d ' ')
EPUB_COUNT=$(ls ../output/shamela-full/*.epub 2>/dev/null | wc -l | tr -d ' ')

echo "  Metadata files:  $METADATA_COUNT"
echo "  Page files:      $PAGE_COUNT"
echo "  EPUB files:      $EPUB_COUNT"
echo

echo "Target: 8,567 books"
echo

# Show recent log
if [ -f /tmp/shamela_scraper.log ]; then
    echo "Recent activity (last 5 lines):"
    tail -5 /tmp/shamela_scraper.log | sed 's/^/  /'
fi
