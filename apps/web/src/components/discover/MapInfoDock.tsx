import { Link } from 'react-router-dom';
import { MapPin, Locate } from 'lucide-react';

export interface MapInfoDockProps {
  /** Current navigation node's display label — used for both the count and recenter rows. */
  where: string;
  /** Precomputed count copy, or null while no count is derivable yet (e.g. loading). */
  countText: string | null;
  /** True once a real area is selected (a listing-capable result scope) — hides the guidance row. */
  listingCapable: boolean;
  isAuthenticated: boolean;
  onRecenter: () => void;
  isMobile: boolean;
}

/**
 * Issue #2748 — the Discover map's ONE information dock (design PR #2747's
 * `ExpMapInfoDock`), replacing three independently-floating messages
 * (count pill, anonymous guidance card, "Recenter on <city/area>" button)
 * with a single deterministic card. Areas journey only (see
 * `mapInfoDockContent.ts`'s `deriveMapInfoDockContent`, the sole gate).
 *
 * Rows, top to bottom, per #2747: guidance (anon + not yet listing-capable)
 * → count → recenter. The recenter row is UNCONDITIONAL whenever this
 * component renders at all — "exactly one Recenter on <current node>" is the
 * whole point of consolidation (#2748 AC1/AC2/AC3), so it is never gated on
 * whether the node happens to be off-screen.
 *
 * Desktop is a bordered card anchored bottom-left of the map, clear of zoom/
 * attribution/legend/"Search this area" (verified via Playwright bounding
 * boxes — see e2e/discover-map-info-dock-2748.spec.ts). Mobile renders the
 * same three rows compact, consolidating what were three separate floating
 * elements into this one — see this issue's PR for the mobile-placement
 * finding (no pre-existing city/node-level bottom sheet to embed into).
 *
 * A11Y (pre-push review fix) — `role="status"` is NOT on the outer card: that
 * implies `aria-live="polite" aria-atomic="true"`, and the card also contains
 * the "sign in" <Link> and the recenter <button>. An atomic live region
 * wrapping focusable controls re-announces their labels on every node change
 * and is not what a live region is for. Only the count row — the one piece
 * that actually changes to announce — carries `role="status"`; the card
 * itself is a plain, stably-queryable (`data-testid="map-info-dock"`)
 * container with no live-region semantics of its own.
 *
 * POINTER-EVENTS (lane review fix, live-browser finding) — the dock is
 * anchored at a fixed screen position, but destination/direction markers move
 * freely underneath it as the map pans/zooms (real geography, not a fixed
 * compass layout), so a marker CAN land inside the dock's footprint. Proven
 * live: `document.elementFromPoint` at a direction marker's own click point
 * resolved to inside `[data-testid="map-info-dock"]` once the marker panned
 * under it, and a real synthetic click there never reached the map. The
 * outer card is therefore `pointer-events-none` — it is visually solid but
 * lets a click pass straight through to whatever is on the map beneath it —
 * and each genuinely interactive piece (the "sign in" <Link>, the recenter
 * <button>) opts back in with its own `pointer-events-auto`, exactly the
 * technique MapEmptyGuidance's #2724 fix already established for the same
 * problem (a solid-looking card over the map, one real link inside it).
 */
export function MapInfoDock({
  where,
  countText,
  listingCapable,
  isAuthenticated,
  onRecenter,
  isMobile,
}: MapInfoDockProps) {
  const showGuidance = !isAuthenticated && !listingCapable;

  return (
    <div
      data-testid="map-info-dock"
      className={
        isMobile
          ? 'pointer-events-none flex w-[calc(100vw-2rem)] max-w-[320px] flex-col gap-2 rounded-lg border border-border bg-card/95 px-3 py-2.5 shadow-lg backdrop-blur-sm'
          // Owner feedback (round 4) — the width cap (mock: min(288px, 50% - 92px)) now lives on
          // the desktop anchor wrapper (DiscoverMapSurface.tsx), which is positioned against the
          // map container and can resolve a `%` width; this card just fills it.
          : 'pointer-events-none flex w-full flex-col overflow-hidden rounded-lg border border-border bg-card/95 shadow-lg backdrop-blur-sm'
      }
    >
      {showGuidance && (
        <div
          data-testid="map-info-dock-guidance"
          className={
            isMobile
              ? 'text-xs leading-snug text-muted-foreground'
              : 'border-b border-border bg-muted/40 px-3 py-2 text-xs leading-snug text-muted-foreground'
          }
        >
          Select an area to see properties &mdash; or{' '}
          <Link
            to="/auth?returnTo=/discover"
            className="pointer-events-auto font-medium text-primary underline underline-offset-2"
          >
            sign in
          </Link>{' '}
          {isMobile ? 'for the full map' : 'to explore the full map'}
        </div>
      )}

      {countText && (
        <div
          // Issue #2748 — kept as the legacy `discover-badge` testid (not a new
          // `map-info-dock-*` one): ~11 existing e2e specs read this element's
          // text for the count/scope copy across journeys/states this issue does
          // not otherwise touch. Reusing the id here means the dock's count row
          // is a drop-in replacement for those readers rather than a second,
          // differently-named count surface they would all need updating for.
          // `role="status"` lives HERE (not on the card) — see the component
          // doc comment: only this row's own text changes and needs announcing.
          role="status"
          data-testid="discover-badge"
          className={
            isMobile
              ? 'flex items-start gap-2 text-xs text-foreground'
              : 'flex items-start gap-2 px-3 py-2.5 text-xs text-foreground'
          }
        >
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--copper))]" aria-hidden="true" />
          <span className="min-w-0">{countText}</span>
        </div>
      )}

      <button
        type="button"
        data-testid="map-info-dock-recenter"
        onClick={onRecenter}
        title={`Recenter on ${where}`}
        aria-label={`Recenter on ${where}`}
        className={
          isMobile
            ? 'pointer-events-auto flex min-h-[36px] w-full items-center gap-2 rounded-md border border-border bg-background/80 px-2.5 py-1.5 text-left text-xs font-semibold text-primary'
            : 'pointer-events-auto flex min-h-[40px] w-full items-center gap-2 border-t border-border bg-transparent px-3 py-2 text-left text-xs font-semibold text-primary'
        }
      >
        <Locate className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="line-clamp-2 min-w-0 [overflow-wrap:anywhere]">Recenter on {where}</span>
      </button>
    </div>
  );
}
