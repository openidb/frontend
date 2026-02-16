export default function ConfigLoading() {
  return (
    <div className="p-4 md:p-8">
      <div className="max-w-md mx-auto space-y-8">
        {/* Title */}
        <div className="h-8 w-32 bg-muted rounded animate-shimmer" />

        {/* Language section */}
        <div className="space-y-4">
          <div className="h-3 w-20 bg-muted rounded animate-shimmer" />
          <div className="h-10 w-full bg-muted rounded-lg animate-shimmer" />
        </div>

        <hr className="border-border" />

        {/* Appearance section */}
        <div className="space-y-4">
          <div className="h-3 w-24 bg-muted rounded animate-shimmer" />
          <div className="flex items-center justify-between">
            <div className="h-4 w-16 bg-muted rounded animate-shimmer" />
            <div className="h-7 w-40 bg-muted rounded-full animate-shimmer" />
          </div>
        </div>

        <hr className="border-border" />

        {/* Translations section */}
        <div className="space-y-4">
          <div className="h-3 w-28 bg-muted rounded animate-shimmer" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="h-4 w-36 bg-muted rounded animate-shimmer" />
              <div className="h-5 w-9 bg-muted rounded-full animate-shimmer" />
            </div>
          ))}
        </div>

        <hr className="border-border" />

        {/* Books display section */}
        <div className="space-y-4">
          <div className="h-3 w-24 bg-muted rounded animate-shimmer" />
          <div className="flex items-center justify-between">
            <div className="h-4 w-28 bg-muted rounded animate-shimmer" />
            <div className="h-7 w-36 bg-muted rounded-full animate-shimmer" />
          </div>
          <div className="flex items-center justify-between">
            <div className="h-4 w-40 bg-muted rounded animate-shimmer" />
            <div className="h-5 w-9 bg-muted rounded-full animate-shimmer" />
          </div>
        </div>
      </div>
    </div>
  );
}
