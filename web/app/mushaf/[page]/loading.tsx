export default function MushafLoading() {
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-screen">
      {/* Mushaf content skeleton */}
      <div
        className="flex-1 flex justify-center py-6"
        style={{ backgroundColor: "hsl(var(--reader-bg))" }}
      >
        <div className="w-full max-w-[540px] mx-auto px-6 space-y-6" dir="rtl">
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
