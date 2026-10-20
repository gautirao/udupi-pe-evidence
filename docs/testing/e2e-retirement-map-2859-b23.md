# E2E retirement map — #2859 batch B2+B3 (handoff 285902)

Per-assertion disposition for the eight legacy specs of batch B2+B3. The legacy specs stay on disk,
byte-identical; nothing is deleted from this branch. Plan: `.claude/handoffs/issue-285902/approved-plan.toml`
(rev3). Rules: R_outcome, R_control, R_injected, R_stub_echo, R_stale, R_retain, R_mutation, R_jsdom, R_toast, R_reload.

Dispositions: COVERED_EXISTING / COVERED_NEW / RETAIN / STALE / OBSOLETE / UNCOVERED.
Every COVERED_* claim names exactly one mutation proof (register:
`.claude/handoffs/issue-285902/evidence/mutation/register.tsv`; diffs on disk are named `MM<id>.diff` (the id already
starts with `M`), predicted/observed sets alongside), with ONE stated exception: the three
**COVERED_EXISTING (canonical, unmutated)** rows L1 (T13), L3 (T17) and C4.real-flow (CC1). Their canonical E2E
bodies were read and are cited only for what they assert, but a mutation run needs the E2E stack, so they carry no
mutation proof (disclosed gap). Product files byte-identical at the end (`final-restore-check.txt`, VERDICT
BYTE_IDENTICAL).

## B3 section — listing-creation forms (csv 11, 16, 33, 210)

### Test-file aliases (test id = `alias > describe > it`)

| alias | file |
|---|---|
| AP | `apps/web/src/components/broker/__tests__/AddressPicker.test.tsx` |
| F1 | `apps/web/src/components/broker/__tests__/PriceField.test.tsx` (new) |
| F2 | `apps/web/src/pages/broker/editListing/__tests__/EditListingForm.titleLocality2859.test.tsx` (new) |
| F3 | `apps/web/src/components/broker/__tests__/ResidentialListingForm.locationFlow2859.test.tsx` (new) |
| F4 | `apps/web/src/components/broker/residential/__tests__/MapPin.pinDialog2859.test.tsx` (new) |
| F5 | `apps/web/src/components/broker/__tests__/CommercialListingForm.gating2859.test.tsx` (new) |
| F6 | `apps/web/src/components/poi/__tests__/PoiManager.addManual2859.test.tsx` (new) |
| URL | `apps/web/src/components/broker/residential/__tests__/useResidentialLocation.test.tsx` |
| BPC | `apps/web/src/components/broker/__tests__/BuyerPreviewCard.test.tsx` |
| PR | `apps/web/src/components/broker/__tests__/ResidentialListingForm.parity.test.tsx` |
| IP | `apps/web/src/components/broker/residential/__tests__/InlinePhotos.test.tsx` |
| PMT | `apps/web/src/components/poi/PoiManager.test.tsx` (existing, unedited) |
| CMDS | `apps/web/src/pages/broker/editListing/__tests__/EditListingForm.commands.test.tsx` (existing, unedited) |
| LTPT | `apps/api/src/test/java/com/example/realestate/listing/workflow/ListingTransitionPolicyTest.java` |
| LCT | `apps/api/src/test/java/com/example/realestate/listing/api/ListingControllerTest.java` (existing, unedited) |

Injected boundaries (R_injected), stated once: `@/lib/geocode` is mocked everywhere, so geocode-driven claims
are "UI behaviour given a geocode response"; react-leaflet is mocked (AP, F4) and replaced in F3/URL/PR by a
confirm-button AddressPicker; `useBrokerListings` mutations are mocked (payload claims = the client request
only; F3 uses a stateful in-test fake); F5 and F6 replace the Radix Select with a file-scoped native `<select>`
pass-through, so every Select pick gesture is RETAIN.

### csv11 — `e2e/broker-address-reconciliation.spec.ts`

| id | assertion | disposition | destination test id | mutation | note |
|---|---|---|---|---|---|
| AR1a | 'Confirm Location' text (swallowed `.catch`) | OBSOLETE | — | — | vacuous wait; real step title is 'Confirm location' (`LocationStep.tsx:47`) |
| AR1b/AR2c/AR3d | `.leaflet-container` visible | RETAIN | — | — | real Leaflet (D5) |
| AR1c | search input visible | COVERED_EXISTING | AP > AddressPicker — AC15: prop reconciliation updates query state > updates the search input value when initialLocality prop changes after mount | M20d | |
| AR1d | input prefilled with persisted locality when coords set (AddressPicker half) | COVERED_NEW | AP > AddressPicker — #2859 B3 persisted locality + Change + pick result > AR1d prefills the search input and status line with the persisted locality when coords are set (control: … > AR1d control: without a persisted locality the input stays empty and the status shows coordinates) | M20a | |
| AR1d.LocationStep | LocationStep passes `initialLocality` | RETAIN | — | — | no in-scope test; `LocationStep.test.tsx` (`pages/broker/editListing/steps/__tests__/`) is outside the approved globs (M21 dropped) |
| AR2b.1 | AddressPicker shows the `initialLocality` prop it is given (prop change) | COVERED_EXISTING | AP > AddressPicker — AC15: prop reconciliation updates query state > updates the search input value when initialLocality prop changes after mount (+ AR1d) | M20a | |
| AR2b.2 | after a browser reload step 3 shows saved 'Manipal', not unsaved 'Udupi' | RETAIN | — | — | reload path (R_reload) |
| AR3.title-edit+step3-continue | title edit, step-3 Save & Continue advances to Review | COVERED_NEW | F2 > EditListingForm — title/locality gate composite (#2859 B3 csv11 AR3i-k) > a manually edited title without the confirmed locality shows the warning and disables submit; Update title clears both | M22b | |
| AR3.step1-save | step-1 Save & Continue advances to step 2 | COVERED_EXISTING | CMDS > EditListingForm — save/submit commands (Issue #1838 PR C commit 1) > Step-1 save success > shows the "Listing updated" toast and advances to step 2 | M22c | PUT itself = mocked mutate (client request) |
| AR3.stepper | step-3 indicator button enabled via persisted addressConfirmed, click navigates | RETAIN | — | — | StepIndicator is stubbed in F2; no mutation-proved destination in this slice |
| AR3.change | 'Change' resets the confirmed pin | COVERED_NEW | AP > AddressPicker — #2859 B3 persisted locality + Change + pick result > AR3 Change resets the confirmed pin; picking a search result re-confirms and emits onConfirm + onLocalityConfirmed | M20c | |
| AR3.pick | pick result -> onConfirm + onLocalityConfirmed, input shows display name | COVERED_NEW | (same AP it as AR3.change) | M20b | |
| AR3i-k.composite | title without locality -> warning, submit disabled, 'Update title' clears (control: title containing the locality shows no banner, same it) | COVERED_NEW | F2 > … > a manually edited title without the confirmed locality shows the warning and disables submit; Update title clears both | M22 | |
| AR3.real-geocode | real `/api/geocode` request + Nominatim results | RETAIN | — | — | R_injected (`@/lib/geocode` mocked) |

### csv16 — `e2e/broker-listing-form.spec.ts`

| id | assertion | disposition | destination test id | mutation | note |
|---|---|---|---|---|---|
| P1 | slider renders | COVERED_NEW | F1 > PriceField — slider + lakh/crore text (#2859 B3 csv16) > P1/P2 renders the slider and reflects initialRupees 50,00,000 in text and aria-valuenow | M23e | |
| P2 | text lakh/crore for 50,00,000 (+ aria-valuenow) | COVERED_NEW | (same F1 it) | M23c | expected values computed from the component's formulas |
| P3 | keyboard ArrowRight changes the text, still lakh/crore | COVERED_NEW | F1 > … > P3 keyboard ArrowRight on the thumb moves the position and rewrites the text (still lakh/crore) | M23a | the real Radix thumb responded to keyboard in jsdom; pre-authorised RETAIN fallback NOT needed |
| P4 | typing '1 crore' moves aria-valuenow | COVERED_NEW | F1 > … > P4 typing "1 crore" moves aria-valuenow from the 50-lakh position to the 1-crore position | M23b | |
| P5a | PUT body price 7,500,000 after '75 lakh' | COVERED_NEW | F2 > EditListingForm — real PriceField save payload (#2859 B3 csv16 P5a) > typing "75 lakh" then Save & Continue sends price 7,500,000 (was 50 lakh) | M23d | client request only |
| P5b | server returns 7,500,000 | RETAIN | — | — | spec guards it behind `if (listingRes !== null)` (can be vacuous); no mutation-proved destination for persistence in this slice (controller pass-through not separately proved) |
| P.drag | real pointer drag | RETAIN | — | — | D5 |
| GF1-GF3.envelope | 422 `errors[]` envelope from submit | COVERED_EXISTING | LCT > submit_tooFewImages_returns422 / submit_addressNotConfirmed_returns422 / submit_multipleErrors_returnsAllErrors | M24b | |
| GF1-GF3.rule | price>0 / >=3 images / address confirmed -> exact field + message, isolated, complete-listing control | COVERED_NEW | LTPT > guardCompleteness field-level errors (#2859 GF1-GF3) > gf1_zeroPrice_yieldsOnlyThePriceError_completeListingPasses / gf2_twoImages_yieldsOnlyTheImagesError_threeImagesPass / gf3_unconfirmedAddress_yieldsOnlyTheAddressError_confirmedPasses | M24 | one product edit, three predicted reds, all observed |

### csv33 — `e2e/commercial-create-listing-1684.spec.ts`

All five legacy tests reach the form via `/broker/listings/new` + 'Switch flow', which is STALE (journey selector
since #1719); F5 mounts `CommercialListingForm` directly with `initialPropertyType`.

| id | assertion | disposition | destination test id | mutation | note |
|---|---|---|---|---|---|
| C.nav | `/broker/listings/new` heading + 'Switch flow' | STALE | — | — | `NewListingJourneyRouting.test.tsx:99-103` |
| C1.SHOP | no subtype fields before pick; SHOP -> floorChoice/hubType/occupancy, no office/floorMode; hub vocab Mall not IT park | COVERED_NEW | F5 > CommercialListingForm — subtype field gating (#2859 B3 csv33 C1) > C1 SHOP: nothing subtype-specific before the pick; after SHOP floorChoice/hubType(shop vocab)/occupancy, no office or floorMode | M25a (vocab: M25g) | |
| C1.OFFICE | seats/cabins/meeting rooms, no occupancy; hub vocab IT park not Mall | COVERED_NEW | F5 > … > C1 OFFICE: office seats/cabins/meeting rooms + office hub vocab; no occupancy status | M25b (vocab: M25h) | |
| C1.BUILDING | no subtype picker; floorMode/powerLoad/occupancy; no floorChoice/hubType/office | COVERED_NEW | F5 > … > C1 BUILDING: no subtype picker; floorMode/powerLoadKva/occupancy present; floorChoice/hubType/officeSeats absent | M25c | |
| C1.WAREHOUSE | clear height/bays/truck/flooring; no occupancy/floorMode/floorChoice | COVERED_NEW | F5 > … > C1 WAREHOUSE: clear height/loading bays/truck access/flooring present; occupancy/floorMode/floorChoice absent | M25d | |
| C1.LAND | zoning/ownership/approvals; More details hides washrooms/parking/utilities, keeps suitable uses | COVERED_NEW | F5 > … > C1 LAND: zoning/ownership/approvals present, warehouse fields absent; More details hides washrooms/parking/utilities but keeps suitable uses | M25e | |
| C2.rent-positive | under Rent / Lease: monthlyRent shown (test :177) | COVERED_NEW | F5 > CommercialListingForm — purpose gating + vocab (#2859 B3 csv33 C2/C3) > C2 Sale shows price + yield and hides rent/lease-term; Rent / Lease flips both sets | M25o | proves ONLY this positive (observed first failure :177). leaseTermMonths/leaseEscalationPct shown (:178-179) is asserted, not separately mutation-proved |
| C2.sale-positive | under Sale: price (:172) and yield (:173) shown | COVERED_NEW | (same F5 C2 it) | M25t (:172), M25u (:173) | single edit each on the TSX outer guard (`CommercialTermsSection.tsx:42`, `:50`); observed first failure = predicted line (`c2-assertion-lines.txt`) |
| C2.negatives | Sale hides monthlyRent (:174) / leaseTermMonths (:175); Rent hides price (:180) / yield (:181) | COVERED_NEW | (same F5 C2 it) | M25p (:174), M25s (:175), M25q (:180), M25r (:181) | every negative is doubly guarded (TSX `:42,:50,:63,:86` AND `listingFieldConfig.ts:438-444,:493-499`), so a single-file edit cannot redden it: M25f and M25n SURVIVED alone. Each proof is one combined two-file mutation removing BOTH guards (M25r = M25f + M25n); both files restored and sha-checked per run; observed first failure = predicted line |
| C3a-c | 'For Sale' and 'For Rent / Lease' present, 'For Lease' absent | COVERED_NEW | F5 > … > C3 the purpose group offers exactly For Sale and For Rent / Lease (no For Lease) | M25l | |
| C4.real-flow | SHOP+RENT create -> submit -> PENDING_REVIEW | COVERED_EXISTING (canonical, unmutated) | canonical CC1 (`commercial-lifecycle.canonical.ts:530-575`, `:493`, `:506-526`) | not run in this slice | canonical E2E body; mutation needs the E2E stack — disclosed gap |
| C4i-k | utilities CCTV/Internet + suitable-use Retail chips on; 'Co-working' absent for SHOP (control: offered for OFFICE) | COVERED_NEW | F5 > CommercialListingForm — chips + payload (#2859 B3 csv33 C4i-k / C5i) > C4i-k SHOP utilities and suitable-use chips toggle on; Co-working is absent for SHOP but offered for OFFICE | M25i (chip state: M25j, M25k) | |
| C4m | buyer preview '₹45K/mo' (rent) | COVERED_NEW | BPC > BuyerPreviewCard — rent vs sale price line (#2859 B3 csv33 C4m/C5e) > C4m rent: shows the monthly rent with "/mo" and ignores the sale price | M26a | component, from props |
| C5e | buyer preview '₹3.50 Cr', no '/mo' (sale) | COVERED_NEW | BPC > … > C5e sale: shows the sale price without "/mo" and ignores the monthly rent | M26b | component, from props |
| C4o-q/C5f | review-preview strings ('Shop', 'For rent', 'Commercial building', 'For sale', 'Vacant') | RETAIN | — | — | pre-authorised fallback: CommercialReviewPreview is reached only after the Select picks (subtype / floorMode / occupancy) and the full review gate. Under the pass-through those picks are injected, so the claim is not stretched |
| C4h/C4s/C5h/C4.poi | POI name / serverState status read from the spec's own stub | OBSOLETE | — | — | R_stub_echo |
| C4l | photo cover reorder (client call) | COVERED_EXISTING | IP > InlinePhotos — AC5: tile grid > "Set cover" on a non-cover tile reorders that image to index 0 | M34e | server round trip RETAIN |
| C5g | BUILDING+SALE end-to-end submit | RETAIN | — | — | no real flow covers it |
| C5i | client payload floorMode WHOLE_BUILDING, no commercialSubtype | COVERED_NEW | F5 > … > C5i BUILDING + SALE draft payload carries floorMode WHOLE_BUILDING and no commercialSubtype | M25m | client request; the floorMode value is set via the pass-through |
| C.select | real Radix Select picks | RETAIN | — | — | R_injected (file-scoped Select pass-through in F5) |

### csv210 — `e2e/residential-create-listing-1722.spec.ts`

Sub-ids follow the spec's assertion order within each test (spec line numbers given where the letter is ambiguous).

| id | assertion | disposition | destination test id | mutation | note |
|---|---|---|---|---|---|
| R1a | AC-4.7 pin CTA disabled before any resolve | COVERED_NEW | URL > useResidentialLocation — #2859 B3 AC-4.7 / AC-4.4 / AC-4.5 / AC-4.6 additions > R1 AC-4.7: pin CTA disabled with helper before resolve, enabled without helper after Use, disabled again after Change | M27 | |
| R1b | helper 'Confirm a location above…' shown | COVERED_NEW | (same URL R1 it) | M27c | |
| R1c | Section-2 resolve enables the Section-6 CTA | COVERED_EXISTING | URL > useResidentialLocation — 3-state model preserved > state 2 (resolved via search "Use"): local only, never persists addressConfirmed (+ URL R1 it) | M27b | |
| R1d | helper gone after resolve | COVERED_NEW | (same URL R1 it) | M27c | |
| R1e | 'Change' re-disables the CTA | COVERED_NEW | (same URL R1 it) | M27 | |
| R2 | AC-4.1 search caption `Buyers see only "Manipal, Udupi".`, preview shows only the public locality (4 private-marker negatives, before and after pin confirm), pin caption text; positive control: the private string IS on the page | COVERED_NEW | F3 > ResidentialListingForm — location flow (#2859 B3 csv210) > R2 AC-4.1: captions and buyer preview show only the public locality; the private string never reaches the preview | M28b (search caption M28a, pin caption M28c) | real BuyerPreviewCard |
| R3 | AC-4.2 'Location entered' / 'Map pin confirmed' toggle independently | COVERED_NEW | F3 > … > R3 AC-4.2: "Location entered" and "Map pin confirmed" toggle independently | M29a | met = `border-primary` on the row's first span (same oracle as the spec) |
| R4a-e | AC-4.3 query edit after pin-confirm: CTA disabled, nearby hidden, pin gate unmet, unconfirm PUT (stateful fake: updates +1, addressConfirmed false) | COVERED_NEW | F3 > … > R4 AC-4.3: editing the query after pin-confirm hides nearby, disables the pin CTA and un-meets the pin gate (stateful fake) | M29b | "nearby" = InlineNearby mounting the PoiManager sentinel; the POI heading text lives in PoiManager (F6/PMT) |
| R4c | unconfirm on edit (hook level) | RETAIN | URL > useResidentialLocation — query-edit invalidation > editing the query after a persisted pin confirm resets local state and unconfirms the server pin (exists, not claimed) | — | M29b does not redden the cited existing test (register.tsv M29b observed = F3 R4 only); R4 outcome proved by F3 under M29b (qa-fast re-scan finding) |
| R5a/b | AC-4.4 Find disabled while empty, enabled for 'ab' | COVERED_NEW | URL > … > R5 AC-4.4: Find disabled while empty, enabled for "ab", and the not-found copy carries the landmark hint | M30a | |
| R5c/e | 'No results for "ab"' / '"12345"' without a search call | COVERED_EXISTING | URL > useResidentialLocation — not-found threshold (AC-4.4) > treats a too-short query as not-found without calling the search API / treats an all-numeric query as not-found without calling the search API | M30e | |
| R5d | landmark / road / PIN hint copy | COVERED_NEW | (same URL R5 it) | M30b | |
| R6a/b/d | AC-4.5 rationale dialog before geolocation; not called until Allow; called once | COVERED_EXISTING | URL > useResidentialLocation — geo rationale gate (AC-4.5) > shows a rationale card before calling navigator.geolocation, only calling it on Allow | M30f | geolocation stubbed (as in the spec) |
| R6c | 'Location confirmed —' after a successful fix | COVERED_NEW | URL > … > R6c AC-4.5: Allow -> a successful geolocation fix shows "Location confirmed —" (absent before) | M30c | reverse geocode mocked |
| R7 | AC-4.5 'Not now' dismisses without calling geolocation | COVERED_EXISTING | URL > useResidentialLocation — geo rationale gate (AC-4.5) > "Not now" dismisses the rationale card without calling the geolocation API | M30g | |
| R8a-c | AC-4.6 open pin dialog, Cancel, dialog hidden, nothing persisted | COVERED_EXISTING | URL > useResidentialLocation — picker Cancel / Adjust pin > Cancel closes the dialog without persisting and preserves the resolved-not-pinned state | M30d | |
| R8d | CTA still 'Pin location on map', no 'Pin confirmed —' after Cancel (control: real confirm shows it) | COVERED_NEW | URL > … > R8d AC-4.6: Cancel leaves no "Pin confirmed —" banner; a real confirm then shows it | M30d | |
| R8e | `serverState.listing.addressConfirmed === false` | OBSOLETE | — | — | R_stub_echo |
| R8f-g | confirm, then 'Adjust pin' re-opens seeded with the current pin | COVERED_EXISTING | URL > useResidentialLocation — picker Cancel / Adjust pin > Adjust pin reopens the picker seeded with the current confirmed pin | M31c | |
| R8h-i | re-opened dialog (real AddressPicker) shows 'Confirm Location', not the empty-search state (positive control: unseeded picker shows it) | COVERED_NEW | F4 > MapPin — Adjust pin re-opens the real AddressPicker seeded with the confirmed pin (#2859 B3 R8f-j) > shows "Confirm Location" (not the empty search state); Cancel closes and keeps the confirmed banner | M31a (seed: M31c) | leaflet mocked |
| R8j-l | Cancel on the re-open closes it and keeps `map-pin-status` | COVERED_NEW | (same F4 it) | M31b | |
| R9.save-url | after Save draft the URL stays `/broker/listings/new` (spec :849) | RETAIN | — | — | router-level; no in-scope test asserts navigation absence |
| R9.pin-gating | CTA disabled before / enabled after resolve (:857, :865) | COVERED_NEW | URL R1 it (see R1a/R1c) | M27 / M27b | duplicate of AC-4.7 |
| R9.nearby-gating | no nearby at state 2, nearby after confirm (:872, :895) | COVERED_NEW | F3 > … > R11 confirmed-pin header: not-confirmed -> resolved-not-pinned -> pin-confirmed copy, PoiManager only in the last state | M32c | |
| R9.pin-row | 'Map pin confirmed' row unmet then met (:880-898) | COVERED_NEW | F3 R3 it | M29a | |
| R9.poi-name | `MOCK_POI.name` visible (:896) | OBSOLETE | — | — | R_stub_echo |
| R9.persisted-pin | fresh-context EditListing shows 'Pin Location (complete)' (:917-928) | RETAIN | — | — | real navigation in a new browser context (reload class, R_reload); canonical CC1/T13 cover a real reload |
| R9.upload | real `setInputFiles` upload of 3 photos (:933-947) | RETAIN | — | — | real upload / storage round trip |
| R9l-n | tiles 0..2 render, '3/5 photos' (and the minimum note below 3) | COVERED_NEW | IP > InlinePhotos — #2859 B3 tile grid copy > R9l-n three images render tiles 0..2 and "3/5 photos" with no minimum note; two images show the minimum note | M34a | from the hook's image list |
| R9o | 'Cover' on tile 0 only | COVERED_NEW | IP > … > R9o the Cover badge sits on tile 0 only; the image at index 0 is the cover | M34b | |
| R9.set-cover | 'Set cover' reorders the target to index 0 (client call) | COVERED_EXISTING | IP > InlinePhotos — AC5: tile grid > "Set cover" on a non-cover tile reorders that image to index 0 | M34e | |
| R9.reorder-roundtrip | tile 0 src = promoted image after the PUT + refetch; preview cover src follows (:958, :968) | RETAIN | — | — | server reorder round trip |
| R9u | preview 'Pinned' marker only with a confirmed address (:969) | COVERED_NEW | PR > ResidentialListingForm — #2859 B3 honest preview + review/submit copy > R9u the buyer preview marks the location only once the draft carries a confirmed address; review and post-submit never say "published" | M34c | |
| R9.no-verified | no 'verified broker' anywhere (:970, :978) | COVERED_EXISTING | BPC > BuyerPreviewCard — AC6 honesty > never renders an unconditional Verified/Published/Details-confirmed claim | M34g | |
| R9t/R9.published | review heading, no '/published/' in review and after submit (:975-989) | COVERED_NEW | (same PR R9u it) | M34d | |
| R9.submit | submit enabled -> 'Submitted for review' heading + 'Pending admin approval' (:980-988) | COVERED_EXISTING | PR > ResidentialListingForm — review + submit gating > enables "Submit for review" once every real gate is met, and shows honest success copy on submit | M34h | submit = mocked mutate |
| R10 | area chips set Carpet/Built-up values, track manual edits, flow into the draft payload (carpetArea 1500, builtArea 800) | COVERED_NEW | F3 > … > R10 area chips: Carpet and Built-up chips set the inputs, track manual edits, and flow into the draft payload | M35 | payload = client request (spec's `serverState` poll is R_stub_echo) |
| R11a-c | state 1 copy 'Location not yet confirmed' + hint, no nearby | COVERED_NEW (also COVERED_EXISTING InlineNearby.test.tsx) | F3 R11 it | M32c | |
| R11d-f | state 2 `Location resolved — Manipal, Udupi`, no 'MIT Road'/'576104', 'not a confirmed pin' copy | COVERED_NEW | F3 R11 it | M32a | |
| R11g | `inline-nearby-open-picker` visible at state 2 | STALE | — | — | `ResidentialListingForm.locationNearbyRecomposition.test.tsx:167-192` (#2655: exactly one 'Pin location on map'; the InlineNearby CTA is absent) |
| R11h | state 2 'Location not yet confirmed' gone, no nearby | COVERED_NEW | F3 R11 it | M32c | |
| R11i-k | state 3 `Pin confirmed — Manipal, Udupi`, 'nearby places will be shown' copy, picker CTA absent, nearby mounted | COVERED_NEW (also COVERED_EXISTING InlineNearby.test.tsx) | F3 R11 it | M32b | |
| R11l-o | 'Change location' reverts to state 1 (the spec's own KNOWN-DEFECT note says this failed in the browser; it passes at form level) | COVERED_NEW | F3 R11 it | M32d | form-level only; the spec's browser-level failure report is not re-adjudicated here |
| R12a | starts on 'Suggested nearby places' with the POI, no Approved badge | COVERED_EXISTING | PMT > PoiManager — three explicit modes (issue #2642) > switches between Suggested, Approved, and Add manually as three distinct tabs (+ F6 R12b it) | M33h | |
| R12b | Approve -> Approved tab active, badge '1', POI moved out of Suggested, 'All suggestions reviewed' (stateful fake, GET count +1) | COVERED_NEW | F6 > PoiManager — POI modes + add manually over a stateful fake (#2859 B3 csv210) > R12b approving a suggestion moves it to Approved (tab active, badge 1) and out of Suggested | M33a | |
| R13a | empty-state 'no nearby places were found' + Add manually reachable | COVERED_EXISTING | PMT > PoiManager — Suggested tab: empty vs provider-failure vs populated (#2042) > renders the genuine-empty message (not a provider-failure warning) when providerIssue is false and nothing has ever been approved | M33h | |
| R13b | name required gates 'Add place' | COVERED_NEW | F6 > … > R13 validation gates Add place; a valid add posts 500 m, lands on Approved with BROKER-ADDED and the row line; the form is empty again | M33d | |
| R13c | distance 'abc' / '-5' invalid + hint; blank and 0.5 valid | COVERED_NEW (also COVERED_EXISTING PMT 'rejects zero and negative distances…') | (same F6 R13 it) | M33e | |
| R13d | successful add -> Approved active, BROKER-ADDED, 'School / University · 500 m', posted distanceMeters 500 | COVERED_NEW | (same F6 R13 it) | M33f (normalisation: M33b) | client request; category set via the pass-through |
| R13e | the form resets after a successful add (Name empty on return) | RETAIN | — | M33g SURVIVED | overdetermined: Radix `TabsContent` unmounts the inactive manual form (`PoiManager.tsx:658`), so the `setName('')` reset (`:245`) is not observable on tab return. The assertion stays in the F6 it, but no single edit can turn it red, so it is not claimed |
| R13.category-select | real category Select pick | RETAIN | — | — | R_injected (pass-through) |
| R14 | blank distance posts null; row shows category only (no '·', no placeholder) | COVERED_NEW | F6 > … > R14 a blank distance posts null and the row shows the category only (no distance, no placeholder) | M33c | |
| R15.UI | two manual POIs (1.3 km, 850 m) both render, badge '2', posted 1300 / 850 | COVERED_NEW | F6 > … > R15 UI: two manual POIs on one listing (km then m) both render and the Approved badge reads 2 | M33b | unit Select via the pass-through |
| R15.DB | V139 multiple-manual-POI DB constraint | RETAIN | — | — | `ListingPoiUniqueConstraintIT` is tagged (not run by default); spec reads `serverState.pois` (stub) |
| R16 | provider failure banner, Retry re-fetches and succeeds | COVERED_EXISTING | PMT > PoiManager — Retry (issue #2642) > refetches the suggestions query when Retry is clicked after a provider failure | M33i | |
| R.map | real Leaflet / geolocation / geocoder network | RETAIN | — | — | D5 / R_injected |

### B3 disposition counts

| row | COVERED_EXISTING | COVERED_NEW | RETAIN | STALE | OBSOLETE | UNCOVERED |
|---|---|---|---|---|---|---|
| csv11 | 3 | 5 | 5 | 0 | 1 | 0 |
| csv16 | 1 | 6 | 2 | 0 | 0 | 0 |
| csv33 | 2 | 13 | 3 | 1 | 1 | 0 |
| csv210 | 12 | 32 | 9 | 1 | 2 | 0 |

(csv210 rows marked "COVERED_NEW (also COVERED_EXISTING …)" count once, as COVERED_NEW. csv33 COVERED_EXISTING
includes C4.real-flow = COVERED_EXISTING (canonical, unmutated).)

### B3 mutation summary

76 B3 mutations registered (`register.tsv`): 73 RED, 3 SURVIVED. Every row has restored_sha_ok=true and
green_after=true. The exception is C4.real-flow, which is COVERED_EXISTING (canonical, unmutated) and has no
mutation.
- M25f and M25n SURVIVED: alone, each removes only one of the two guards on a commercial purpose field.
- M33g SURVIVED: the form reset is overdetermined, so R13e is RETAIN.
- Code-review cycle 1 added the C2 per-assertion proofs M25t and M25u (single file) and M25p, M25s, M25q and M25r
  (two files: `CommercialTermsSection.tsx` + `listingFieldConfig.ts` in one run). All are RED, and each failed
  first at its predicted test line (`evidence/mutation/c2-assertion-lines.txt`; M25o observed :177).
- Product reference for the cycle-1 runs and the final check is the committed head `b66da887` (the branch was
  rebased; `CommercialTermsSection.tsx` and `listingFieldConfig.ts` are identical at `ee473dce` and `b66da887`).
  Final product check: BYTE_IDENTICAL.

## B2 section — moderation lifecycle (csv 190, 195, 196, 199)

### Test-file aliases (test id = `alias > describe > it`)

| alias | file |
|---|---|
| W1 | `apps/web/src/pages/admin/__tests__/PendingListings.moderation2859.test.tsx` (new) |
| W2 | `apps/web/src/components/broker/listings/__tests__/BrokerListingCard.moderation2859.test.tsx` (new) |
| W3 | `apps/web/src/pages/broker/editListing/__tests__/EditListingForm.rejectedBanner2859.test.tsx` (new) |
| W4 | `apps/web/src/pages/__tests__/ListingDetail.previewLifecycle2859.test.tsx` (new) |
| W5 | `apps/web/src/components/notifications/__tests__/NotificationBell.navigation2859.test.tsx` (new) |
| IT1 | `apps/api/src/test/java/com/example/realestate/listing/api/ListingModerationLifecycleIT.java` (new, untagged, Testcontainers postgis) |
| PLT | `apps/web/src/pages/admin/__tests__/PendingListings.test.tsx` (existing, unedited) |
| NBT | `apps/web/src/components/notifications/__tests__/NotificationBell.test.tsx` (existing, unedited) |
| LDT | `apps/web/src/pages/__tests__/ListingDetail.test.tsx` (existing, unedited) |

W1 it ids (describe `PendingListings — moderation transitions over a stateful fake (#2859 B2 csv190/csv196)`):
W1.approve = `AM1.a/AM1.d/PA0/PA1.c/PA1b.a: …`, W1.cancel = `PA1.a/PA1b.b-c/PA3.a-b: …`, W1.reject = `AM2.b/AM2.d/PA3.c.1: …`,
W1.return = `PA2.b/PA2.c.1: …`, W1.stale = `PA4.b: …`. W2 (describe `BrokerListingCard — moderation outcomes (#2859 B2
csv190/csv199)`): W2.rejected = `AM3.a-c / RR1.3: …`, W2.link = `RR1.4: …`, W2.pending = `RR1.10.1: …`. W3: `RR1.5/RR1.6: …`.
W4 (describe `ListingDetail preview — lifecycle actions (#2859 B2 csv195 LC1)`): W4.offline = `LC1.P1/LC1.P1b.1: …`,
W4.archived = `LC1.P2.1/LC1.P2b.1: …`, W4.draft = `LC1.P3.1: …`. W5: `L5.b: …`. IT1 methods: IT1.reject =
`reject_validCodePersistsFullReason_dealerAndFreeTextRefusedWithStateUnchanged`, IT1.approve =
`approve_thenSecondApproveConflicts_andNotifiesOwnerWithListingIdMetadata`, IT1.return =
`returnForEdits_requiresAdminAndNote_persistsDraftWithNote`, IT1.resubmit = `rejectedListing_ownerEditsAndResubmits_toPendingReview`,
IT1.archive = `brokerArchiveThenReopenAsDraft_ownershipEnforced_archivedAtCleared`, IT1.b1 = `b1CarryOver_adminArchiveAndRestore_persist`.

Injected boundaries (R_injected), stated once: W1 replaces `@/lib/api` with a stateful in-test fake (GET counter asserted;
a decided row leaves the fake) and drives the REAL Radix Sheet / AlertDialog / Select with the PLT pointer polyfills (no
primitive pass-through); W2/W3 render from props (no route, no auth, no fetch); W4 records `api.post` and serves the GET
from in-test data, with the real `useArchiveListing` / `useReopenAsDraftListing` hooks; W5 mocks the notification hooks and
uses a file-scoped Popover pass-through (the real Popover re-open timed out at 5 s in jsdom during development) with the
REAL router navigate. Every toast claim is the `useToast` call ARGUMENT (hoisted spy); no test mounts the real Toaster, so
every visible-toast subclaim is RETAIN (R_toast). W4 fresh mounts are not browser reloads (R_reload). IT1 is the real
filter chain + DB role lookup + controllers + services + Postgres; `ListingAreaResolutionService` and
`SupabaseStorageService` are `@MockitoBean` (nothing about geocoding / storage is asserted).

### csv190 — `e2e/journey/admin-moderation.spec.ts`

| id | assertion | disposition | destination test id | mutation | note |
|---|---|---|---|---|---|
| AM1.a | queue row by title | COVERED_NEW | W1.approve | M19b | plan cited PLT :170-177, but that it asserts the row testid + humanized type, not the title; re-homed to W1 (title asserted inside each row) |
| AM1.b | row-level Approve button | STALE | — | — | `PendingApprovalsTable.tsx:128-140`: rows have only 'Review'; approve is in the drawer |
| AM1.c.1 | approve success calls toast with title 'Listing approved' | COVERED_EXISTING | PLT > PendingListings > approve > approves and invalidates the queue on success once the confirm dialog is accepted (+ W1.approve) | M17r | toast-call argument only |
| AM1.c.2 | 'Listing Approved' toast visibly rendered | RETAIN | — | — | R_toast: no real Toaster mounted |
| AM1.d | row leaves the queue after approve (sibling stays) | COVERED_NEW | W1.approve | M1 | stateful fake: before row, approve, GET +1, row gone, sibling present |
| AM1.e | approve -> LIVE persisted | COVERED_NEW | IT1.approve | M11b | canonical T14 also covers it (body not mutation-run here) |
| AM2.a | row Reject opens dialog `#rejection-reason-code` | STALE | — | — | `ListingReviewDrawer.tsx:316-334` (drawer reject mode, `#drawer-rejection-code`) |
| AM2.b | reason + note -> 'CODE: note' payload | COVERED_NEW | W1.reject | M3 | client request |
| AM2.c.1 | confirm -> POST reject and toast called with 'Listing rejected' | COVERED_NEW | W1.reject (bare-code request also PLT > reject > shows a confirm dialog … only calls the API once confirmed) | M17r (request: M3) | deviation: PLT :370-403 asserts the request only, not the toast, so the toast argument is claimed from W1 |
| AM2.c.2 | 'Listing Rejected' toast visibly rendered | RETAIN | — | — | R_toast |
| AM2.d | row leaves the queue after reject | COVERED_NEW | W1.reject | M1 | stateful |
| AM2.e | REJECTED + reason persisted | COVERED_NEW | IT1.reject | M11a | FULL reason string in `rejection_reason`, `status_reason_code`, `status_reason_note`; one PENDING_REVIEW->REJECTED history row with reason_code = note = full string |
| AM3.a-c | broker card: title, 'Rejected' badge, 'Rejection reason' text (control: LIVE card without reason has none) | COVERED_NEW | W2.rejected | M6a (badge: M6c) | render from props |
| AM3.d | broker's API returns REJECTED + reason | COVERED_NEW | IT1.reject | M11c | GET /api/listings/mine?status=REJECTED as owner (the other-broker absence is in the security table's "asserted, not separately mutation-proved" row) |
| AM3.e | broker's real page fetch -> card (login + /broker/listings) | RETAIN | — | — | R_injected: W2 renders from props |

### csv199 — `e2e/listing-rejection-resubmit.spec.ts`

| id | assertion | disposition | destination test id | mutation | note |
|---|---|---|---|---|---|
| RR1.1 | admin reject with a free-text reason returns ok | STALE | — | — | `AdminListingController.java:181-185` + `VALID_REJECTION_CODES` `:53-54` return 400 'Unrecognized rejection code'. IT1.reject asserts the 400 with state unchanged and a valid-code control in the same test (that arm proved by M10) |
| RR1.2 | GET status REJECTED | COVERED_NEW | IT1.reject | M11c | DB re-read + broker /mine?status=REJECTED |
| RR1.3 | card title, 'Rejected', reason | COVERED_NEW | W2.rejected | M6a | |
| RR1.4 | 'Edit & Resubmit' link -> /broker/listings/{id}/edit (control: LIVE card has none) | COVERED_NEW | W2.link | M6b | |
| RR1.5 | edit page renders `#title` | COVERED_NEW | W3 | M7b | `#title` value = listing title (REJECTED and DRAFT arms) |
| RR1.6 | edit page 'Rejection reason:' alert (control: DRAFT has none) | COVERED_NEW | W3 | M7 | `EditListingForm.tsx:205-214` |
| RR1.7.put | edited title persisted by PUT | COVERED_NEW | IT1.resubmit | M12b | owner's PUT persists the edited title (the non-owner PUT 403 is in the security table's "asserted, not separately mutation-proved" row) |
| RR1.7.gesture | 'Save & Continue' button gesture | RETAIN | — | — | the edit-page button flow is not driven here |
| RR1.8 | step-4 'Submit for Review' enabled, click submits + navigates | RETAIN | — | — | uncertain (directive 4) |
| RR1.9 | REJECTED -> PENDING_REVIEW persisted | COVERED_NEW | IT1.resubmit | M12 | submission_count 1 -> 2; one REJECTED->PENDING_REVIEW history row |
| RR1.10.1 | a PENDING_REVIEW card renders 'Under Review' | COVERED_NEW | W2.pending | M6c | render from props only |
| RR1.10.2 | after resubmit + reload the broker sees 'Under Review' | RETAIN | — | — | reload path (R_reload) |

### csv196 — `e2e/journey/pending-approvals-review-2369.spec.ts`

| id | assertion | disposition | destination test id | mutation | note |
|---|---|---|---|---|---|
| PA0.search | search narrows the queue | COVERED_NEW (also COVERED_EXISTING PLT > filters the queue by search term) | W1.approve | M18 | |
| PA0.drawer | Review opens the drawer with the title | COVERED_NEW | W1.approve | M19 | SheetTitle heading |
| PA1.a | alertdialog 'Approve this listing?' + title | COVERED_NEW (identity also PLT > approve > shows a confirm dialog with listing identity …) | W1.cancel | M2b | |
| PA1.b.1 | confirm -> POST approve; no POST before confirm; toast called with title | COVERED_EXISTING | PLT > approve > approves and invalidates the queue on success once the confirm dialog is accepted | M2r (toast argument: M17r) | same-test control PLT :287-292 |
| PA1.b.2 | approve toast visibly rendered | RETAIN | — | — | R_toast |
| PA1.c | drawer closes, row leaves the queue (one filtered item) | COVERED_NEW | W1.approve | M1 | stateful |
| PA1.d | LIVE persisted | COVERED_NEW | IT1.approve | M11b | |
| PA2.a | return-for-edits needs a reason; payload note | COVERED_EXISTING | PLT > return for edits > requires at least one reason before submit is enabled, and includes reasons in the note | M4c | |
| PA2.b | note textarea joins the payload | COVERED_NEW | W1.return | M4 | 'Reasons: …\n\n<note>' |
| PA2.c.1 | drawer closes, row leaves (stateful); toast called with 'Returned for edits' | COVERED_NEW | W1.return | M1 (toast: M17r) | |
| PA2.c.2 | 'Returned for edits' toast visibly rendered | RETAIN | — | — | R_toast (W1 does not mount the real Toaster) |
| PA2.d | DRAFT + status_reason_note persisted; blank note 422 state unchanged | COVERED_NEW | IT1.return | M16b (422: M16) | rejected_at stays NULL; one PENDING_REVIEW->DRAFT history row with the note |
| PA3.a-b | reject gated on a reason; alertdialog; no POST before confirm | COVERED_NEW | W1.cancel (also W1.reject: no POST before confirm) | M2d | re-homed: PLT's two reject its (real Select, ~13-14 s) time out under vitest's default 5 s AT BASE in this worktree (M2/M2c/M4b/M17 restored runs), so M2c was vacuous; they pass with `--testTimeout=90000` (M2r/M4c/M17r green_after) |
| PA3.c.1 | note -> 'INCOMPLETE_INFO: note' payload, toast called, row leaves | COVERED_NEW | W1.reject | M3 (toast: M17r, row: M1) | |
| PA3.c.2 | reject toast visibly rendered | RETAIN | — | — | R_toast |
| PA3.d | REJECTED + reason persisted; unknown code 400 unchanged | COVERED_NEW | IT1.reject | M11a (400: M10) | |
| PA4.a.1 | stale approve -> 409 -> toast called with 'Already processed' | COVERED_EXISTING | PLT > 409 conflict handling > invalidates the queue, closes the drawer, and shows an honest conflict message | M17r | toast-call argument only |
| PA4.a.2 | 'Already processed' toast visibly rendered | RETAIN | — | — | R_toast |
| PA4.b | queue refreshes, stale row gone, sibling stays | COVERED_NEW | W1.stale | M5 | stateful (ApiError 409) |
| PA4.c | second approve 409, one history row | COVERED_NEW | IT1.approve | M13 | `AdminListingController.java:83-87` maps ListingStatusException to 409; LIVE->LIVE is refused by `ListingTransitionPolicy.java:165-173` (self-transition AND not in ALLOWED, so the plan's M13 "remove the self-transition check" would be overdetermined; the mapping mutation was run instead) |
| PA5 | 1120px no h-scroll; sticky bar in viewport | RETAIN | — | — | owner D5 (geometry) |
| PA1b.a | first click opens the dialog, no POST, no success toast (argument-level negative; control: called after confirm, same it) | COVERED_NEW (also COVERED_EXISTING PLT :287-290) | W1.approve | M2r | visible absence not claimed separately |
| PA1b.b-c | Cancel (approve and reject dialogs) keeps drawer + row, no POST (control: confirm posts, same it) | COVERED_NEW | W1.cancel | M2r | |
| PA-gesture | real Radix AlertDialog / Sheet behaviour | COVERED_NEW | W1 (all five its drive the real primitives; no pass-through) | M2r | jsdom pointer polyfills only; browser pointer geometry is not claimed |

### csv195 — `e2e/journey/listing-lifecycle.spec.ts`

| id | assertion | disposition | destination test id | mutation | note |
|---|---|---|---|---|---|
| L1 | created listing appears in /broker/listings | COVERED_EXISTING (canonical, unmutated) | canonical T13 step 9 (`listing-lifecycle.canonical.ts:509-524`) | not run in this slice | canonical E2E body read (GET /mine 2xx, title + 'Under Review' visible); its mutation needs the E2E stack — disclosed gap |
| L2 | broker detail loads without error, title visible | RETAIN | — | — | T12 not verified against the authed principal |
| L3 | 'Request viewing' for LIVE, authed | COVERED_EXISTING (canonical, unmutated) | canonical T17 (`booking-request.canonical.ts:345-355`) | not run in this slice | manifest's T16 citation corrected; disclosed gap as L1 |
| L5.a | bell popover lists the notification | COVERED_NEW | W5 (both notifications listed after open) | M8e | re-homed: NBT's 12 Popover-opening its (incl. 'renders notifications in the dropdown') time out at 5 s AT BASE in this worktree (M8c restored run 12/20 failed), so M8c was vacuous; W5 uses the Popover pass-through, so the real Popover listing is narrowed (see L5.b.popover) |
| L5.b | item click lands on /listing/<id> (control: no listing_id does not navigate, same it) | COVERED_NEW | W5 | M8 | real router + route probe; Popover pass-through |
| L5.b.popover | real Popover re-open gesture before the click | RETAIN | — | — | R_injected (pass-through in W5; the real open is NBT) |
| L5.c | listing_approved notification created with metadata `listing_id` | COVERED_NEW | IT1.approve | M15 | bounded poll 10 s / 100 ms on public.notifications; exactly one row, title 'Listing approved' |
| L5.d | landed page shows the title | COVERED_EXISTING | LDT > ListingDetail — residential redesign smoke > summary card renders title, price and a Google Maps link when coords exist | M8d | composition with L5.b; M8b (displayTitle) SURVIVED — the h1 is fed by ListingDetailMainContent; M8d mutates the h1 |
| LC1.P1 | LIVE preview 'Take Offline' -> dialog copy | COVERED_NEW | W4.offline | M9g | |
| LC1.P1b.1 | confirm -> POST /api/listings/{id}/archive; toast called with 'Listing archived' | COVERED_NEW | W4.offline | M9a (toast: M9b) | no POST / no toast before confirm (same it) |
| LC1.P1b.2 | 'Listing archived' toast visibly rendered | RETAIN | — | — | R_toast |
| LC1.P1c | ARCHIVED persisted | COVERED_NEW (also COVERED_EXISTING BrokerArchivedListingsFilterIT) | IT1.archive | M14c | archived_at set, one LIVE->ARCHIVED history row (the archived-row 404 on the owner's PUT is in the security table's "asserted, not separately mutation-proved" row) |
| LC1.P2.1 | fresh mount with an ARCHIVED listing renders the archived banner + 'Reopen for Editing' | COVERED_NEW | W4.archived | M9e (action: M9d) | fresh-mount render only |
| LC1.P2.2 | browser reload after Take Offline shows that state | RETAIN | — | — | R_reload (`ListingDetail.tsx:109-111` vs `useBrokerListings.ts:744-757`) |
| LC1.P2b.1 | reopen -> POST /reopen-as-draft; toast called with 'Listing reopened' | COVERED_NEW | W4.archived | M9c (toast: M9b) | URL confirmed at `useBrokerListings.ts:841` |
| LC1.P2b.2 | 'Listing reopened' toast visibly rendered | RETAIN | — | — | R_toast |
| LC1.P2c | DRAFT persisted, archived_at NULL | COVERED_NEW | IT1.archive | M14a | one ARCHIVED->DRAFT history row |
| LC1.P3.1 | fresh mount with a DRAFT listing renders the draft banner + 'Edit Listing' link | COVERED_NEW | W4.draft | M9f (banner: M9e) | fresh-mount render only |
| LC1.P3.2 | browser reload after Reopen shows that state | RETAIN | — | — | R_reload |
| LC1.B1 | B1 carry-over: admin archive / restore persistence | COVERED_NEW | IT1.b1 | M14b (archive: M14d) | see the B1 carry-over note below |

### B1 carry-over note (INV4a-a.3 / INV4a-c.2 backend half / INV4a-d.3)

IT1.b1 (`b1CarryOver_adminArchiveAndRestore_persist`) proves, on Testcontainers through the real filter chain:
a dealer's POST /api/admin/listings/{id}/archive and /restore are 403 with the row unchanged (M10e, M10f); an admin archive
persists ARCHIVED + archived_at + the reason note + one LIVE->ARCHIVED ADMIN history row (M14d); an admin restore persists
DRAFT with archived_at NULL (M14b); a second restore is 409. This is recorded here ONLY as a note: the B1 map
(`docs/testing/e2e-retirement-map-2859-b1.md`) and the B1 manifest rows are not edited from this branch (plan rev2).

### Security assertions in IT1 (AC7; not spec ids)

| assertion | test | mutation |
|---|---|---|
| dealer reject -> 403, status / reason / history unchanged | IT1.reject | M10b |
| dealer approve -> 403 (`@PreAuthorize`), unchanged | IT1.approve | M10c |
| dealer return-for-edits -> 403, unchanged | IT1.return | M10d |
| dealer admin-archive / restore -> 403, unchanged | IT1.b1 | M10e / M10f |
| non-owner broker archive -> 403, LIVE unchanged (owner positive control) | IT1.archive | M14e |
| non-owner GET -> 403 (owner 200), non-owner reopen-as-draft -> 403, non-owner PUT -> 403 with the title unchanged (RR1.7.put), archived row 404s the owner's PUT (LC1.P1c), REJECTED row absent from another broker's /mine?status=REJECTED (AM3.d) | IT1.archive / IT1.resubmit / IT1.reject | asserted, not separately mutation-proved |
| free-text reason -> 400 unchanged, valid code accepted (same test) | IT1.reject | M10 |

Security reviewer INFO (recorded, not fixed here): `JwtConfig.securityFilterChain` (`JwtConfig.java:43-160`) has no
`/api/admin/**` role matcher. Admin paths fall through to `anyRequest().authenticated()` (`:160`), so the
in-controller and method-level checks proved by M10b-M10f are the ONLY admin gate on these endpoints. This is the same
defence-in-depth gap disclosed in B1 and handed to the owner; it is not fixed in this test-only PR.

### B2 disposition counts

| row | COVERED_EXISTING | COVERED_NEW | RETAIN | STALE | OBSOLETE | UNCOVERED |
|---|---|---|---|---|---|---|
| csv190 | 1 | 9 | 3 | 2 | 0 | 0 |
| csv199 | 0 | 8 | 3 | 1 | 0 | 0 |
| csv196 | 3 | 16 | 5 | 0 | 0 | 0 |
| csv195 | 3 | 11 | 6 | 0 | 0 | 0 |

(Rows marked "COVERED_NEW (also COVERED_EXISTING …)" count once, as COVERED_NEW.)

### B2 mutation summary

53 B2 mutations registered (`register.tsv`, appended after the B3 rows; specs appended to `mutations.py`, predicted sets
written before each run). 52 RED, 1 SURVIVED. Every row has restored_sha_ok=true. Exception: the canonical rows L1 (T13)
and L3 (T17) are COVERED_EXISTING (canonical, unmutated), with no mutation. After code-review cycle 1 (six B3 C2 ids
added), `verify_restore.py` checked 129 ids against the committed head `b66da887`: BYTE_IDENTICAL, product files dirty:
NONE.

- SURVIVED M8b (`ListingDetail.tsx` displayTitle): only the breadcrumb it went red; the h1 is rendered from
  `ListingDetailMainContent.tsx:124-126`. Replaced by M8d on the h1 (RED) for L5.d.
- Five round-1 rows have green_after=false for one reason, observed in their restored (= base) runs: two PLT reject its
  (real Radix Select, ~13-14 s) time out under vitest's default 5 s (M2, M2c, M4b, M17), and NBT's 12 Popover-opening its
  time out at 5 s (M8c). M2c and M8c are therefore vacuous (their predicted its fail at base) and are NOT cited: PA3.a-b is
  re-homed to W1 (M2d RED) and L5.a to W5 (M8e RED). M2, M4b and M17 were re-run as M2r, M4c, M17r with
  `--testTimeout=90000` (R_jsdom): all RED with green_after=true; the map cites the re-runs.
- Plan deviations: plan M13 (remove the self-transition check) would be overdetermined (LIVE->LIVE is also absent from
  ALLOWED), so M13 mutates the controller's 409 mapping. Plan M16 (blank-note guard) is defence-in-depth (the service
  re-checks), so M16 changes the controller's 422 to 400 and M16b removes the persisted note. Added proofs not in the
  plan: M2b-M2d, M4b/M4c, M6c, M7b, M8b-M8e, M9b-M9g, M10b-M10f (admin-only 403s), M11b, M11c, M12b, M14c-M14e, M18, M19, M19b.

## Follow-ups (not fixed in this PR)

- `NotificationBell.navigation2859.test.tsx:5`: the header comment lists the Radix Popover as real, but `:44` replaces
  it with a file-scoped pass-through. The map already narrows this (L5.b.popover RETAIN). The comment is left as is
  because the code-review cycle-1 rework was docs-only (code-reviewer finding 4, LOW).
- `JwtConfig.securityFilterChain` has no `/api/admin/**` role matcher (security reviewer INFO; see the AC7 section).
  This is the same owner hand-off as B1.
- PLT (2 reject its) and NBT (12 Popover-opening its) time out under vitest's default 5 s at base. They back several
  COVERED_EXISTING citations that were proved with `--testTimeout=90000` (code-reviewer pre-existing open question).
