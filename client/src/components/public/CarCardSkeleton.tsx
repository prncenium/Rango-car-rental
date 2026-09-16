export function CarCardSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-lg border border-border bg-surface-card">
      <div className="aspect-[4/3] bg-surface-sunken" />
      <div className="space-y-3 p-4">
        <div className="h-5 w-2/3 rounded-sm bg-surface-sunken" />
        <div className="h-3.5 w-1/2 rounded-sm bg-surface-sunken" />
        <div className="h-3.5 w-3/4 rounded-sm bg-surface-sunken" />
        <div className="h-5 w-1/3 rounded-sm bg-surface-sunken" />
      </div>
    </div>
  );
}
