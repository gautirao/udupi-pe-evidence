# Discover — active context & trustworthy result-count badge

**Status:** design handoff (design only — no production code changed)
**Scope:** desktop Discover shell. Mobile bottom-sheet is explicitly **out of scope**.
**Companion wireframes:** [`ACTIVE_CONTEXT_wireframes.html`](./ACTIVE_CONTEXT_wireframes.html) — annotated desktop mock screens for every state below.
**Recommended follow-up eng issue:** `feat(discover): add active context chips and trustworthy result-count badge behaviour`

---

## 1. Problem & principle

A buyer can have result-affecting state active (a region, an area, a search query, several filters, filters preserved after a reset) while the shell **fails to make that state obvious**. The map/panel then say "Showing X properties" and the buyer cannot tell whether **X** means the whole city, this region, this area, the filtered subset, the search subset, or the markers currently drawn on the map. Results appear to "change for no reason," and a filtered `0` reads as "the city is empty."

**The Discover shell must always answer six questions at a glance:**

1. **Where am I?** (scope: city → region → group → area → school)
2. **What is selected?** (the object the journey is anchored on)
3. **What is filtering the results?** (filters + search)
4. **What does the count mean?** (which of the above the number is counted against)
5. **How do I clear state safely?** (per-chip, and all-at-once)
6. **What does Start over really do?** (a stated, predictable contract)

**Governing principle for the count:** *a number the user cannot trust is worse than no number.* Whenever the count contract is ambiguous or the panel and map counts could diverge, the badge shows a **label with no number** rather than a misleading figure.

### The one structural decision that resolves most of the confusion

> **Scope lives in the breadcrumb. Filters and search live in chips. The count is always stated relative to the current scope, and when filters/search are active it is shown as `M of N` — matches out of the in-scope total.**

Scope (city/region/group/area/school) is **already** expressed, in both surfaces, by the breadcrumb: the navy header band's crumb in the panel and the top-left crumb chip on the map. Re-emitting scope as chips would be redundant noise. So the **context-chip row carries only what the breadcrumb does not**: the active **filters** and the **search query**. This keeps chips meaningful (every chip is a thing you can clear) and keeps the row short.

`M of N` is the second half of the fix: it structurally separates "how many exist here" (`N`) from "how many your filters kept" (`M`), so a filtered zero reads as `0 of 1,240 match your filters` — never as "no properties in Bangalore."

---

## 2. Anatomy — where context appears

```
┌── top nav ───────────────────────────────────────────────────────────────┐
│ ReTrends logo        Discover                              ⌂  Sign in       │
└────────────────────────────────────────────────────────────────────────────┘
┌── map (left) ─────────────────────────┐┌── panel / right rail ─────────────┐
│ ⌖ Bangalore › East › Whitefield  [crumb]││ ‹ Back to areas                    │
│                                        ││ ┌ navy header band ──────────────┐ │
│           (leaflet + markers)          ││ │ SELECTED AREA                  │ │
│                                        ││ │ Whitefield          18 homes   │ │
│                                        ││ │ Bangalore › East › Whitefield  │ │
│                                        ││ └────────────────────────────────┘ │
│                                        ││ ── CONTEXT BAR ──────────────────  │
│                                        ││ 5 of 18 match  ·  Owner ✕  RERA ✕  │
│  ┌ COUNT BADGE (bottom-center) ─────┐  ││ Search:"corner plot" ✕  +2 ⌄  Clear│
│  │ ⌖ 5 of 18 match in Whitefield    │  ││ ──────────────────────────────────  │
│  └──────────────────────────────────┘  ││ (results grid …)                   │
│  ● matches  ○ filtered out             ││                                    │
└────────────────────────────────────────┘└────────────────────────────────────┘
```

Two surfaces, **one active context**, mirrored:

- **Breadcrumb (both surfaces)** — scope + selected object. Segments are clickable to move up. *Unchanged by this work* except that its count stat now follows the `M of N` rule (§6).
- **Context bar (panel, new)** — a slim strip directly beneath the header band and above the results grid. Left→right: a **count summary**, then **filter chips**, then the **search chip**, then an **overflow control** and **Clear all**. This is the home of the ActiveContextChips model (§3–§5).
- **Count badge (map, existing pill, re-specified)** — the bottom-center "Showing…" pill. Re-specified in §6 to state its scope and obey `M of N`, loading and error rules. The panel header stat and this badge read the **same number**.

The context bar appears **only when there is filter/search state to show**. With scope-only state (no filters, no `q`), there are no chips and the bar collapses — the breadcrumb alone is enough. This is deliberate: chips are for the state the breadcrumb can't express.

---

## 3. ActiveContextChips model + chip taxonomy

**What is a chip, and what is not.** A chip represents one piece of **clearable, result-affecting filter/search state**. Scope objects are **not** chips — they are the breadcrumb. This is the "decide what is useful and what is noise" call the brief asks for:

| Candidate state | Chip? | Where it lives instead |
|---|---|---|
| city | **No** | breadcrumb root + City select |
| macro-region | **No** | breadcrumb segment (clickable to clear up) |
| area group / zone / corridor | **No** | breadcrumb segment |
| area | **No** | breadcrumb segment / header band title |
| school | **No** | header band title; radius is a control, not a chip |
| search query `q` | **Yes** | context bar |
| seller type | **Yes** | context bar |
| date range | **Yes** | context bar |
| back on market | **Yes** | context bar |
| new to market | **Yes** | context bar |
| RERA registered | **Yes** | context bar |
| ready to move | **Yes** | context bar |
| property type | **Yes** (when set) | context bar |
| budget | **Yes** (when set) | context bar |
| bedrooms | **Yes** (when set) | context bar |
| verified only (existing) | **Yes** (when on) | context bar |

**Chip taxonomy table** — every chip, its copy, and the exact consequence of clearing it. "Clearing" always removes just that chip's state, updates the URL, keeps the journey/scope, does **not** move the map camera, and triggers one refetch of the in-scope results.

| State | Example value | Chip label | Clearable? | Clear action | URL impact | Notes |
|---|---|---|---|---|---|---|
| search query `q` | corner plot | `Search: "corner plot"` | Yes | remove `q` only; scope/journey untouched | drop `q=` | Chip lives in the context bar, **not** in the search box. Truncate label past ~24 chars with `…`. On area/school scope the search is scoped-to-that-object; clearing `q` returns to the unfiltered in-scope list. |
| seller type | Owner | `Seller: Owner` | Yes | reset seller to "Any" | drop `sellerType=` | Single-select; one chip, not one-per-value. |
| date range | Last 30 days | `Listed: last 30 days` | Yes | reset to "Any time" | drop `dateRange=` | Use the preset label, never raw dates. |
| back on market | true | `Back on market` | Yes | set false | drop `backOnMarket=` | Boolean → its own chip, label = the state, no value half. |
| new to market | true | `New to market` | Yes | set false | drop `newToMarket=` | Boolean chip. |
| RERA registered | true | `RERA registered` | Yes | set false | drop `reraRegistered=` | Boolean chip. Trust filter — evergreen dot allowed (see styling). |
| ready to move | true | `Ready to move` | Yes | set false | drop `readyToMove=` | Boolean chip. |
| property type | Apartment | `Apartment` | Yes | reset to "Any type" | drop `ptype=` | Value-only label (type name is self-explanatory). |
| budget | ≤ ₹1.5 Cr | `≤ ₹1.5 Cr` / `₹80 L – 1.5 Cr` | Yes | reset to "Any" | drop `budget=` | Mono numerals (Geist Mono). Indian formatting. |
| bedrooms | 3+ | `3+ BHK` | Yes | reset to 0 (Any) | drop `beds=` | Mono numerals. |
| verified only | true | `Verified only` | Yes | set false | drop `verified=` | Existing filter. Boolean chip. |

**Chip anatomy & styling** (reuse the design-system chip/pill language):

- Pill, `--radius-full`, `--paper` background, hairline `--border`, `13px`/`600` label, `Geist Mono` for any numerals inside the label.
- Trailing **✕** clear button, `≥` 24 px hit area, `aria-label="Remove {chip label}"`.
- **Filter chips** are neutral (slate). **The search chip is visually distinct** — copper hairline + a leading `search` icon — because it is the one chip a buyer typed rather than toggled (see §4).
- Copper stays reserved: chips do **not** use filled copper. Only the search chip's hairline + Clear-all hover borrow the accent, sparingly. `RERA registered` may carry a small evergreen dot to echo the trust system, but stays a neutral pill otherwise.
- Rest / hover / focus follow the system: hover tints the border, focus shows the 3 px navy ring.

**Clear-all consequences (shared by every chip's clear):** update URL · preserve journey · **do not** reset map selection/camera · trigger one refetch. Clearing the **last** chip collapses the context bar and the count returns to the plain in-scope form (`N properties in {scope}`).

---

## 4. Search query chip

- **Appearance:** `Search: "corner plot"` — the label is prefixed `Search:` and the query is quoted, so it never reads like a filter value. It carries a leading `search` icon and a copper hairline to set it apart from toggle-filters.
- **Location:** in the **context bar with the other chips**, not pinned to the search box. Rationale: the buyer needs one place that shows *everything* narrowing the results; a query that lives only inside the search input is invisible once they scroll or look at the map. The search box still shows the live text while focused; the chip is the persistent, clearable record.
- **Clearing:** removes **only `q`**. It never resets the journey, scope, or selected object — clearing a search should feel like "show me everything here again," not "start over."
- **Cold-loaded URLs:** yes — if `q` is present on load (`/discover?city=bangalore&q=plot`), the chip renders on cold load, and the count badge reflects the search immediately (§6, §8).
- **With an area/school also selected:** the search is **scoped to that object** — `q` filters within Whitefield / within 5 km of the school. The chip sits alongside the scope breadcrumb; clearing `q` drops back to the full in-scope list while staying in the area/school. If the query would be meaningless at the current scope (e.g. a locality name that isn't in this area), we keep the chip but the empty state (§7) offers "Search all of {city} instead."

---

## 5. Filter chips, grouping & overflow

**Booleans are separate chips** (`RERA registered`, `Ready to move`, `New to market`, `Back on market`, `Verified only`). Each is independently clearable — collapsing them into a single "4 filters" blob would hide exactly the state the buyer needs to audit. **Value filters** (seller, date, budget, type, beds) are one chip each.

**No premature grouping.** Seller + date are *not* pre-grouped into a "listing details" chip; they read more clearly as `Seller: Owner` and `Listed: last 30 days`. Grouping only happens via the overflow control below.

### Chip overflow — desktop-first recommendation

**Recommendation: single row, no wrap. Show the count summary + as many chips as fit, then collapse the remainder into a `+N ⌄` overflow chip that opens a small popover; a `Clear all` text button pins to the right of the row.**

Evaluated against the alternatives:

| Option | Verdict | Why |
|---|---|---|
| Wrap to a second line | Rejected as default | Panel height jumps as chips are added/removed; the results grid start-position shifts under the buyer — unstable and distracting on a rail they're scanning. Acceptable as a graceful fallback only if the popover can't be built. |
| Horizontal scroll | **Rejected** | Hides active state off-screen behind an easily-missed scroll — directly contradicts the "always visible" goal and the trust principle. |
| First 3 + `+N filters` overflow popover | **Chosen** | Predictable single-line height (no layout shift), count summary + `Clear all` always visible, every hidden chip still reachable and individually clearable inside the popover, fully keyboard-navigable. |
| Compact "Filtered" summary only | Rejected as default | Too opaque — collapses the exact detail the buyer is trying to verify. Reserve the word "Filtered" for the *untrustworthy-count* fallback (§6), not for normal overflow. |
| Filter-drawer summary | Rejected | The drawer is where filters are *edited*; the context bar is where they're *seen and cleared*. Different jobs. |

**Overflow behaviour:** chips are ordered **search → booleans → value filters** (most-scanned first). The `+N ⌄` chip opens a popover listing the overflowed chips as a vertical list, each with its ✕; the popover also carries the `Clear all filters` action. `+N` counts filters only (the search chip is kept visible whenever present, since it's the highest-signal item). The count summary (`M of N match`) and `Clear all` never overflow — they are fixed anchors.

---

## 6. Result-count badge

The badge is the **map bottom-center pill** and the **panel header stat**, bound to the **same number**. That number is always the **total filtered result count for the active scope** — never the count of markers currently painted on the map (clustering/demotion can draw fewer markers than results; the badge must not follow the markers).

### Copy contract

- Plain scope, no filters/search: **`{N} {noun} in {scope}`**
- Filters and/or search active: **`{M} of {N} match {your filters | "{q}" | your filters and "{q}"} in {scope}`**
- The `M of N` form is what makes the count trustworthy: `N` = everything in this scope, `M` = what survived filtering/search. A filtered zero becomes `0 of N` — unmistakably "your filters, not an empty city."

`{noun}` follows existing platform terminology (`properties` / `homes` / `parcels`), `{scope}` is the current object (`Bangalore`, `East Bangalore`, `Whitefield`, `within 5 km of {school}`).

### Badge state table

| Context | Filters/search active? | Loading? | Zero results? | Recommended badge copy | Show/hide? | Rationale |
|---|---|---|---|---|---|---|
| City landing | No | No | No | `1,240 properties in Bangalore` | Show | Baseline; scope named so it never reads as a global absolute. |
| City landing | Yes | No | No | `84 of 1,240 match your filters` | Show | `M of N` separates filtered subset from city total. |
| Region selected | No | No | No | `310 properties in East Bangalore` | Show | Scope explicit. |
| Region selected | Yes | No | No | `22 of 310 match in East Bangalore` | Show | — |
| Area group selected | No | No | No | `96 properties in {Group}` | Show | — |
| Area group selected | Yes | No | No | `12 of 96 match in {Group}` | Show | — |
| Area selected | No | No | No | `18 homes in Whitefield` | Show | `homes` noun for residential area scope. |
| Area selected | Yes | No | No | `5 of 18 match in Whitefield` | Show | — |
| School selected | No | No | No | `14 homes within 5 km of {School}` | Show | Radius is part of scope wording. |
| School selected | Yes | No | No | `4 of 14 match within 5 km` | Show | Scope shortened to fit; school named in header band. |
| Search query active | (search only) | No | No | `9 results for "corner plot" in {scope}` | Show | `results` noun when a query is the active narrower. |
| Loading / refetching | any | Yes | — | keep last count, **dimmed**, with a small spinner; first-ever load → `Searching…` (no number) | Show (dimmed) | Never flash a fresh number mid-fetch — a wrong transient number is the exact trust failure. `aria-busy`, no live announcement. |
| Zero results — filters caused | Yes | No | Yes | `0 of 1,240 match your filters` | Show | The `0 of N` form proves the scope isn't empty — filters are. Pairs with the empty state (§7). |
| Zero results — search caused | (search) | No | Yes | `No results for "corner plot" in {scope}` | Show | — |
| Zero results — scope genuinely empty | No | No | Yes | `No listings here yet` | Show | Emerging-area case; ties to the existing low-data treatment, not a filter problem. |
| Stale / error / count-contract unreliable | any | maybe | maybe | `Filtered results` (no number) | Show label, hide number | **Prefer no number to a wrong one.** Triggers when the result set is stale, the fetch errored, or panel-count and map-result-count can't be reconciled. |

### Panel-count vs map-marker-count mismatch

They must not diverge, because both bind to the **same** in-scope filtered result length. The map may *render* fewer markers than results (clustering, area demotion, "Show on map") — that is a rendering concern and **must not** change the badge number. If a real divergence is ever possible (a genuine gap in the count contract between what the panel list has and what the map query returns), the badge **drops to `Filtered results` (no number)** and we treat the reconciliation as the count-contract eng follow-up (§10, handoff). We never publish a number we can't stand behind.

### Answering the brief's direct questions

- "Showing X properties" → **only in the plain, unfiltered case**, and always with `in {scope}` appended.
- "X matching filters" → yes, via the `M of N match…` form (which is stronger — it also shows `N`).
- "X in this area" → yes, that's the scope phrase.
- "Filtered results" (no number) → yes, but **reserved** for the untrustworthy/stale/error case, not normal filtering.
- Hide during loading? → **don't hide**; dim the last known number + spinner (or `Searching…` on first load). Hiding causes a jarring reflow and reads as "broken."
- Map-visible vs total? → **total in-scope filtered result count**, never map-marker count.

---

## 7. Empty / zero-result states

Distinguish the **cause** before writing copy — this is what stops "no properties in the city" from ever showing when only filters are responsible.

| Cause | Panel copy | Map copy (badge) | Primary action(s) | Secondary |
|---|---|---|---|---|
| **Filters** reduced a non-empty scope to 0 | **No homes match these filters** · "All {N} homes in {scope} are still here — your filters are hiding them." | `0 of {N} match your filters` | **Clear filters** (primary, copper) | "See all {N} in {scope}" |
| **Search** reduced to 0 | **No results for "{q}"** · "Nothing in {scope} matches that search." | `No results for "{q}" in {scope}` | **Clear search** (primary) | If scoped narrower than city: "Search all of {city}" · "Clear filters" if any also active |
| **Filters + search** both active | **No homes match your search and filters** | `0 of {N} match` | **Clear search** and **Clear filters** shown as two distinct actions | "Clear all" |
| Scope **genuinely empty** (emerging area, no listings yet) | **No listings here yet** · "We add more across {city} weekly." | `No listings here yet` | "Widen the area" / "Back to {parent scope}" | (existing low-data ochre treatment) |

**Which action to lead with:** if a **search** is the narrower and there are also filters, offer **Clear search first** (it's the most specific, most recently-added constraint) then Clear filters. If only filters are active, lead with **Clear filters**. Only offer **widen area / search wider** when the scope itself is thin — never when filters/search are the cause (widening scope would wrongly imply the area is empty).

The empty state must **never** be styled like an error. It uses the existing `DPEmpty` component (icon + title + body + actions), sitting under a context bar whose chips are still present and clearable — so the buyer can see *exactly* which constraints produced the zero and lift them one at a time.

---

## 8. Start over

**Decision: Option A — a true clean slate.** Silently preserving filters (Option B) is the specific trust bug this initiative exists to kill; "start over" that leaves hidden filters active is a trap.

- **Clears:** journey · selected region / group / zone / area / school / corridor / cluster · search query `q` · all property filters · all agri filters · map selection · highlighted listing · open popup / stepper state.
- **Preserves:** **city** (you're still in Bangalore) and **Buy/Rent mode** (a standing intent, not a confusing result-changer). Nothing else.
- **Label:** `Start over` (sentence case). Promote it from an unlabelled ghost link to a clearly-labelled ghost button with a `rotate-ccw` icon, positioned by Buy/Rent in the map/panel chrome.
- **Confirmation:** lightweight, and **only when there is substantial state to lose** — i.e. selection deeper than a region, or any filter/search active. A small popover anchored to the button: *"Start over? This clears your filters, search and selection. You'll return to Bangalore."* with **Start over** / **Cancel**. No full modal. When only a region (or nothing) is selected, skip the confirm and just reset.
- **After click:** returns to the city landing (`region-bubbles` layer), context bar empty, count badge back to `{N} properties in {city}`, map camera reset to the city view. Focus moves to the panel's `h1` (city hero) so keyboard users land somewhere sensible.
- **URL after reset:** `/discover?city=bangalore` (mode appended only when non-default, e.g. `&mode=rent`). All scope, journey, filter and `q` params dropped.

---

## 9. URL / cold-load behaviour

Active context is fully URL-addressable, and the chips + badge are **derived from the URL on cold load** — a shared link restores the same visible context.

| URL | Chips shown | Badge copy | Notes |
|---|---|---|---|
| `/discover?city=bangalore&q=plot` | `Search: "plot"` | `{M} results for "plot" in Bangalore` | Search chip on cold load; city scope. |
| `/discover?city=bangalore&journey=area-first&groupId=thanisandra-hennur-belt` | none (scope only) | `{N} properties in {Group}` | Scope in breadcrumb; no chips → context bar collapsed. |
| `/discover?city=bangalore&areaKey=whitefield&sellerType=owner` | `Seller: Owner` | `{M} of {N} match in Whitefield` | Area scope in breadcrumb; one filter chip. |
| `/discover?city=bangalore&readyToMove=true&reraRegistered=true` | `Ready to move` · `RERA registered` | `{M} of {N} match your filters` | Two boolean chips at city scope. |

**Rules:**
- Chips reflect URL params 1:1; each chip's ✕ removes its param and updates the URL (replace, not push, so back-button isn't polluted per-chip).
- Badge copy matches URL state on first paint (the `M of N` form appears immediately when filter/search params are present).
- Clearing chips updates the URL predictably (drop that key); `Clear all` drops all filter+`q` keys but keeps `city`, `journey`, and scope keys (it clears filters, not location).
- `Start over` rewrites the URL to the bare `?city=` form (§8).

---

## 10. Accessibility

- **Keyboard:** the context bar is a single tab stop group — arrow-key roving focus across chips (`role="group"`, `aria-label="Active filters and search"`), `Enter`/`Space` triggers a chip's clear, `Backspace`/`Delete` on a focused chip also clears it. The `+N` overflow and `Clear all` are normal buttons in tab order. The overflow popover traps focus while open and returns focus to `+N` on close.
- **Labels:** each ✕ has `aria-label="Remove {full chip label}"` (e.g. "Remove RERA registered"), not a bare "Remove". `Clear all` → `aria-label="Clear all filters and search"`.
- **Result count is announced politely, and debounced:** the badge (or a visually-hidden mirror of it) is `aria-live="polite"` and updates **only after the fetch settles** — never on each keystroke and never mid-refetch. Debounce ~500 ms after input stops so typing "corner plot" announces once, not eleven times. During loading the badge is `aria-busy="true"` and makes no announcement.
- **Focus states:** the system 3 px navy focus ring on every chip, the ✕, `+N`, `Clear all`, and `Start over`. Never rely on colour alone — boolean chips read their state in text, not just tint.
- **Reduced motion:** chip add/remove, the overflow popover, and the badge dim/settle transition all collapse to instant under `prefers-reduced-motion: reduce` (consistent with the existing region-guidance handling).
- **Contrast:** chip label text on `--paper` meets AA; the search chip's copper hairline is decorative (the `Search:` prefix carries the meaning, not the colour).

---

## 11. Constraints honoured

**Not designed / not touched:** mobile bottom sheet or any mobile-specific layout; backend/API changes (except the *count-contract* gap identified in §6/§10 as a follow-up); map label-overlap work; school-search work; code-quality/SonarQube; DB/Flyway/OpenSearch/ingestion; Central-Bangalore/taxonomy; production mock data.

**Preserved:** the Discover model where map and panel mirror one active context (this work *strengthens* it — one number, both surfaces); the existing area-first / school-first / listings journeys; the current region/group/area URL model (chips add filter/`q` params alongside it); existing map camera invariants (clearing a chip never moves the camera); saved-homes behaviour; trust/tier behaviour (RERA chip echoes but doesn't alter it).

---

## 12. Wireframes

See [`ACTIVE_CONTEXT_wireframes.html`](./ACTIVE_CONTEXT_wireframes.html) for annotated desktop mock screens of:

1. City landing — no filters (context bar collapsed, plain badge)
2. City landing — with filters (`M of N`, chip row)
3. Area group selected — with filters
4. Area selected — with a search query
5. Zero-results, filtered (`0 of N`, empty state, clear actions)
6. Many active chips — overflow (`+N ⌄` popover)
7. After Start over (clean slate)

Plus the chip anatomy, the count-badge state matrix, and the Start-over confirm popover.

---

## 13. Engineering handoff

**Recommended issue title:** `feat(discover): add active context chips and trustworthy result-count badge behaviour`

**Proposed scope**
- Add an **ActiveContextBar** to the panel (below the header band, above results) rendering filter + search chips per §3–§5, with the overflow popover and `Clear all`.
- Extend the filter model beyond `{ budget, ptype, beds, verified }` to include `sellerType`, `dateRange`, `backOnMarket`, `newToMarket`, `reraRegistered`, `readyToMove`, plus `q` (search) as first-class URL-addressable state.
- Introduce a single **result-count selector** that returns `{ n, m, scopeLabel, noun, state: 'ok'|'loading'|'zero-filters'|'zero-search'|'zero-empty'|'stale' }`, consumed by **both** the map badge pill and the panel header stat so they can never diverge.
- Re-specify the map badge pill and panel stat copy from that selector (§6).
- Promote **Start over** to a labelled button with the conditional confirm popover (§8).
- Wire all of the above to the URL (§9) and add the a11y behaviours (§10).

**Likely files** (from the current kit — production paths will differ):
- `ui_kits/discover/src/DiscoverPortal.jsx` — state model (add filter keys + `q`), the result-count selector, `reset()` → confirm flow, URL sync.
- `ui_kits/discover/src/components/shared.jsx` — new `DPActiveContextBar` + `DPChip` + `DPChipOverflow`; extend `DP_DEFAULT_FILTERS`, `DP_applyFilters`; badge/stat copy helper.
- `ui_kits/discover/src/DiscoverPanel.jsx` — mount the context bar per layer; route empty-state copy by cause (§7).
- `ui_kits/discover/src/PortalMap.jsx` — badge pill copy + loading/stale states; keep camera invariant on chip clear.
- (production: the equivalent `MapDiscoveryPage` surfaces + the filter/query state store.)

**Acceptance criteria**
- Every active filter and any `q` renders as a clearable chip; scope objects never render as chips.
- The count badge and panel stat always show the **same** number, always name the scope, and use `M of N` whenever filters/search are active.
- A filtered zero reads `0 of N match…`, never "no properties in {city}".
- Loading never flashes a new number; a stale/unreconcilable count shows `Filtered results` with no number.
- Clearing a chip updates the URL, keeps journey/scope, doesn't move the map camera, and refetches once.
- `Start over` clears everything except city + mode, confirms only when there is substantial state, and rewrites the URL to `?city=…`.
- Cold-loaded URLs from §9 restore the exact chips + badge copy shown there.
- Chips are keyboard-operable; count updates announce politely and debounced.

**Test scenarios**
- Apply seller + RERA + ready-to-move → three chips, `M of N`, clear each individually, URL updates each time.
- Type a query at city scope, then select an area → search scopes to the area; clearing `q` returns the full area list, stays in the area.
- Filter down to zero → `0 of N`, empty state offers Clear filters; clearing restores results and collapses the bar.
- Add ≥ 6 filters → overflow `+N ⌄` popover; every hidden chip clearable; count + Clear all stay on the row.
- Cold-load each §9 URL → chips + badge match the table.
- Trigger a refetch (change scope) → badge dims + spinner, no transient wrong number, one polite announcement on settle.
- `Start over` with deep state → confirm popover; with region-only → no confirm; both land on `?city=…` clean slate.
- `prefers-reduced-motion` → no chip/popover/badge motion.

**Risks**
- **Count contract** — the biggest one. If the panel result list and the map query can return different totals for the same context, the `M of N` promise breaks. Mitigation: single shared selector; if it can't reconcile, fall back to `Filtered results` (no number) and file the contract gap. *This is the one place design flags a possible missing API contract.*
- Loading flicker / debounce tuning — too eager announces noise, too slow feels laggy (~500 ms target).
- Chip-row overflow measurement on resize (recompute how many chips fit).
- URL param sprawl — keep keys stable and documented; use `replace` for per-chip clears.

**Non-goals** — mobile layout, map label-overlap, school-search internals, taxonomy/Central-Bangalore, ingestion/data, saved-homes and trust-tier logic (only referenced, not changed).
