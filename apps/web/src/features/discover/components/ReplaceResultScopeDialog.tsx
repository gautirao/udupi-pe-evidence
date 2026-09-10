/**
 * J3.3 replace-confirmation dialog — Issue #2016.
 *
 * The AC4 scope-transition primitive: a binary confirm/cancel modal with
 * zero per-area controls, shown when finishing a drawn polygon would replace
 * an already-committed result scope (AREA_SET or another POLYGON). Copy is
 * cited EXACTLY from the frozen design oracle
 * (docs/design/retrends-design-system/ui_kits/new_discover/src/transitions-data.js
 * J3.3, L275-279) — do not reword it.
 *
 * The oracle's example body names three specific areas ("Hebbal, Nagawara
 * and Jakkur") for that scenario's fixture data; `outgoingScopeLabel` here is
 * the general form — a human-readable description of whatever is actually
 * being replaced (a single area's name today, since multi-area chip
 * selection is out of scope for this PR; "your drawn boundary" for a
 * POLYGON-over-POLYGON replacement).
 */
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface ReplaceResultScopeDialogProps {
  open: boolean;
  /** Human-readable label for the scope currently being replaced, e.g. "Hebbal" or "your drawn boundary". */
  outgoingScopeLabel: string;
  /** J3.3 primary action — "Replace and search". */
  onConfirm: () => void;
  /** J3.3 secondary action — "Keep selected areas". */
  onCancel: () => void;
  /**
   * Issue #2471 — where to portal the dialog. On mobile the Map view is a
   * `fixed inset-0 z-[60]` wrapper (DiscoverPageShell.tsx, #1953), and a
   * Radix portal to `document.body` at z-50 lands BELOW it: the dialog
   * existed but was invisible and untappable after finishing a valid
   * polygon. Mounting INSIDE that wrapper — the MobileClusterSheet /
   * MobileListingPreviewSheet precedent — keeps every z-value in
   * DiscoverPageShell untouched. Pass the map canvas root; omit for the
   * Radix default (body).
   */
  container?: HTMLElement | null;
}

export function ReplaceResultScopeDialog({
  open,
  outgoingScopeLabel,
  onConfirm,
  onCancel,
  container,
}: ReplaceResultScopeDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      {/* z-[1200]: inside the map wrapper's stacking context this must clear
          the map's own chrome (DrawModeOverlay z-[1001], marker popover and
          mobile sheets z-[1100]); it is a modal, so nothing may sit above it. */}
      <AlertDialogContent container={container} className="z-[1200]" overlayClassName="z-[1200]">
        <AlertDialogHeader>
          <AlertDialogTitle>Replace selected areas with this boundary?</AlertDialogTitle>
          <AlertDialogDescription>
            {outgoingScopeLabel} will be removed from the search. Filters stay as they are.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Keep selected areas</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Replace and search</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
