import { useEffect, useState } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { DrawControl } from '@/components/map/DrawControl';
import { Button } from '@/components/ui/button';
import { isValidPolygon } from '@/lib/geoJsonUtils';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

interface BoundaryDrawStepProps {
  /** Pre-existing boundary coords (may be empty for a new listing). */
  initialCoords: [number, number][];
  /** Map center derived from listing latitude/longitude. */
  center: [number, number];
  /** Called when broker confirms the drawn boundary. */
  onSave: (coords: [number, number][]) => void;
  /** Called when broker skips boundary drawing (boundary remains unchanged). */
  onSkip: () => void;
}

/**
 * Step 4 panel for agricultural listings — lets the broker draw the plot boundary
 * on a Leaflet map using DrawControl.
 *
 * UX states:
 *   empty       — no polygon drawn; save disabled; guidance text shown
 *   in-progress — polygon being drawn (<3 pts via partial DrawControl state — not reachable
 *                 in practice since DrawControl only fires onPolygonDrawn after completing
 *                 the polygon; hint shown for defensive coverage)
 *   valid       — >=3 pts; save enabled; "Boundary ready" indicator; clear available
 *   cleared     — after Clear; back to empty
 */
export function BoundaryDrawStep({
  initialCoords,
  center,
  onSave,
  onSkip,
}: BoundaryDrawStepProps) {
  const [drawnCoords, setDrawnCoords] = useState<[number, number][]>([]);

  // Pre-populate from existing boundary on mount only
  useEffect(() => {
    if (initialCoords.length > 0) {
      setDrawnCoords(initialCoords);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasCoords = drawnCoords.length > 0;
  const valid = isValidPolygon(drawnCoords);

  const handlePolygonDrawn = (coords: [number, number][]) => {
    setDrawnCoords(coords);
  };

  const handlePolygonCleared = () => {
    setDrawnCoords([]);
  };

  const handleClear = () => {
    setDrawnCoords([]);
  };

  const handleSave = () => {
    if (valid) {
      onSave(drawnCoords);
    }
  };

  return (
    <div className="space-y-4" data-testid="boundary-draw-step">
      {/* Disclaimer — always visible */}
      <div
        className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        data-testid="boundary-disclaimer"
        role="note"
      >
        <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-600" aria-hidden="true" />
        <p>
          The boundary drawn on the map is approximate and should be legally verified before
          purchase.
        </p>
      </div>

      {/* Guidance / status text */}
      {!hasCoords && (
        <p className="text-sm text-muted-foreground" data-testid="boundary-guidance-empty">
          Draw the plot boundary on the map below. Click points to mark the boundary.
        </p>
      )}
      {hasCoords && !valid && (
        <p className="text-sm text-amber-700" data-testid="boundary-guidance-in-progress">
          Add at least 3 points to save a boundary.
        </p>
      )}
      {valid && (
        <div
          className="flex items-center gap-2 text-sm text-green-700"
          data-testid="boundary-ready-indicator"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          <span>Boundary ready</span>
        </div>
      )}

      {/* Map */}
      <div className="rounded-md border overflow-hidden">
        <MapContainer
          center={center}
          zoom={16}
          style={{ height: '350px', minHeight: '280px', width: '100%' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <DrawControl
            onPolygonDrawn={handlePolygonDrawn}
            onPolygonCleared={handlePolygonCleared}
            polygon={drawnCoords.length > 0 ? drawnCoords : null}
          />
        </MapContainer>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={onSkip}
          data-testid="boundary-skip-btn"
        >
          Skip (no boundary)
        </Button>

        <div className="flex items-center gap-2">
          {hasCoords && (
            <Button
              type="button"
              variant="ghost"
              onClick={handleClear}
              data-testid="boundary-clear-btn"
            >
              Clear Boundary
            </Button>
          )}
          <Button
            type="button"
            disabled={!valid}
            onClick={handleSave}
            data-testid="boundary-save-btn"
          >
            Save Boundary
          </Button>
        </div>
      </div>
    </div>
  );
}
