import "dotenv/config";
import { prisma } from "../lib/db";

async function main() {
  // Check malik hadith number patterns
  const malikHadiths = await prisma.hadith.findMany({
    where: {
      book: { collection: { slug: "malik" } }
    },
    select: {
      hadithNumber: true,
      book: { select: { bookNumber: true } }
    }
  });

  console.log(`Total malik hadiths: ${malikHadiths.length}`);

  // Group by suffix pattern
  const patterns = new Map<string, number>();
  for (const h of malikHadiths) {
    const suffix = h.hadithNumber.replace(/^\d+/, '');
    patterns.set(suffix, (patterns.get(suffix) || 0) + 1);
  }

  console.log("\nHadith number suffix patterns:");
  for (const [suffix, count] of patterns.entries()) {
    console.log(`  "${suffix}": ${count}`);
  }

  // Check if numeric part is unique within each book
  const byBook = new Map<number, Map<string, string[]>>();
  for (const h of malikHadiths) {
    const bookNum = h.book.bookNumber;
    const numericPart = h.hadithNumber.replace(/[A-Za-z]+$/, '');

    if (!byBook.has(bookNum)) {
      byBook.set(bookNum, new Map());
    }
    const bookMap = byBook.get(bookNum)!;

    if (!bookMap.has(numericPart)) {
      bookMap.set(numericPart, []);
    }
    bookMap.get(numericPart)!.push(h.hadithNumber);
  }

  // Find duplicates
  let duplicates = 0;
  for (const [bookNum, bookMap] of byBook.entries()) {
    for (const [num, fullNums] of bookMap.entries()) {
      if (fullNums.length > 1) {
        duplicates++;
        if (duplicates <= 10) {
          console.log(`\nBook ${bookNum}, number ${num} has multiple: ${fullNums.join(", ")}`);
        }
      }
    }
  }

  console.log(`\nTotal numeric duplicates across books: ${duplicates}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
