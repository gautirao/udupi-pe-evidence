# #2459 AC6 rule 5 — the area chip wraps instead of truncating

Evidence for the owner ruling on PR #2502 ("OPTION A, in the opt-in form"): an additive `wrap`
prop on the shared `Chip`, defaulting to today's truncating behaviour, enabled only for the
area-filter chip. No vocabulary change, no abbreviation, no rewritten numbers, unchanged width.

## Method — real layout, not a character budget

Every number below is read from the **live layout engine** in a real Chromium
(`getBoundingClientRect`, `scrollWidth`/`clientWidth`, `scrollHeight`/`clientHeight`,
`getComputedStyle`), against the production build of this branch served from `dist`.

#2459 requires evidence at **both** viewports — "mobile `390×844` and desktop `1366×768`" — so
both are captured here, BEFORE and AFTER, over the same nine states.

This matters because the character-count model was rejected — twice. A 24-character budget
standing in for a 160px box assumes a fixed glyph width, which is exactly how a variant measured
as "fitting" on `800–1,200` overshot by 43px on `Warehouse 10,000–20,000`. Nothing here counts
characters. `clipX` is `scrollWidth > clientWidth`; `clipY` is `scrollHeight > clientHeight`.

**File naming.** Unsuffixed files (`before-chip-*.png`, `before-measurements.json`) are the
**mobile 390×844** set. Files carrying `-desktop-` are the **1366×768** set. The desktop JSONs
additionally record `viewport` and `innerWidth` **inside each entry**, so they state what they
were measured at rather than relying on this README to say so — a gap the mobile JSONs have, and
the reason confirming their viewport required reading the capture script.

Raw output: `before-measurements.json`, `after-measurements.json`,
`before-desktop-measurements.json`, `after-desktop-measurements.json`.

Both arms are served from the **same saved bundles** with the same backend, fixture and URL set;
only the `Chip`/`ActiveContextChips` change differs. Before measuring, the two bundles were
checked to actually discriminate: the wrapping branch emits the literal
`whitespace-normal break-words`, which occurs **0 times** in the BEFORE bundle and **1 time** in
the AFTER bundle. A BEFORE arm that was secretly an AFTER build would make every table below
vacuous, so this is verified rather than assumed.

## ⚠️ Reachability — read this before reproducing

The area chip is **not reachable from the `area-first` journey**. `?journey=area-first&node=…`
renders the areas-journey panel, which hosts no active-context chip strip at all: probed at both
390×844 and 1366×768, across `type=`, `seller=`, `bom=`, `areaMinSqft=`, the legacy `areaKey=`
deep link, and a journey-less URL — `active-context-chips` was absent in **every** combination.

The one URL state found to mount the bar is **`?city=bangalore&journey=agri-first&areaMinSqft=…`**,
which renders `discover-right-panel` and its top chip strip. All captures below use that shape.

This is a pre-existing composition fact, not something this PR changed — `DiscoverRightPanel.tsx`
is untouched here. It is recorded because a screenshot taken on the area-first journey would show
an *absent* chip and could be misread as an unwrapped one.

## MOBILE 390×844 · BEFORE — pushed HEAD 75e53a37, truncating

Every one of the nine states clipped horizontally. Note this is **not** confined to the
multi-meaning cases: the single-meaning `Built-up area: 800 – 1,200 sq ft` needed 180px in a
160px box.

| case | span client/scroll px | clipped | chip height |
|---|---|---|---|
| single apartment | 160 / 180 | yes | 24px |
| single warehouse | 160 / 196 | yes | 24px |
| warehouse 10,000–20,000 | 160 / 226 | yes | 24px |
| mixed residential | 160 / 563 | yes | 24px |
| mixed two-family (homes + warehouses) | 160 / 738 | yes | 24px |
| mixed commercial | 160 / 781 | yes | 24px |
| commercial broad | 160 / 1126 | yes | 24px |
| broadest | 160 / 1499 | yes | 24px |
| broadest, six-digit range | 160 / 1591 | yes | 24px |

`white-space: nowrap`. `before-chip-broadest-six-digit-range.png` shows what the buyer actually
read: `Mixed built-up/warehous…`.

## MOBILE 390×844 · AFTER — wrapping, same 160px width

`white-space: normal`, `overflow-wrap: break-word`, `max-width: 160px` unchanged.
**`clipX=false` and `clipY=false` in all nine states** — nothing is cut in either axis.

| case | rendered width/height | clipped | chip height |
|---|---|---|---|
| single apartment | 108 / 32 | no | 40px |
| single warehouse | 65 / 48 | no | 56px |
| warehouse 10,000–20,000 | 65 / 80 | no | 88px |
| mixed residential | 96 / 112 | no | 120px |
| mixed two-family | 96 / 144 | no | 152px |
| mixed commercial | 96 / 160 | no | 168px |
| broadest | 160 / 192 | no | 200px |
| commercial broad | 116 / 208 | no | 216px |
| broadest, six-digit range | 160 / 208 | no | 216px |

The six-digit range renders in full as `1,00,000 – 2,00,000 sq ft` (en-IN lakh grouping, the
pre-existing `toLocaleString('en-IN')` behaviour — a separator choice, not a rewrite; every digit
the buyer entered is present at its own place value). Contrast withdrawn variant D, which fitted
six digits by displaying `100k`.

## ⚠️ FINDING — the vertical cost is ~4× the ruling's estimate

The ruling accepted a taller chip on the basis that "three-meaning states fit on three lines
(54px)". **Measured, they occupy 200–216px** at 390px width — roughly a quarter of an 844px
viewport for a single filter chip.

The discrepancy is not a defect in the implementation and not a disagreement with the ruling; it
is a difference in what was measured. The ruling's table measured the label alone
(`Mixed built-up/warehouse/plot: 500+ sq ft` → 3 lines). The **rendered chip also carries the
disclosure sentence**, because `ActiveContextChips` deliberately puts it inside the chip label so
it reaches `Chip`'s `aria-label` (D1: "Disclosure is NOT optional"). For the broadest selection
that sentence names six clauses:

> Compares built-up area for homes; plot size for plots; built-up area for shops, offices and
> commercial buildings; warehouse area for warehouses and godowns; plot size for commercial land;
> plot size for agricultural land.

So the implemented behaviour satisfies rule 5 exactly as ruled — nothing truncates, width is
unchanged, no vocabulary changed — while costing four times the vertical space the ruling priced.
Shortening this would require changing the disclosure or the vocabulary, both explicitly out of
scope for this PR, so it is **reported rather than acted on**.

## The `Mixed` collision carve-out — RE-MEASURED, and removed

`TOLERATED_TRUNCATION_COLLISION` documented one pair sharing a visible lead:
"mixed two-family (homes + warehouses)" and "broadest" both opened `Mixed built-up/warehouse`.

Re-measured against the wrapping layout, **the collision does not exist**. It was never a fact
about the two labels — the untruncated strings always differed — it was a fact about the
presentation that cut them short:

- two-family → `Mixed built-up/warehouse: 800 – 1,200 sq ft — Compares built-up area for homes; …`
- broadest  → `Mixed built-up/warehouse/plot: 500+ sq ft — Compares built-up area for homes; …`

The carve-out and the 24-character proxy it depended on are both deleted. All seven canonical
states are now asserted pairwise-distinct with **no exceptions**.

## DESKTOP 1366×768 — the unchanged-width premise, tested where a regression would hide

Desktop is not a second screenshot. At 1366×768 the chip has far more horizontal room, so the
question is whether the opt-in wrap still holds its premise: **does the label still wrap at its
unchanged 160px cap rather than widening?** That is the whole basis of the ruling, and desktop is
where a width regression would be least visible.

**It holds.** `max-width: 160px` in every state of both arms, and the chip element measures
**219.25px in BOTH arms** — byte-for-byte the same width before and after — so the wrap change
widens nothing. All nine states are `clipX=false` **and** `clipY=false` after.

| case | BEFORE span client/scroll | BEFORE clipX | AFTER span client/scroll | AFTER clipX/clipY | AFTER chip height |
|---|---|---|---|---|---|
| single apartment | 160 / 177 | yes | 160 / 160 | no / no | 40px |
| single warehouse | 160 / 196 | yes | 160 / 160 | no / no | 40px |
| warehouse 10,000–20,000 | 160 / 226 | yes | 160 / 160 | no / no | 40px |
| mixed residential | 160 / 563 | yes | 160 / 160 | no / no | 72px |
| mixed two-family (homes + warehouses) | 160 / 738 | yes | 160 / 160 | no / no | 88px |
| mixed commercial | 160 / 781 | yes | 160 / 160 | no / no | 120px |
| commercial broad | 160 / 1126 | yes | 160 / 160 | no / no | 152px |
| broadest | 160 / 1499 | yes | 160 / 160 | no / no | 200px |
| broadest, six-digit range | 160 / 1591 | yes | 160 / 160 | no / no | 216px |

BEFORE is `white-space: nowrap` and clips in all nine at desktop too — the extra room does not
rescue it, because the cap is on the label, not the viewport. AFTER is `white-space: normal`.

### FINDING — desktop is SHORTER than mobile, and the reason is not the cap

Six of the nine states occupy **less** vertical space at desktop than at mobile:

| case | mobile height | desktop height |
|---|---|---|
| single warehouse | 56px | 40px |
| warehouse 10,000–20,000 | 88px | 40px |
| mixed residential | 120px | 72px |
| mixed two-family | 152px | 88px |
| mixed commercial | 168px | 120px |
| commercial broad | 216px | 152px |
| broadest | 200px | 200px |
| broadest, six-digit range | 216px | 216px |
| single apartment | 40px | 40px |

The cap is 160px at both viewports, so the cap is not what changed. The **effective** label width
is: at mobile the span is squeezed *below* its cap by the surrounding flex layout, measuring
65–160px across the states; at desktop it reaches the full 160px in **all nine**. A wider line
takes fewer lines, so the same label renders shorter.

This is a behavioural difference between viewports and is reported as a finding rather than
smoothed over. It does not weaken the ruling in either direction: nothing clips at either
viewport, and the 160px cap is unchanged at both. It does mean the **200–216px vertical-cost
finding recorded above is a mobile worst case** — at desktop the same broadest states cost
200–216px only in the two states that were already at the cap, and materially less elsewhere.

## Environment

Captures used a second Spring Boot backend on port 8095, reading the **already-running**
`pg-test-fixture` container (host port 5434) with Flyway disabled. `local-fixture-backend.sh` was
deliberately **not** invoked: its Step C restore tears down and recreates that shared container,
which other lanes are using. Only its Step G environment was reproduced, so the container was
read and never replaced, and every Discover request the browser makes is a GET.
