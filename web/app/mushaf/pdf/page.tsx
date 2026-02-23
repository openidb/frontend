"use client";

import dynamic from "next/dynamic";

const MushafPdfClient = dynamic(
  () => import("@/components/MushafPdfClient").then((m) => m.MushafPdfClient),
  { ssr: false }
);

export default function MushafPdfPage() {
  return <MushafPdfClient />;
}
