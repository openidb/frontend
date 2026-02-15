export default function ReaderLoading() {
  return (
    <div className="flex flex-col h-full">
      {/* Top bar skeleton */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="h-5 w-48 bg-muted rounded animate-shimmer" />
        <div className="flex gap-2">
          <div className="h-8 w-16 bg-muted rounded animate-shimmer" />
          <div className="h-8 w-16 bg-muted rounded animate-shimmer" />
        </div>
      </div>

      {/* Content skeleton */}
      <div className="flex-1 p-6 md:p-8 max-w-3xl mx-auto w-full space-y-4">
        {[85, 92, 78, 95, 70, 88, 74, 97, 82, 90, 76, 93].map((w, i) => (
          <div
            key={i}
            className="h-4 bg-muted rounded animate-shimmer"
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
    </div>
  );
}
