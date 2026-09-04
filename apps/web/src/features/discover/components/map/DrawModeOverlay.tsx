import { PenTool, RotateCcw, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  POLYGON_REJECTION_COPY,
  POLYGON_UNVERIFIED_COPY,
} from '@/features/discover/state/polygonRejection';
import type { PolygonDraftBlock, PolygonDraftPhase } from '@/features/discover/state/polygonDraftPhase';

/**
 * Issue #2419 (PR-2) — the product-native draw-mode and blocked-draft surface.
 *
 * NO MOCK AUTHORITY for anything in this file, and that is recorded rather
 * than glossed. `Experience.jsx`'s `drawArea` fabricates a finished polygon
 * outright (`:264`), so the design kit has no point-placement mode at all: no
 * instructions, no Cancel, no Undo. FUNCTIONAL_AUDIT gap M8 records the same
 * absence for the rejection state. Every string below is issue #2419's own
 * indicative wording, used verbatim, and is labelled MISMATCH in the PR's
 * evidence table. Replace it wholesale if design publishes these states.
 *
 * What IS mock-derived lives elsewhere: the draft/committed polygon geometry
 * styling in `shared/map/DrawControl.tsx` comes from `ExpMap.jsx:461-462`.
 *
 * Renders nothing outside DRAWING and INVALID. The committed and idle states
 * belong to `ActiveScopeChip`, and REVIEWING is owned by #2016's replace
 * dialog — this component deliberately does not add a third confirmation
 * surface, per the issue's "do not create a second confirmation flow".
 */

/** Desktop and touch wording differ per the issue; the split is by pointer capability, not width. */
export const DRAW_MODE_COPY = {
  title: 'Draw your search area',
  desktopBody: 'Click points on the map to outline the area. Click the first point to finish.',
  touchBody: 'Tap points on the map. Tap the first point to finish.',
} as const;

export interface DrawModeOverlayProps {
  phase: PolygonDraftPhase;
  /** Why a completed draft was refused, or null. Only read in the INVALID phase. */
  block: PolygonDraftBlock | null;
  /** Vertices placed so far, from DrawControl. Gates the Undo affordance. */
  vertexCount: number;
  /** True on a touch-primary device — selects the touch wording. */
  isTouch: boolean;
  onCancelDraw: () => void;
  onUndoVertex: () => void;
  onRedraw: () => void;
  onRetryValidation: () => void;
  onDismissBlock: () => void;
  /**
   * Top offset (px) from the map container, so this never lands on the
   * breadcrumb or the AREA_SET chip strip. Supplied by the same measured
   * stack #2426 built for `SearchThisAreaCta` — see useSearchThisAreaCtaOffset.
   */
  topOffsetPx: number;
}

function blockCopy(block: PolygonDraftBlock) {
  if (block.kind === 'policy') return POLYGON_REJECTION_COPY[block.rejection.reason];
  if (block.kind === 'signed_in_required') return POLYGON_UNVERIFIED_COPY.signInRequired;
  return block.retryable ? POLYGON_UNVERIFIED_COPY.retryable : POLYGON_UNVERIFIED_COPY.signInRequired;
}

export function DrawModeOverlay({
  phase,
  block,
  vertexCount,
  isTouch,
  onCancelDraw,
  onUndoVertex,
  onRedraw,
  onRetryValidation,
  onDismissBlock,
  topOffsetPx,
}: DrawModeOverlayProps) {
  const isDrawing = phase.status === 'DRAWING';
  const isBlocked = phase.status === 'INVALID' && block !== null;
  if (!isDrawing && !isBlocked) return null;

  return (
    <div
      className="pointer-events-none absolute left-4 right-4 z-[1001] flex justify-center lg:left-1/2 lg:right-auto lg:-translate-x-1/2"
      style={{ top: topOffsetPx }}
    >
      <div
        className={cn(
          'pointer-events-auto w-full max-w-sm rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur',
          isBlocked && 'border-destructive/40',
        )}
        // Announced politely rather than assertively: this replaces content
        // the shopper just acted on, so it should not interrupt a screen
        // reader mid-sentence.
        role="status"
        aria-live="polite"
        data-testid={isDrawing ? 'draw-mode-overlay' : 'draw-blocked-overlay'}
      >
        {isDrawing ? (
          <>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <PenTool className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {DRAW_MODE_COPY.title}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {isTouch ? DRAW_MODE_COPY.touchBody : DRAW_MODE_COPY.desktopBody}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onUndoVertex}
                // Offering to undo a point that does not exist would be a lie.
                disabled={vertexCount === 0}
                className="h-8 gap-1.5"
                data-testid="draw-mode-undo"
              >
                <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                Undo last point
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onCancelDraw}
                className="h-8 gap-1.5"
                data-testid="draw-mode-cancel"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Cancel
              </Button>
            </div>
          </>
        ) : (
          block && (
            <>
              <p className="text-sm font-semibold text-foreground">{blockCopy(block).title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {blockCopy(block).body}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {/* Redraw is offered for a POLICY rejection, where the shape
                    itself is the problem. It is deliberately absent for an
                    unverified block: the drawing may be perfectly fine and
                    the app never got a verdict, so telling the shopper to
                    draw it again would be a lie. */}
                {block.kind === 'policy' && (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={onRedraw}
                    className="h-8 gap-1.5"
                    data-testid="draw-blocked-redraw"
                  >
                    <PenTool className="h-3.5 w-3.5" aria-hidden="true" />
                    Redraw area
                  </Button>
                )}
                {block.kind === 'unverified' && block.retryable && (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={onRetryValidation}
                    className="h-8 gap-1.5"
                    data-testid="draw-blocked-retry"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Try again
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onDismissBlock}
                  className="h-8"
                  data-testid="draw-blocked-dismiss"
                >
                  Dismiss
                </Button>
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}
