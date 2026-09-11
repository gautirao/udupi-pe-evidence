# Issue #2480 — real-browser evidence

Returning from a committed VIEWPORT/POLYGON result scope to a **single-area (N=1)**
AREA_SET previous scope committed the scope but did not re-fit the camera.

---

## Status at head — read this first

This document spans **three capture rounds and two different builds**. A reader who
checks an early claim against current head will find it contradicted, so the boundary
is stated up front:

| Round | Build | What it shows | Still true at head? |
|---|---|---|---|
| 1, 2 — desktop | `5737760c` fix | Desktop N=1 Return restores the camera | **Yes** |
| 2 — mobile | `5737760c` fix | Mobile *user-reachable* journey did **not** restore | **No — fixed by `08e84394`** |
| 3 — mobile + desktop | `08e84394` | Mobile user-reachable journey **restores**; no replay on a second mount; desktop unregressed | **Yes** |

The round-2 mobile gap frames are kept deliberately: they are the record of **why
`08e84394` exists**, not a description of current behaviour. They are labelled
historical where they appear.

**Round-3 outcome — all five checks pass** (details in
[Round 3](#round-3--the-mobile-journey-after-08e84394), raw record in
[`meta-reshoot.json`](meta-reshoot.json)):

| Check | Result |
|---|---|
| Mobile user-reachable journey restores the camera | **YES** — `12.93169, 77.52932` (was: did not move) |
| Second Map open does not replay the restore (#1953) | **YES** — camera unchanged |
| Map-mounted control (target fit was always correct) | **YES** — byte-identical output |
| List → Map → List neutrality control, **re-run on this build** | **YES** — camera bit-identical |
| Desktop regression check | **YES** — `12.93170, 77.52933`, unchanged |

## Why the primary evidence here is numbers, not pixels

Camera state is hard to photograph: a map that *looks* similar is not proof, and a
screenshot cannot distinguish "moved to the right place" from "moved somewhere
plausible". This app writes the live camera into the URL as `lat`/`lon`/`zoom`, so
every claim below is bound to a checkable value a reviewer can verify without
opening an image.

Since the first round of evidence, the frames also carry the claim **in the pixels**
— see [Pixel-level proof](#pixel-level-proof-re-derivable-from-the-committed-frames).

## Stack

Isolated, purpose-built per lane — the machine-wide shared fixture container
(`pg-test-fixture`, port 5434) was **not** touched by either lane.

| Component | Round 1 (desktop fixed pair) | Round 2 (capture lane) |
|---|---|---|
| Fixture container | `pg-test-fixture-2480` on 5442 | `pg-test-fixture-2480b` on 5452 |
| Backend | port 8271 | port 8281 |
| Frontend | Vite on 5371 | Vite on 5381 |
| CORS | header-verified | header-verified `Access-Control-Allow-Origin: http://localhost:5381` |
| Fixture data | 313 Bangalore areas | 313 Bangalore areas |

Round 2 confirmed from captured network traffic that the app called its own backend
(`http://localhost:8281`) and no other origin.

## Fixture area — RR Nagar

Values as reported by `GET /api/discover/areas?city=bangalore` (identical in both rounds):

| Field | Value |
|---|---|
| `areaKey` | `IN\|KA\|Bengaluru\|RR Nagar` |
| centre | `12.9314733, 77.5290964` |
| bbox | `12.9307099, 77.528404` – `12.932668, 77.530232` |
| listings | 4 |

(Indiranagar and Koramangala do **not** resolve in this fixture's canonical
hierarchy — the app reports "that destination isn't available anymore". RR Nagar
does.)

## Procedure — identical in both arms

1. Load `/discover` with `rscope=vp` (committed VIEWPORT) and
   `rprev=areas:IN|KA|Bengaluru|RR Nagar` (N=1 AREA_SET previous scope).
2. Dismiss the telemetry consent gate.
3. Pan the map away from RR Nagar.
4. **Wait for tiles to settle** — a screenshot taken mid-pan shows a blank map and
   is not evidence.
5. Click **"Return to RR Nagar"** in the panel scope bar
   (`data-testid="area-panel-scope-bar-return"`) — not the map's
   "Recenter on RR Nagar" chip (`areas-recenter-button`), which is a different control.

Round 2 replaced the hand-driven pan with a **closed-loop pan**: read the camera back
out of the URL, compute the residual in metres, convert to pixels at the current
zoom/latitude, drag, repeat until within ~40 m. Each drag is 30 interpolated moves with
a 500 ms hold before release, which suppresses Leaflet's inertia. It converges in 5–9
iterations and lands on the round-1 staging position to within 1e-5°.

## Result — desktop

| Build | camera before Return | camera after Return | moved? |
|---|---|---|---|
| **Unfixed** (parent `17b9ab1c`) | `12.97148, 77.54700, z16` | `12.97148, 77.54700, z16` | **NO** |
| **Fixed** (#2480) | `12.97148, 77.54700, z16` | `12.93169, 77.52932, z16` | **YES** |

Reproduced **three times across two independent harnesses**. Rounds 1a/1b drove a
Chrome extension by hand; round 2 drove Playwright with programmatic guards, and landed
on `12.97149, 77.54701` staged → `12.93170, 77.52933` after Return on the fixed build —
agreeing with the hand-driven runs to within 1e-5°.

On the fixed build the camera lands ~25 m from RR Nagar's true centre after a ~4.4 km
jump; the residual is expected because `fitBounds` frames the bbox with padding rather
than centring on the centroid.

**In both arms the scope itself committed correctly** — URL became
`rscope=areas&rareas=IN|KA|Bengaluru|RR Nagar` with `rprev=vp:...`, the panel heading
became "Properties in RR Nagar", and "2 shown for sale" rendered. Only the camera
differs. That isolates the defect to the camera path and rules out "the whole Return
flow was broken".

## Pixel-level proof (re-derivable from the committed frames)

An earlier independent review noted, correctly, that the frames do not capture browser
chrome, so the coordinates could not be read off the pixels. The frames now carry the
claim directly: crop the map pane out of each arm's before/after pair and compare.

| Arm | frames compared | mean abs diff | pixels changed >8/255 |
|---|---|---|---|
| **Unfixed** desktop | `before-…-01` vs `before-…-02` | **2.127** | **2.31 %** |
| **Fixed** desktop | `before-…-01` vs `after-…-r2-02` | **32.371** | **84.70 %** |
| **Mobile**, user-reachable path | `mobile-…-01` vs `mobile-…-03` | **2.571** | **3.53 %** |
| **Mobile**, map mounted | `mobile-…-01` vs `mobile-…-04` | **33.672** | **88.01 %** |
| **R3** mobile user-reachable — *now restores* | `fixed-mobile-…-01` vs `fixed-mobile-…-03` | **33.672** | **88.01 %** |
| **R3** second Map open — *no replay* | `fixed-mobile-…-03` vs `fixed-mobile-…-04` | **0.822** | **1.95 %** |

A ~14× gap in mean absolute difference, and 2–4 % vs 85–88 % of pixels changed.

The first four rows are the **pre-fix** build, the two **R3** rows the fixed one. Rows 3
and 5 are the *same journey* either side of `08e84394`: **3.53 % → 88.01 %**. The last row
is the replay check — near-zero is the passing result there, not a failure.

Desktop crop box `(0, 114, 1366, 1536)`, mobile `(0, 300, 780, 1560)`; images are
device-pixel (DSF 2). **All four rows are computed from the committed JPEGs in this
directory**, not from the source PNGs, so re-derivation reproduces these values exactly
rather than only to JPEG-rounding tolerance. `frames.json → pixel_diff` carries the same
numbers with exact filenames and crop boxes.

The **round-1** desktop pair (`after-desktop-1366x768-01/02`) is deliberately **not** a
row here: it was captured at 1512×794 by a different harness, so the DSF2 crop box does
not apply and forcing one would produce a meaningless number. The round-2 fixed pair
supersedes it for pixel-diff purposes; the round-1 *numbers* are in the result table
above, and round 2 reproduced them to within 1e-5°.

### Why both desktop arms share one "before" frame

The unfixed arm and the round-2 fixed arm use the **same file** as frame A. That is not a
shortcut — their staged screenshots are **byte-identical** (sha256 `9d9515e7a6f581fd…`;
the source PNGs differ by mean 0.0000). The fix is inert until the Return action fires,
so at the staged state both builds render the same DOM over the same cached tiles at the
same camera and DPR. That sha256 identity is a stronger proof of "identical staging in
both arms" than the assertion it replaces, and committing the same bytes under two names
would have added nothing.

> **Do not "fix" this by shooting a second staged frame.** The single shared file is the
> point, not an oversight: two files with equal hashes prove identical staging, whereas
> two separately-captured frames could only ever *look* alike. Re-shooting one would
> replace a checkable claim with an eyeballed one and destroy the proof.

### What the residual few percent is

On the **desktop** unfixed pair the tile counts are identical across both frames (30/30 →
30/30), so the 2.31 % is overlay only: the newly-rendered `A RR Nagar ×` scope chip and
the marker layer.

On the **mobile** pair that reading does **not** hold and is not claimed: `tiles.all`
drops **29 → 8** between frames 01 and 03. That pair brackets a List → Map transition,
and Leaflet is measurably absent in List view
(`document.querySelectorAll('.leaflet-container').length === 0`), so frame 03's tile nodes
are necessarily a *fresh* set rather than the same nodes re-used. **Why the fresh set
settles at 8 rather than 29 is not established here**, and is recorded as
observed-but-unexplained. The 3.53 % pixel diff still supports "map content
overwhelmingly unchanged", which is the claim that matters; the tile-count drop is
flagged rather than explained away.

## Result — mobile 390×844, and a gap this lane found

> ⚠️ **HISTORICAL — this section describes the build *before* `08e84394`.** The gap
> below is **fixed at head**; see [Round 3](#round-3--the-mobile-journey-after-08e84394)
> for the current behaviour. Kept because it is the record of why the fix exists.


Guards asserted before every mobile shot: `window.innerWidth === 390` and
`matchMedia('(max-width: 820px)').matches === true`, both via Playwright's viewport
(`resize_window` reports success without resizing and was not used).

**Mobile is panel-first**: `/discover` opens in List view, and the Leaflet map is
**not mounted at all** there (`document.querySelectorAll('.leaflet-container').length === 0`).
The Map view is a full-screen overlay; the two are mutually exclusive. The panel scope
bar's "Return to RR Nagar" is therefore only *reachable* in List view — in Map view it
is in the DOM but covered by the map overlay (`document.elementFromPoint` at its centre
returns the `.leaflet-container`).

| Mobile path | camera before | camera after Return | restored? |
|---|---|---|---|
| **User-reachable** — Return tapped in List view, then switch to Map | `12.97148, 77.54702, z16` | `12.97148, 77.54702, z16` | **NO** |
| **Map mounted** — same handler run while the map is alive | `12.97148, 77.54702, z16` | `12.93169, 77.52932, z16` | **YES** |

Two things follow, and they should not be conflated:

1. **The fix itself is viewport-independent.** At 390×844, with the map mounted, Return
   restores the camera to `12.93169, 77.52932` — the *same* fit as desktop, to 1e-5°.
   That is `mobile-390x844-04`.
2. **On the user-reachable mobile path the camera is not restored**, because the control
   is only reachable in the view where the map does not exist. The scope commits
   correctly (`rscope=areas&rareas=…RR Nagar`, panel reads "Properties in RR Nagar"), and
   reopening the Map shows the old panned-away camera. That is `mobile-390x844-03`.

**Control run, so (2) is not an artefact of reopening the map**: toggling
List → Map → List with no Return in between leaves the camera bit-identical. The toggle
does not move the camera, so frame 03 shows the real post-Return camera and not a re-fit.

This control is load-bearing — it is the only thing ruling out "reopening the Map reset
the camera" — so the raw run record is committed rather than merely cited. See
[`meta-mobile.json`](meta-mobile.json) → `phase1.toggleControl`:

| step | camera |
|---|---|
| `before` (Map, staged) | `12.97148, 77.54702, z16` |
| `inList` (after → List) | `12.97148, 77.54702, z16` |
| `backInMap` (after → Map) | `12.97148, 77.54702, z16` |
| `cameraNeutral` | `true` |

Row (2) was measured on **this branch only**. Whether `main` or the `#2478` base behaves
differently was **not** measured — on `main` the N=1 fit came from `ActiveScopeChip`,
which renders on the map itself, and PR #2484 unmounts it. That makes a mobile
difference plausible, but it is an inference from the code, not a measurement, and is
flagged here for the owner rather than asserted.

Note that mobile Map view does still offer a reachable **"Recenter on RR Nagar"**
(`areas-recenter-button`), a camera-only control distinct from the scope-restoring
Return. So a mobile user is not stranded — but they must tap a second, different control.

## Round 3 — the mobile journey after `08e84394`

Captured against the fixed build from a **dedicated worktree** (`issue-2480-reshoot`),
own container and ports (`pg-test-fixture-2480c` / 5462 / backend 8291 / Vite 5391), CORS
confirmed by response header. Raw record: [`meta-reshoot.json`](meta-reshoot.json).

### The expectation inverted

| Arm | before Return | after Return + open Map | round 2 | round 3 |
|---|---|---|---|---|
| **User-reachable** (Return in List, then Map) | `12.97148, 77.54702` | `12.93169, 77.52932` | **NO** | **YES** |
| **Map already mounted** | `12.97148, 77.54702` | `12.93169, 77.52932` | YES | YES |

Pixel-level, same crop box as everywhere else: the user-reachable pair goes from
**3.53 %** of pixels changed (round 2, camera did not move) to **88.01 %** (round 3, it
did). The inversion is visible in the pixels, not only in the URL.

### The destination was always correct — only delivery changed

**What carries this claim: the coordinates, not the pixels.** The user-reachable journey
ends at `12.93169, 77.52932` and the map-mounted arm ends at the same coordinates, both
read from the URL and recorded in [`meta-reshoot.json`](meta-reshoot.json). The frames
corroborate the destination; they do not establish it. See
[Are the frames journey-blind?](#are-the-frames-journey-blind-yes-and-that-is-the-point)
for why that division of labour is not a hedge.

The two arms did also produce **byte-identical** screenshots — sha256 `d1191598…` on the
source PNGs, mean absolute difference `0.0000` — and only one file is committed, per the
same rule as the shared staged frame. The identity is recorded in
[`frames.json`](frames.json) → `byte_identity`.

That the identity is not merely "all map frames look alike" is shown by frame 04, captured
from the same view at the same camera, which is **not** identical (mean 0.604 on the source
PNGs).

So `08e84394` did not change *where* the camera goes — round 2 had already established that
target independently, on the previous build. It changed only whether the intent survives to
a map that mounts later.

### Are the frames journey-blind? Yes, and that is the point

An earlier draft of this document argued that byte-identity between two outcome frames was
a *stronger* form of proof than a coordinate match. **That is wrong for outcome frames, and
the correction matters enough to state rather than quietly edit.**

The capture is deterministic (see below). A deterministic renderer's output depends only on
final state — so an outcome screenshot is **journey-blind by construction**. It cannot show
*how* the app arrived. Frames 03 and 05 are byte-identical precisely because two *different*
journeys reached the same state: that demonstrates journey-blindness rather than refuting it.

Consequences, applied throughout this document:

- A which-path claim ("the *user-reachable* path now restores") rests on the URL-bound
  coordinates and the run record. Never on a frame.
- Hash equality remains meaningful for a deliberately shared **staged input** — same
  *starting* state — which is why the shared before-frame above is legitimate.
- Byte-identity between outcomes is **uninformative rather than incriminating**: genuine
  convergence and a recycled file predict the same bytes. Only re-capture separates them.

### A second Map open must not replay the restore

The #1953 adopt-on-mount guard exists to stop a remount re-firing a camera intent the
previous mount already consumed. The fix makes a pending intent survive an unmount, so
"does it now fire twice?" is a live question rather than a formality.

Staged `List → Return → Map → List → Map` and compared the two Map opens:

| | camera |
|---|---|
| first open (restore fires) | `12.93169, 77.52932, z16` |
| second open | `12.93169, 77.52932, z16` — **unchanged** |

Pixel diff between them: **0.822 mean / 1.95 %** — overlay difference, no camera move.

**This row is deliberately weaker than it looks, and should not be read as proof of a single
publish.** The second open lands on the *same coordinates* as the first, so the browser
cannot distinguish "the intent did not re-fire" from "it re-fired and re-applied the same
camera". Both produce this observation. What actually discriminates is publish counting,
which `useDiscoverMapDataController.test.ts` does via the strictly-monotonic
`CameraIntent.seq` — a delta of 0 proves no second fire. **That test owns this claim; this
row only shows the outcome is consistent with it.**

### The neutrality control was re-run, not reused

The List → Map → List control (toggle views, no Return) establishes that toggling alone
does not move the camera. **The round-2 result was not carried forward.** That control
probes mount behaviour, and `08e84394` changes mount behaviour — so the old run
establishes a property of the *old* mount path and would say nothing about the new one.
Reusing it would have been a stale reassurance wearing the shape of evidence.

Re-run on this build:

| step | camera |
|---|---|
| `before` (Map, staged) | `12.97148, 77.54702, z16` |
| `inList` | `12.97148, 77.54702, z16` |
| `backInMap` | `12.97148, 77.54702, z16` |
| `cameraNeutral` | `true` |

### Desktop regression check

The fix touches `PropertyMap` mount logic that desktop shares, so desktop was re-run
rather than assumed unaffected: staged `12.97149, 77.54701` → after Return
`12.93170, 77.52933`.

The result is stronger than "matches to 1e-5". The round-3 desktop capture is
**byte-identical** to the round-2 desktop capture taken *before* `08e84394` existed —
sha256 `fba23f0e…`:

| File | Build |
|---|---|
| `after-desktop-1366x768-r2-02-return-camera-restored.jpg` | pre-fix (`5737760c`) |
| `fixed-desktop-1366x768-01-after-return.jpg` | post-fix (`08e84394`) |

Same hash. Both files are committed because they carry *different* claims (one is round-2
fixed-desktop evidence, one is the round-3 regression check).

Read this one carefully, because it is a **same-state** comparison rather than a
which-path one: both frames depict the desktop after-Return state, and the claim is that
the state is unchanged across the fix. Byte-identity is exactly the right instrument for
that. It would *not* be the right instrument for "the desktop journey still works" — that
rests on the coordinates `12.93170, 77.52933`, recorded in
[`meta-reshoot.json`](meta-reshoot.json).

### The target never moved — across builds, not just across paths

The convergence above holds across the fix as well as within it. The round-3
user-reachable outcome on the **fixed** build is byte-identical to the round-2
map-mounted arm captured on the **pre-fix** build — sha256 `a7d047c1…`:

| File | Build | Path |
|---|---|---|
| `mobile-390x844-04-map-mounted-return-camera-restored.jpg` | pre-fix | map already mounted |
| `fixed-mobile-390x844-03-map-camera-RESTORED.jpg` | post-fix | user-reachable journey |

Two builds, two different code paths, identical bytes. Whatever `08e84394` changed, it
was not the destination — that was already correct and already reachable when the map
happened to be mounted. The fix changed only whether the intent survives to a map that
mounts later.

(The staged frames are byte-identical across rounds too, sha256 `eaae90cb…`, which is
the same reproducibility property the closed-loop pan was built to give.)

**This identity was challenged as evidence of recycled files, and the challenge was
right to be made** — four round-3 frames hash-match earlier ones, and on the pixels alone
that is indistinguishable from copying old files under new names. It was settled by
re-capture, below.

## Is the capture deterministic? Yes — measured, not assumed

Recorded here because it is the fact that stops this whole question being re-derived, and
because provenance metadata (inodes, mtimes, write ordering, session logs) **does not
travel with the commit** and is in any case satisfied by a copy. Only re-capture separates
"a deterministic pipeline reproduced the bytes" from "someone copied a file".

Four tests, same harness and stack, run after the challenge:

| | Test | Result |
|---|---|---|
| **T1** | Same page, two screenshots 3 s apart of one settled state | identical — `67131cf7…` |
| **T2** | Independent browser session, same staged state | identical — `67131cf7…` |
| **T3** | Live re-run of the **map-mounted** arm, end to end | `d1191598…`; through the same annotation step → `a7d047c1…`, **the committed frame byte-for-byte** |
| **T4** | Live re-run of the **user-reachable** journey, real click on "Return to RR Nagar" | `d1191598…` |

At a fixed camera with cached tiles and no animation, the render is fully deterministic —
across sessions, and across builds. **A recycled file cannot be regenerated by a live
browser run**, and T3 regenerated the committed bytes exactly.

T3 and T4 also settle the journey question empirically: two *different* journeys produced
**identical** bytes. That is journey-blindness demonstrated rather than argued.

Two things this rules out that looked decisive at the time:

- **A cross-harness "control" proves nothing about determinism.** The round-1 desktop pair
  (Chrome extension, 1512×794) and the round-2 pair (Playwright, 2732×1758 at DSF 2) differ
  in bytes — but they are different instruments at 4× the pixel count, which is also why
  their sizes differ so widely (173 417 vs 470 269 B). `frames.json` had already excluded
  that pair from pixel comparison for this reason.
- **Distinct inode, `nlink 1` and a fresh mtime do not prove a capture happened** — they are
  exactly what `cp` produces. They attest that a *file* was written, never that a *capture*
  produced its bytes.

### A corollary: tile counts track DOM nodes, not pixels

`meta-reshoot.json` records `tiles 10` for frame 03 while `meta-mobile.json` records
`tiles 13` for the byte-identical frame it matches. Byte-identical images cannot differ in
what they depict, so the difference is in the **count**, not the render: `img.leaflet-tile`
counts DOM nodes, which include tiles that are covered, retained from a previous zoom, or
outside the visible area.

That also bears on the `29 → 8` drop recorded earlier as observed-but-unexplained: it
confirms the tile count is not a reliable proxy for visible map content, so a drop in it is
not by itself evidence that the map changed. The underlying reason for that particular drop
is still not established here.

## Frames

| File | Build / viewport | Shows | Bound observable |
|---|---|---|---|
| `after-desktop-1366x768-01-staged-panned-away.jpg` | fixed, 1366×768 | staged: panned away, tiles settled, "Return to RR Nagar" in the panel scope bar | `12.97148, 77.54700, z16` |
| `after-desktop-1366x768-02-return-camera-restored.jpg` | fixed, 1366×768 | after Return: camera restored to RR Nagar, panel "Properties in RR Nagar" / "2 shown for sale" | `12.93169, 77.52932, z16` |
| `after-desktop-1366x768-r2-02-return-camera-restored.jpg` | fixed, 1366×768 (round 2) | the same after-Return state re-captured through the round-2 pipeline, so the fixed arm has a DSF2 frame the pixel-diff table can use. Its staged counterpart is `before-…-01`, byte-identical to it | `12.93170, 77.52933, z16` |
| `before-desktop-1366x768-01-staged-panned-away.jpg` | **unfixed**, 1366×768 | staged identically to the fixed arm, tiles 30/30 | `12.97149, 77.54701, z16` |
| `before-desktop-1366x768-02-after-return-camera-NOT-restored.jpg` | **unfixed**, 1366×768 | after Return: panel *did* switch to "Properties in RR Nagar" / "2 shown for sale" and the `A RR Nagar ×` chip appeared — **map pixels unchanged** | `12.97149, 77.54701, z16` |
| `mobile-390x844-01-map-staged-panned-away.jpg` | fixed, 390×844 | Map view, panned away, tiles 29/29 | `12.97148, 77.54702, z16` |
| `mobile-390x844-02-list-after-return-scope-committed.jpg` | fixed, 390×844 | List view right after tapping Return — scope committed | `rscope=areas`, `rareas=…RR Nagar` |
| `mobile-390x844-03-map-after-return-camera-NOT-restored.jpg` | fixed, 390×844 | Map reopened after Return — **camera still panned away** (the gap above) | `12.97148, 77.54702, z16` |
| `mobile-390x844-04-map-mounted-return-camera-restored.jpg` | fixed, 390×844 | Return with the map mounted — camera restored, `A RR Nagar ×` chip, "2 verified properties in RR Nagar" | `12.93169, 77.52932, z16` |
| **Round 3 — build `08e84394`** | | | |
| `fixed-mobile-390x844-01-map-staged-panned-away.jpg` | fixed build, 390×844 | Map view, panned away, tiles 29/29 | `12.97148, 77.54702, z16` |
| `fixed-mobile-390x844-02-list-after-return.jpg` | fixed build, 390×844 | List view immediately after tapping Return — scope committed | `rscope=areas`, `rareas=…RR Nagar` |
| `fixed-mobile-390x844-03-map-camera-RESTORED.jpg` | fixed build, 390×844 | **the headline**: Map reopened after Return — camera restored to RR Nagar on the *user-reachable* path. Byte-identical to the map-mounted control | `12.93169, 77.52932, z16` |
| `fixed-mobile-390x844-04-second-open-no-replay.jpg` | fixed build, 390×844 | second Map open — camera unchanged, the restore did not replay (#1953 intact) | `12.93169, 77.52932, z16` |
| `fixed-desktop-1366x768-01-after-return.jpg` | fixed build, 1366×768 | desktop regression check after Return — unchanged from the pre-fix desktop result | `12.93170, 77.52933, z16` |

`frames.json` is a sidecar giving each frame's sha256, byte size, the full `page.url()`
read in the same step that wrote the image, and its tile counts. It also carries the
`pixel_diff` rows and the `staging_identity` record.

The raw run records are committed alongside them, so every number quoted in this
document traces to a file in this directory rather than to a lane's report:

| File | Run |
|---|---|
| [`meta-mobile.json`](meta-mobile.json) | mobile: both phases **and the List → Map → List camera-neutrality control** |
| [`meta-desktop-before.json`](meta-desktop-before.json) | unfixed desktop (controller reverted to parent `17b9ab1c`) |
| [`meta-desktop-after-r2.json`](meta-desktop-after-r2.json) | round-2 fixed desktop — the harness self-test against the documented round-1 numbers. Its internal `arm` field reads `selftest` and its step names are `selftest-desktop-…`: that is the run's own name, kept as written rather than retitled to match the filename, so the record matches what executed |
| [`meta-reshoot.json`](meta-reshoot.json) | round 3 against `08e84394`: neutrality control, user-reachable journey, second-open replay check, map-mounted control, desktop regression |

### About the annotation strip

Each round-2 frame has a dark strip burned along the bottom reading
`CAPTURE ANNOTATION (added by capture script — NOT browser chrome)` followed by the
`lat`/`lon`/`zoom`/`rscope`/`rareas` read from `page.url()` at shot time.

It is **not** a browser URL bar. Capturing real chrome needs an OS-level window grab,
and this harness had no macOS Screen Recording permission (`screencapture` failed with
`could not create image from display`), so that was not possible. The strip is a
harness-authored caption, carrying exactly the values recorded in `frames.json`.
Treat it as a convenience, and `frames.json` plus the pixel-diff table above as the
checkable evidence.

`mobile-390x844-04` was produced by dispatching the click **on the element**
(`element.click()`, which bubbles to React's root listener) rather than at coordinates,
because the map overlay covers the control. That is deliberately **not** a user path —
it exists to isolate the fix from the reachability gap. A coordinate click at the same
spot lands on the map and commits nothing, which is itself recorded: the first attempt
left `rscope=vp` untouched.

## Capture guards

Every round-2 frame had to pass these or it was discarded rather than committed:

- **Tiles settled** — `img.leaflet-tile` count equals `.leaflet-tile-loaded`, non-zero,
  held stable across a second sample 1.8 s later. (Frame 02 is List view, which has no
  map, so it is exempt and recorded with `tiles: 0`.)
- **Pan actually took** — the camera must have moved off the initial fit
  (`12.94995, 77.52490`) *and* must not still be sitting on RR Nagar. A frozen URL with
  settled tiles means the input never reached the page; the run throws rather than shoots.
- **Viewport** — mobile asserts `innerWidth === 390` and the 820 px media query.
- **Post-Return settle** — 30 s wait, then the URL must be unchanged across three
  consecutive 1.2 s samples. The camera animates and the URL write lags; a shot taken
  early catches it mid-flight still reporting the pre-Return position.
- **Phase-2 outcome guard** — the map-mounted mobile run throws unless the camera
  actually reaches RR Nagar, so a silent no-op cannot be published as a success frame.

## Reverting for the unfixed arm

The unfixed desktop pair required reverting
`apps/web/src/features/discover/controllers/useDiscoverMapDataController.ts` to parent
`17b9ab1c`, capturing, and restoring. Before the window was opened the file was copied
outside the repo and the `git diff --numstat` against the base recorded. After restoring,
all three were verified: `git status` clean, the file byte-identical to the backup, and
sha256 `da8e09090a92462f6243551c53548a2c7509aaf7cb8f0e91722de63856974e0e` — and the
diffstat identical to the pre-window baseline. Nothing was committed while reverted.

## Automated coverage backing this

`apps/web/src/features/discover/controllers/useDiscoverMapDataController.test.ts`
asserts the observable camera side effect (`cameraIntent.center` / `.bounds` /
`.framing`) and proves publish counts using `CameraIntent.seq`, which is strictly
monotonic — a delta of 1 proves exactly one fire and 0 proves none. The failure mode
being guarded is a **silent no-op**, so a "did not throw" or "was called" assertion
would pass against completely broken behaviour and is deliberately not used anywhere.

## Why the staging is timing-flaky

Recorded so the next person does not rediscover it:

1. The telemetry consent banner renders a few seconds **after** load and silently
   swallows map drag events. Round 2 removed this class of flake entirely by setting
   `discover_telemetry_consent` in an `addInitScript`, which runs before any page
   script on every navigation.
2. Synthetic drags do not always reach Leaflet. Playwright's CDP-level input did reach
   it reliably; the browser-extension harness did not, and in one round-1 session
   stopped dispatching input altogether after a tool timeout — the tell being a frozen
   URL with settled tiles across every drag.
3. Tiles blank mid-pan and need ~20 s to settle.
4. After Return the camera animates and the URL write lags.
5. Round 1 found that batching the whole sequence into one call produced the unusable
   frames; round 2 sidesteps this by scripting the sequence with explicit guards.
