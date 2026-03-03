export default function ReaderLoading() {
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      {/* Header skeleton */}
      <div className="flex items-center gap-2 md:gap-3 border-b border-border/50 px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 shrink-0">
        {/* Back button */}
        <div className="h-10 w-10 sm:h-9 sm:w-9 rounded-md bg-muted animate-shimmer shrink-0" />
        {/* Title */}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="h-5 w-48 bg-muted rounded animate-shimmer" />
        </div>
        {/* Menu button */}
        <div className="h-10 w-10 sm:h-9 sm:w-9 rounded-md bg-muted animate-shimmer shrink-0" />
      </div>

      {/* Progress bar placeholder */}
      <div className="h-0.5 bg-muted shrink-0" />

      {/* Content skeleton */}
      <div className="flex-1 overflow-hidden" dir="rtl">
        <div className="max-w-3xl mx-auto px-5 md:px-12 py-6 md:py-10 space-y-4">
          {[85, 92, 78, 95, 70, 88, 74, 97, 82, 90, 76, 93, 80, 86].map((w, i) => (
            <div
              key={i}
              className="h-4 bg-muted rounded animate-shimmer"
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
      </div>

      {/* Mobile bottom bar skeleton */}
      <div className="sm:hidden shrink-0 border-t border-border/50 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between">
          <div className="h-11 w-24 rounded-xl bg-muted animate-shimmer" />
          <div className="h-5 w-20 rounded bg-muted animate-shimmer" />
          <div className="h-11 w-24 rounded-xl bg-muted animate-shimmer" />
        </div>
      </div>
    </div>
  );
}
