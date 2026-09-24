# #2627 — Mobile Map View filter experience

Design-only spec for **#2628**. Interactive source of truth: `experience.html` → review group **Map filters · #2627** (states 01–16).

> **Owner review, round 1: direction approved, with two rulings, both now applied.**
> 1. **Schools → Homes near ⟨school⟩** gets the same Map Filters entry. The sheet owns only the property filters. School, radius, school navigation and board/level stay with the Schools journey (states mf-14…16).
> 2. **Buy/Rent and family are always stated on Map.** The results heading always reads "N ⟨homes for sale | homes to rent | commercial properties …⟩ · Residential | Commercial". `Filters N` counts only refinements beyond intent and family, and `Filtered: …` lists only those refinements (state mf-13). The mobile viewport switcher in the review bar (375 × 667 · 390 × 844 · 412 × 915) keeps the current state, so you can check any state at all three sizes.
New/changed design files: `src/ExpMapFilters.jsx` (new), `src/ExpMap.jsx` (`lead` slot, mobile *Search this area* position), `src/ExpPanel.jsx` (`EPFilters expanded`), `src/Experience.jsx` (state, actions, scenarios).

---

## A. Current-state audit

Screenshots: `audit-2627/01…07-current.png`

| # | Screen | Observation |
|---|---|---|
| 01–03 | Map at 375 / 390 / 412 | **No filter access on Map at all.** The only chrome is the context row (Back, breadcrumb, List \| Map), *Fit all 3 areas* at top-left, and zoom at top-right. To refine, you have to leave Map. |
| 04 | Marker selected | The listing preview replaces the results sheet. The × and *Close* both close it. Top-left and top-right stay clear. |
| 05 | List | Filters live **inside the List scroll** (Type → Residential type → *More filters* disclosure). Buy/Rent lives in the List control bar, which **does not exist on Map**. They apply instantly. |
| 06 | Map, zero results | The sheet says "0 listings · Hebbal · Nagawara · Jakkur" and offers **no recovery action**. The map is empty with nothing to explain it. |
| 07 | Map, Commercial | Same shell. Pins carry the subtype. The sheet title and *Fit all* wrap at 390. |
| — | Search this area (code) | Mobile position `bottom: 128px` sits **under the results sheet** (about 205px tall), so it's occluded when the map is dirty. |

Follow-ups for **#2698** (not solved here): the breadcrumb truncates mid-word ("North B…"); the Commercial sheet title and *Fit all* wrap; the preview has a duplicate × / Close; the List "More filters" disclosure is collapsed even when refinements are set.

---

## Options considered

- **A. Modal bottom sheet (recommended).** Rises from the thumb zone and keeps the map dimmed behind it as context. It has room for the full Residential and Commercial group stack, with a scrolling body and a pinned footer. It's the same surface family as the existing results sheet and listing preview.
- **B. Full-screen filter page.** Maximum room, but the shopper loses Map context entirely and it reads as "leaving Map". It would also need a route or page, which clashes with *List and Map are one state*.
- **C. Side drawer.** Unusual for phones and fights horizontal map pans at the screen edge. At 375 it leaves a sliver of map too narrow to be useful context, and chip rows get cramped.

Why A: the Commercial stack (family, 6 subtypes, area, budget, toggles) doesn't fit a half-height peek, so the sheet grows to content, **capped at 88px below the top**. The body scrolls; the footer never does. Because semantics are staged (below), the map doesn't need to be live while editing. The scrim makes it inert, so **no sheet gesture can compete with a map gesture**. The sheet reuses the List's `EPFilters` groups, so there's no second taxonomy.

---

## B. Recommended interaction

```text
Map (Filters · outlined, or navy + count)
 ↓ tap Filters                         (marker preview closes first if open)
Filter sheet opens · draft = copy of applied filters · focus → "Filters" heading
 ↓ edit chips                          (map, markers, results sheet: UNCHANGED)
Footer: "Not applied yet — the map still shows 95 homes"  +  [Clear all] [Show 28 homes]
 ├─ Show N  → filters := draft → sheet closes → markers + results sheet + List update → stays on Map
 └─ Cancel / scrim / swipe-down / Esc / browser Back → draft discarded → nothing changes
Map (Filters ③ navy) · results sheet line: "Filtered: 2+ BHK · up to ₹1.20 Cr · Apartment  Edit"
 ↓ tap Filters again
Sheet reopens seeded from the applied filters (selections preserved)
```

---

## C. Mock states (review group "Map filters · #2627")

Screenshots: `audit-2627/states/NN-mf.png`; contact sheet: `states/_contact.png`.

| ID | State | What it proves |
|---|---|---|
| mf-01 | Map, no active filters | Entry visible at rest: outlined "Filters", 44px, top-left |
| mf-02 | Entry, keyboard focus | Focus ring; name "Filters, none active" |
| mf-03 | Sheet open, Residential | Buy/Rent first, then the List groups, all expanded |
| mf-04 | Edited, not applied | Draft chips; map unchanged; "Not applied yet…"; "Show 28 homes" |
| mf-05 | Map after Apply | Navy entry with ③; "Filtered: …  Edit" line; 28 on markers and in the sheet |
| mf-06 | Reopened | Draft = applied; footer "These filters are on the map now." |
| mf-07 | Clear all | Draft reset (Buy/Rent + family kept); still staged; *Clear all* disabled |
| mf-08 | Map zero results | "0 matching homes", filters named, *Edit filters* / *Clear filters* |
| mf-09 | Sheet, Commercial | Family, Commercial type, Built-up area, Budget; no bedrooms; "Show 2 commercial properties" |
| mf-10 | Map after Commercial subtype | Pins, title and "Filtered: Shop" agree |
| mf-11 | Marker preview + filter | Preview at the bottom; Filters still top-left and usable |
| mf-12 | 375 × 667 constrained | Sheet capped, body scrolls, footer pinned and reachable |
| mf-13 | Buy → Rent only, no refinements | Badge shows no count, but the heading reads "27 homes to rent · Residential", so the Rent context is visible |
| mf-14 | Schools, Homes near school, Map | Same Filters entry; heading "168 homes for sale · Residential"; school pin, radius ring and breadcrumb unchanged |
| mf-15 | Schools, filter sheet | Property filters only; a plum note says "Property filters only · school and radius stay on the map"; the count is scoped to the same school + radius |
| mf-16 | Schools, applied | Entry ②, "Filtered: 2+ BHK · Apartment"; school, radius and Back to schools unchanged |

---

## Decisions

1. **Entry point.** The first item in the map's top-left row (`map-top-row`), ahead of *Fit all N areas*. Zoom stays top-right, so the two never mix. It sits above every bottom surface (results sheet, preview), so nothing can cover it. It's a pill, 44px min height, sliders icon + the visible word **Filters**.
2. **Container.** A modal bottom sheet (`role="dialog"`, `aria-modal`) over a scrim. It's one sheet for both families.
3. **Apply semantics: STAGED.** Nothing in the sheet touches the canonical filters until **Show N**. Markers, the results sheet and List don't change before Apply. **Cancel**, a **scrim tap**, **swipe-down** (grab zone only), **Esc** and **browser Back** all discard the draft identically, with no confirm. Nothing applied is ever lost, and reopening shows the applied state.
4. **Reset.**
   - **Clear all** (sheet footer) sets draft = `DEFAULT_FILTERS` with the current `purpose` and `family` kept. That's the existing `resetFilters` rule. It's staged and needs Show to take effect. It's disabled when there's nothing to clear.
   - **Individual clears** are chip toggles plus the existing *Clear residential types* / *Clear commercial types* / *Reset commercial filters*. All are staged.
   - **Clear filters on the Map zero state** applies immediately. It's an explicit one-shot action outside the sheet, with no draft to stage into.
5. **Active indication (per owner ruling 2).** Results heading = `N ⟨deal noun⟩ · ⟨family⟩` (e.g. "28 homes to rent · Residential"). It's always present, with or without refinements. The scope stays on the existing *Result scope —* chip below it. At rest: an outlined "Filters". Active: a navy fill + an accent count badge = the number of refinements, i.e. `filterLabels` minus Buy/Rent and minus family. The family is already stated by the result noun ("commercial listings"). Plus **one** summary line in the results sheet: "Filtered: … · Edit". There are no chips on the map.
6. **Result count.**
   - Before editing: the results sheet title ("95 listings · …").
   - While editing: the primary button **"Show N ⟨units⟩"**, recomputed live for the draft, plus a status line: "Not applied yet — the map still shows M ⟨units⟩" / "These filters are on the map now."
   - After Apply: the sheet title updates, and aria-live says "Filters applied. N listings on the map."
   - Zero while editing: "No homes match these filters in ⟨scope⟩." in brick, and the button still reads "Show 0 homes". It's honest, not blocked.
   - Zero after Apply: see Zero results.
7. **Residential vs Commercial.** There's no new taxonomy: `EPFilters` renders inside the sheet with `expanded` (no *More filters* disclosure). Residential shows Buy/Rent, Type, Residential type, then Bedrooms and Carpet area (dwellings) or Plot size (plots), with the Home-bedrooms/Home-carpet labels in the mixed state, then Budget/Monthly rent and Only show. Commercial shows Buy/Rent, Type, Commercial type, Built-up/contextual area and Budget, with no bedrooms. Buy/Rent uses the exact List rule: it resets both budgets and drops Plot on Rent. Per-family subtype and budget memory is preserved, because the draft is the whole filter object.

---

## Map occlusion — layout contract (mobile, Map mode)

| Zone | Occupant | Can be covered by |
|---|---|---|
| App bar + context row (Back · breadcrumb · List \| Map) | unchanged | the scrim, only while the sheet is open |
| Map top-left row, 14px inset | **Filters** · *Fit all N areas* (wraps) · cluster-focus pill below | nothing |
| Map top-right | Leaflet zoom (+/−) | nothing (the row wraps before reaching it) |
| Map top-centre, `top: 70px` | *Search this area* (only when the map has moved) | nothing (**moved from `bottom:128px`**, where the results sheet hid it) |
| Bottom | results sheet **or** listing preview (never both) | the filter sheet, while open |
| Filter sheet | handle + header (grab zone) · scrolling body · pinned footer (+ `env(safe-area-inset-bottom)`) | — |

Gestures: when the sheet is closed, the map pans and zooms everywhere outside the chrome. When it's open, the map is inert behind the scrim; only the grab zone swipes, and the body scrolls with `overscroll-behavior: contain`.

---

## Zero results

In the results sheet: **"0 matching ⟨units⟩"**, then "Nothing in ⟨scope⟩ matches your N filters. Filters were not widened for you.", then the active filter list. Actions:
- **Edit filters** (primary) opens the sheet seeded with the current filters.
- **Clear filters** applies the reset immediately (Buy/Rent and family kept).
- **Return to previous scope** appears only when an existing `prevScope` return target applies (Polygon/Viewport). There's no new recovery logic.

---

## Accessibility

- Touch targets: entry 44px; sheet chips use the existing 44px mobile chips; Cancel 44px; footer buttons 48px; zero actions 44px.
- Names: the entry's `aria-label` is "Filters, N active. Showing homes to rent, Residential." / "Filters, no refinements. Showing …". Intent is always spoken. with `aria-haspopup="dialog"`, `aria-expanded` and `aria-controls="mf-sheet"`. The dialog uses `aria-labelledby="mf-title"`. Every important action has a visible text label; no action is icon-only.
- Focus: on open, focus moves to the "Filters" heading (`tabIndex=-1`) and Tab is trapped in the sheet. On any close, focus returns to `#mf-entry`. Esc = Cancel.
- Live regions: the footer status is `aria-live="polite"`, and so is the post-Apply announcement.
- Scroll: the body scrolls with `overscroll-behavior: contain`; the header and footer are fixed.
- Safe area: the footer bottom padding includes `env(safe-area-inset-bottom)`.
- Reduced motion: the sheet transform transition falls under the existing `prefers-reduced-motion` handling. Implement as no slide.

---

## D. Interaction spec

| Event | Behaviour |
|---|---|
| open | Tap Filters (or *Edit* / *Edit filters*). Closes any listing preview, sets draft := copy of `filters`, pushes one history entry, moves focus to the heading. |
| edit | Writes to the draft only. The count and status line recompute live. |
| apply | `filters := draft`. The sheet closes, the history entry is consumed, `shown` resets, the preview clears, the camera refits (existing fitKey includes filter labels), focus returns to the entry, and the change is announced. Presentation stays **Map**. |
| cancel / close | Cancel, scrim, swipe-down > 90px, Esc, browser Back. The draft is discarded and focus returns to the entry. |
| clear | *Clear all* resets the draft (staged). The zero-state *Clear filters* applies immediately. |
| reopen | The draft is seeded from the applied `filters`, so selections are always preserved. |
| zero results | The results sheet body is replaced by the zero block (above). Markers are absent. |
| marker selection | The preview opens at the bottom; Filters stays usable. Opening Filters closes the preview. After Apply, the preview is cleared. |
| List ↔ Map | Switching presentation closes the sheet without applying. List and Map read the same `filters`, so the List reflects applied Map filters and vice versa. |

---

## E. State mapping

| UI concept | Existing application state |
|---|---|
| Buy/Rent | existing `filters.purpose` (List control-bar reset rule) |
| Residential/Commercial | existing `filters.family` |
| Residential subtype | existing `filters.ptype` |
| Commercial subtype | existing `filters.comSubs` |
| Budget | existing `filters.maxPrice` / `filters.comMaxPrice` |
| Bedrooms | existing `filters.beds` |
| Area | existing `filters.carpetArea` / `plotArea` / `comArea` |
| Only show | existing `filters.ready` / `filters.verified` |
| Map results | the same canonical result/query state (scope + filters + query) |
| Schools homes results | existing school selection + `radiusKm` + the same `filters`. The sheet reads the school and radius; it never writes them |
| Sheet draft | **UI-local, transient** copy of `filters`, never persisted, never in the URL |
| Active count | derived from `filterLabels(filters)`; not stored |

There's no map-only filter state.

---

## F. Handoff for #2628

- **Placement:** render the entry in the mobile Map top-left overlay row, before *Fit all*. Move mobile *Search this area* to top-centre (below that row).
- **Ownership:** the Discover shell owns the sheet's open state and the transient draft. The canonical filter store is untouched until Apply. The sheet renders the **same** filter-group component the List uses, fed the draft (the prototype does this via `EPFilters st={…filters: draft} act={…setFilters: edit draft}`).
- **Contract:** `openMapFilters()`, `editDraft(patch)`, `clearDraft()`, `applyDraft()` (one canonical filter write), `cancel()`, `clearAppliedFilters()` (zero state only).
- **History:** opening pushes one entry; Back = cancel; Apply/Cancel consume it. Apply itself follows the existing filter-change history rule, with no new rule.
- **Responsive:** one design at every phone width. The sheet max-height is `100% − 88px`, the body scrolls, and the footer is pinned. The Map filter entry is shown exactly where List shows property filters: Areas listing results **and Schools "Homes near ⟨school⟩"**. It isn't shown at hierarchy levels, on the school list, in Agricultural, or during an area-set draft.
- **Schools:** the draft count = homes near the SAME selected school within the SAME `radiusKm` for the draft filters. Apply writes `filters` only. School, radius, board/level and Schools Back/breadcrumb are untouched. The zero state says "No homes within N km of ⟨school⟩ match…" and explicitly states that school and radius were not changed.
- **Tests:** mf-01…mf-16 at 375 × 667, 390 × 844 and 412 × 915. Also check: Back closes the sheet without applying; focus returns to the entry; the count equals the List count after Apply; Commercial never shows bedrooms; Rent removes Plot; reopening equals the applied state; the zero state never widens; Buy→Rent alone changes the heading noun but not the badge; Schools apply never changes school or radius.
- **Mocks to implement:** `audit-2627/states/01-mf.png` … `16-mf.png` (IDs match the review pills).

---

```text
Recommended design:
A staged modal bottom sheet opened from a labelled "Filters" pill at the top-left of the mobile Map
(navy with a refinement count when active). It reuses the List's Residential/Commercial filter groups
with Buy/Rent first. It's available in Areas listing results and Schools "Homes near ⟨school⟩" (property filters only). The Map heading always states intent + family ("28 homes to rent · Residential"), and the badge counts only refinements. "Show N ⟨units⟩" applies to the one canonical filter state and keeps the shopper on Map;
Cancel/scrim/swipe/Back discard; a single "Filtered: … Edit" line and an honest 0-result block explain the markers.

Implementation owner:
#2628

Deferred broader mobile polish:
#2698

Design status:
READY FOR FINAL OWNER APPROVAL (rulings 1 and 2 applied)
```
