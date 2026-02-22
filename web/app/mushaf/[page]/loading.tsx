export default function MushafLoading() {
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-screen">
      {/* Top bar skeleton */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-card gap-2">
        <div className="flex gap-2">
          <div className="h-7 w-24 bg-muted rounded animate-shimmer" />
          <div className="h-7 w-16 bg-muted rounded animate-shimmer" />
        </div>
        <div className="flex items-center gap-1">
          <div className="h-7 w-7 bg-muted rounded animate-shimmer" />
          <div className="h-7 w-24 bg-muted rounded animate-shimmer" />
          <div className="h-7 w-7 bg-muted rounded animate-shimmer" />
        </div>
        <div className="h-4 w-32 bg-muted rounded animate-shimmer hidden sm:block" />
      </div>

      {/* Mushaf content skeleton */}
      <div
        className="flex-1 flex justify-center py-6"
        style={{ backgroundColor: "hsl(var(--reader-bg))" }}
      >
        <div className="w-full max-w-[600px] mx-auto px-6 space-y-6" dir="rtl">
          {/* Surah header */}
          <div className="flex justify-center">
            <div className="h-10 w-48 bg-muted/40 rounded-lg animate-shimmer" />
          </div>
          {/* Lines */}
          {Array.from({ length: 15 }, (_, i) => (
            <div
              key={i}
              className="h-8 bg-muted/30 rounded animate-shimmer"
              style={{ width: `${85 + Math.sin(i) * 15}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
