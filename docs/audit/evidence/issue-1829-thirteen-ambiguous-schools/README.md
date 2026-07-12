# Issue #1829 — the 13 ambiguous Bengaluru schools: two independent decisions each

---

## PRODUCT RULINGS (recorded — these are DECISIONS, not open questions)

Issued by the product owner after reviewing this evidence. They **ratify** what is implemented here;
no code changed as a result. They are recorded so that a future reader sees settled decisions with
reasons, not unresolved ambiguity.

| # | Ruling |
|---|---|
| **R1** | **Do not auto-migrate any of the 10 MEDIUM_CONFIDENCE schools.** A nearest configured centroid is **not** sufficient to establish canonical locality. |
| **R2** | **National Public School, Banashankari stays MEDIUM.** Jayanagar is *strongly contradicted*; Subramanyapura is *plausible but not independently proven*. Leave unchanged until an official address/boundary source resolves it. |
| **R3** | **Preserve the 2 HIGH_CONFIDENCE migrations and the 1 UNRESOLVED case** exactly as implemented. |
| **R4** | **V110 is immutable** (already applied to shared dev). Any future change to the coverage model must be a **new forward Flyway migration**. See `docs/operations/school-attribution-corrections.md`. |
| **R5** | *(#1830, related)* **Bengaluru Rural is a separate administrative/product geography.** Not normalised into the Bengaluru Urban bucket; its schools stay unassigned by the urban-area algorithm. Onboarding/coverage policy tracked separately in **#1836**. |

### R2 — new evidence that *strengthens* the ruling

The ruling allowed that "a configured Banashankari locality" might resolve the case. **It does not —
and measuring it made the case *against* auto-migration stronger, not weaker.**

`IN|KA|Bengaluru|Banashankari` **is** a configured locality. Measured against real catalogue geometry:

| Candidate area | Distance to school | Real bbox |
|---|---|---|
| **Banashankari** *(what the address says)* | **4,594 m** | **does NOT contain the school** |
| **Subramanyapura** *(what the geometry says)* | **502 m** | **CONTAINS the school** |
| Jayanagar *(currently stored)* | 7,693 m | does not contain |
| Banashankari Temple Ward | 4,857 m | does not contain |

So the configured `Banashankari` locality **actively contradicts** the address token rather than
confirming it. The reason is visible in the address itself:

> *"No.81, 3rd Cross, 60 Feet Road, Dr. Vishnuvardhan Rd, **5th Stage, Banashankari**, Bengaluru"*

**"Banashankari 5th Stage" is a large BDA layout name, not the Banashankari locality.** That is
precisely why the address token and the geometry disagree — and precisely the class of ambiguity that
must not be auto-resolved.

The honest state of the evidence: **Jayanagar is almost certainly wrong** (7.7 km away, not
contained), and Subramanyapura is the strongest candidate (502 m, geometrically contained). But
"strongest candidate" is not "proven", and a layout name in an address is not a locality. It remains
MEDIUM and unchanged, per R2.

---

Resolved under the #1828 two-concept model. Every school gets **two independent decisions**:

| Decision | Question it answers | Where it is stored |
|---|---|---|
| **Canonical locality** | Where is this school *actually* located? | `schools.area_key` |
| **Curated coverage** | Which curated Discover areas may surface/count it? | `school_discover_area_coverage` |

These are **not** forced to the same answer. That separation is the whole point: a school can have a
truthful fine-grained locality **and** still legitimately count toward a curated area — but only when
real evidence says so, never to prop up a badge.

---

## 0. How the 13 were identified (re-derived, not copied)

`derive_evidence.py` in this directory re-runs #1737's 4-part decision rule against the **real**
sources and subtracts the 5 schools V109 actually corrected (parsed out of the migration itself, not
retyped):

```
Bengaluru schools parsed        : 32   (expect 32)
V109 corrections parsed         : 5    (expect 5)
Suspected by the #1737 rule (M) : 18   (expect 18)
Left for human ruling (L)       : 13   (expect 13)  <- RE-DERIVED, not copied
```

The derivation independently reproduces the audit's N/M/K/L and the 13 names. **No hardcoded list is
validated against another hardcoded list.**

---

## 1. Geometry source and the exact containment query (required evidence)

Containment was **not** taken from parsed migration text. It was verified against **real database
geometry**.

**Source of truth**

| | |
|---|---|
| Table | `public.areas` — columns `min_lat`, `min_lon`, `max_lat`, `max_lon` |
| Populated by | `V71__cities_and_areas.sql` (10 curated areas) + `V106__seed_bangalore_macro_region_mapping.sql` (304 localities) |
| Minus | `V108__fix_mukkidipeta_north_emerging_bounds.sql` (guarded delete of the mis-geocoded Mukkidipeta) |
| Verified | **No migration in the repo ever `UPDATE`s `areas` min/max bounds.** The only `ALTER TABLE areas` is V100 (adds `area_slug`). So the seeded VALUES *are* the DB geometry. |
| Container | `postgis/postgis:15-3.4`, with the **real migration files applied verbatim** (V71 → V77 → V78 → V98 → V100 → V106 → V108) |
| Sanity check | Container reports **313 Bengaluru areas, 69 degenerate bboxes** — independently matching the #1737 audit's "69 of 313 (22%)". |

**The query**

```sql
SELECT s.name,
       s.stored_coarse AS curated_area,
       (a.min_lat <> a.max_lat AND a.min_lon <> a.max_lon) AS bbox_usable,
       (s.lat BETWEEN a.min_lat AND a.max_lat
        AND s.lon BETWEEN a.min_lon AND a.max_lon)         AS contained
FROM probe_schools s
JOIN public.areas a ON a.area_key = 'IN|KA|Bengaluru|' || s.stored_coarse;
```

plus a cross-check against **all 10 curated areas** (not just the stored one), which is what surfaced
the ORCHIDS Haralur result below.

> **69 of 313 areas have a degenerate (point) bbox** where `min == max`. Containment is meaningless
> for those, so `bbox_usable` is checked explicitly and a degenerate bbox never yields `contained`
> coverage.

**Result — 4 schools contained in their stored curated area:**
Carmel Garden (HSR Layout), Narayana/Bellandur (Sarjapur Road), ORCHIDS Sarjapur Road (Sarjapur
Road), Poornaprajna (Indiranagar).

**Result — 1 school contained by a curated area that is NOT its stored area:**
**ORCHIDS Haralur** is geometrically inside **Sarjapur Road**, while its stored `area_key` says HSR
Layout. This was only discoverable by querying the DB against all curated areas; parsing the stored
attribution alone would have missed it.

---

## 2. The 13 rulings

Confidence rules applied:

- **HIGH_CONFIDENCE** — the school's own address and the geometry (nearest of the 313-area
  catalogue) **agree**. Only these are auto-migrated.
- **MEDIUM_CONFIDENCE** — evidence mostly agrees but address and geometry name different areas;
  a boundary/judgement call remains. **Canonical locality is NOT auto-migrated.**
- **UNRESOLVED** — insufficient or conflicting evidence. Left entirely unchanged.

`contained` coverage is added **only** where the real-geometry query above proves containment.

### HIGH_CONFIDENCE — canonical locality auto-migrated (2)

These two are exactly the schools the *old* single-column rule had to refuse to fix ("demoted by
condition 4"), because moving them would have zeroed their curated badge. Under the two-concept model
that blocker dissolves: truthful locality **and** the curated area keeps counting them, via real
geometric containment rather than a fabricated relation.

| | **Poornaprajna Education Centre, Indiranagar** |
|---|---|
| Canonical locality | `IN\|KA\|Bengaluru\|New Tippasandra` *(was: Indiranagar)* |
| Canonical evidence | Address names **New Tippasandra**; nearest of 313 is **New Tippasandra** at **424 m** (vs 1826 m to Indiranagar's centroid). Address and geometry **agree**. |
| Canonical confidence | **HIGH_CONFIDENCE** |
| Curated coverage | `Indiranagar` |
| Coverage relationship | `contained` |
| Coverage evidence | Real-DB bbox query: the school's coordinate lies inside Indiranagar's **non-degenerate** bbox. Geometry, not assertion. |
| Coverage confidence | **HIGH_CONFIDENCE** |
| Manual review | not required |

| | **Narayana eTechno (CBSE) School — Bellandur** |
|---|---|
| Canonical locality | `IN\|KA\|Bengaluru\|Bellandur` *(was: Sarjapur Road)* |
| Canonical evidence | Address names **Bellandur**; nearest of 313 is **Bellandur** at **1322 m** (vs 1769 m to Sarjapur Road's centroid). Address and geometry **agree**; the school's own name says Bellandur. |
| Canonical confidence | **HIGH_CONFIDENCE** |
| Curated coverage | `Sarjapur Road` |
| Coverage relationship | `contained` |
| Coverage evidence | Real-DB bbox query: inside Sarjapur Road's non-degenerate bbox. |
| Coverage confidence | **HIGH_CONFIDENCE** |
| Manual review | not required |

> Both are asserted as **unchanged controls** in `SchoolAreaKeyCorrectionIT` (they are what proved
> #1737 did not silently re-derive everything). Those assertions must be updated **deliberately** as
> part of this change — see §4.

### MEDIUM_CONFIDENCE — canonical locality UNCHANGED; coverage added only where geometry proves it (10)

Address and geometry name **different** areas. Per the rule, canonical locality is **not**
auto-migrated. Listed for product review.

| School | Stored (canonical, unchanged) | Address says | Geometry says (dist) | Coverage action |
|---|---|---|---|---|
| **ORCHIDS Intl — Haralur** | HSR Layout | Varthur / Haralur | Kasavanahalli (1024 m) | **ADD `contained` → Sarjapur Road** (real-geometry containment; not its stored area) |
| Carmel Garden Public School | HSR Layout | Koramangala | Sarjapur (972 m) | `contained` → HSR Layout — *already its `primary`; no new row* |
| ORCHIDS Intl — Sarjapur Road | Sarjapur Road | Sarjapur | Lakeview Residency (858 m) | `contained` → Sarjapur Road — *already its `primary`; no new row* |
| National Public School, Banashankari | Jayanagar | Banashankari | Subramanyapura (502 m) | none — no curated bbox contains it |
| RMS International School | Jayanagar | Bikasipura | Konanakunte (1154 m) | none |
| Narayana eTechno — Rk Layout | Jayanagar | Kanakapura | Banashankari Temple Ward (1273 m) | none |
| EuroSchool Whitefield | Marathahalli | Whitefield | Hoodi (1575 m) | none |
| Vivekananda ORCHIDS — Sahakar Nagar | Hebbal | Kodigehalli | Vignana Kendra (672 m) | none |
| Narayana eTechno — Electronic City Ph 1 | HSR Layout | Electronic City | Hongasandra (631 m) | none |
| BS International School, Electronic City | Electronic City | S.Bingipura | Koppa Gate (3774 m) | none |

**Why these are not auto-migrated.** In each case the address token and the geometry disagree, so
either answer could be defended and neither is *proven*. **A nearest configured centroid is not
sufficient to establish canonical locality** (ruling R1).

This is now a **recorded product ruling, not a deferral for want of effort.** The strongest case —
**National Public School, Banashankari** (7,693 m from Jayanagar, 502 m from Subramanyapura) — was
examined specifically and **still stays MEDIUM** (ruling R2): the configured `Banashankari` locality
is 4,594 m away and does *not* contain the school, because the address's "Banashankari **5th Stage**"
is a BDA *layout* name, not the locality. See the R2 evidence block at the top of this document.

**Deferring these is now SAFE in a way it was not before #1828.** Their curated badge no longer
depends on their canonical locality being false — coverage carries the count. So a later ruling can
move any of them with **no badge consequence**. That freedom is exactly what the two-concept model
bought, and it is why there is no pressure to guess.

### UNRESOLVED (1)

| | **Narayana eTechno (CBSE) School — KR Puram** |
|---|---|
| Canonical locality | **UNCHANGED** (`Marathahalli`) |
| Canonical evidence | The address names **no configured area at all**. Geometry alone suggests Hoodi (496 m), 5193 m from Marathahalli's centroid — but geometry with **zero** corroborating address evidence is exactly the "guess" the issue forbids. |
| Canonical confidence | **UNRESOLVED** |
| Curated coverage | none added |
| Coverage evidence | No curated bbox contains it. |
| Coverage confidence | n/a |
| Manual review | **REQUIRED** — needs an independent source (official address / UDISE record) to identify a configured locality. |

---

## 3. Audit totals

```
Total schools evaluated:              13
Canonical locality changed:            2   (HIGH_CONFIDENCE only)
Canonical locality unchanged:         11   (10 MEDIUM + 1 UNRESOLVED)
Curated coverage rows created:         3   (see §4 — Indiranagar, Sarjapur Road x2)
Schools with multiple curated coverages: 2  (the 2 HIGH: fine primary + curated contained)
High-confidence cases:                 2
Medium-confidence cases:              10
Unresolved cases:                      1
```

## 4. Expected count movement

**No curated area loses a school. One gains, on real geometric evidence.**

| Curated area | Before | After | Why |
|---|---|---|---|
| Indiranagar | n | **n** | Poornaprajna's `primary` moves to New Tippasandra, but `contained` coverage keeps it counted. **Net zero.** |
| Sarjapur Road | n | **n + 1** | Narayana/Bellandur's `primary` moves to Bellandur but stays counted via `contained` (net zero); **ORCHIDS Haralur gains `contained` coverage** on proven containment → **+1**. |
| New Tippasandra | 0 | **1** | Poornaprajna's truthful canonical locality. |
| Bellandur | 0 | **1** | Narayana/Bellandur's truthful canonical locality. |
| HSR Layout | n | **n** | Carmel Garden / ORCHIDS Haralur canonical unchanged; Haralur's *coverage* addition is to Sarjapur Road, not a removal from HSR Layout. |
| all others | — | **unchanged** | |

The **+1 to Sarjapur Road is a real count change** and is disclosed deliberately: it is not
fabricated to preserve a badge, it is a school that the database's own geometry says is inside that
curated area and which was previously invisible to it.

## 5. Guardrails honoured

- Canonical locality is never falsified to preserve a count.
- `contained` coverage is used **only** where real DB geometry proves containment; degenerate bboxes
  are excluded explicitly.
- No `nearby` coverage is generated here (it would not count anyway, per the #1828 ruling).
- **No wholesale re-derivation.** 11 of 13 canonical localities are untouched; the naive
  nearest-of-313 path (measured: moves 26/32, collapses counts 32 → 6) is not used.
- Corrections are delivered as a reviewed migration keyed on `udise_code`, per
  `docs/operations/school-attribution-corrections.md`.
