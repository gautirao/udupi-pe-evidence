# Issue #2076 Amendment-1 Step 4 — AC14 shipped-side capture index

All captures are **HOSTED_CURRENT_STATE** — read-only current-state audit evidence against
`https://udupi-property-explorer.pages.dev`, hosted Bangalore. None of these is a Stage-4
deterministic baseline. Every row below is a capture whose expected A-state was mechanically
verified before being used in any comparison in `parity-matrix.md` / `discrepancy-register.md`.
No capture that failed verification was used in a comparison (there were none this step; every
capture below verified cleanly).

**Auth arms used (disclosed, not hidden):**
- **Desktop captures** (`mcp__claude-in-chrome`, tab 600529786): the connected browser tab already
  carried a pre-existing **authenticated broker session** ("TE" avatar, Broker workspace/New
  listing nav visible). This session was not created by this run; no login form was submitted, no
  credential entered. Same disclosure as the existing F1-F6 register.
- **Mobile captures** (`mobile-capture-script.mjs`, headless Chromium via Playwright): a **fresh
  anonymous** browser context (`Sign in` button visible, no session cookie). Genuinely different
  arm from the desktop captures, not a duplicate.

**Viewport verification (AC14 mandate — resize_window is unreliable at mobile size):** the two
mobile captures were taken with `mobile-capture-script.mjs`, which sets the Playwright context
`viewport: {width:390,height:844}` and mechanically confirms `window.innerWidth`/`innerHeight`
read back as exactly 390/844 (printed per-capture in the script's stdout, reproduced below). This
avoids the known `resize_window` mobile-viewport failure mode already documented in
`state-mapping.md` and the amendment's `mobile_capture_constraint`.

## Desktop (1366x768, authenticated arm)

| capture id | A-state(s) | frozen ref | URL (exact) | verification observed |
|---|---|---|---|---|
| A01-desktop-city-default | A01 | areas-city-default | `.../discover?city=bangalore&journey=area-first` | heading/DOM text = "Bangalore / 1737 listings" (NOT "Where do you want to explore?" — see F8 below); 5 region cards present (Central/North/East/South/West Bangalore), each with area/listing/school counts; map shows 5 region bubbles; no error banner |
| A02-A04-desktop-west-region-areas | A02, A04 | areas-region-areas | `.../discover?city=bangalore&journey=area-first&node=d%3Aw` | breadcrumb "West Bangalore"; heading "West Bangalore / 34 areas with matches / 135 listings"; sidebar lists individual AREA cards (Annapurneshwari Nagar, Badamanavarathekaval, Bikasipura, ...); no error banner |
| A03-A05-desktop-north-direction-flat-area-list | A03, A05 (see F9) | areas-region-clusters | `.../discover?city=bangalore&journey=area-first&node=d%3An` | breadcrumb "North Bangalore"; heading "North Bangalore / 58 areas with matches / 228 listings"; sidebar lists individual AREA cards (Abbigere, Agrahara Layout, Allalasandra, ...) — **not** cluster-selection cards; map shows a "Yelahanka +55 areas within" cluster bubble; no error banner |
| A08-A20-desktop-area-listings-kambipura | A08, A20 | areas-area-listings | `.../discover?city=bangalore&journey=area-first&node=a%3AIN%7CKA%7CBengaluru%7CKambipura` | breadcrumb "Home > Bangalore > West Bangalore > Kambipura"; heading "Properties in Kambipura"; body text "Showing sale prices in ₹ for Kambipura"; "Add a school in this area" CTA present (school-shortcut / `add-school-cta` anchor); listing card visible on scroll (₹84.19 L, 2 BHK Apartment); no error banner |
| A08-desktop-listing-card-scrolled | A08 | areas-area-listings | same as above, scrolled | listing card composition: price, type badge, title, area, beds/sqft, save button |
| A09-desktop-rent-variant-header | A09 | NO_FROZEN_REFERENCE as a distinct state id (renders as a copy-only variant of areas-area-listings, per state-mapping.md) | same URL + `&intent=rent` | "Looking to: Rent" selected; body text changed to "Showing rent prices in ₹ for Kambipura"; no error banner (see F7 below for the empty-inventory result) |
| A11-desktop-query-active-whitefield | A11 | areas-listings-query-active (REF, no-self-ID per state-mapping.md) | `.../discover?...&node=a%3AIN%7CKA%7CBengaluru%7CWhitefield&q=3+bhk` | search input populated "3 bhk"; result text "20 verified properties for sale in Whitefield"; map badge switched from city-wide pill to "Filtered results" pill; no error banner |
| A12-desktop-filters-active-3bhk-whitefield | A12 | areas-listings-filters-active (REF, no-self-ID) | `.../discover?...&node=a%3AIN%7CKA%7CBengaluru%7CWhitefield&beds=3` | "3 BHK" bedroom chip visually selected (bordered/highlighted); result text "20 verified properties for sale in Whitefield"; map badge "Filtered results"; no error banner |
| A13-desktop-empty-results-reset-whitefield | A13 | areas-listings-query-active's empty-results notes (REF, no-self-ID) | `.../discover?...&node=a%3AIN%7CKA%7CBengaluru%7CWhitefield&beds=3&q=zzznonexistentquery` | empty-state icon + "No results for \"zzznonexistentquery\"" + "Nothing in Whitefield matches that search." + "Clear search" button (`area-empty-state` anchor); no error banner |
| A19-desktop-area-autocomplete-overlay | A19 (PARTIAL — overlay half only) | shell-area-autocomplete-open | `.../discover?city=bangalore&journey=area-first&node=a%3AIN%7CKA%7CBengaluru%7CKambipura` + typed "White" into area search | autocomplete listbox opened below the search input, showing "Whitefield" and "Kannamangala - Whitefield Hoskote Road"; underlying page (Kambipura area-detail) unchanged behind the overlay — matches manifest's "Overlay only; underlying state unchanged" note; no error banner |

## Region-level F7-probe captures (Buy vs Rent count-badge comparison, desktop, authenticated arm)

| capture id | URL | verification observed |
|---|---|---|
| F7-region-buy-west-bangalore | `.../discover?...&node=d%3Aw` | "West Bangalore / 34 areas with matches / 135 listings", Buy selected |
| F7-region-rent-west-bangalore-identical-counts | `.../discover?...&node=d%3Aw&intent=rent` | identical text "34 areas with matches / 135 listings", Rent selected — every per-area count in the sidebar (e.g. "2 listings", "1 listing") is byte-identical to the Buy screenshot too |
| F7-A09-desktop-rent-empty-badge-unfiltered-kambipura | `.../discover?...&node=a%3A...Kambipura&intent=rent`, scrolled | "No listings here yet" empty state while the map badge (bottom-right) simultaneously reads "1,737 properties in Bangalore" — city-wide, unfiltered by the active Rent intent |

## Rent-probe captures (#2074 rendered-behaviour verification feed for step 5)

| capture id | area | URL | result |
|---|---|---|---|
| F7-A09-desktop-rent-empty-badge-unfiltered-kambipura | Kambipura (West Bangalore) | `.../discover?...&node=a%3AIN%7CKA%7CBengaluru%7CKambipura&intent=rent` | "No listings here yet" |
| rent-probe-whitefield-header / rent-probe-whitefield-empty | Whitefield (East Bangalore, 49+ sale listings) | `.../discover?...&node=a%3AIN%7CKA%7CBengaluru%7CWhitefield&intent=rent` | "No listings here yet"; zero map pins (vs. dense priced pins under Buy) |
| rent-probe-hsr-layout-empty | HSR Layout (South Bangalore) | `.../discover?...&node=a%3AIN%7CKA%7CBengaluru%7CHSR+Layout&intent=rent` | "No listings here yet"; zero map pins |

Combined with the 4 areas already sampled during the amendment's feasibility check (state-mapping
step), this is **7 sampled areas across 3 macro-regions, all showing zero rent listings** under the
Rent toggle on hosted Bangalore. Not exhaustive across ~312 areas — this remains a strong signal,
not a proven citywide zero. See `discrepancy-register.md` F4 (unchanged from Stage 1, now with
#2074 merged) for the disposition.

## Mobile (390x844, anonymous arm, Playwright-verified viewport)

| capture id | A-state(s) | frozen ref | URL | mechanically observed viewport | verification observed |
|---|---|---|---|---|---|
| A01-mobile-city-default.png | A01, A21 (city level) | areas-city-default-mobile (manifest object; DOM never emits this id — id-emission caveat per state-mapping.md) | `.../discover?city=bangalore&journey=area-first` | `innerWidth=390, innerHeight=844` (script stdout) | heading "Bangalore / 1737 listings" (same as desktop — no "Where do you want to explore?" text here either); region cards stacked single-column (Central/North/East/South visible, West below fold); "Sign in" button visible (anonymous arm); cookie-consent banner visible at bottom; no error banner |
| A08-A21-A23-mobile-area-listings.png | A08, A21, A23 (AREA level) | areas-area-listings-mobile (same id-emission caveat) | `.../discover?...&node=a%3AIN%7CKA%7CBengaluru%7CKambipura` | `innerWidth=390, innerHeight=844` (script stdout) | breadcrumb "Home > Bangalore > West Bangalore > Kambipura"; heading "Properties in Kambipura"; "Showing sale prices in ₹ for Kambipura"; Property Type / Bedrooms filter chips stacked full-width; map/list toggle icon top-right (relevant to A22/A24, itself NO_FROZEN_REFERENCE — noted, not compared); no error banner |

Exact script stdout (both lines, verbatim):
```
{"name":"A01-mobile-city-default","url":"https://udupi-property-explorer.pages.dev/discover?city=bangalore&journey=area-first","innerWidth":390,"innerHeight":844}
{"name":"A08-A21-A23-mobile-area-listings","url":"https://udupi-property-explorer.pages.dev/discover?city=bangalore&journey=area-first&node=a%3AIN%7CKA%7CBengaluru%7CKambipura","innerWidth":390,"innerHeight":844}
```

## Failed captures

None. Every capture attempted this step verified its expected state before being used downstream.

## What was NOT captured, and why (honesty ledger, feeds the "what I did not compare" report)

- **A14 (Browse All)** — searched for a "Browse All" / "view all listings" affordance from the city
  root page (accessibility-tree `find` query, plus manual clicks on the "Bangalore / 1737 listings"
  heading and the map's "Showing 1,737 verified properties across Bangalore" badge). Neither
  produced a navigation or a distinct Browse-All composition. **No shipped-side capture exists for
  A14.** This is recorded as UNDETERMINED, not as ENVIRONMENT_BLOCKED and not as a discrepancy —
  the search was not exhaustive (a Browse-All entry point could exist behind a URL parameter this
  step did not try, e.g. an explicit `?b=1`-style param mirroring the mock's `#b=1` hash), so this
  is a genuine gap in this step's coverage, flagged for the downstream step rather than guessed at.
- **"Verified only" filter chip** — visually absent from both the Property Type and Bedrooms filter
  rows on every AREA-level capture taken this step (Kambipura, Whitefield, HSR Layout). Consistent
  with the state-mapping step's grep finding (zero hits for `verified.only`/`Verified only`/
  `verifiedOnly` under `src/components/discover/**`). Not comparable to a mock reference either way
  since the mock's `filter-toolbar` PARTIAL classification already flagged this as unconfirmed;
  recording the visual absence here as corroborating evidence, not a new independent finding.
- **A21's Direction/Local-Destination mobile levels, A22 (mobile map mode), A24 (mobile map/list
  switching)** — NO_FROZEN_REFERENCE per state-mapping.md; not captured or compared, by design.
- **Authenticated-arm mobile capture** — not taken. The mobile script uses a fresh anonymous
  context by design (OQ5's recommendation: anonymous for composition, authenticated only where a
  state's definition depends on auth). No AREA-level pricing composition differs between arms for
  the states captured this step (A08/A23 show sale prices in both arms per the merged #2074
  contract — anonymous sees bands, authenticated sees exact rupees — but that pricing-parity
  render verification is deliberately out of this step's scope; see discrepancy register).
