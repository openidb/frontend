/**
 * Discovery Script: Find Chain Variation Hadiths
 *
 * Identifies hadiths that are ONLY chain variations (just isnad + reference note, no actual matn/content).
 * Uses conservative multi-criteria detection to minimize false positives.
 *
 * Examples of what we filter:
 * - Short text ending with "نحوه" (similar to it) - just a chain with no content
 * - "بنحو حديث فلان" (similar to the hadith of X)
 *
 * Examples of what we DON'T filter (avoiding false positives):
 * - Long hadiths that mention "similar to X" in the middle of actual content
 * - Hadiths comparing narrations: "وفيه نحو مما روي عن..." (400+ chars with content)
 *
 * Usage: bun run scripts/find-chain-variation-hadiths.ts
 */

import { prisma } from "@web/lib/db";

/**
 * Conservative multi-criteria detection for chain variation hadiths.
 * Returns true ONLY if the hadith is clearly just a chain variation with no real content.
 */
function isChainVariationOnly(textPlain: string): { isVariation: boolean; type: string; reason: string } {
  const text = textPlain.trim();
  const length = text.length;

  // ===========================================
  // TYPE A: Simple chain variations (very short)
  // Pattern: Isnad only + terminal marker like "نحوه" (similar to it)
  // Example: "حدثنا X عن Y عن Z نحوه"
  // ===========================================
  const endsWithSimpleMarker = /(?:نحوه|بمثله|مثله)\s*\.?\s*$/.test(text);
  if (endsWithSimpleMarker && length < 150) {
    return { isVariation: true, type: "A", reason: "Short text ending with نحوه/بمثله/مثله" };
  }

  // ===========================================
  // TYPE B: Chain variations with reference to another hadith
  // Structure: Isnad + "بنحو حديث X" or "بهذا الحديث نحو حديث X"
  // NOT just the word "نحو" alone (too many false positives)
  // ===========================================

  // Full phrase patterns (REQUIRED - must match one of these)
  const chainVariationPhrases = [
    { pattern: /بنحو\s+حديث/, name: "بنحو حديث X" },           // similar to the hadith of X
    { pattern: /بهذا\s+الحديث\s+نحو/, name: "بهذا الحديث نحو" }, // with this hadith similar to
    { pattern: /نحو\s+حديث\s+\S+/, name: "نحو حديث X" },       // similar to hadith of X
    { pattern: /بمعنى\s+حديث/, name: "بمعنى حديث X" },         // with meaning of hadith of X
    { pattern: /بمعناه\s*$/, name: "بمعناه at end" },           // with its meaning (terminal)
  ];

  const matchedPhrase = chainVariationPhrases.find(p => p.pattern.test(text));
  if (!matchedPhrase) {
    return { isVariation: false, type: "NONE", reason: "No chain variation phrase found" };
  }

  // ===========================================
  // TYPE B.1: With "except he said" (quotes a small difference)
  // Pattern: "بنحو حديثهم غير أنه قال" + quoted text
  // These can be longer (~500 chars) since they include quoted diff
  // ===========================================
  const hasExceptHeSaid = /غير\s*ان[هـ]?\s*قال/.test(text);
  if (hasExceptHeSaid && length < 500) {
    return { isVariation: true, type: "B1", reason: `Has "${matchedPhrase.name}" + "غير انه قال" (exception clause)` };
  }

  // ===========================================
  // TYPE B.2: Just the chain variation phrase, no content
  // Shorter threshold since no quoted material
  // ===========================================
  if (length < 250) {
    return { isVariation: true, type: "B2", reason: `Short text with "${matchedPhrase.name}"` };
  }

  return { isVariation: false, type: "NONE", reason: `Has phrase but text too long (${length} chars)` };
}

/**
 * Additional helper to count isnad markers (for analysis)
 */
function countIsnadMarkers(text: string): number {
  const markers = [/عن\s/g, /حدثنا/g, /اخبرنا/g, /سمعت/g, /انبانا/g];
  return markers.reduce((count, pattern) => count + (text.match(pattern) || []).length, 0);
}

async function main() {
  console.log("=== Chain Variation Hadith Discovery ===\n");

  // Fetch all hadiths
  const allHadiths = await prisma.hadith.findMany({
    select: {
      id: true,
      textPlain: true,
      textArabic: true,
      hadithNumber: true,
      book: {
        select: {
          bookNumber: true,
          nameArabic: true,
          collection: {
            select: {
              slug: true,
              nameArabic: true,
            },
          },
        },
      },
    },
  });

  console.log(`Total hadiths: ${allHadiths.length}\n`);

  // Categorize hadiths
  const chainVariations: typeof allHadiths[0][] = [];
  const byType: Record<string, typeof allHadiths[0][]> = { A: [], B1: [], B2: [] };
  const byLengthBucket: Record<string, typeof allHadiths[0][]> = {
    "0-100": [],
    "100-150": [],
    "150-200": [],
    "200-300": [],
    "300-500": [],
    "500+": [],
  };

  for (const hadith of allHadiths) {
    const result = isChainVariationOnly(hadith.textPlain);
    const length = hadith.textPlain.trim().length;

    // Bucket by length (for all hadiths that COULD match patterns, even if not marked)
    const bucket =
      length < 100 ? "0-100" :
      length < 150 ? "100-150" :
      length < 200 ? "150-200" :
      length < 300 ? "200-300" :
      length < 500 ? "300-500" : "500+";

    // Check if has any pattern for length analysis
    const hasAnyPattern = /(?:نحوه|بمثله|مثله|بنحو|بمعنى|بمعناه)/.test(hadith.textPlain);
    if (hasAnyPattern) {
      byLengthBucket[bucket].push(hadith);
    }

    if (result.isVariation) {
      chainVariations.push(hadith);
      byType[result.type]?.push(hadith);
    }
  }

  // Print summary
  console.log("=== DETECTION SUMMARY ===\n");
  console.log(`Total chain variations detected: ${chainVariations.length}`);
  console.log(`  Type A (simple terminal marker): ${byType.A.length}`);
  console.log(`  Type B1 (with exception clause): ${byType.B1.length}`);
  console.log(`  Type B2 (short with phrase): ${byType.B2.length}`);
  console.log();

  // Group by collection
  const byCollection: Record<string, number> = {};
  for (const h of chainVariations) {
    const slug = h.book.collection.slug;
    byCollection[slug] = (byCollection[slug] || 0) + 1;
  }
  console.log("=== BY COLLECTION ===");
  for (const [slug, count] of Object.entries(byCollection).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${slug}: ${count}`);
  }
  console.log();

  // Print samples from each type
  console.log("=== SAMPLES (Type A - Simple Terminal Marker) ===\n");
  for (const h of byType.A.slice(0, 5)) {
    console.log(`[${h.book.collection.slug}:${h.hadithNumber}] (${h.textPlain.length} chars)`);
    console.log(`  "${h.textPlain.slice(0, 200)}${h.textPlain.length > 200 ? '...' : ''}"`);
    console.log();
  }

  console.log("=== SAMPLES (Type B1 - With Exception Clause) ===\n");
  for (const h of byType.B1.slice(0, 5)) {
    console.log(`[${h.book.collection.slug}:${h.hadithNumber}] (${h.textPlain.length} chars)`);
    console.log(`  "${h.textPlain.slice(0, 300)}${h.textPlain.length > 300 ? '...' : ''}"`);
    console.log();
  }

  console.log("=== SAMPLES (Type B2 - Short With Phrase) ===\n");
  for (const h of byType.B2.slice(0, 5)) {
    console.log(`[${h.book.collection.slug}:${h.hadithNumber}] (${h.textPlain.length} chars)`);
    console.log(`  "${h.textPlain.slice(0, 250)}${h.textPlain.length > 250 ? '...' : ''}"`);
    console.log();
  }

  // Length distribution analysis
  console.log("=== HADITHS WITH PATTERNS BY LENGTH BUCKET ===");
  console.log("(Shows hadiths that have ANY pattern phrase, regardless of detection)\n");
  for (const [bucket, hadiths] of Object.entries(byLengthBucket)) {
    const detected = hadiths.filter(h => isChainVariationOnly(h.textPlain).isVariation);
    console.log(`  ${bucket} chars: ${hadiths.length} total, ${detected.length} detected as variations`);
  }
  console.log();

  // False positive check - show hadiths with patterns that are NOT detected
  console.log("=== POTENTIAL FALSE NEGATIVES (long hadiths with patterns, NOT detected) ===");
  console.log("(Review these to ensure we're not missing real chain variations)\n");
  const notDetected = allHadiths.filter(h => {
    const hasPattern = /(?:نحوه|بمثله|مثله|بنحو|بمعنى|بمعناه)/.test(h.textPlain);
    const result = isChainVariationOnly(h.textPlain);
    return hasPattern && !result.isVariation && h.textPlain.length >= 250 && h.textPlain.length < 600;
  });

  for (const h of notDetected.slice(0, 5)) {
    const result = isChainVariationOnly(h.textPlain);
    console.log(`[${h.book.collection.slug}:${h.hadithNumber}] (${h.textPlain.length} chars)`);
    console.log(`  Reason not detected: ${result.reason}`);
    console.log(`  "${h.textPlain.slice(0, 400)}${h.textPlain.length > 400 ? '...' : ''}"`);
    console.log();
  }

  // Output IDs for the marking script
  console.log("=== CHAIN VARIATION IDs (for marking script) ===\n");
  const ids = chainVariations.map(h => h.id);
  console.log(`Total IDs to mark: ${ids.length}`);
  console.log(`First 20: ${ids.slice(0, 20).join(', ')}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Discovery failed:", err);
  process.exit(1);
});
