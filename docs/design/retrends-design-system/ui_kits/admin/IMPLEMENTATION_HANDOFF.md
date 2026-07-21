# City Launch — Implementation Handoff (Claude CLI)

Admin-only **City Launch** wizard for the ReTrends property platform. This document maps the frozen, approved mock to a production React implementation. **No production code is written here** — this is a build guide.

> Golden rule: the Preview step reuses the **real Discover map** (`window.DPMap`). Do **not** build a second, simplified Discover map. Everything the operator sees in Preview must be the production Discover experience pointed at a sandbox revision.

---

## 1. Where the mock lives

All City Launch mock files live in **`ui_kits/admin/`**:

| File | Role |
|---|---|
| `ui_kits/admin/index.html` | **Entry page.** App shell: loads deps, mounts the in-page router (`App`), owns wizard state (selected city, per-city validation, launched flag). Open this file to run the mock. |
| `ui_kits/admin/admin-data.js` | Mock data (no backend): `RTA_CITIES`, `RTA_PREP_STEPS`, `RTA_VALIDATION`, `RTA_STATUS`, and `RTA_PREVIEW_PATH` (the guided review path + the simulated listing record). |
| `ui_kits/admin/AdminChrome.jsx` | `RTA_Header`, `RTA_Stepper` (persistent 4-step wizard), `RTA_Page` container. |
| `ui_kits/admin/SelectCityScreen.jsx` | Step 1 — `RTA_SelectCity` (launch-queue table). |
| `ui_kits/admin/PrepareCityScreen.jsx` | Step 2 — `RTA_PrepareCity` (preparation steps, running/failed/done). |
| `ui_kits/admin/PreviewValidateScreen.jsx` | Step 3 — `RTA_PreviewValidate` (the thin shell around the real Discover map + validation checklist). |
| `ui_kits/admin/LaunchScreen.jsx` | Step 4 — `RTA_Launch` (validation summary + guarded launch). |

### Discover source of truth (reused, do not fork)
| File | Role |
|---|---|
| `ui_kits/discover/index.html` | **Visual + interaction source of truth** for the Discover experience. |
| `ui_kits/discover/src/data.js` | `window.BLR_DATA` (city → regions → groups → areas → listings), `window.BLR_COUNTS`, `window.BLR_INR`, geo helpers. The preview city is this dataset presented as a sandbox revision. |
| `ui_kits/discover/src/PortalMap.jsx` | **`window.DPMap`** — the one Leaflet map. Region bubbles, area-group pills, area markers, clustered listing pins, listing popups, camera-fit, breadcrumb. Reused **unchanged**. |
| `ui_kits/discover/src/DiscoverPanel.jsx`, `src/DiscoverPortal.jsx`, `src/components/*` | Rest of the consumer Discover shell (panel, cards). Reference for the full experience; the admin preview only mounts `DPMap`. |

### Shared framework / assets
- **Tokens/CSS:** `styles.css` (root) — linked by every mock page; all colors/spacing/type are CSS vars.
- **Components:** `_ds_bundle.js` (root) → `window.ReTrendsDesignSystem_f37966` (`Icon`, `Button`, `Badge`, `Card`, `Input`, `Select`, `TrustBadge`, `PropertyCard`, …).
- **Leaflet 1.9.4** + **CARTO Voyager** tiles (loaded via CDN in `index.html`).
- **Simulated-listing image:** an Unsplash URL (`photo-1560448204-...`) declared in `RTA_PREVIEW_PATH.sim.image`. Real listing imagery comes from `BLR_DATA` records. Swap for real assets in production.

---

## 2. How to run and navigate

### Run locally
The mock is plain HTML + Babel-in-browser; it must be **served over HTTP** (relative `../../styles.css`, `../../_ds_bundle.js`, `../discover/src/*` and Leaflet CDN must resolve).

```
# from the project root
npx serve .        # or: python3 -m http.server 8000
# then open:
#   http://localhost:8000/ui_kits/admin/index.html
```

Opening the file via `file://` will not load the relative assets — serve it.

### Full interaction path
1. **Select Bengaluru** — Step 1 table; the `Bengaluru` row is `Ready for preview`. Click **Continue** → Step 3 (a prepared city skips straight to preview). *(A `Not started` city shows **Prepare city**; `Preparing` shows **View progress**; `Ready to launch` shows **Review & launch**.)*
2. **Prepare / continue the sandbox revision** — Step 2 (`RTA_PrepareCity`) shows the six preparation steps with timestamps; a not-started city simulates a running preparation, a failed city shows the failed step + retry. Bengaluru is already prepared (rev 7), so this step is skipped when continuing.
3. **Open Preview & Validate** — Step 3. Persistent **PREVIEW MODE · SANDBOX** banner: city, `rev 7 (draft)`, `NOT LIVE`, `Isolated preview`.
4. **Landing** — map shows **macro-region bubbles only** (North / South / East / West / Central), fit to the whole city. Rail breadcrumb: `Bengaluru`.
5. **Click `North`** — camera flies to North; region bubbles disappear.
6. **Confirm** — map fits North and shows **area groups only** (Airport Belt, Thanisandra–Hennur Belt, Outer North). Breadcrumb: `Bengaluru › North`.
7. **Click `Airport Belt`** — camera flies to the group.
8. **Confirm** — map fits the group and shows its **individual areas** (Hebbal, Yelahanka, Jakkur, Devanahalli). Breadcrumb: `Bengaluru › North › Airport Belt`.
9. **Click `Hebbal`** — camera fits Hebbal.
10. **Confirm** — Hebbal is the focus; unrelated areas are gone; a single copper price pin (the simulated listing) shows. Footer: `Showing 1 simulated listing in Hebbal`.
11. **Click the simulated listing** pin.
12. **Confirm** — the **real Discover image-led listing card** opens (`DPMap` popup): representative image, `Simulated listing` tag, price (`₹1.50 Cr`), `Apartment` + `3 BHK`, `Hebbal Kempapura, Hebbal`, `3 BHK · 2 bath · 1500 sq.ft`, and the **Show in list** affordance.
13. **Tick / untick** the five checks (Landing, Regions, Area Groups, Areas, Listing) — plain checkboxes, fully reversible, never auto-completed by map clicks.
14. **Outcome controls:**
    - **Mark preview validated** — enabled *only* when all five are ticked; advances to Step 4 (Launch).
    - **Preview not ready** — reveals guidance: *update the review spreadsheet / pipeline input, discard this revision, rerun preparation, return to preview*, with **Back to city launch** / **Discard preview revision**. No issue editor.
    - **Reset validation** — clears the five checks; does **not** discard the revision.
    - **Exit preview** (banner) — returns to Step 1.
15. **Launch page** (`RTA_Launch`) — read-only summary of the five checkpoints; **doubly guarded**: the launch button is disabled until all checks pass **and** requires typing the city name to confirm. This is the only screen that writes to production; on confirm it promotes the sandbox revision → city live.

---

## 3. Expected map state transitions

| State | Visible marker/layer | Camera fit | Breadcrumb / review path | Hidden / faded | Allowed next |
|---|---|---|---|---|---|
| **City landing** | Macro-region bubbles only (N/S/E/W/Central) | Fit whole city | `Bengaluru` · path: North → Airport Belt → Hebbal → Simulated listing | Individual areas, groups, listings all hidden | Click a region bubble |
| **Region selected** | Area-group pills for that region only | Fit region bounds | `Bengaluru › North` | All other regions hidden; areas/listings hidden | Click a group; breadcrumb back to city |
| **Area group selected** | Individual area markers within the group | Fit group's member-area bounds | `Bengaluru › North › Airport Belt` | Other groups/regions hidden | Click an area; breadcrumb back |
| **Area selected** | Single simulated listing pin inside the area | Fit area bounds | `Bengaluru › North › Airport Belt › Hebbal` | All other areas hidden | Click the listing pin; breadcrumb back |
| **Simulated listing open** | Listing pin + real Discover popup card | Pan-into-view (no re-fit) | Same as area | Nothing else changes | Show in list; close popup; breadcrumb back |

Notes: camera uses `flyToBounds`/`flyTo` (already in `DPMap`). Navigation is reversible via the rail breadcrumb; validation checkboxes are independent of navigation.

---

## 4. Reuse requirements (do NOT duplicate)

Reuse the existing production Discover primitives — do not re-implement any of them:

- **Discover map** → `window.DPMap` (one Leaflet instance). **Must not create a second simplified Discover map.**
- **Region bubbles** → `DPMap` `region-bubbles` layer.
- **Area-group markers** → `DPMap` `area-groups` layer (declutter/pills).
- **Area markers / boundaries** → `DPMap` `area-areas` layer (degradation bands, `+N areas` chips).
- **Listing marker + image card/drawer** → `DPMap` clustered leaf markers + `listingPopupHTML` popup. The simulated listing is just a normal listing record fed to this layer.
- **Camera-fit logic** → `DPMap` `fitBounds`/`flyTo` (`PAD`, `CAM` constants). Do not hand-roll camera math.
- **Breadcrumbs & scope navigation** → `DPMap` `crumb` prop + the wizard's `nav` state driving `layer`/`scope`/`selection`.
- **Design-system UI** → `window.ReTrendsDesignSystem_f37966` (`Button`, `Badge`, `Card`, `Input`, `Icon`) + `styles.css` tokens.

The admin work is a **thin controller + shell** on top of `DPMap`, nothing more.

---

## 5. Security boundaries

- **Admin-only route & API.** All City Launch routes (`/admin/cities/*`) sit behind an admin guard; non-admins never see the nav, routes, or endpoints. The mock signals this with the `Admin only` lock in the header and the `🔒 Admin` chrome pill.
- **Sandbox revision isolation.** Preparation and preview operate on a **draft sandbox revision** (`rev N (draft)`) that is physically separate from the live Discover dataset.
- **Preview is read-only.** No write/publish action exists on the Preview page. The map loads the draft revision only.
- **Simulated listings never persist.** The simulated first listing exists only in the preview session (client-side/preview-scoped); it is never written to any store and never appears to real users.
- **Preview cannot launch a city.** There is no launch/enable action anywhere in Preview.
- **Only the final Launch action writes to production**, and it is disabled until all five checks pass **and** requires type-to-confirm. It promotes the validated revision → live.
- **Normal users cannot access preview cities or data.** Not-yet-live cities and their sandbox revisions are invisible outside the admin surface.

---

## 6. Implementation mapping (mock → React)

### Pages / routes
| Mock | Route | Notes |
|---|---|---|
| `index.html` `App` router | `/admin/cities/launch` (+ nested step routes) | Wrap in `AdminGuard`. |
| `RTA_SelectCity` | `/admin/cities` | Launch-queue table. |
| `RTA_PrepareCity` | `/admin/cities/:cityId/prepare` | Preparation progress. |
| `RTA_PreviewValidate` | `/admin/cities/:cityId/preview` | Reuses `DPMap`. |
| `RTA_Launch` | `/admin/cities/:cityId/launch` | Guarded write. |

### Reusable components (already exist — reuse)
- `DPMap` (Discover map) and all its layers/popups.
- Design-system `Button`, `Badge`, `Card`, `Input`, `Select`, `Icon`.

### New **thin wrapper** components to build
- `CityLaunchWizard` + `WizardStepper` (persistent 4-step chrome).
- `AdminGuard` (route/API guard).
- `SelectCityTable` / `CityRow` + `LaunchStatusBadge` + `GeographyMeter`.
- `PrepareCitySteps` (step list, timestamps, failure log).
- `PreviewShell` = `PreviewBanner` + `ValidationChecklist` (5 reversible checks) + `<DPMap>` (the map is **not** wrapped/duplicated, only mounted) + guided "Review path" strip + rail breadcrumb.
- `LaunchGate` (summary + disabled-until-valid + type-to-confirm).

### State required for the preview journey
- `nav = { level: 'city'|'region'|'group'|'area', regionId?, groupId?, areaId? }` → derives `DPMap` `layer` / `scope` / `selection` / `crumb` / `listings`.
- `validation = { landing, regions, areaGroups, areas, listing }` (booleans, reversible; `allValidated` gates launch).
- `activeListing` (focused listing id for the popup).
- Selected `cityId` + `revision` for the sandbox context.

### API contracts (eventually needed — mock-only today)
- `GET /admin/cities` → launch queue (city, status, geography rev, preview state).
- `POST /admin/cities/:id/prepare` → start preparation; `GET …/prepare` → step status + timestamps + failure.
- `GET /admin/cities/:id/preview?rev=` → sandbox Discover dataset (same shape as `BLR_DATA`) + a simulated first listing.
- `POST /admin/cities/:id/validation` (optional) → persist checkbox state / audit.
- `POST /admin/cities/:id/launch` → promote validated revision to production (guarded, admin-only, idempotent).

### What remains mock-only
- All data in `admin-data.js` and `BLR_DATA` (fixtures).
- Simulated listing record (`RTA_PREVIEW_PATH.sim`) — replace with a backend-seeded preview listing.
- Preparation timestamps/logs, geography percentages, and the fake "running" simulation.
- Unsplash imagery.

---

*Frozen design — implement against this document; the four-step wizard and the preview hierarchy must not change.*
