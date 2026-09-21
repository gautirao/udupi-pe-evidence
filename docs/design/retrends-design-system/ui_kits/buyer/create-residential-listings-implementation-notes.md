# Create Residential Listing — implementation notes for #2642

Companion to `ui_kits/buyer/create-residential-listing.html`. Written for Claude CLI as the implementation blueprint. Read with `create-listing-location-build-notes.md` (location semantics) and `create-listing-cli-investigation-guide.md` (how to render/verify the mock).

Production code inspected at `gautirao/udupi-property-explorer@main` (2026-09-21): `PoiManager.tsx`, `InlineNearby.tsx`, `useResidentialLocation.ts`, `ResidentialFormPrimitives.tsx`, `AreaField.tsx`, `residentialListingPayload.ts`, `poi-categories.ts`, `ListingPoiController.java`, `ManualPoiRequest.java`, `ListingPoi.java`.

---

## 1. Purpose

This note translates the approved HTML design into production implementation guidance for **#2642 — ux(broker): refine Create Listing location/POI flow and area quick-select chips**.

- The **HTML mock is the visual and interaction source of truth**: layout, hierarchy, copy, states, affordance placement.
- The **production app remains the behavioural and data authority**: query keys, endpoints, enum values, the 3-state location invariant, auth/ownership gating.
- **Do not port the mock's internal state model.** The mock is a single React class with `poiFetch`/`poiTab`/`poiDraft`/`suggested`/`approved` local state and a mocked provider (`fetchPoi`, `deriveSuggestions`) plus a `PROTOTYPE STATES` button row. All of that exists only to make nine states demonstrable offline. Production keeps react-query + the real endpoints.
- `#2641` (locality lost after draft refresh) is **not** solved by this work. §12 lists the exact places where #2642 touches the same location state so the two don't collide.

---

## 2. Source-of-truth hierarchy

When two inputs disagree, resolve in this order:

1. **Current production semantics / working backend contracts** — `PoiCategory` enum, `/pois/*` endpoints, `addressConfirmed` write rules, ownership checks.
2. **#2642 acceptance criteria.**
3. **Approved `create-residential-listing.html`.**
4. **This note.**
5. **Older screenshots / earlier mocks / earlier issue threads** (#1718, #1722, #2039, #2065 comments) — historical context only.

If the mock contradicts backend/data semantics, **do not invent behaviour** — implement the production semantics and flag the mismatch on #2642. The known mismatches are listed in §11; three of them (category vocabulary, manual distance persistence, `formatDistance(null)`) must be decided before the POI panel can be finished.

---

## 3. Page composition map

```text
Mock section (HTML)                     Production component                                      State / data source
─────────────────────────────────────── ───────────────────────────────────────────────────────── ────────────────────────────────────────────
§1 Property type & purpose              ResidentialListingForm → Section 1                        useResidentialListingFormState (propertyType, listingPurpose)
§2 Where is it?                         ResidentialLocalitySection → AddressSearch                useResidentialLocation (query/status/results/resolved)
  ├ "Saved in draft" cue                  (new, small)                                            draftListing.locality from useGetListing — NOT local state (see §12)
  ├ Project / society name                Field + Input                                           formState.projectName
  └ Listing title                         Field + Input                                           formState.title
§3 Property details                     ResidentialPropertyDetailsSection                         formState
  ├ Carpet area + chips                    CarpetAreaInput (MUST GAIN CHIPS — §5)                  formState.carpetArea / carpetAreaUnit
  ├ Built-up area + chips                  AreaField (already has chips)                           formState.builtArea / builtAreaUnit (landArea for plots)
  └ BHK / bath / balcony / furnishing      SingleChipGroup + residentialFormConstants              formState
§4 Sale terms                           ResidentialTermsSection                                   formState
§5 More details                         ResidentialMoreDetailsSection                             formState
§6 "Photos & video"                     Photos/media section (RENAME — §9)                        formState.photos / videoUrl
§7 Nearby Points of interest            InlineNearby → PoiManager (RESTRUCTURE — §6, §7)          server: GET /api/listings/{id}/pois/suggestions
  ├ pin-not-confirmed prompt               InlineNearby's gate branch                              server addressConfirmed (never local)
  ├ "Location resolved — X" + pin CTA      new branch in InlineNearby                              useResidentialLocation.state.resolved && !addressConfirmed
  ├ green "Pin confirmed — X" block        new sub-component (PoiLocationHeader)                   addressConfirmed + draftListing.locality (publicLoc)
  ├ mode tabs (3)                          PoiManager Tabs                                         local UI state only
  ├ Suggested list                         PoiRow                                                  suggestions.pois where !approved && !SETTLEMENT
  ├ Approved list                          PoiRow                                                  suggestions.pois where approved && !SETTLEMENT
  └ Add manually form                      AddManualForm (own tab — §8)                            POST /pois/manual
§8 Description                           description section                                      formState.description
Right rail: Buyer preview               ResidentialSidebarSummary → BuyerPreviewCard              computeResidentialSpecChips
Right rail: Listing strength            strength meter + checklist                                strength inputs incl. localityResolved / addressConfirmed
Sticky Save draft / Review & publish    existing sticky action bar                                unchanged
```

The mock's "Location Context" equivalent does **not** exist in the design. Production `PoiManager` renders an auto-computed settlement block (village / town / highway) for non-apartment types. **Keep it** — it is real data the design simply didn't draw. Place it above the mode tabs, styled as a muted read-only card consistent with the mock's canvas panels.

---

## 4. What the mock is, mechanically

- One file, React 18 + Babel in-browser, design-system bundle via `<script src="../../_ds_bundle.js">`, components read off `window.ReTrendsDesignSystem_f37966` (`Button`, `Input`, `Select`).
- Inline styles throughout; the only CSS rules are `@keyframes spin/fadeUp` and three responsive blocks (`max-width: 1080px`, `920px`, `560px`).
- Interactive for real: type/pick/pin, approve/dismiss, tab switching, manual add, validation, review mode.
- Mocked: geocoder (`mockResults`), browser geolocation, POI provider (`fetchPoi` with `setTimeout`), map picker (CSS grid, not a map SDK).
- `PROTOTYPE STATES` row (`poiDemoBtns`) drives the nine POI states — **prototype-only, do not ship**.

---

## 5. Area quick-select chips (§3)

**Design rule:** label → chip row → `[ numeric input ] [ unit ▾ ]`. Chips **above** the input for both Carpet area and Built-up area. The user explicitly rejected chips beside or below the input.

Presets in the mock (apartment): `600, 800, 1,000, 1,200, 1,500, 2,000 sqft` — **identical to `AreaField.CHIPS.apartment`**. No new preset table is needed.

Production today:
- `AreaField.tsx` already renders `role="radiogroup"` chips above the input, per-type presets, unit select, exact-match chip highlight (`activeChipIndex`, value **and** unit must match), and a conversion helper line. Used for Built area / Land area.
- `CarpetAreaInput` (in `ResidentialFormPrimitives.tsx`) deliberately has **no chips** — its doc comment cites "#1722 correction #3 — design parity". **#2642 reverses that decision.** Update the comment when you change it, or the next reader will revert you.

**Recommended implementation:** export the apartment/house chip sets from `AreaField.tsx` (e.g. `export const AREA_CHIPS = CHIPS`) and render the same chip row inside `CarpetAreaInput`, reusing `AreaField`'s chip markup/classes so the two rows are visually identical. Prefer this over swapping carpet area to `AreaField` wholesale, because `AreaField` hardcodes `required` styling, its own label defaults (`Built Area` / `Land Area`), and the conversion line — and it is shared with commercial/land/agricultural flows that are out of scope.

Behaviour to match the mock:
- Clicking a chip sets value **and** unit, and highlights that chip.
- A hand-typed value (e.g. `1375`) is fully valid with **no** chip selected. The mock additionally shows a mono `Custom · 1,375 sq.ft` marker at the right of the label row — optional polish; if you skip it, keep the existing conversion line, which serves the same "your number was understood" purpose.
- Carpet area stays optional; Built-up area keeps `*` and the existing submit gate.
- The mock shows an advisory when carpet > built-up: *"Built-up area is normally larger than carpet area — check both values."* Non-blocking, ochre, never disables submit. Implement as a derived hint, not validation.
- Keep `type="number" min="0" step="any" inputMode="decimal"` and `aria-checked` on chips.

Mobile: `.cl-area-row > div { width: 108px }` at ≤560px — the unit select narrows so the number field keeps a usable width. Chips wrap (`flex-wrap`), never scroll horizontally.

---

## 6. Confirmed-pin context moves into §7

**Why:** nearby places are computed *from* the confirmed pin. Showing "Pin confirmed — Manipal" in §6 and the POI panel in §7 hid the dependency.

Render one of three gate states at the top of the POI card, above the tabs:

| Gate | Condition (production) | Design |
|---|---|---|
| **Pin not confirmed** | `!resolved && !addressConfirmed` | dashed canvas panel, pin glyph, "Add the location first" prompt, link back to §2 |
| **Location resolved, not pinned** | `resolved != null && !addressConfirmed` | neutral panel: **"Location resolved — {publicLoc}"**, body *"A resolved locality is not a confirmed pin. Place the pin on the property to calculate nearby places."*, primary CTA **Pin location on map** → opens the existing picker (`openPicker`) |
| **Pin confirmed** | `addressConfirmed === true` | green/evergreen panel: **"Pin confirmed — {publicLoc}"**, sub *"Nearby places will be shown for this location."*, secondary **Change location**, footer *"Buyers see only {publicLoc} — the exact pin stays private."* |

Rules:
- Use the **server** `addressConfirmed` flag (from `useGetListing`), exactly as `InlineNearby` does today. Never a local boolean.
- Never render lat/lng or `resolved.formatted`. Only `publicLoc` / persisted `locality`.
- **Change location** navigates to §2 (focus the address input) and opens the picker path the broker already knows. It must **not** itself write `addressConfirmed:false` — unconfirming stays in `useResidentialLocation.clear()` / `editQuery()`. Do not add a second unconfirm path.
- Keep the three location states visually distinct (typed → resolved → confirmed). A typed or resolved "Manipal" never gets the green treatment.
- Listing strength keeps two separate rows — **Location entered** and **Map pin confirmed**.

Component shape: keep the gate branches in `InlineNearby.tsx` (it already owns the gate) and pass `publicLoc`, `addressConfirmed`, `resolved`, `onChangeLocation`, `onOpenPicker` down. `PoiManager` then only owns tabs + lists, and stays reusable by `EditListing.tsx`. If `EditListing` mounts `PoiManager` directly, give the header block a prop-gated render so Edit doesn't grow a stray green banner.

---

## 7. POI information architecture — three modes

**Today:** `Tabs` with `nearby` + `approved`, and `AddManualForm` rendered *inside the Approved tab* under a `<Separator/>`. That is the confusion #2642 fixes.

**Target:** three explicit modes, one row, underline-style triggers:

```
[ ✨ Suggested nearby places ]  [ ✓ Approved (N) ]  [ ＋ Add manually ]
```

- Tab values: `suggested` | `approved` | `manual` (rename `nearby` → `suggested`; keep the existing `setActiveTab('approved')` jump after a successful approve).
- **Suggested** — provider-derived, unapproved, non-settlement POIs. Row actions: **Approve** (primary-dark) and **Dismiss** (delete). Keep pin/unpin only if product still wants it in this flow; the mock shows Approve + Dismiss only, and pinning is available from the Approved list.
- **Approved (N)** — approved, non-settlement POIs, current sort (pinned first, then distance). Count in the tab label. Manual entries carry a `BROKER-ADDED` badge. **No manual form underneath.**
- **Add manually** — its own panel (§8).
- Empty states per mode: Approved-empty = *"No approved places yet. Approve a suggestion or add one manually."* with a button back to Suggested and a link to Add manually.
- After all suggestions are reviewed, show the mock's "All suggestions reviewed" strip with a **Check again** action (refetch), not a blank list.
- A newly added manual place lands on the Approved tab with a transient green *"{name} added"* pill (the mock's `poiJustAdded`).

Every mode keeps the OSM attribution line (`POI data © OpenStreetMap contributors (ODbL)`) — present in production, and legally required.

---

## 8. Add manually — V1 simplification

The location search is **removed** for V1 so manual POIs map cleanly to a future spreadsheet import (`name`, `category`, `distance`, `distance unit`) and need no geocoding.

Final field list and copy:

| Field | Control | Copy |
|---|---|---|
| Name | text input, required | placeholder `e.g. Sri Krishna Temple` |
| Category | select, required | placeholder `Select category` |
| Distance from property | number input + unit select (`km` / `m`) | label `Distance from property` + muted `optional`; helper *"Add the approximate distance if you know it — you can leave this blank."* |
| — | submit | `Add place`; provenance note *"Places you add are labelled broker-added, not platform-verified."* |

- **Delete** `locationQuery` / `locationResults` / `locationChip` / `showLocationResults` / the debounce ref / the click-outside effect / the `searchNominatim` import / the "Add without location" link from `AddManualForm`. This is a net deletion of ~120 lines.
- Distance units are **m** and **km** only. No minutes, no walking/driving time, no free text, no "nearby".
- Validation: blank is valid; otherwise `^\d*\.?\d+$` and `> 0`. On invalid, ochre border + *"Enter a positive number, like 1.3 or 850."* and disable `Add place`. Keep `Add place` disabled while name or category is empty, and while the mutation is pending (`Adding…`).
- Normalise to metres on submit: `km → round(value * 1000)`, `m → round(value)`. Examples: `1.3 km → 1300`, `850 m → 850`.
- Persist the last-used unit for the next entry (the mock keeps `unit` after a successful add).
- Mobile (≤560px): Name full width, Category full width, distance number + unit side by side, `Add place` full-width-ish below. No horizontal scroll.

**Backend delta (the one contract change in this work):** `ManualPoiRequest` currently has `(name, category, latitude, longitude)` and the controller hardcodes `poi.setDistanceMeters(null)` with the comment "manual POIs have no auto-calculated distance". To ship the design, add a nullable `Integer distanceMeters` to the request, validate `> 0` (400 otherwise), and set it on the entity. `listing_pois.distance_meters` already exists — **no migration needed**. Latitude/longitude stay in the DTO (other callers/bulk import may use them); the web form simply stops sending them.

---

## 9. Provider error, genuine empty, retry

`GET /pois/suggestions` already returns `{ pois, providerIssue }`, where `providerIssue` is true only when an Overpass fetch **failed** (as opposed to returning nothing). Production currently renders both cases as text and tells the broker to *"refresh and try again"* / *"add places manually from the Approved tab"*. Replace with two visually distinct inline states:

**A. Provider failure** (`providerIssue === true`, or the query itself errored) — ochre/warning panel, **not** destructive red:
- Title: **"Couldn't fetch nearby places right now"**
- Body: *"The map data provider may be temporarily unavailable. Your pin and the rest of this listing are unaffected."*
- Primary: **Retry** → `refetch()` (or invalidate `['pois','suggestions',listingId]`). While in flight: spinner + **"Retrying…"**, button disabled. This is state 9 of 9 and must be implemented, not faked.
- Secondary, inline: *"You can still **add a place manually**."* → switches to the `manual` tab.
- No "refresh the page" copy anywhere.

**B. Genuine empty** (`providerIssue === false && pois.length === 0`) — neutral dashed panel, search glyph:
- **"No nearby places were found around this location."**
- *"Common for new layouts and outskirt plots. Add the landmarks buyers ask about — a school, bus stop or temple."*
- Primary: **Add a place manually**; secondary: **Check again**.

**C. Loading** — keep `SkeletonRows`; the mock's caption *"Finding nearby places around {publicLoc}…"* is a nice addition above the skeletons.

The two panels must not be interchangeable — a provider failure is recoverable, an empty result is an invitation to add.

---

## 10. Category vocabulary — must be resolved before coding

The mock's picker is illustrative: `School`, `Hospital / clinic`, `Transport`, `Market / shopping`, `Restaurant / cafe`, `Temple / landmark`, `Beach / river / coast`, `Other`.

Production is a closed enum. `PoiCategory` + `CATEGORY_LABELS` give: `TRANSPORT` (Bus / Transit), `GROCERY` (Supermarket / Market), `HOSPITAL` (Hospital / Clinic), `SCHOOL` (School / University), `WORSHIP` (Place of Worship), `HOTEL`, `AIRPORT`; settlement categories `TOWN_CENTER` / `VILLAGE_CENTER` / `HIGHWAY` are auto-computed and rejected for manual add/approve/delete. `POST /pois/manual` 400s on any value that isn't a `PoiCategory` name.

**Implement with the production enum and the existing labels** (`AMENITY_CATEGORY_ORDER` + `CATEGORY_LABELS`) — do not send `Other`, `Restaurant / cafe` or `Beach / river / coast`. If product wants those, that's an enum + migration change, out of scope for #2642. Category stays **required** (the mock's silent `Other` default is a prototype shortcut).

---

## 11. Mock-vs-production mismatches to flag, not silently "fix"

1. **Category list** — mock labels ≠ `PoiCategory`. Use production (§10).
2. **Manual distance** — design asks for it; API drops it. Needs the `ManualPoiRequest` change (§8). Until then, a manual place has no distance and renders category-only.
3. **`formatDistance(null)` returns `"manual"`** — the design says *omit distance entirely* when absent (never "0 km", never "distance unavailable"). Change the POI row to render `CATEGORY_LABELS[c]` alone when `distanceMeters == null`, rather than changing `formatDistance` (it has other call-sites; check them if you do).
4. **Category optional in the mock** — required in production. Keep required.
5. **Dismiss = hard delete** — the mock's "Dismiss" only hides locally; production `DELETE /pois/{id}` is a hard delete and a dismissed suggestion can reappear on the next Overpass refresh. Acceptable, but write the copy honestly (Dismiss, not "Remove forever").
6. **Approve is optimistic in the mock** — production has `approveMutation` with a destructive toast on failure. Keep the toast.
7. **Mock area units are `Sq.ft/Sq.m/Sq.yd/Cents/Acre`** for residential; production `CarpetAreaInput` offers `sqft`/`sqm` only. Keep production's two.
8. **Mock "Photos & video" vs production section title** — see §12 rename.
9. Mock `PROTOTYPE STATES` row, mocked geocoder, mocked picker grid — never ship.

---

## 12. §6 rename and the #2641 boundary

**Rename:** with the confirmed-pin context moved to §7, §6 holds only photos (+ the video link). The mock titles it **"Photos & video"**; if the production section has no video field, title it **"Photos"**. Do **not** move the locality search out of §2, and do not move the map-pin CTA out of the existing media/location flow described in `create-listing-location-build-notes.md` — §7 *echoes* pin status and offers the CTA, it doesn't take ownership of the picker.

**#2641 touchpoints (do not fix here, but do not break):**
- `useResidentialLocation.ts` mount seeding: the `addressConfirmed + lat/lng` branch and the locality-only branch (`status:'typed'`, `localityResolved:true`, no fabricated `center`). Both are load-bearing; the "Saved in draft" cue must read the same persisted value, not a new local flag.
- `editQuery()` invalidation must keep clearing `resolved`/`pin`/`pinConfirmed`/`localityResolved` and unconfirming server-side.
- The mock's §2 cue — *"This location text is saved with your draft. The map pin is separate — confirm it in Nearby Points of interest."* — must render **only** when a draft exists and `draftListing.locality` is non-empty. Never on keystroke, never optimistic. If #2641 is still open, gate the cue behind the same data it describes; it will start telling the truth when #2641 lands.

---

## 13. Reuse vs build

**Reuse as-is:** `Card`/`CardHeader`/`CardContent`, `Tabs`, `Alert`, `Badge`, `Button`, `Input`, `Label`, `Select`, `Skeleton`, `Separator`, `useToast`; `PoiRow`, `SkeletonRows`; react-query keys `['pois','suggestions',listingId]` and `['pois',listingId]`; `formatDistance`, `CATEGORY_LABELS`, `AMENITY_CATEGORY_ORDER`, `SETTLEMENT_CATEGORIES`; `useResidentialLocation` in full; `AreaField` chip markup; `Field`/`Section`/`SectionHeader` primitives; the existing sticky action bar, `BuyerPreviewCard`, strength meter.

**Build (small, local):**
- `PoiLocationHeader` — the three gate panels (§6).
- Chip row inside `CarpetAreaInput` (§5).
- Provider-error and genuine-empty panels (§9).
- Distance field + unit select inside `AddManualForm` (§8).

**Do not build:** a new tab component, a new chip primitive, a new POI row, a new toast/alert system, a second location state machine, a new query key, a mock geocoder.

---

## 14. Files likely to change

```
apps/web/src/components/poi/PoiManager.tsx                                 tabs → 3 modes; AddManualForm out of Approved; error/empty panels; retry
apps/web/src/components/broker/residential/InlineNearby.tsx                three location gate states + confirmed header
apps/web/src/components/broker/residential/ResidentialFormPrimitives.tsx   CarpetAreaInput gains the chip row (update the #1722 comment)
apps/web/src/components/broker/AreaField.tsx                               export the chip table (no behaviour change)
apps/web/src/components/broker/residential/ResidentialListingForm.tsx      §6 title; wire publicLoc/onChangeLocation/onOpenPicker into InlineNearby
apps/web/src/lib/poi-categories.ts                                         only if distance-absent rendering moves here
apps/api/.../poi/ManualPoiRequest.java                                     + Integer distanceMeters
apps/api/.../poi/ListingPoiController.java                                 validate + persist distanceMeters on manual add
```

**Should not change:** `useResidentialLocation.ts` (unless #2641 dictates), `deriveResolvedLocation.ts`, `AddressPicker`, `useUpdateListing`, `residentialListingPayload.ts` (area payload shape is unchanged — chips only set existing fields), `OverpassService`, `ListingPoiService`, `ListingPoi.java`, the `listing_pois` schema, commercial/agricultural flows, `EditListing.tsx` beyond prop plumbing.

---

## 15. Desktop / mobile behaviour

- **Desktop (1280–1440):** two-column — form left, sticky right rail (buyer preview + listing strength). POI card is full-width in the left column; confirmed block is a single row with **Change location** right-aligned (`white-space: nowrap`). Mode tabs on one row.
- **≤1080px:** mode tabs tighten (16px gap) and wrap rather than clip — the third tab must never be cut. This was a real defect in the mock; keep the equivalent guard.
- **≤920px:** single column, right rail moves below the form, photo grid 3-up, top nav collapses.
- **≤560px (390 target):** address search stacks (input then full-width Find location); mode tabs 12px and wrapped; POI row actions drop to a full-width row indented under the name (44px targets); manual form fields stack; area chips wrap with a narrower unit select. No horizontal page scroll at any breakpoint.
- Confirmed block must not become cramped at 390 — stack text then the Change location button, keep the privacy line on its own row.

---

## 16. Evidence and tests

Extend `apps/web/src/components/poi/PoiManager.test.tsx`:
1. Three tab triggers render; `Add manually` form is **not** in the Approved panel.
2. `providerIssue: true` → error panel with a **Retry** button; clicking it refetches; `Retrying…` shown while pending.
3. `providerIssue: false, pois: []` → empty panel with **Add a place manually**; asserts the error panel is absent.
4. Approving a suggestion moves it to Approved and switches tabs.
5. Manual add posts `{ name, category, distanceMeters }` — `1.3 km → 1300`, `850 m → 850`; blank distance posts `distanceMeters: null`/omitted.
6. Invalid distance (`-1`, `abc`) disables submit and shows the inline message; no request is made.
7. A POI with `distanceMeters: null` renders category only — no "manual", no "0 km".

Residential form tests: carpet-area chip click sets value + unit and marks `aria-checked`; a typed custom value clears chip selection and still submits; built-up chips unchanged.

Location tests (`useResidentialLocation`): unchanged assertions must still pass — resolve never sets `addressConfirmed`; `editQuery` invalidation still unconfirms; mount seeding untouched.

E2E (create-listing / POI): confirm pin → suggestions load → approve one → add one manually with a distance → both appear in Approved with badge and distance; provider failure path shows Retry and recovers.

Manual evidence to attach to #2642: desktop screenshots of the two area-chip rows, suggestions, provider error, Approved, Add manually; 390px screenshots of area chips, confirmed block + modes, error + Retry, manual form. Reference set lives in `screenshots/` of this design project (`01-cl-desk.png`, `01…09-cl-poi.png`, `01-cl-manual.png`, `02-cl-manual-units.png`, `03-cl-manual-units.png`, `cl-mob-manual-form*.png`, `01-cl-mob-add.png`). Check the browser console is clean.

---

## 17. Copy inventory (use verbatim)

```
§2  This location text is saved with your draft. The map pin is separate — confirm it in Nearby Points of interest.
§3  Carpet area / Built-up area *
    Tap a common size or type the exact number. Buyers compare on carpet area.
    Required to submit this listing for review.
    Built-up area is normally larger than carpet area — check both values.
§7  Nearby Points of interest
    Add nearby amenities to show what makes this location great for buyers. Suggestions are calculated from the confirmed map pin.
    Location resolved — {publicLoc}
    A resolved locality is not a confirmed pin. Place the pin on the property to calculate nearby places.
    Pin confirmed — {publicLoc}
    Nearby places will be shown for this location.
    Buyers see only {publicLoc} — the exact pin stays private.
    Change location
    Suggested nearby places | Approved ({n}) | Add manually
    From the map data provider — approve what buyers should see.
    Finding nearby places around {publicLoc}…
    Couldn't fetch nearby places right now
    The map data provider may be temporarily unavailable. Your pin and the rest of this listing are unaffected.
    Retry / Retrying… / You can still add a place manually.
    No nearby places were found around this location.
    Common for new layouts and outskirt plots. Add the landmarks buyers ask about — a school, bus stop or temple.
    Add a place manually / Check again
    All suggestions reviewed. Approved places are listed under Approved ({n}).
    Shown to buyers on the listing, in this order.
    No approved places yet. Approve a suggestion or add one manually.
    Name / Category / Distance from property (optional)
    Add the approximate distance if you know it — you can leave this blank.
    Enter a positive number, like 1.3 or 850.
    Places you add are labelled broker-added, not platform-verified.
    Add place
    BROKER-ADDED
    POI data © OpenStreetMap contributors (ODbL)
```

---

## 18. Implementation order

1. Backend: `distanceMeters` on `ManualPoiRequest` + controller validation/persistence (+ API test).
2. `AddManualForm`: delete the location search, add distance + unit, normalise to metres, validation.
3. `PoiManager`: three tabs, move the form, error/empty/retry panels, distance-absent rendering.
4. `InlineNearby` + `ResidentialListingForm`: gate states, confirmed header, prop plumbing, §6 rename.
5. Carpet-area chips.
6. Tests, then screenshots at 1440 and 390.

Ship 1–3 and 4–5 as separate reviewable commits; they touch disjoint files and #2642 is easier to review that way.
