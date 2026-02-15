export default function BooksLoading() {
  return (
    <div className="p-4 md:p-8">
      {/* Header skeleton */}
      <div className="mb-6">
        <div className="h-8 w-24 bg-muted rounded animate-shimmer mb-4" />
        <div className="h-10 w-full max-w-md bg-muted rounded-lg animate-shimmer mb-4" />
        <div className="flex gap-2 mb-4">
          <div className="h-8 w-24 bg-muted rounded animate-shimmer" />
          <div className="h-8 w-24 bg-muted rounded animate-shimmer" />
        </div>
      </div>

      {/* Table skeleton */}
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-3 border rounded">
            <div className="h-4 flex-1 bg-muted rounded animate-shimmer" />
            <div className="h-4 w-32 bg-muted rounded animate-shimmer" />
            <div className="h-4 w-16 bg-muted rounded animate-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}
