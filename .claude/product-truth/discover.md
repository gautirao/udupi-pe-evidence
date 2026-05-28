# Product Truth — Discover

> **Authoritative, implementation-INDEPENDENT statement of what the Discover feature
> must always be true for buyers and brokers.** This document is the reference the
> Definition-of-Done (DoD) autopilot review gate evaluates an issue against. It describes
> *buyer-facing behaviour*, never implementation. If this document and the code ever
> disagree, that disagreement is a defect to be resolved — the document states the intent.

- **Owner anchor:** `.claude/product-truth/discover.md`
- **Consumed by:** `.claude/autopilot/templates/definition-of-done.toml` (each `[[criterion]].truth_anchor` points at a section anchor below) and `.claude/autopilot/gates/AUTOPILOT_DOD_REVIEW.md`.
- **Source-of-truth tests:** `e2e/discover-real-data-smoke.spec.ts` (see `testing.real_data_smoke`).

Each section below carries a **stable anchor** (the `key.subkey` in its heading). DoD criteria reference these anchors; do not rename an anchor without updating the DoD templates that cite it.

---

## `markers.anon_visibility` — Markers are visible to anonymous users

Property/area markers on the Discover map are visible to **anonymous (unauthenticated)
users**, not only to signed-in users. This holds for both the area journey and the
school-radius journey.

- An anonymous user who has **not** selected an area sees area-cluster markers for the city.
- An anonymous user who **has** selected an area sees property markers within that area.
- An anonymous user in the school-radius journey sees markers within the school radius circle.

Marker data for anonymous users is served by **public** Discover endpoints (no
authentication required). Authentication is **never** a precondition for *seeing markers*.

**Buyer promise:** "I can open Discover without an account and still see where homes are."

---

## `auth.card_vs_marker_contract` — Auth changes card content/actions, NOT marker visibility

Authentication changes **what a listing card shows and what actions are available on it**
— it does **not** change **which markers are visible** on the map.

- Signing in may reveal richer **card content** (e.g. price detail, broker contact) and
  enable **card actions** (e.g. save, booking) that are gated behind auth.
- Signing in (or out) does **not** add, remove, or relocate map **markers** for the same
  map state. For an identical area/zoom/journey, an anonymous user and an authenticated
  user see the **same set of markers**.

**Buyer promise:** "Logging in unlocks details and actions on a listing — it does not
change which homes appear on the map."

---

## `journeys.area_first` — Area-first journey contract

The **area-first** journey:

1. The user selects a geographic **area**.
2. Listings and markers for that area load (cards + map markers stay consistent).
3. No school selection is required to use this journey.
4. **Back** navigation returns to the area-selection state.

This journey is available to **anonymous** users. Selecting/clearing an area updates the
URL contract such that the rendered cards, the count badge, and the visible markers all
reflect the same active area context.

**Buyer promise:** "I can pick an area and immediately see the homes there."

---

## `journeys.school_first` — School-first journey contract

The **school-first** journey:

1. The user selects a **school**.
2. Listings within the school **radius** load (cards + markers consistent).
3. The user may **optionally** select an area within the school radius (combined context).
4. **Back** at the school-radius step returns to school selection (the journey stays
   coherent; the school-radius circle is a **visual** aid).

**Buyer promise:** "I can start from a school and see homes near it, then optionally
narrow to an area — and stepping back never strands me."

---

## `search.contextual_q` — Contextual keyword search filters cards AND markers consistently

The keyword search parameter (`q`) is **contextual**: it filters within the currently
active context (area or school-radius), and it filters **listing cards and visible map
markers consistently** — the cards shown and the markers shown always reflect the same
filtered set.

- Clearing `q` restores the unfiltered set for the active context.
- `q` has **no effect** at the top-level city view **before** an area is selected (a
  top-level `?q=` must NOT fabricate a fake filtered state or a fake chip).
- When `q` is active within a valid context, an **active-search chip** is visible and is
  clearable; clearing it removes the keyword filter.

**Buyer promise:** "When I search by keyword, the list and the map agree — they show the
same matching homes — and clearing the search brings everything back."

---

## `testing.real_data_smoke` — Real-data smoke tests are the buyer-journey source of truth

`e2e/discover-real-data-smoke.spec.ts` runs against a **real backend** (no `page.route()`
mocks) and is the **authoritative source of truth** for the Discover buyer journeys. Its
journeys must pass before any Discover PR merges:

- **J1** — area-first, anonymous
- **J2** — school-radius, anonymous
- **J3** — school-first, authenticated
- **J4** — keyword (contextual search)

A buyer-facing Discover claim is only "true" if the corresponding real-data smoke journey
demonstrates it against real data.

---

## `testing.mocked_edge_only` — Mocked E2E is for edge/error paths only

Mocked E2E specs (those that stub responses via `page.route()`) exist to exercise **edge
cases and error paths** (empty states, retries, malformed/absent data, boundary
conditions). They are **never** the buyer-journey source of truth. The buyer-journey truth
is the real-data smoke suite (`testing.real_data_smoke`). A mocked spec passing does not,
by itself, establish that a buyer journey works.

---

## `testing.implementation_boundary` — Tests must not encode implementation quirks as product truth

Tests (and this document) **must not** treat implementation details as product truth.
Product truth is **visible, buyer-facing output**. The following are implementation details
and must NOT be asserted as correctness criteria of the product:

- internal React state key names or component prop names,
- specific API response field names or endpoint URL structure (unless directly testing a
  documented API contract),
- Supabase table/column names,
- exact CSS class names or precise style values (e.g. a specific opacity percentage) where
  the *product* requirement is merely "the user sees loading feedback".

Assert **what the buyer sees** (cards present, markers visible, chip text, card content,
journey reachable), not **how the code achieves it**. When a refactor changes the *how*
without changing the *what*, product truth — and the DoD — must remain satisfied.

---

## `known_gaps` — Documented gaps (deferred, NOT acceptance failures)

The following are **known, intentional product gaps** at the time of writing. They are
documented here so a future DoD evaluation does **not** mistake a deferred gap for an
unmet acceptance criterion. A gap listed here is "expected", not "broken".

- **Anonymous school-radius is bounded to a single area (#1193).** For anonymous users the
  school-radius listing set is sourced from area-scoped listings and does **not** cross
  area boundaries; the authenticated path crosses area boundaries (server-side radius
  query). This is a documented product gap, not a regression. The school-radius circle is
  visual for anonymous users.
- **Top-level / pre-area filters are deferred (#1167 family).** There is no top-level
  (pre-area) filter UI; filters are contextual (applied within an area/school context).
- **Top-level / city-only keyword search is deferred.** `q` is contextual only; a
  top-level `?q=` must not show a fake chip or fake filtered state (see
  `search.contextual_q`).

When a gap above is closed, update both this section and any DoD criterion that referenced
it.

---

## Change discipline

This is a **living document** under `.claude/`. When Discover *buyer-facing behaviour*
changes (not when implementation changes), update the relevant section here in the same
change, and update any DoD criterion `truth_anchor` that points at a renamed/removed
section. Implementation-only refactors must **not** require edits here.
