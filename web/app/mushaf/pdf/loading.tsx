export default function MushafPdfLoading() {
  return (
    <div className="p-4 md:p-8">
      {/* Header skeleton */}
      <div className="max-w-3xl mx-auto mb-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-muted rounded-lg animate-shimmer" />
          <div className="h-5 w-32 bg-muted rounded animate-shimmer" />
          <div className="ml-auto h-8 w-20 bg-muted rounded animate-shimmer" />
        </div>
      </div>

      {/* PDF page skeleton */}
      <div className="max-w-3xl mx-auto mb-6">
        <div className="border rounded-lg p-4 flex items-center justify-center" style={{ minHeight: "70vh" }}>
          <div
            className="bg-muted rounded animate-shimmer"
            style={{ width: "min(60vw, 360px)", aspectRatio: "0.65" }}
          />
        </div>
      </div>

      {/* Bottom bar skeleton */}
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-center gap-4">
          <div className="h-9 w-9 bg-muted rounded animate-shimmer" />
          <div className="h-8 w-20 bg-muted rounded animate-shimmer" />
          <div className="h-4 w-16 bg-muted rounded animate-shimmer" />
          <div className="h-9 w-9 bg-muted rounded animate-shimmer" />
        </div>
      </div>
    </div>
  );
}
