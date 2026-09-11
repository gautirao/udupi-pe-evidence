import { MapPin, PenTool } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SCOPE_TITLE } from '@/features/discover/presentation/scopeTitles';

/**
 * Issue #2478 (step 1) — panel-side scope bar for a committed VIEWPORT or
 * POLYGON result scope, mirroring `ActiveScopeChip`'s map-overlay chip
 * (apps/web/src/features/discover/components/map/ActiveScopeChip.tsx).
 * Renders nothing for AREA: that scope already has its own heading in
 * AreaSelectedPanel and no committed-scope indicator is needed there.
 *
 * All derivation (returnLabel, the commit callback) stays in
 * AreaSelectedPanel — this component only renders what it's given, same
 * display/container split used elsewhere in this panel.
 */
interface AreaSelectedPanelScopeBarProps {
  resultScopeKind: 'AREA' | 'POLYGON' | 'VIEWPORT';
  returnLabel: string | null;
  onReturn: () => void;
  onRedrawPolygon?: () => void;
}

export function AreaSelectedPanelScopeBar({
  resultScopeKind,
  returnLabel,
  onReturn,
  onRedrawPolygon,
}: AreaSelectedPanelScopeBarProps) {
  if (resultScopeKind !== 'VIEWPORT' && resultScopeKind !== 'POLYGON') return null;

  const isPolygon = resultScopeKind === 'POLYGON';
  const ScopeIcon = isPolygon ? PenTool : MapPin;

  return (
    <div data-design-component="scope-bar" className="mt-3 flex flex-col gap-[7px]">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs text-foreground"
          data-testid={isPolygon ? 'area-panel-scope-bar-polygon' : 'area-panel-scope-bar-viewport'}
        >
          <ScopeIcon className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          {SCOPE_TITLE[resultScopeKind]}
        </span>
        {isPolygon && onRedrawPolygon && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRedrawPolygon}
            className="h-auto gap-1 px-1.5 py-0.5 text-xs"
            data-testid="area-panel-scope-bar-redraw"
          >
            <PenTool className="h-3 w-3" aria-hidden="true" />
            Redraw
          </Button>
        )}
      </div>
      {returnLabel && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onReturn}
          className="h-auto w-fit gap-1 px-1.5 py-0.5 text-xs"
          data-testid="area-panel-scope-bar-return"
        >
          {returnLabel}
        </Button>
      )}
    </div>
  );
}
