import { Check, MapPin as MapPinIcon } from 'lucide-react';
import { AddressPicker } from '@/components/broker/AddressPicker';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { UseResidentialLocationResult } from '@/components/broker/residential/useResidentialLocation';

// ---------------------------------------------------------------------------
// Issue #1722 correction #4 — Section 6 ("Photos & location") thin view over
// the shared useResidentialLocation hook. Renders the "Pin location on map"
// CTA (gated on `resolved`, set by either this view or Section 2's
// <AddressSearch>) and the pin-confirm modal, which wraps the EXISTING,
// UNMODIFIED AddressPicker. addressConfirmed is persisted ONLY from this
// modal's explicit Confirm — never from resolving a search result.
//
// LEAK FIX (contract §C, wire 2): the AddressPicker instance here does NOT
// receive `onLocalityConfirmed` — a pin-drag reverse-geocode inside
// AddressPicker must never overwrite the persisted `locality`.
// ---------------------------------------------------------------------------

export interface MapPinProps {
  location: UseResidentialLocationResult;
}

export function MapPin({ location }: MapPinProps) {
  const { state, pickerOpen, saveError, isSaving, openPicker, cancelPicker, adjustPin, confirmPin } = location;
  const { resolved, pin, pinConfirmed } = state;

  const seedLat = pin?.lat ?? resolved?.center.lat ?? null;
  const seedLng = pin?.lng ?? resolved?.center.lng ?? null;

  if (pinConfirmed) {
    const summary = resolved?.publicLoc || (pin ? `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}` : 'Pinned location');
    return (
      <div className="space-y-2">
        <p className="text-[13px] font-semibold">Location</p>
        <div className="flex items-center justify-between gap-3 rounded-md border border-green-200 bg-green-50 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-green-700">
            <Check className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            {/* #2647 — testid added (no copy/behaviour change): InlineNearby's
                Section 7 header now carries the same "Pin confirmed — {locality}"
                wording, so E2E must address this Section 6 banner precisely. */}
            <span className="truncate" data-testid="map-pin-status">
              Pin confirmed — {summary}
            </span>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={adjustPin}
              disabled={isSaving}
            >
              Adjust pin
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={location.clear}
              disabled={isSaving}
            >
              Change
            </Button>
          </div>
        </div>
        {saveError && <p className="text-sm text-destructive">{saveError}</p>}
        <PinDialog location={location} seedLat={seedLat} seedLng={seedLng} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[13px] font-semibold">Location</p>
      {/* #2647 — testid added (no behaviour change) because InlineNearby now
          renders a SECOND button with this same accessible name in Section 7
          (state b). Playwright's getByRole is strict-mode, so E2E specs must
          address this Section 6 CTA precisely rather than by name alone. */}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        data-testid="map-pin-open-picker"
        disabled={!resolved}
        onClick={openPicker}
      >
        <MapPinIcon className="mr-2 h-4 w-4" aria-hidden="true" />
        Pin location on map
      </Button>
      {!resolved && (
        <p className="text-xs text-muted-foreground">Confirm a location above to pin it on the map.</p>
      )}
      {saveError && <p className="text-sm text-destructive">{saveError}</p>}
      <PinDialog location={location} seedLat={seedLat} seedLng={seedLng} />
    </div>
  );
}

interface PinDialogProps {
  location: UseResidentialLocationResult;
  seedLat: number | null;
  seedLng: number | null;
}

function PinDialog({ location, seedLat, seedLng }: PinDialogProps) {
  const { pickerOpen, cancelPicker, confirmPin, state } = location;
  const publicLocCaption = state.resolved?.publicLoc || 'your locality';

  return (
    <Dialog open={pickerOpen} onOpenChange={(open) => { if (!open) cancelPicker(); }}>
      <DialogContent className="max-w-lg sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pin the exact location</DialogTitle>
          <DialogDescription data-testid="map-pin-privacy-caption">
            Buyers see only &quot;{publicLocCaption}&quot; — the exact pin and address stay private.
          </DialogDescription>
        </DialogHeader>
        {pickerOpen && (
          <AddressPicker
            initialLatitude={seedLat}
            initialLongitude={seedLng}
            initialLocality={state.resolved?.formatted ?? ''}
            initialConfirmed={false}
            onConfirm={confirmPin}
            onUnconfirm={location.clear}
            // LEAK FIX — onLocalityConfirmed intentionally NOT wired here (contract §C).
          />
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={cancelPicker}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
