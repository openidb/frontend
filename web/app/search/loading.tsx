export default function SearchLoading() {
  return (
    <main className="min-h-screen bg-background">
      <div className="p-4 md:p-8">
        {/* Header skeleton */}
        <div className="max-w-3xl mx-auto mb-6 md:mb-8">
          <div className="h-8 w-32 bg-muted rounded animate-shimmer mb-2" />
          <div className="h-4 w-64 bg-muted rounded animate-shimmer" />
        </div>

        {/* Search bar skeleton */}
        <div className="max-w-2xl mx-auto mb-6 md:mb-8">
          <div className="flex gap-2">
            <div className="flex-1 h-10 md:h-12 bg-muted rounded-lg animate-shimmer" />
            <div className="h-10 md:h-12 w-20 bg-muted rounded animate-shimmer" />
            <div className="h-10 md:h-12 w-10 md:w-12 bg-muted rounded animate-shimmer" />
          </div>
        </div>

        {/* Results skeleton */}
        <div className="max-w-3xl mx-auto space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="border rounded-lg p-4 space-y-2">
              <div className="h-4 w-48 bg-muted rounded animate-shimmer" />
              <div className="h-3 w-full bg-muted rounded animate-shimmer" />
              <div className="h-3 w-3/4 bg-muted rounded animate-shimmer" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
