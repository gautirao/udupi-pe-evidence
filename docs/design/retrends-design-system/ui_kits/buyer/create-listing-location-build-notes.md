# Create-listing — address & map-pin flow (developer build notes)

Companion to `ui_kits/buyer/create-residential-listing.html`. Covers only Section 2 (Where is it?), Section 6 (Photos, video & location → Map pin), the buyer-preview location states, and the listing-strength location signals.

## Core product rule

A typed locality alone is **not** a location. Never treat free text as a confirmed pin. Three distinct states must exist in the data model and be reflected in UI:

```
typed address/locality   →  resolved location   →  confirmed map pin
(free text, unverified)     (geocoded candidate)   (broker-adjusted lat/lng)
```

The **Pin location on map** action stays disabled until the location is *resolved* (a search result was selected, or browser location was accepted). Pinning must start near the resolved location — never a default/random centre.

## Recommended component structure

```
<LocationSection>            // Section 2
  <AddressSearch />          // query input + Find location + Enter-to-search
  <BrowserLocationCTA />     // "Use my current location" → permission prompt
  <LocationStatePanel>       // one of: searching | results | notfound | resolved
    <SearchResultList />     // selectable candidates
    <ResolvedLocationCard /> // "Location found" + Change + privacy line
  </LocationStatePanel>
  <ProjectNameInput /> <ListingTitleInput />
</LocationSection>

<MediaSection>               // Section 6
  <PhotoGrid /> <VideoLinkInput />
  <MapPin>                   // gated on resolvedLocation
    <MapPinDisabled />       // no resolved location yet
    <MapPinCTA />            // resolved → "Pin location on map"
    <MapPinConfirmed />      // pinDone → "Map pin confirmed" + Adjust pin
  </MapPin>
  <NearbyPlaces />           // derived after pin confirmed
</MediaSection>

<MapPickerModal />           // draggable pin, Confirm / Cancel
```

## Required form state

```ts
type LatLng = { lat: number; lng: number };
type ResolvedLocation = {
  formatted: string;   // full internal line: "Indiranagar, Bengaluru 560038"
  publicLoc: string;   // buyer-facing locality: "Indiranagar, Bengaluru"
  center: LatLng;      // geocoder result used to centre the picker
  source: 'search' | 'browser';
};

locationState: {
  query: string;                 // raw typed text
  status: 'empty'|'typed'|'searching'|'results'|'notfound'|'resolved';
  results: GeocodeCandidate[];    // shown in the results list
  resolved: ResolvedLocation | null;
  geoPermission: 'idle'|'prompt'|'locating'|'granted'|'denied';
  pin: LatLng | null;            // exact broker-set pin
  pinConfirmed: boolean;         // true only after Confirm pin
}
```

Deriving completeness: `locationEntered = !!resolved`; `pinConfirmed = pin != null && pinConfirmed`. Editing `query` after resolving must invalidate `resolved`, `pin`, and `pinConfirmed` (address change → re-resolve → re-pin).

## Resolved-location vs confirmed-pin

- **Resolved** = the geocoder returned a place and the broker picked it. Enough to *enable* pinning and centre the map. Populates buyer-facing `publicLoc`.
- **Confirmed pin** = broker dragged/placed the marker and pressed **Confirm pin**. This is the routing/map-accuracy coordinate. Only this marks location "complete" in listing strength.

Listing strength shows the two as separate rows — **Location entered** and **Map pin confirmed** — and must not mark location complete on resolve alone.

## Geolocation permission states

```
idle     → show "Use my current location" CTA
prompt   → in-app rationale card (why + optional) with Allow / Not now
locating → navigator.geolocation.getCurrentPosition in flight (spinner)
granted  → reverse-geocode → set resolved{source:'browser'} → enable pin
denied   → fall back to text search; keep the CTA available
```

Always request permission explicitly with a rationale before calling the browser API; never block the flow on it. Handle `PERMISSION_DENIED`, `POSITION_UNAVAILABLE`, and `TIMEOUT` by returning the user to text search with a gentle message.

## Map picker interaction

- Open only when `resolved` exists; centre on `resolved.center`.
- Draggable marker (pointer down on map = place/drag; clamp to viewport bounds); support tap-to-place.
- **Confirm pin** commits `pin` + `pinConfirmed:true` and triggers nearby-places derivation. **Cancel** reverts to the prior state (enabled or previously-confirmed).
- **Adjust pin** re-opens the picker seeded with the current pin.

## Validation rules

- Cannot reach `resolved` without selecting a candidate or accepting browser location.
- `Find location` disabled when query is empty or a search is in flight.
- Search treated as not-found when the cleaned query is < 3 chars or has no letters → show the recovery message (add landmark / road / PIN).
- Publish gate should list "Pin the location on the map" as outstanding until `pinConfirmed`.

## Public vs private address display

- **Private (internal only):** exact pin lat/lng, full formatted address, flat/house number, PIN. Used for maps, routing, dedupe.
- **Public (buyer-facing):** `publicLoc` — locality + city only. Never render the exact pin or flat number in the buyer preview or listing detail unless product explicitly enables it.
- The resolved card and picker both restate this ("Buyers see only …") so brokers understand what is exposed.

## Prototype notes

The HTML prototype mocks the geocoder (`mockResults`) and browser location with timeouts so all ten states are demonstrable without an API. In production, swap `findLocation`/`allowGeo` for a real geocoding + reverse-geocoding service and a map SDK (the picker markup is a placeholder grid). Everything else — state machine, gating, copy, privacy handling — is production-intended.
