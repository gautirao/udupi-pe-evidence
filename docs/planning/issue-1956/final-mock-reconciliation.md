# #1956 — Final-mock three-way reconciliation

**Status: PROPOSED — awaiting user approval.** Terminal state: `USER_RECONCILED_PLAN_APPROVAL_REQUIRED`.

| | |
|---|---|
| Author | orchestrator-8 (mode3-orchestrator, `[orchestrator_pr_b_gen7]`) |
| Date | 2026-07-27 |
| Trigger | The final Claude Design prototype landed on `main` via PR #2022, commit `c13dc017`. |
| Design root | `docs/design/retrends-design-system/ui_kits/new_discover/` |
| Sibling kit | `docs/design/retrends-design-system/ui_kits/discover-scopes/` — **not** #1956's design root; audited for scope boundary only (§4) |
| Actions taken | **none.** No code, no branch, no commit, no push, no PR, no `/mode3-run`, no PLAN_REVIEW resubmission. Nothing in the salvage branch or worktree was reset, cleaned, rebased, deleted or overwritten. |

## Evidence labelling

Every claim below carries one of:

- **VERIFIED** — I ran the command or read the file myself in this session.
- **AUDIT** — stated by the design team's own `FUNCTIONAL_AUDIT.html`, which distinguishes what the mock *communicates* from what the docs *intend*. I treat it as the most reliable design source because it is self-critical.
- **DOC** — stated by `DESIGN_INTENT.md` / `VISUAL_RULES.md` / `NONREGRESSION_MATRIX.md` / `DESIGN_STATE_MANIFEST.json`.
- **BROWSER-PENDING** — requires the live browser walk, which is still running. Flagged rather than guessed.

Where AUDIT and DOC disagree, **AUDIT wins** (observable prototype behaviour beats documented intent — the precedence rule I was given).

> **Consolidated (revision 4.2).** The browser walk completed after this document's first draft and changed several conclusions. **Those changes have been written into the tables themselves** — Table D and Table F now state the resolved position directly, and §9 records the walk's evidence and the reasoning trail. There is no "read §9 instead of the tables" instruction: the tables are correct as they stand.

### Status of the live browser walk — now COMPLETE (see §9)

A `ui-designer` specialist was dispatched to walk `experience.html` in a real browser. It **could not use the Chrome automation tool** (the extension requires a permission only the user can grant, and I declined to interrupt the user to unblock a subagent). I redirected it to **Playwright**, which is already in the repo and is a real Chromium browser. At the time of writing it is still running — it had to re-root the static server because the kit loads `../../_ds_bundle.js` and `../../styles.css` from above the design root.

**What this does and does not cost.** It does **not** change any conclusion or recommendation in this document, because:

- the mock's own `FUNCTIONAL_AUDIT.html` is itself an *observational* audit of the built prototype — it explicitly audits "what `experience.html` (and the scripts it loads) **actually communicates**", and it is candid enough to record its own defects (C7-C10, H4, M1, M2). For the two conflicts that matter (F-2 copy, F-3 hidden zero-match and filter-ranked names) it is the design team stating the prototype's behaviour against their own intent, which is stronger evidence than a third-party walk would be;
- for both conflicts the **contract wins regardless** of what the walk finds. If the walk shows the mock renders `N areas with matches` after all, F-2 simply dissolves; if it confirms `+N areas with matches`, F-2 stands as written. Neither outcome changes the plan.

**What the walk would still add:** upgrading two rows from AUDIT to OBSERVED, and settling whether the string `No matches with current filters` actually renders (the correction-delta copy) or is intent only. Both are recorded as BROWSER-PENDING below. I would rather hand over an artefact that says so than one that implies an observation I did not make.

---

## 1. Repository and baseline state (VERIFIED)

| Fact | Evidence |
|---|---|
| `main` = `c13dc017` "Chore/design update v3 (#2022)" | `git log --oneline -3` |
| That commit is **33 files, 100% under `docs/design/`** — zero production, zero backend | enumerated the commit's file list; non-design count = **0** |
| Salvage branch `issue-1956-pr-b-frontend-areas-journey` — **ahead 3, behind 1** | `git status --porcelain=v1 --branch`. The "behind 1" is *only* the design commit. |
| Commits ahead: `d01bbcd1` / `1f10f52f` / `29df02a8` (checkpoints A/B/C) | recorded previously, unchanged |
| Checkpoint D still uncommitted and intact: 44 tracked modified/deleted + 12 untracked | `git status` — nothing reset or cleaned |

**Baseline staleness — resolved without re-running.** The brief said "re-run if stale". It is **not** stale, and I can prove that rather than burn a long suite: `main`'s only new commit touches zero files outside `docs/design/`, so it cannot affect `tsc`, Vitest, backend tests or the Vite build of application code. The revision-3 baseline therefore still holds: tsc 20 errors on branch vs 21 pre-existing on clean main (no net-new); targeted Vitest 1187 passed / 0 failed / 3 skipped; `vite build` succeeds. Re-running would consume significant time to reproduce a number that cannot have moved.

**My prior backend audit also remains valid** for the same reason — zero backend files changed since it was taken.

### 1.1 The finding that most changes the plan (VERIFIED)

I checked the routing seam on **`main`**, not on the branch. Previous revisions reasoned from the worktree and that was the wrong frame.

| On `main` (`c13dc017`) | Evidence |
|---|---|
| `DiscoverRightPanelContainer.tsx` is **484 lines** and contains **no** `DiscoverAreasJourneyPanel`, **no** `area-groups-landing` case, **no** area-first gate | `git grep` for all three returned exit 1 (no match); line count 484 |
| `DiscoverRightPanel.tsx` has **four live `<AreaGroupsLandingPanel>` render sites** (lines 1406, 1442, 1484, 1516) | `git grep -n` |
| `macroRegionResolver` is a **live import** on `main` at `DiscoverRightPanel.tsx:616` (`SummaryRegionRef`) | `git grep -n` |

**Therefore: `main`'s Areas journey is 100% legacy and fully intact, and the entire node-journey seam exists only on the salvage branch.**

Three consequences, all of which strengthen decisions already in the plan:

1. **PR 1 does not "narrow an existing gate" — it introduces a journey that does not exist on `main` at all.** The branch's version of that introduction is unconditional for area-first (`DiscoverRightPanelContainer.tsx:633-649` in the worktree, with `nodeKey` defaulting to `'root'`). That unconditional form is precisely what must not be merged.
2. **Correction 2 (no legacy deletion before cutover) is now mandatory, not merely prudent.** Deleting `macroRegionResolver` would break a live typed import on `main`.
3. The `AreaGroup*Panel` "restoration" work in PR 1 is, against `main`, simply *not deleting* — cheaper than revision 3 assumed, because those files were never removed from `main`.

---

## 2. Contract state — re-read of all ten issues (VERIFIED via `gh`)

**No comment on any of the ten issues is dated 2026-07-27 or later.** The newest across all ten is `2026-07-26T21:42:45Z` (#2020). All rulings in my baseline are current, and **nothing has moved into or out of #1956.**

| Issue | State | Delta vs my baseline |
|---|---|---|
| #1956 | OPEN | UNCHANGED |
| #2014 | OPEN | UNCHANGED (all three 2026-07-26 amendments as understood) |
| #2015 | OPEN | **NEW**: now *depends on #2016* and must use its exclusive `VIEWPORT` result-scope state — "Do not introduce an independent viewport-search state model." Moves work away from #2015, not into #1956. |
| #2016 | OPEN | **NEW** design-dependency on #2020. Boundary unchanged and explicit: "It does **not** replace the canonical Areas hierarchy delivered by #1956." |
| #2017 | OPEN | **NEW** #2020 design gate. Still "**Follow-up to #1956 and dependent on #2016.**" |
| #2018 | OPEN | **NEW** #2020 design gate + #2019 owns alert persistence |
| #2019 | OPEN | **NEW** #2020 design gate |
| #2020 | OPEN | **NEW and important** — see below |
| #2021 | OPEN | UNCHANGED. Its go/no-go list covers #2016-#2019 and #2015 — **#1956 is not in it** |
| #2012 | OPEN | UNCHANGED — "**not a dependency of #1956**" |

**The single most important new statement**, #2020 comment `2026-07-26T21:42:45Z`, verbatim:

> "This does not reopen or pause the already-locked #1956 implementation contract; it gates the new follow-ups #2016–#2019 and the #2015 scope amendment."

So the new design/research track explicitly **does not pause #1956**, and the `discover-scopes` kit does not gate it.

### 2.1 PRODUCT CONFLICT — the frozen mock path changed with no contract amendment

#2014 names, as binding:

> `- Frozen Discover V2 design: `docs/design/retrends-design-system/ui_kits/new_discover/index.html``
> `- Directional map-card reference: `docs/design/retrends-design-system/ui_kits/new_discover/src/NDMap.jsx``
> "The frozen mock controls visual composition."

PR #2022 / `c13dc017` **modified both of those exact files** (plus `NDPanel.jsx`, `NewDiscover.jsx`, `components/cards.jsx`, `components/shared.jsx`) and added a large `experience.html` / `Exp*.jsx` layer. **No issue records this.** The *path* declared frozen is still the path; its *contents* changed.

**Recommendation: request a product ruling** (Table F, F-1). I am not treating the new content as automatically binding, nor as automatically non-binding. #2014 says the mock controls *visual composition* only — it does not control hierarchy depth, marker content, density, navigation semantics or non-regression, all of which #2014 reserves to itself. That limits the blast radius of the ambiguity considerably, but it does not remove it.

---

## 3. Prototype behaviour — what the design's own audit says

`FUNCTIONAL_AUDIT.html` is explicit that it audits "what `ui_kits/new_discover/experience.html` (and the scripts it loads) **actually communicates**", assuming nothing about the repository, backend, API contracts, production URLs or any PR plan. That makes it the best available source, and it is candid about defects.

### 3.1 Hierarchy shape — CONFIRMS the contract (AUDIT)

> "Areas-first hierarchy (both shallow shapes) City · Direction · optional Local · Area · Listings, breadcrumb, hierarchy Back, visual clusters" — status *Partial*

And the two shapes are enumerated separately (`areas-region-clusters` for a dense Direction that splits into Local Destinations, `areas-region-areas` for a shallow Direction going straight to areas). **The mock implements exactly the two valid shapes and no third public CLUSTER level.** This is the strongest corroboration in the whole reconciliation: the final design and the contract agree on the core shape.

### 3.2 Marker and card copy — the real strings (AUDIT §7, lines 282-286)

| Surface | Names | Count copy in the mock | Audit's own note |
|---|---|---|---|
| Areas Direction / Local **marker** | 2 representative area names | **"+N areas with matches"** | "Names are ranked by listing count under the current filters, so they change as filters change; **the '+N' form is shared with visual clusters**" |
| Areas Direction / Local **panel row** | Label | **"Names · +N areas with matches"** | "Same instability" |
| Schools Direction / Local marker | names by school count | **"+N areas with schools"** | "Stable — school counts are not filter-dependent" |
| Areas **visual AREA cluster** | visible names | **"+N / N areas with matches"** | "Clear" |
| Schools visual AREA cluster | visible names | **"+N areas with schools"** | "Four data lines in a 190px chip — legible but at the limit" |

`VISUAL_RULES.md:232` and `:255` render this in shorthand as a "`+N areas` pill" on both the marker and the card row; `FUNCTIONAL_AUDIT` gives the full string. `NONREGRESSION_MATRIX.md:109` also shows a `"N areas with matches"` note form on area rows.

**Conflict with the user's locked correction 2 — and the mock's own audit agrees with the user.** Correction 2 forbids a `+N` form at structural levels precisely because it implies the displayed names are matching members. The design audit independently flags the identical problem: *"the '+N' form is shared with visual clusters."* So the user's lock is the fix for a defect the design team already recorded. See Table F, F-2.

### 3.3 Two mock defects that directly contradict locked contract items (AUDIT)

**(a) Zero-match structural destinations are HIDDEN in the mock.** Multiple independent statements:

> H4 (line 131): "Areas Direction with zero matching areas — Directions with `n === 0` are **removed from the children list** — Card absent — Row absent — **Contradictory** — The stated intent is that a zero-match destination stays visible; the mock hides it"
> C9 (line 421): "Zero-match destinations are hidden although the model says they stay visible — Children are filtered to those with a non-zero count **at every level, in both Areas and Schools**"
> M2 (line 391): "Shoppers cannot tell 'nothing here' from 'does not exist'; counts appear to shrink the map"
> Open product decision (line 435): "Should a zero-match destination remain visible with a zero count?"

The user's correction 3 **locks them visible** with an explicit stable zero-match state. **Contract wins.** Note that `"No matches with current filters"` is the *intended* correction copy, not a string I can confirm renders — BROWSER-PENDING.

**(b) Structural representative names are filter-dependent in the mock.**

> C10 (line 422): "Representative names on structural cards are filter-dependent — Names are the top areas by current filtered listing count, so **a canonical destination re-labels itself as filters change** — while the Schools journey's equivalents stay stable"
> line 172: "Filters also **silently re-rank the representative names** on destination cards"

Correction 3 and #2014 both require structural identity, position and naming to be filter-invariant. **Contract wins.**

Both are cases where the *design docs' stated intent matches the contract* but the *built prototype does not*. Under the precedence rule (observable behaviour beats docs) the prototype would win — except these are not presentation details, they are the hierarchy-stability semantics #2014 explicitly reserves to itself. So the contract governs, and I record the conflicts rather than resolving them silently.

### 3.4 URL and history — prototype non-goals, with a trap (AUDIT)

> line 99: "URL / refresh restoration — In-session Back over committed snapshots — **No product URL at all**; the only query parameter is the reviewer's scenario switch — **Missing**"
> line 149: "The mock has no product URL. The one query parameter it reads (`?journey=`) selects a reviewer scenario at mount and is **never written back**. Browser history is a stack of **in-memory snapshots** … destroyed on refresh"
> C7 (line 419): "Browser Back from the first committed state discards the entry state … Back falls into a **hardcoded reset to the Areas city root** … **in-mock defect that will mislead any URL/history** [implementation]"
> line 338: "Refresh and Back intent for a search landing are **Engineering unknown**"

This is exactly the trap the brief warned about. The absence of URLs is a **prototype non-goal**, not permission for #1956 to skip URL state — and C7 is explicitly labelled as something that would mislead an implementer. #1956's `node=` URL contract, canonical-parent Back and browser-history rules stand entirely unchanged and take **no** guidance from the mock here.

### 3.5 The customer "Preview" action — the premise needs refining (AUDIT)

The brief stated Preview "has been REMOVED from the final mock". That is **only partly true**:

> C8 (line 420): "Comparison metaphor and Preview **survive after being removed** — Capability strip: 'Compare up to 3 areas'; a dead 'Compared areas · N' string in the view builder; **'Preview / Previewing' buttons and a 'Previewing X — not added to any search' note in zero-result recovery**"
> line 254: "No Preview action — Removed from the draft — **but zero-result recovery still offers 'Preview / Previewing'** on nearby areas — Contradictory"

So: removed from the Add-nearby-areas **draft** flow, but still present in **zero-result recovery**. Both of those surfaces are other issues' territory (#2017 and #2018). Either way this has **no bearing** on the engineering preview gate — see Q1 in §6, which I answer from repository evidence, not from design copy.

### 3.6 Filter set expansion (DOC/AUDIT)

`NONREGRESSION_MATRIX.md:41` and AUDIT line 172 show the Areas property filters as **"Beds / budget / type / ready / verified"**, an expansion from today's type/beds/verified. #1956's contract says *preserve* Buy/Rent and applicable property filters — preservation, not expansion. New filter chips are therefore **not** #1956 work. See Table F, F-6.

### 3.7 Mobile listing preview sheet — resolved in the mock (AUDIT)

> C6 (line 502): "A listing tap in mobile Map mode produced nothing → **A marker selection opens a listing preview sheet** (image, price, type, bedrooms, area, **View details**, **Close**); View details opens the full detail, and **Back or Close returns to the same map state**. Mobile Map mode, all listing-capable scopes. **Resolved**"

Answers Q7 (§6).

### 3.8 Open backend questions the mock raises (AUDIT lines 469, 472)

> "Are destination counts filter-aware server-side, and are the representative names on a destination stable or ranked by the current filter?"
> "Are zero-match destinations returned and suppressed by the client, or never returned?"

These map exactly onto PR 1's backend gaps and correction 5. Independent corroboration that the count boundary is the right thing to settle in Phase 0.

---

## 4. `discover-scopes` sibling kit — scope boundary only (VERIFIED via its README)

**It is not #1956's design root.** `README.md:1-7`: *"Design mocks for **#2020**, built as an extension of the approved Discover kit in `ui_kits/discover/`."* `index.html` lists its coverage as #2016, #2015, #2017, #2018, #2019 and #2014.

| State group | Demonstrates | Owner |
|---|---|---|
| A1-A10 | single-area scope; polygon replaces areas; viewport from panning; loading/error | #2016, #2015 |
| B1-B8 | draft chip editor; 3-area max; nearby suggestions | #2017 |
| C1-C5 | three-area committed result; focus one; non-contiguous; Fit all | #2017 |
| D1-D5 | school counts on suggestions; summary; grouped list; boundary copy | #2017 |
| E1-E11 | zero results; nearby alternatives; filter relaxation; mobile | #2018 |
| F1-F10 | alert creation, persistence, management, deep-link restore | #2019 |
| G1-G3 | hierarchy destination moves breadcrumb; visual cluster moves camera only; panel subset | #2014 / #1956-adjacent |

**Boundary risks to record, none of which change #1956's scope:**

1. **The result-scope chip row is #2016's, and must not be retrofitted into #1956.** If it were, the breadcrumb and the chip row would both claim to say "what you are searching", which is the exact ambiguity #1956 avoids by making the selected AREA implicit in the hierarchy.
2. **Visual-cluster visual grammar.** This kit draws visual clusters as a *hollow dashed chip with a magnifier glyph*, action "Tap to zoom" — deliberately not a destination silhouette. That is *compatible* with #1956's presentation-only requirement and is arguably a better answer to "clusters must be visually distinct from listing clusters" than anything in `new_discover`. Worth adopting, but it is a design ruling (F-4), not something I should assume.
3. **Area-marker copy differs by context** — "Tap to add" in draft mode (#2017) vs "Tap to view homes" for single-area selection (#1956). If both ever coexist, copy precedence must be explicit. Not a #1956 change today.
4. **G1-G3 corroborate #1956's core contract**: "A visual cluster zooms or reveals its member areas and changes **neither the breadcrumb nor the result scope**."

---

## 5. The six reconciliation tables

### Table A — State reconciliation

Scope classes: `1956_REQUIRED` · `1956_SEAM_ONLY` · `SEPARATE_ISSUE` · `DESIGN_NON_GOAL` · `PRODUCT_CONFLICT` · `ENGINEERING_UNKNOWN`.

| Design state | Observable behaviour | Contract owner | Current repo (`main`) | Verdict | #1956 impact | Evidence |
|---|---|---|---|---|---|---|
| `areas-city-default` | 5 directional destinations, compass-positioned, panel rows alongside; no whole-city marker first | #1956 / #2014 s2 | legacy `AreaGroupsLandingPanel` (group cards) | **NEW** | PR 2 builds it | AUDIT §2, DOC manifest |
| `areas-region-clusters` | Dense Direction splits into Local Destinations labelled by representative names | #1956 | absent | **NEW** | PR 2 | AUDIT §2 |
| `areas-region-areas` | Shallow Direction goes straight to AREA children | #1956 | absent | **NEW** | PR 2 | AUDIT §2 |
| Visual AREA cluster + `Tap to zoom` | camera/reveal only; breadcrumb and scope unchanged | #1956 | absent | **NEW** | PR 3 | AUDIT §7, scopes-kit G2 |
| Single AREA marker | name + count + chevron; no nearby line | #1956 | partial (area pills exist) | **REWORK** | PR 3 | AUDIT §7 |
| `areas-area-listings` | compact header, property search, filters, school shortcut, listing grid | #1956 (preserve) | exists | **KEEP** | PR 4 preserves | DOC manifest |
| `areas-listings-query-active` | within-area search applied; "N of M" + Reset | #1956 (preserve) | exists | **KEEP** | PR 4 | DOC manifest |
| `areas-listings-filters-active` | type/beds/verified chips; "No homes match" empty | #1956 (preserve) | exists | **KEEP** | PR 4 | DOC manifest |
| Expanded filter set (budget, ready) | extra filter chips | — | absent | **SEPARATE_ISSUE** | none — preservation only | §3.6 |
| `areas-browse-all` (`#b=1`) | flat filterable list, CITY scope | #1956 (preserve, "Browse All where already part of the frozen journey") | exists | **KEEP** | PR 4 | DOC manifest |
| Zero-match Direction / Local | **hidden in the mock**; contract requires visible + stable zero state | #2014 / #1956 | n/a | **PRODUCT_CONFLICT** (F-3) | PR 2 must implement *visible*, against the mock | AUDIT H4/C9/M2 |
| Filter-dependent structural names | mock re-ranks names by filtered count | #2014 / #1956 | n/a | **PRODUCT_CONFLICT** (F-3) | PR 1/2 implement *stable*, against the mock | AUDIT C10 |
| `schools-city-default`, `schools-region-areas` | same compass layout filtered to regions with schools | #1956 seam + non-regression | legacy school-first exists | **1956_SEAM_ONLY** | optional `schoolCount` + visibility predicate only | AUDIT §8 |
| `schools-area-schools` | school search, board/level filters, area homes beneath | full-Schools (separate) + #1956 non-regression | exists | **KEEP** (non-regression) | PR 4 preserves shortcut | SCHOOLS_NONREGRESSION |
| `schools-homes-near` (radius 3/5/10 km) | school-centred radius query, dashed plum ring, distance-sorted homes | **SEPARATE_ISSUE** — full Schools journey; #1956 s17 "No full Schools journey redesign" | exists | **KEEP** (non-regression) | none beyond not breaking it | AUDIT §8, #1956 s17 |
| Add nearby areas (draft → commit, max 3) | draft chips, "Show N listings" commit, combined results | **#2017** | absent | **SEPARATE_ISSUE** | none | #2017 body |
| Polygon replacement | draw → confirm → polygon results | **#2016** | absent | **SEPARATE_ISSUE** | none | #2016 body |
| Search this area / viewport scope | pan → CTA → confirm → committed bounds | **#2015** (via #2016) | absent | **SEPARATE_ISSUE** | none | #2015 amendment |
| Zero-result recovery (nearby, filter relaxation, alert) | ochre recovery panel with real counts | **#2018** (+ #2019 alerts) | absent | **SEPARATE_ISSUE** | none | #2018 body |
| Create alert / manage alerts | alert CRUD, deep-link restore | **#2019** | absent | **SEPARATE_ISSUE** | none | #2019 body |
| `agri-*` (4 states) | full Agricultural journey | **out of scope** (#1956 s17, #2014 s18) | exists | **KEEP** (non-regression) | none | contracts |
| `shell-city-switcher-open` | city switcher overlay | shared shell (preserve) | exists | **KEEP** | PR 1 must not disturb | DOC manifest |
| `shell-area-autocomplete-open` | mode-aware autocomplete, ≤6 results | #1956 (direct-search convergence) | exists | **REWORK** | PR 2 convergence onto `node=` | DOC manifest |
| `areas-city-default-mobile`, `areas-area-listings-mobile` | stacked sheet ≤820px; single-column grid <560px | #1956 | legacy mobile shell exists | **REWORK** | PR 5 | DOC manifest |
| Mobile listing preview sheet | marker tap → sheet → View details → Back/Close returns to same map state | #1956 | absent | **NEW** | split PR 4 / PR 5 (Q7) | AUDIT C6 |
| Tablet 391-1365px | **not represented at all** | — | n/a | **DESIGN_NON_GOAL** / ENGINEERING_UNKNOWN | note in plan; do not invent | AUDIT §11 |
| Loading / skeleton, hard-error, map-tile-failure | **not designed**; docs say request a product decision | — | partial today | **ENGINEERING_UNKNOWN** | #1956 must preserve today's states; no redesign | DOC §12 |
| Any refresh-restorable / shareable state | **no product URL in the mock at all** | #1956 owns `node=` | n/a | **DESIGN_NON_GOAL** (prototype) | #1956's URL contract stands unchanged | AUDIT M1, §3.4 |

### Table B — Transition reconciliation

| Transition | Mock behaviour | Contract requirement | Verdict | Owner |
|---|---|---|---|---|
| City → Direction | refit + card swap; pushes history | committed hierarchy state, one CameraIntent fit | **aligned** | PR 2 |
| Direction → Local Destination | same | committed state | **aligned** | PR 2 |
| Tap visual AREA cluster | camera zoom only; breadcrumb and scope unchanged; no history | identical | **aligned — strong corroboration** | PR 3 |
| Show all areas | refit; no history | identical | **aligned** | PR 3 |
| Select AREA | "navigation and result scope set by one press" | canonical AREA `node=`, then listing markers | **aligned** | PR 2 → PR 4 |
| Direct-search AREA | resolves to the same canonical state as the guided path | identical (convergence) | **aligned** | PR 2 |
| Breadcrumb ancestor jump | restores that ancestor | identical, one direct fit | **aligned** | PR 2 |
| Hierarchy Back | present in mock; one parent | backend-ancestry canonical parent, never `history.back()` | **mock cannot prove it** (in-memory history) | PR 2, from contract only |
| Browser Back from first committed state | **mock defect** — hardcoded reset to city root | must restore committed states, no loops | **DESIGN_NON_GOAL / trap** | PR 2, from contract only |
| Filter change | recomputes counts **and re-ranks structural names**, and **hides** zero-match destinations | counts may change; identity/position/names must not; zero-match stays visible | **PRODUCT_CONFLICT** (F-3) | PR 1/2 |
| Journey switch (Areas ↔ Schools ↔ Agri) | returns to where you left it; Buy/Rent preserved | preserve filters and journey state | **aligned** (non-regression) | PR 4 |
| Radius change (Schools) | replaces state, no history entry | — | **SEPARATE_ISSUE** | full-Schools |
| Draft → commit "Show N listings" | pushes history, fits to set | — | **SEPARATE_ISSUE** | #2017 |
| Polygon / viewport scope replacement | confirmation naming what is lost | — | **SEPARATE_ISSUE** | #2016 / #2015 |
| Mobile Map ↔ List | preserves canonical state | must not change `node=` or history | **aligned** | PR 5 |

### Table C — Component reconciliation

**Do not copy the prototype component tree into production.** It is a fixture-backed demo; the production app already has a shell, a panel container and a map layer with real ownership seams (PR #2011). The prototype's value is *specification*, not code.

| Prototype component | Nature | Production disposition | Prototyping shortcut to reject |
|---|---|---|---|
| `directional-marker` | presentation | specify → new map destination card in PR 2 | compass layout is an "orientation canvas, not exact pins" — real bearings, but do not fake coordinates |
| `directional-card` (panel row) | presentation | specify → `NavigationChildCard` rework, PR 2 | copy conflict F-2 |
| visual cluster chip | presentation | specify → PR 3 clustering module | **synthetic geometry**: prototype clusters are precomputed in fixtures, not derived from real bounds at a real zoom |
| `area-marker` | presentation | already exists; rework labels only | — |
| `breadcrumb` (pill, chevrons, CSS ellipsis overflow) | presentation | PR 2. **Note:** CSS `text-overflow` ellipsis is *not* the retired trail-collapse apparatus — it corroborates overrule O-2's replacement (per-crumb truncation) | — |
| `filter-toolbar` | presentation | preserve today's set; do not expand (F-6) | — |
| `listing-card` | presentation | already exists | — |
| `school-marker`, `school-result`, `radius-selector` | presentation + behaviour | preserve; radius journey is separate | — |
| `agricultural-sector`, `town-row`, `parcel-card` | presentation | out of scope; preserve | — |
| map ↔ panel hover/focus/selection sync (`.nd-nav-on` class toggle, never rebuild the marker) | **behaviour** | **adopt the technique** — PR 2/PR 3; it is also a perf protection | — |
| draft multi-area selection | behaviour | **#2017** | — |
| scope chip row | behaviour | **#2016** — do not retrofit | — |
| in-mock history (`pushState` + index into a JS array) | behaviour | **reject entirely** | in-memory, destroyed on refresh, and C7-defective |
| fixture counts | data | **reject** | real counts come from the PR 1 count boundary |
| `?journey=` scenario switch | data | **reject** | a reviewer switch, never written back — not a URL contract |

### Table D — Count and data reconciliation

| Item | Mock | Contract (locked) | Verdict |
|---|---|---|---|
| Structural destination count copy | **OBSERVED: only the plain form** — "13 areas with matches", "7 areas with matches"; never a `+N` | **`N areas with matches`**, or **`No matches with current filters`** at zero; **never a `+N`** | **ALIGNED — F-2 closed.** The mock already matches the contract at this level |
| Visual cluster count copy | **OBSERVED: both forms, conditionally** — "+3 areas with matches" when the named areas are a subset; "2 areas with matches" when they are the complete set | `hiddenCount = visibleMemberCount − displayedRepresentativeCount`; `>0` → **`+N areas with matches`**; `==0` → **`N areas with matches`**; **never `+0`** | **ALIGNED, and the mock's conditional rule is adopted** — it is better than a flat `+N` |
| Schools variants | "+N areas with schools" | optional `schoolCount` metadata only | **aligned in principle**; phrasing follows the structural/cluster split (F-2) |
| Count aggregation basis | "counts only over areas *with matches*" | journey-aware visibility: `eligibleListingCount > 0` (Areas) / `eligibleSchoolCount > 0` (Schools) | **aligned — strong corroboration** |
| Representative-name stability | audit reports re-ranking; the walk could not exercise it (no structural filter toolbar) | **stable canonical, filter-invariant** | **contract requirement, not a proven conflict** — F-3 downgraded |
| Zero-match structural destination | not reachable in the mock (filters exist only at the area/listings level) | **visible in canonical position, stable parentage and names, rendering `No matches with current filters`** | **contract requirement, not a proven conflict** — F-3 downgraded |
| Zero-content AREA at final level | filtered out of the funnel | excluded from browse clusters, but still resolvable by canonical URL/search with a normal empty state | **aligned** |
| Listing dedup | fixture totals | dedup by canonical listing identity; **one authoritative combined result** owns marker + panel + total; never sum per-area totals | contract governs; `pl.area_key` is single-valued so listing sums are safe, **schools are the real dedup risk** |
| School count semantics | design left "located inside" vs "serving" unspecified at direction/cluster level | **RULED: distinct schools physically located INSIDE the represented canonical AREA or member AREAs, deduped by stable school identity; cluster totals aggregate DISTINCT schools across member AREAs. "Serving" is not adopted; no radius/catchment/travel-time/admission/quality semantics.** Display ordering: Areas-first → listing count primary, `schoolCount` optional secondary; Schools-first → preserve #1954 and the current #2014 marker contract. | **RESOLVED — F-5 closed** by product-owner ruling ([#1956 comment 5094909370](https://github.com/gautirao/udupi-property-explorer/issues/1956#issuecomment-5094909370)). The mock's school-count-primary ordering is explicitly **not adopted** by #1956. |
| Server vs client ownership | mock is silent; audit *asks* the question | backend owns batched per-area counts + authoritative deduped totals, no N+1; frontend owns predicate, names, `+N`, clustering | **aligned**; audit lines 469/472 independently corroborate |

### Table E — URL and restoration reconciliation

| Item | Mock | Contract | Verdict |
|---|---|---|---|
| Product URL | **none at all** | `node=` is the sole Areas hierarchy identity | **prototype non-goal — takes no guidance from the mock** |
| Query parameters | only `?journey=`, a reviewer scenario switch never written back | `node=`, plus a compat domain that is not hierarchy identity | mock irrelevant |
| Browser history | in-memory snapshot stack, destroyed on refresh | committed hierarchy states; no entries from pan/zoom, cluster focus, camera fits, Map/List | mock irrelevant, and **C7 is an active trap** |
| Back from first entry | hardcoded reset to city root (**mock defect**) | canonical parent from backend ancestry, works on cold deep links | contract only |
| Refresh restoration | destroyed | full ancestry re-resolved from `node=` | contract only |
| Deep link to unavailable data | not designed; docs suggest nearest-valid-ancestor | stale-node ladder: nearest-valid-ancestor → city root + non-blocking notice | contract already stronger than the mock |
| Scroll-offset restoration | stated as restored per result state | "`Back to results` restores … panel/list position where reliable" | **aligned**; "where reliable" keeps it non-blocking |

**Conclusion:** the prototype contributes **nothing** to #1956's URL/restoration contract, and one of its behaviours (C7) would actively mislead an implementer. Every URL, Back and history requirement stays sourced from #2014's amendment and #1956 s3/s9/s10.

### Table F — Prototype-vs-contract conflicts, with a recommendation each

| # | Conflict | Recommendation |
|---|---|---|
| **F-1** | ~~#2014 declares `new_discover/index.html` + `src/NDMap.jsx` the frozen design reference; PR #2022 (`c13dc017`) changed both, and no issue records it.~~ | **RESOLVED — product-owner ruling, [#1956 comment 5094908480](https://github.com/gautirao/udupi-property-explorer/issues/1956#issuecomment-5094908480).** Locked authority order: **the PR #2022 / `c13dc017` `new_discover` prototype controls visual composition and in-scope interaction presentation**; **#2014 and #1956 control hierarchy depth, canonical identity, `node=` URL behaviour, breadcrumb and Back semantics, browser history, issue scope and non-regression.** Also locked: `experience.html` is authoritative **only for states already owned by #1956** and does **not** pull AREA_SET, polygon, viewport search, alerts or other follow-up functionality into #1956; `discover-scopes/` remains the design reference for **#2015-#2019**, not an #1956 implementation contract; and any older "frozen file" wording in #2014/#1956 refers to the **latest approved contents** of those paths **after** PR #2022, not the pre-#2022 contents. |
| **F-2** | ~~Mock uses a `+N` form on structural destinations~~ — **RESOLVED, NOT A CONFLICT.** The live browser walk observed structural Direction/Local-Destination cards using **only** the plain form (verbatim "13 areas with matches", "7 areas with matches") and **never** a `+N`. The earlier conflict rested on `FUNCTIONAL_AUDIT` lines 282-283, which the running app contradicts; under the precedence rule, observation wins. | **No ruling needed. Closed.** The mock already matches the contract at structural level. The locked rule is: structural = `N areas with matches` (or `No matches with current filters` at zero, never a `+N`); visual cluster = `+N areas with matches` when `hiddenCount > 0`, `N areas with matches` when `hiddenCount == 0`, never `+0`. |
| **F-3** | ~~Mock hides zero-match structural destinations and re-ranks their names~~ — **DOWNGRADED, NOT A PROVEN CONFLICT.** The walk established that filters exist **only at the area/listings level**; Direction and Local Destination have no filter toolbar at all, so a filter-driven structural zero-match may be unreachable in this design. The mock simply does not exercise the state. | **No ruling needed on the conflict. It is a contract requirement, not a contradiction.** #1956 implements: a zero-match structural destination stays visible in canonical position with stable parentage and stable names, rendering the locked literal **`No matches with current filters`**. *(An earlier revision withdrew that literal after mistaking #2018's multi-area recovery copy — "No matching listings in your 3 selected areas" — for a structural zero-match. The literal is restored.)* |
| **F-4** | `discover-scopes` draws visual clusters as a hollow dashed magnifier chip, deliberately distinct from destination silhouettes — arguably a better answer to "area clusters must be visually distinguishable" than `new_discover`'s treatment. | **Record a follow-up seam / design ruling.** Not a #1956 blocker. Ask whether #1956's PR 3 should adopt the dashed-chip grammar. Either way PR 3's AC "area clusters are visually distinguishable from listing clusters" is satisfiable. |
| **F-5** | ~~School-count semantics ("located inside" vs "serving") are unspecified at direction/cluster level.~~ | **RESOLVED — product-owner ruling, [#1956 comment 5094909370](https://github.com/gautirao/udupi-property-explorer/issues/1956#issuecomment-5094909370).** `schoolCount` = **distinct schools physically located inside** the represented canonical AREA or represented member AREAs; deduped by **stable school identity**; Direction / Local-Destination / visual-cluster totals aggregate **distinct** schools across member AREAs. **"Serving" ≠ "located inside".** No catchment, radius, admission, travel-time or quality semantics. The school-radius result journey stays separate. **Display ordering (the newly clarified piece):** Areas-first → **listing count primary, `schoolCount` optional secondary metadata**; Schools-first → **preserve the already-delivered #1954 behaviour and the current #2014 marker contract — #1956 does not redesign field ordering there.** The mock's school-count-**primary** marker ordering is **explicitly not adopted by #1956**. |
| **F-6** | Mock's Areas filter set expands to beds/budget/type/ready/verified; today's is type/beds/verified. | **Record as a separate issue.** #1956 *preserves* filters; it does not expand them. No action in #1956 beyond not breaking what exists. |
| **F-7** | Mock's Add-nearby-areas, polygon, viewport search, zero-result recovery, alerts and the full school-radius journey are all present and polished — and all belong to #2017 / #2016 / #2015 / #2018 / #2019 / full-Schools. | **No action — prototype-only for #1956.** Explicitly do **not** pull any of it in. The `NONREGRESSION_MATRIX`'s "new work preserved" list is a *design-level* statement, not an issue assignment. |
| **F-8** | Mock has no URLs, in-memory history, and a Back defect (C7). | **No action — prototype non-goal.** Record that #1956's URL/Back/history contract is unaffected and that C7 must not be replicated. |
| **F-9** | Tablet widths 391-1365px are entirely unrepresented. | **Record a follow-up seam.** #1956 locks 1366×768 and 390×844 as its evidence viewports; note the gap so nobody claims tablet coverage. |
| **F-10** | Loading, hard-error and map-tile-failure states are "NOT DESIGNED — request a product decision". | **No action for #1956 beyond preservation.** Today's loading/empty/retry/error states are on the must-not-break list; #1956 preserves them and does not redesign. |

---

## 6. The fourteen required answers

**Q1 — Does PR 1 still need the hidden engineering preview gate? → YES, and the evidence is stronger than before.**
Two unrelated meanings of "preview" were correctly separated. The customer-facing Preview action is a design-copy matter (and per §3.5 only partly removed — it survives in zero-result recovery, which is #2018's). The **engineering** gate is justified purely by repository state: on `main`, `DiscoverRightPanelContainer.tsx` has **no** node-journey seam at all (VERIFIED, §1.1), so PR 1 introduces a journey that does not exist rather than modifying one that does; and the salvage branch's introduction is **unconditional for area-first** with `nodeKey` defaulting to `'root'`, which would put every area-first shopper on a partial journey the moment it merged. The dual gate (deployment capability **AND** `areasPreview=1`) is therefore still required, unchanged.

**Q2 — Which count/API changes are genuinely needed? → Narrower than a new stack; four real gaps.**
Backend unchanged since my audit (VERIFIED: `c13dc017` touched zero backend files). An anonymous-public counts endpoint already exists (`NavigationController.java:546-576`), and `AreaCountRollupService.java:75-95` already returns a whole-city per-area map in **one cached query**, so **the request-line/8 KB problem does not apply to counts at all** — it belongs to the listings/marker `?areaKeys=` feed (PR 4). Genuine gaps: (a) expose the per-area map in `NavigationCountsResponse`; (b) per-area eligible **school** counts (absent entirely); (c) plumb school filters through `AreaCountQuery` and the provider; (d) input validation and bounds (`propertyType` accepted as-is; no key-count bound, city/key validation or rate limiting). Plus index/query-plan evidence, still UNKNOWN. The design audit independently asks the same two questions (lines 469/472), which corroborates the shape.

**Q3 — Does the mock change the structural Direction/LocalDest card contract? → Yes on copy, and it conflicts.**
The shape is confirmed (both shallow paths, no third cluster level). But the mock puts a **`+N` form** on structural destinations and makes their representative names **filter-dependent**, and it **hides** zero-match destinations. All three conflict with the locked contract (F-2, F-3). The contract wins; the mock's own audit flags two of the three as defects, so this is a divergence *from a known-defective prototype behaviour*, not from a considered design decision.

**Q4 — Does it change the visual AREA-cluster metadata contract? → Essentially no; it corroborates it.**
"+N / N areas with matches" + counts + `Tap to zoom`, camera-only, breadcrumb and scope unchanged, explicit member identity. That matches #1956/#2014 and the user's correction 6. The one open item is visual grammar (F-4). Counts "over areas with matches" independently corroborates journey-aware visibility.

**Q5 — Should optional school counts appear in shared markers, and at which levels? → Yes, as secondary metadata, at Direction / Local Destination / visual cluster / single AREA — but ownership of *primacy* is a ruling.**
#1956 s12 permits exposing optional `schoolCount` in shared area-marker presentation. The mock goes further: in **Schools journey** the area marker shows **"N schools" as primary and "N listings" as secondary**, with the caption "View schools". That primacy inversion is a Schools-mode presentation decision; #1956 should implement the *optional secondary* form it is licensed for and treat Schools-mode primacy as part of the Schools journey. Semantics ("located inside" vs "serving") are unspecified at cluster level → F-5.

**Q6 — Which Schools behaviour is shortcut/non-regression only? → Everything except the shortcut and the count metadata.**
#1956 owns: the **Schools shortcut from a selected AREA**, optional `schoolCount` metadata, and the Schools *visibility predicate* (`eligibleSchoolCount > 0`) for journey-aware clusters. Everything else — school search, board/level filters, school markers, selected-school state, the 3/5/10 km radius journey, distance-sorted homes, "homes near school" — is **non-regression only** (preserve, do not redesign), per #1956 s17 "No full Schools journey redesign". VERIFIED: no issue has reassigned the full Schools journey to #1956.

**Q7 — Does the listing preview sheet move responsibility between PR 4 and PR 5? → Split it, cleanly.**
The mock resolves it as a **mobile Map-mode** behaviour (AUDIT C6): marker tap → preview sheet (image, price, type, bedrooms, area, `View details`, `Close`) → `View details` opens full detail → `Back`/`Close` returns **to the same map state**. Recommendation: the **data and restoration contract** (what the sheet shows, and that Back/Close restores the same map state rather than navigating the hierarchy) belongs to **PR 4**, alongside listing peek and `Back to results`; the **mobile Map-mode presentation** (the sheet itself, at 390×844) belongs to **PR 5**. This keeps PR 4's Gate F security review over the listing-exposure surface and PR 5's `ui-designer` reachability review over the mobile shell — no responsibility is duplicated.

**Q8 — Does Buy/Rent need new work or just preservation? → Preservation only.**
The mock preserves Buy/Rent across journey switches and hides it in Agri. #1956's contract lists Buy/Rent under must-not-break. The mock's *expanded* filter set (budget, ready) is **not** #1956's (F-6). One nuance worth keeping: the design notes Buy and Rent are two separate inventories with price swaps and renamed results — that is existing behaviour to preserve, not new work.

**Q9 — Which zero-match states must #1956 implement, at which level?**
- **Structural (Direction / Local Destination):** destination stays **visible, in position, with stable parentage**, and renders an explicit stable zero-match state. **Against the mock**, which hides it (F-3). PR 2.
- **Final AREA browse presentation:** zero-content areas **are excluded** from journey clusters and `+N` arithmetic. Aligned with the mock. PR 1 (predicate) + PR 3 (presentation).
- **Zero-content AREA reached directly:** still resolvable by canonical URL or explicit search, rendering a normal empty state. PR 1/PR 4.
- **Zero listings after filtering inside an AREA:** existing "No homes match" empty state preserved. PR 4.
- Zero-**result recovery** (nearby alternatives, filter relaxation, alerts) is **#2018**, not #1956.

**Q10 — Which design states are future result-scope functionality that must not affect the canonical hierarchy?**
Add-nearby-areas / draft chips / committed AREA_SET (#2017); polygon draw and replacement (#2016); "Search this area" / viewport scope (#2015, now *via* #2016); zero-result recovery (#2018); saved-search alerts (#2019); and the entire `discover-scopes` kit's scope-chip row. **None may touch `node=`, the breadcrumb, canonical ancestry or hierarchy history.** #2016 states this itself: "It does **not** replace the canonical Areas hierarchy delivered by #1956." The concrete guard: do not retrofit the scope chip row into #1956, or the breadcrumb and the chip row would both claim to define the search scope.

**Q11 — Are legacy URL producers fully accounted for pre-cutover? → Yes, and one item is now firmer.**
The three verified `?areaKey=` producers stand: `AreaCtaBlock.tsx:19`, `AreaGuide.tsx:96`, `AreaGuideHero.tsx:87` — each would render a blank panel post-cutover if unmigrated. Ownership per parameter is unchanged: only `node` is Areas-exclusive; `region` (agricultural), `scope` (residential/`resolveScope`), `groupId` (school-first level 2) and `areaKey` (school-first hybrid + the three producers) all have live non-Areas consumers that must survive. **Newly firmer:** `macroRegionResolver` is a **live import on `main`** at `DiscoverRightPanel.tsx:616` (VERIFIED), so correction 2's no-early-deletion rule is now a hard requirement rather than a precaution. Phase 0 still owns formalising the full per-site ledger; PR 6 may not delete until it is discharged.

**Q12 — Does PR 6 remain a single reversible squash boundary? → Yes, unchanged.**
Nothing in the mock or the issues affects it. The rollback remains "revert the PR 6 squash-merge SHA", with the pre-approval revert rehearsal on a temporary branch (AC6.14) proving that the revert restores legacy default routing, legacy panels/helpers, the preview gate and the required legacy tests. §1.1 slightly *improves* the position: because the legacy panels were never deleted from `main`, PR 6's deletion is the first and only removal, making the revert cleaner.

**Q13 — What test and evidence changes are required?**
Additions driven by this reconciliation: (a) a test that **no `+N` form renders at structural levels** and that "N areas with matches" / "No matches with current filters" does (F-2); (b) a test that a **zero-match Direction stays visible, in position, with stable parentage** (F-3, explicitly against the mock); (c) a test that **structural representative names do not change when filters change** while counts do (F-3); (d) area-cluster vs listing-cluster visual distinguishability evidence (F-4); (e) mobile listing-preview-sheet restoration evidence split PR 4 / PR 5 (Q7); (f) a Testcontainers case for **school** dedup (`DISTINCT` school id) since schools, not listings, are the real double-count risk; (g) an explicit note in PR 2's evidence that the mock's in-memory history and C7 Back defect are **not** the target behaviour, so a reviewer cannot mistake mock parity for correctness. Unchanged: the mandatory 390×844 smoke in PRs 2/3/4, real-browser geometry evidence for every visual claim, and command + exit code on every PASS.

**Q14 — Has any salvage-branch work drifted into #2015/#2016-#2021? → No. Zero `MOVE_TO_FOLLOW_UP` items.**
I re-checked the salvage inventory against the follow-up issues' scopes. Checkpoints A-D contain navigation core, URL/state domains, breadcrumb/overlay, camera orchestration, marker resolution, panels and tests — all within #1956's hierarchy/navigation remit. There is **no** multi-area chip work, no polygon, no viewport search, no zero-result recovery, no alerts, no scope-chip row and no result-scope framework. The one adjacent item, `FlatAreaFallbackPanel`, is a no-hierarchy-city fallback, not a result-scope feature. So the 4th classification the brief asked me to add is **empty** — which is itself a useful finding: the branch never drifted, and the prototype's out-of-scope richness is the only source of drift *risk*, not the branch.

---

## 7. Scope classification summary

| Class | Count | Contents |
|---|---|---|
| `1956_REQUIRED` | 13 | city root Directions; Local Destinations; both shallow shapes; visual AREA clustering; single-AREA marker; area listings + within-area search + filters; Browse All; breadcrumb; hierarchy Back; browser history; direct-search convergence; mobile list-first; zero-content AREA empty state |
| `1956_SEAM_ONLY` | 3 | optional `schoolCount` metadata; Schools shortcut from an AREA; Schools visibility predicate |
| `SEPARATE_ISSUE` | 7 | Add-nearby-areas/AREA_SET (#2017); polygon (#2016); viewport search (#2015 via #2016); zero-result recovery (#2018); alerts (#2019); full school-radius journey; expanded filter set |
| `DESIGN_NON_GOAL` | 4 | no product URLs; in-memory history; tablet widths; assertion-free/fixture data |
| `PRODUCT_CONFLICT` | 3 | frozen-mock path changed with no amendment (F-1); structural `+N` copy (F-2); hidden zero-match + filter-ranked names (F-3) |
| `ENGINEERING_UNKNOWN` | 4 | school-count semantics at cluster level; loading/hard-error/map-failure states; index/query-plan evidence; max direct-AREA-child count |
| `MOVE_TO_FOLLOW_UP` | **0** | no salvage-branch work has drifted out of #1956 |

---

## 8. Net verdict

**The final mock does not change #1956's shape, and it corroborates the contract on every structural point that matters:** both shallow paths and no third public CLUSTER level; visual clusters that move only the camera and never the breadcrumb or scope; counts computed over areas *with matches*; map/panel selection sync as a class toggle rather than a marker rebuild; the two locked evidence viewports.

**What it changes is copy and two behaviours — and in all three cases the contract wins over the mock**, because the mock's own `FUNCTIONAL_AUDIT` records two of them as contradictions and the third as an unresolved product decision. That is a comfortable place to be: I am not overriding a considered design, I am declining to copy known prototype defects.

**The real risk the mock introduces is scope gravity.** It is a polished, complete-looking prototype in which Add-nearby-areas, polygon, viewport search, zero-result recovery, alerts and the full school-radius journey all work. None of it is #1956's. Seven `SEPARATE_ISSUE` classifications and F-7 exist to stop that gravity pulling work in.

**Proposed final PR count: 6, unchanged.** No recombination, split or reorder is justified by the mock. The only structural adjustment is an *intra-PR* clarification (Q7's PR 4 / PR 5 split of the listing preview sheet), which does not change the count or the merge order. The count remains locked pending user approval.

**Unresolved product decisions requiring a ruling: F-1** (is the changed frozen-mock content binding?), **F-3** (confirm zero-match destinations stay visible and names stay stable — closing the design's own open question), and **F-5** (school-count semantics at cluster level). **F-2** I recommend resolving in the contract's favour with the divergence recorded. **F-4** is a design nicety, not a blocker.

---

## 9. Browser-walk addendum — OBSERVED, and it corrects §3, §5 and §6

A `ui-designer` specialist completed the walk with **Playwright / headless Chromium** against `experience.html` served over HTTP. Practical note for anyone repeating it: **serve from the `retrends-design-system` root, not `new_discover/`** — the kit loads `../../_ds_bundle.js` and `../../styles.css`, and serving the design root alone 404s them and the app throws `Cannot read properties of undefined (reading 'Icon')` and never renders.

`experience.html` is a **storyboard wrapper** (tabs: Areas-first / Schools-first / Area→Schools / Agricultural / Multi-area / Polygon / Search this area / Zero results / Alert / Mobile, plus 1366×768 and 390×844 canvas toggles) embedding the real app in a fixed preview canvas.

### 9.1 Corrections to this document

| # | Earlier claim | OBSERVED reality | Effect |
|---|---|---|---|
| **9.1.a** | **F-2**: the mock puts a `+N` form on structural Direction/Local-Destination cards, conflicting with correction 2 | **Structural cards use ONLY the plain form, never `+N`** — verbatim "13 areas with matches", "7 areas with matches", "3 areas with matches" on the solid navy Direction and Local-Destination cards | **F-2 LARGELY DISSOLVES.** The mock already matches the user's correction 2 at structural level. My F-2 rested on `FUNCTIONAL_AUDIT` lines 282-283, which the running app contradicts. Per the precedence rule (observable beats docs) **OBSERVED wins.** |
| **9.1.b** | Cluster copy is flatly `+N areas with matches` | **Both forms appear on the same surface, conditionally**: `"Hebbal · Nagawara / +3 areas with matches / 98 listings"` (named areas are a subset) and `"Yelahanka · Jakkur / 2 areas with matches / 53 listings"` (named areas ARE the complete set — no `+`) | **Refinement, not conflict.** The `+` appears only when members exceed the displayed names. This is a *better* rule than my flat lock and should be adopted — see 9.2. |
| **9.1.c** | Zero-match copy is `"No matches with current filters"` | **Verbatim observed:** heading `"No matching listings in your 3 selected areas"`, then `"Your search is kept exactly as it is. Nothing here widens it for you."`, then `"No nearby area has matches with these filters either. A filter change below is the honest next step."` with a `CHANGE ONE FILTER` block | **My locked copy string was wrong.** It came from the audit's correction-delta prose, not from the app. Corrected. Note this state is at the *area/multi-area* level, so parts of it are #2018 recovery territory. |
| **9.1.d** | **F-3**: the mock hides zero-match structural destinations | **INCONCLUSIVE, and my framing was too strong.** Filters (TYPE/BEDS/BUDGET) exist **only at the area/listings level**; Direction and Local-Destination levels have **no filter toolbar at all**, only global Buy/Rent. So a filter-driven zero-match Direction may not be reachable in this design. The walk could neither confirm nor deny it. | **F-3 downgraded** from PRODUCT_CONFLICT to *contract requirement that the mock does not exercise*. The requirement stands (a zero-match Direction must stay visible, in position, with stable parentage) but "explicitly against the mock" is withdrawn. |
| **9.1.e** | Single-AREA marker shows name + counts + "Tap to view homes" | **After selecting an AREA the markers become listing/price pins** — solid circular proximity-clustered badges reading `"42 HOMES"`, `"4 HOMES"`. The named single-AREA card was not observed as a distinct pre-selection state. | Corroborates the AREA→listing-marker transition. The "comfortable single-AREA marker" remains a contract requirement not directly evidenced by the mock. |
| **9.1.f** | §3.5: "Preview" survives in zero-result recovery (per audit C8) | **ABSENT.** `page.locator('text=Preview').count()` = **0** at the landing state, after entering a Direction, and inside the Add-nearby-areas draft panel. The draft's only actions are per-area `Add`, a commit reading **`"Show 42 listings"`** (caption "Honest total for Hebbal alone"), and `Cancel`. | The brief's premise is **confirmed** for the flows walked. Audit C8's residual-Preview claim did not reproduce. |

### 9.2 Contract-relevant confirmations (all OBSERVED)

- **Five Directions including Central**, with counts: North 249, East 169, South 191, West 126, Central 72. Heading `"Where in Bangalore?"`; subcopy *"Five directions, positioned as they really lie. Each card names the areas with matching homes inside it."*
- **No whole-city marker gate.** The 807-listings / 28-areas total renders as a metadata strip above the panel, not a marker you must click first. Directly satisfies #2014 s2 / s14.
- **Maximum regional depth = exactly 2** (Direction, then Local Destination) before leaf AREAs. **No third navigable regional level exists.** Panel eyebrow literally reads `LOCAL DESTINATION`.
- **Breadcrumb maximum = 4 items**: `"Bangalore › North Bangalore › Hebbal · Yelahanka › Hebbal"`. Independently confirms overrule **O-2** — at 4 items the retired collapse apparatus could never trigger.
- **Cluster markers are dashed/outlined, visually distinct from the solid structural cards**, captioned `"Tap to zoom"`. Panel copy states *"The dashed cluster on the map only zooms."* and *"Crowded markers are grouped on the map for legibility only."* Satisfies the distinguishability AC and the presentation-only rule.
- **Back copy is one level up at every depth**: `"‹ Back to Bangalore"`, `"‹ Back to North Bangalore"`, `"‹ Back to areas in North"`, `"‹ Back to schools in Hebbal · Yelahanka"`. *(Copy nit worth passing to design: "areas in North" rather than "areas in North Bangalore" — inconsistent with the card label.)*
- **Schools mirrors Areas 1:1** with plum accent and counts relabelled, and the **radius journey is fully built** — `"Homes within 5 km of Kensri School"`, radius selector `3 km (108 homes) / 5 km (168 homes) / 10 km (335 homes)` with live counts, distance chips (`"0.2 km from school"`), distance sorting, `"Choose another school"`. Reinforces that this is the **full Schools journey → separate issue, preserve only**.
- **Schools shortcut copy**: `"Schools in Hebbal — 12 schools · keeps this area ›"`.

### 9.3 Two NEW risks the walk surfaced

**9.3.a — Scope gravity is worse than §0.7 assumed, because it is inside #1956's own panel.** At the single-AREA level the panel renders eyebrow `"RESULT SCOPE — SELECTED AREAS"`, an `"Hebbal ×"` chip, and an action row: **`Edit areas / Clear selected areas / Draw search area / Create alert`**, plus `"Add nearby areas — Add up to 2 nearby areas ›"`. Those are **#2016 / #2017 / #2019** features sitting in the exact panel #1956 owns — and the scope chip row appears even for a *single* area. This upgrades my earlier "do not retrofit the chip row" note from a sibling-kit observation to a **main-kit reality**. **#1956's AREA panel must ship the listing surface and the Schools shortcut, and must NOT ship the scope chip row, Edit/Clear areas, Draw search area, Add nearby areas or Create alert.** That is now an explicit forbidden-scope line, not a general caution.

**9.3.b — Mobile responsiveness is UNVERIFIED, and the mock cannot be used as evidence for it.** A genuine Playwright viewport resize to 390×844 **did not** trigger the mobile layout: the app kept rendering the full desktop two-column map+panel, shrunk, with no reflow and no `List | Map` toggle. The mobile layout appears **only** via the storyboard's staged "Mobile" tab + canvas toggle. So the mock proves a mobile *design*, not a working mobile *reflow*. **PR 5 must build and verify real media-query behaviour at a true 390×844 viewport and cannot cite the mock as evidence.** This also strengthens the existing rule that PRs 2/3/4 carry a real 390×844 smoke.

### 9.4 Further prototype shortcuts (OBSERVED)

- **Hash "URLs" are decorative.** `page.goto` to `#r=south`, `#a=hebbal`, `#m=schools` always renders the landing state. Confirms Table E: the manifest's hashes are documentation, not a routing contract.
- **Browser history is explicitly untouched during drafting** — in-app copy: *"This is a draft selection: the map, the results and browser history do not change until you show the listings."*
- **`"Simulate a backend failure"`** button on the zero-results scene — a debug affordance, clearly not customer-facing.
- **Fixture counts throughout** (807 / 28 / 249 …), expected for a static kit.
- **A real copy defect not to copy:** on the Add-nearby-areas panel an amber banner reads *"No area here has a listing that matches your filters." / "Reset filters"* **while no filters are active** (TYPE=All, BEDS=Any, BUDGET=Any price). Likely a canned-scenario quirk, but it would read as a lie if shipped.

### 9.5 What the walk could NOT certify (labelled honestly)

The specialist was explicit about the limits of its pass, and I am preserving them rather than rounding up to "verified":

- **Cluster tap was not click-and-diffed.** The zoom-only behaviour is read from the app's own on-screen caption (*"Tap the dashed Hebbal · Nagawara cluster: it zooms, it does not navigate."*), not from clicking the Leaflet marker and diffing state. Contract-wise this is fine — #1956 must implement zoom-only regardless — but it is copy-read, not behaviour-observed.
- **Breadcrumb segment interactivity was not certified.** Text-based locators kept matching the panel heading instead of the breadcrumb chip when strings were identical. Rendered strings are confirmed; per-segment clickability is not. A follow-up with container-scoped selectors would settle it.
- **Back links were read, not clicked.**
- **`View details` was not clicked**; the manifest lists detail pages as `NOT_DESIGNED`, consistent with nothing being reachable.
- **The shallow `City → Direction → AREA` path (South) was not walked live** — it is CODE-READ from the manifest only.
- **No dedicated `Show all areas` / `Reset area view` control was present** at the cluster level; the described interaction is zoom-only, reversible via map controls. #1956 still requires an explicit reset per #2014 s4 — so this is a place where the **contract asks for more than the mock provides**.

### 9.6 Net effect on the plan

**Still Phase 0 + 6 PRs, count LOCKED at 6.** The walk changes no boundary. It *reduces* conflict (F-2 dissolves, F-3 downgrades), *corrects* one locked copy string, *refines* the cluster `+N` rule, and *adds* two risks (9.3.a scope gravity inside the AREA panel, 9.3.b unverified mobile reflow) plus one forbidden-scope line. All are absorbed into `pr-delivery-plan-pr-b.md` §0 without moving work between PRs.

---

## USER_RECONCILED_PLAN_APPROVAL_REQUIRED

`pr-delivery-plan-pr-b.md` and `team-lead-plan-pr-b.toml` are updated to match this reconciliation. Nothing proceeds without user approval; on approval the Main Agent resubmits to PLAN_REVIEW, and no implementation begins before that gate approves.
