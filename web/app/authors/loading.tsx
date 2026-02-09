export default function AuthorsLoading() {
  return (
    <div className="p-4 md:p-8">
      {/* Header skeleton */}
      <div className="mb-6">
        <div className="h-8 w-28 bg-muted rounded animate-pulse mb-4" />
        <div className="h-10 w-full max-w-md bg-muted rounded-lg animate-pulse" />
      </div>

      {/* Table skeleton */}
      <div className="space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-3 border rounded">
            <div className="h-4 flex-1 bg-muted rounded animate-pulse" />
            <div className="h-4 w-24 bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
