/**
 * Generic loading fallback for a route segment's `loading.tsx`
 * (docs/implementation/production-readiness.md — before this, no route in
 * the app had a Suspense/loading boundary, so a slow query on a direct
 * load/refresh rendered nothing but a blank page). `aria-hidden` on the
 * pulsing blocks: `role="status"` + the visually-hidden label is the
 * actual accessible announcement: the blocks are decorative.
 */
export function PageSkeleton({ cardCount = 3 }: { cardCount?: number }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8" role="status">
      <span className="sr-only">Loading…</span>
      <div className="h-7 w-48 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3" aria-hidden="true">
        {Array.from({ length: cardCount }).map((_, index) => (
          <div
            key={index}
            className="h-24 animate-pulse rounded-lg border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900"
          />
        ))}
      </div>
      <div
        className="mt-6 h-48 animate-pulse rounded-lg border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900"
        aria-hidden="true"
      />
    </div>
  );
}
