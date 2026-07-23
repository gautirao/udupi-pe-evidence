import { Skeleton } from '@/components/ui/skeleton';

/**
 * Issue #1953 (build step 4) — Suspense fallback rendered by DiscoverMapMount
 * while the lazy-loaded DiscoverMapCanvas chunk is still downloading. Sized
 * to match DiscoverMapCanvas's own root div (`lg:w-1/2 h-64 lg:h-full`, see
 * DiscoverMapCanvas.tsx's root return) so no layout shift occurs when the
 * real canvas mounts in its place.
 */
export function MapSkeleton() {
  return (
    <div
      className="lg:w-1/2 h-64 lg:h-full relative order-1 lg:order-1 p-4"
      style={{ background: 'hsl(var(--map-bg))' }}
      data-testid="map-skeleton"
      aria-hidden="true"
    >
      <Skeleton className="h-full w-full rounded-lg" />
    </div>
  );
}
