"use client";

import dynamic from "next/dynamic";

const MushafPdfClient = dynamic(
  () => import("@/components/MushafPdfClient").then((m) => m.MushafPdfClient),
  {
    ssr: false,
    loading: () => (
      <div className="p-4 md:p-8">
        <div className="max-w-3xl mx-auto mb-6">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-muted rounded-lg animate-shimmer" />
            <div className="h-5 w-32 bg-muted rounded animate-shimmer" />
          </div>
        </div>
        <div className="max-w-3xl mx-auto">
          <div className="border rounded-lg p-4 flex items-center justify-center" style={{ minHeight: "70vh" }}>
            <div className="bg-muted rounded animate-shimmer" style={{ width: "min(60vw, 360px)", aspectRatio: "0.65" }} />
          </div>
        </div>
      </div>
    ),
  }
);

export default function MushafPdfPage() {
  return <MushafPdfClient />;
}
