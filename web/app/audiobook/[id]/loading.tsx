export default function AudioLoading() {
  return (
    <div className="flex flex-col h-full">
      {/* Top bar skeleton */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="h-5 w-32 bg-muted rounded animate-shimmer" />
        <div className="h-8 w-8 bg-muted rounded animate-shimmer" />
      </div>

      {/* Content skeleton */}
      <div className="flex-1 p-6 md:p-8 max-w-3xl mx-auto w-full space-y-6">
        {[85, 92, 78, 95, 70, 88, 74, 97, 82, 90].map((w, i) => (
          <div
            key={i}
            className="h-4 bg-muted rounded animate-shimmer"
            style={{ width: `${w}%` }}
          />
        ))}
      </div>

      {/* Bottom controls skeleton */}
      <div className="border-t p-3 flex items-center justify-center gap-4">
        <div className="h-10 w-10 bg-muted rounded-full animate-shimmer" />
        <div className="h-12 w-12 bg-muted rounded-full animate-shimmer" />
        <div className="h-10 w-10 bg-muted rounded-full animate-shimmer" />
      </div>
    </div>
  );
}
