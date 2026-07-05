# Unified Discover Portal — UX Spec

**ReTrends · Discover · Consolidation spec · GitHub #1740**

A single Discover shell for Bangalore. **Region is a scope** the user can set or skip; **journey is a narrowing method** (area · school · listings · agricultural), never a page change. The map and the right-hand decision panel always mirror the same scope and level. This spec defines the model, every required state, the scoped search box, the map-layer rules, and the merge plan for the existing kits. Implementation is deliberately out of scope here.

---

## 01 · The unified model

Everything in Discover is one expression: **Scope × Journey → Result**. Both scope and journey are optional and independently set. There is no "area page" or "school page" — only the one portal in different narrowing states.

```
SCOPE (optional)        JOURNEY (optional)        RESULT
Region              →   Intent                →   Narrowed set
North/South/E/W/        Area · School ·           Groups → areas → listings, or
Central — or none       Listings · Agri          zones → schools → homes-in-radius
```

> **The one rule that governs everything:** the left map layer and the right panel content are always two views of the *same* (scope, journey, level) tuple. Clicking a map bubble === clicking its matching card. Changing scope or journey re-renders both sides in place — the shell never navigates away.

Two axes, set in either order:

- **Region as a filter.** Setting a region scopes *whatever journey follows* to that region. Clearing it widens back to all Bangalore. It is a chip on the shell, not a destination.
- **Journey as a method.** Choosing "Search by area" or "Search near a school" swaps the *narrowing mechanism and the map layer*, keeping the current region scope. Journeys can be entered before or after a region is set.

---

## 02 · Persistent shell anatomy

These elements never unmount or reload across any state. Only the panel body and the map layer change.

| Region | Element | Behaviour |
|---|---|---|
| Top bar | Product chrome | Logo, nav, account. Identical everywhere. |
| Panel header | City + Buy/Rent + Start over | City = Bangalore (fixed for now). Buy/Rent is wording-only and persists across scope + journey changes. |
| Panel header | Title + breadcrumb | `Discover Bangalore` → `> North Bangalore` → `> Airport Belt` → … Each crumb is a click-back target. |
| Panel header | Journey tag | Shows the active journey (`By area` / `Near school`) once one is chosen; absent on the neutral landing. |
| Panel body | Scoped search box | Appears once a region *or* journey is active (see §10). |
| Left half | Map | One Leaflet instance; only its marker layer swaps. Fly-to on every scope/level change. |

Split is a balanced **50 / 50** below the 60px top bar, exactly as the current kits.

---

## 03 · State model

State is three orthogonal variables plus a derived *level*. No state is a separate route.

| Variable | Values | Notes |
|---|---|---|
| scope | `region \| null` | The macro region, or none (all-Bangalore). |
| journey | `null \| area \| school \| listings \| agri` | The narrowing method. `null` = neutral landing. |
| selection | `group / zone / area / school ids` | Progressive picks within the active journey. |
| level | *derived* | city · region · groups · group · area · listings (area journey) / zones · zone · area · school (school journey). |

> **Guard:** a region id alone never renders listings or schools — it resolves to the region overview. A journey alone (no region) resolves to the all-Bangalore group/zone level. The two compose; neither dead-ends.

---

## 04 · State 1 — Initial city landing

`scope: none` · `journey: none`

**Map layer**
- Only the **5 macro region bubbles** (North / South / East / West / Central).
- Each bubble shows a **property/listing count** — never a school count.
- No areas, no schools, no clusters. Max 5–8 bubbles, ever.

**Right panel**
- Title `Discover Bangalore`; City = Bangalore; Buy/Rent.
- One line: "Start with a region, or choose how you want to search."
- Region cards (count each) + four journey cards: **Search by area · Search near a school · View all listings**, and **Agricultural land** visually separated as its own journey.

---

## 05 · State 2 — Region selected

`scope: North Bangalore` · `journey: none`

Clicking **North Bangalore** on the map (or its card) sets scope and *stays in the shell*. Breadcrumb becomes `Discover Bangalore > North Bangalore`.

**Map layer**
- Pan/zoom to North Bangalore bounds.
- Show **property clusters** inside the region (top hotspots + a "+ N more" hint) — not every area, not schools.

**Right panel**
- Header: North Bangalore + **total property count** + Change region / Start over.
- Scoped search box (see §10).
- In-region journey cards: **Search by area in North Bangalore · Search near a school in North Bangalore · View listings in North Bangalore**.

---

## 06 · State 3 — Search by area, no region

`scope: none` · `journey: area`

**Map layer**
- Area **group/zone bubbles across all Bangalore** (e.g. Airport Belt, IT Corridor, South Core…). Grouped, not every area.

**Right panel**
- Breadcrumb `Discover Bangalore > Search by area`.
- Group cards + scoped search box (Area mode) covering all Bangalore.

Progressive disclosure continues: `group → area → listings`.

---

## 07 · State 4 — Search by area, region set

`scope: North Bangalore` · `journey: area`

**Map layer**
- Only the area **groups/zones inside North** (Airport Belt, North Growth, Outer North). Then `group → area → listings` bubbles as the user narrows.

**Right panel**
- Breadcrumb `… > North Bangalore > Search by area`.
- Region-scoped group cards; search box placeholder "Search North Bangalore".
- Area level adds listing filters: budget · type · bedrooms · verified · buy/rent.

---

## 08 · State 5 — Search near school, no region

`scope: none` · `journey: school`

**Map layer**
- **School zones across all Bangalore.** School-specific bubbles/counts appear *only now* that the school journey is active — never before.

**Right panel**
- Breadcrumb `Discover Bangalore > Search near school`.
- School-zone cards + scoped search box (School mode) covering all Bangalore.

---

## 09 · State 6 — Search near school, region set

`scope: North Bangalore` · `journey: school`

**Map layer**
- Only **school zones/schools inside North**. Then `zone → area → school pins`; selecting a school shows its **radius ring + filtered home pins** (3 / 5 / 10 km).

**Right panel**
- Breadcrumb `… > North Bangalore > Search near school` → `> Hebbal > {school}`.
- Zone/area/school cards; selected school → radius chips + listings sorted by distance; Change school.

---

## 10 · Scoped search box behaviour

One search box in the right panel, shown once a region *or* a journey is active (hidden on the neutral city landing where the region cards do the job). Two responsibilities: **placeholder reflects scope**, **toggle reflects intent**.

| Aspect | Rule |
|---|---|
| Placeholder | City scope → "Search Bangalore". Region scope → "Search North Bangalore". |
| Toggle | **Area** searches areas · **School** searches schools. Defaults to the active journey's intent (Area journey → Area; School journey → School). |
| Scope respect | Results are filtered to the current region when one is set; all-Bangalore otherwise. |
| Result → action | Area result jumps to that area's listings (area journey) or "Schools in {area}" (school journey), auto-resolving group/zone in the breadcrumb. School result jumps to homes within the default radius. |

> This is the merge of the current kits' two separate search widgets — the area journey's "Search area directly" box and the school journey's "What do you know?" intent control — into **one scope-aware, intent-toggled box**.

---

## 11 · Map-layer rules (single source of truth)

Exactly one layer is active per state. The layer is a pure function of (scope, journey, level).

| State | Map layer | Max markers |
|---|---|---|
| City landing | region bubbles (property counts) | 5–8 |
| Region selected | in-region property clusters / top hotspots + "+N more" | ~3–5 |
| Area · no region | area group bubbles, all Bangalore | ≤ ~8 |
| Area · region | group → area → listing pins (in region) | ≤ ~15 at area level |
| School · no region | school-zone bubbles, all Bangalore | ≤ ~8 |
| School · region | zone → area → school pins → radius ring + home pins | ≤ ~15 at area level |

- **Property counts only** on region bubbles; school counts never surface until the school journey is entered.
- Never render all areas or all schools at once — always the current level's set.
- Agricultural land uses its own layer and is never mixed into residential layers.

---

## 12 · Merge & reuse plan

The two standalone kits collapse into one portal. Nothing needs inventing — the pieces already exist and mostly line up; they are re-hosted under one shell and one state machine.

### Merge into one shell

| Today (two pages) | Becomes |
|---|---|
| `ui_kits/area-discovery/index.html` + `ui_kits/school-discovery/index.html` | One `ui_kits/discover/index.html` shell mounting a single `DiscoverPortal`. The two current index files are retired (or kept as thin redirects). |
| `AreaDiscovery.jsx` + `SchoolDiscovery.jsx` (two state machines) | One `DiscoverPortal.jsx` holding `{scope, journey, selection, mode}` and deriving level. The area/school logic become two *journey modules* the portal switches between — not two apps. |
| Two Leaflet maps (`AreaMap.jsx`, `Map.jsx`) | One `DiscoverMap.jsx` with a layer registry keyed by (journey, level). The marker builders (region bubble, group/zone pill, area pin, school pin, home pin, radius ring) move in wholesale — they already share styling. |

### Reuse as-is (lift into the portal)

- **Cards** — `RegionCard`, `JourneyOption`, `GroupCard`, `AreaCard`, `ListingCard`, `AgriCard` (area kit) and `ZoneCard`, `SchoolCard` (school kit). Region + journey cards are already shared concepts — dedupe to one each.
- **Shared bits** — `BuyRentToggle`, `BackLink`, `Crumb`, `HeaderBand`, `SectionLabel`, empty states. These are near-identical across both kits; keep one copy.
- **Data** — merge `area-discovery/data.js` and `school-discovery/data.js` into one `discover/data.js`: shared `regions`, one `areas` table carrying both group and zone membership, plus `groups`, `zones`, `schools`, `listings`. Counts stay derived (property counts for region bubbles). Reuse `BLR_DIST` / `BLR_HOMES_NEAR` for radius.
- **DS components** — `Icon`, `Button`, `Badge`, `Input`, `TrustBadge` unchanged.

### Consolidate (was duplicated)

- Two search widgets → **one scoped, intent-toggled search box** (§10).
- Two journey headers / breadcrumbs → **one shell header** whose breadcrumb reflects scope + journey + selection.
- Journey tag becomes a mode indicator inside the one shell, not a page identity.

> **Net effect:** ~8 files across two folders collapse to one `discover/` folder (shell, portal, map, cards, data). No new visual language — same ink-navy + copper, plum reserved for the school journey layer/pins only.

---

## 13 · URL / state params

One shareable URL scheme for the whole portal, so any state restores exactly and no state implies a separate page:

```
?region=north&journey=area|school|listings|agri&groupId=…&zoneId=…&areaId=…&schoolId=…&radiusKm=5&mode=rent
```

- `region` and `journey` are independent and both optional.
- Selection ids are validated against the active journey; unknown ids fall back to the nearest valid level rather than erroring.

---

## 14 · Never do this

- Never route to a separate area/school/landing page — it is one shell, always.
- Never show school bubbles or counts before the school journey is active.
- Never render all areas or all schools at once; never exceed 5–8 macro bubbles at city level.
- Never mix agricultural land into residential layers or lists.
- Never lose scope or Buy/Rent when switching journeys — they persist.

---

*Spec only — no implementation. Recommended next step: build `ui_kits/discover/` as the single portal per §12, retiring the two standalone kits.*
