import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Quran Mushaf - OpenIDB",
  description: "Read the Holy Quran in the Madani Mushaf viewer.",
};

export default function MushafPdfLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
