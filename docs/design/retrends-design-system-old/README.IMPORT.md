# ReTrends Design System — DESIGN SOURCE / REFERENCE ONLY

> ⚠️ **This directory is a design reference, NOT runtime application code.**
> Nothing here is imported, bundled, or executed by the Udupi Property Tracker app.
> Do not wire `src/` to these files. Do not treat the `.jsx` here as production components.

## What this is

A local mirror of the **ReTrends Design System** Claude Design project
(`claude.ai/design`, project `f3796631-064b-4956-94ba-14baa7af9bcf`), imported via the
Claude Design connector to serve as the **canonical design reference** for the
school-first discovery pages (and the rest of the discover surface) of the Udupi
Property Tracker.

It captures the brand foundations (color / type / spacing / elevation tokens), the
component specs, the usage guidelines, and the interactive UI-kit prototypes that
encode the intended look, behaviour, and journey model.

## How to use it

- **Grounding for design/redesign work.** Read `readme.md` (brand bible), the
  `tokens/*.css` (source-of-truth design tokens), the relevant `ui_kits/*/README.md`
  (per-journey design notes), and the `.prompt.md` / `.d.ts` component contracts.
- **Translate, don't copy.** The kit JSX targets a standalone React + Tailwind v4 +
  shadcn prototype and references a `window.ReTrendsDesignSystem_f37966.*` runtime that
  does not exist in this repo. Port the *patterns and tokens* into the app's real
  components; never import these files.
- **Production tokens already live in the app.** When implementing, map these CSS
  variables onto the app's existing theme — do not introduce a second token system.

## Provenance & integrity

- Source project: **ReTrends Design System** (`PROJECT_TYPE_DESIGN_SYSTEM`), owner `goutham`.
- Imported: 2026-06-18 via the `DesignSync` read connector (`get_file` per path).
- Refreshed: 2026-06-21 (see **Refresh log** below).
- Read-only import. No production source was modified. No app component was overwritten.

## Not imported (deliberately skipped)

The following were intentionally **not** pulled — binary or compiled artifacts with no
value as a text design reference (and the bundle would exceed the connector's 256 KiB
text cap):

- `_ds_bundle.js` — compiled/minified component runtime (build artifact, not source).
- `screenshots/*.png` (5 files) — broker listing-quality screenshots (binary).
- `uploads/*.png` (11 files) — pasted reference images (binary).
- `.thumbnail` — project thumbnail (binary).

If any of these are needed later (e.g. a screenshot for visual reference), they can be
pulled individually from the source project.

---

## Refresh log — 2026-06-21

Re-pulled from the source project (`updatedAt` 2026-06-20, i.e. changed after the
original 2026-06-18 import). Method: `DesignSync.list_files` + `get_file` per path,
written to disk with the editor.

**Verified unchanged (no re-write needed).** The brand foundation did not change
between 2026-06-18 and 2026-06-20 — confirmed by byte-comparing local vs remote and
by diffing the compiled `_ds_manifest.json` token set:

- `tokens/*.css` (colors, typography, spacing, elevation, fonts) and `styles.css`
- `components/**` specs and `guidelines/**` specimen cards
- the `discover`, `portal`, `school-discovery`, `school-zone-selected` UI kits

**The 2026-06-20 update was purely additive** — new UI-kit surfaces, no token changes.
Pulled the new **design-source** (the canonical port-from material):

- `ui_kits/agri-discovery/` — `README.md`, `LANDING-README.md`, `data.js`,
  `corridor-data.js`, `AgriDiscovery.jsx`, `AgriMap.jsx`, `CorridorDiscovery.jsx`,
  `CorridorMap.jsx`, `Panel.jsx`, `CorridorPanel.jsx`
- `ui_kits/area-discovery/` — `README.md`, `data.js`, `AreaDiscovery.jsx`,
  `AreaCards.jsx`, `AreaMap.jsx`
- `ui_kits/broker/` — `BrokerDashboard.jsx` (Dashboard v2), `DemandGaps.jsx`

**Deliberately deferred — the "preview layer" (large generated artifacts).** Not yet
pulled, pending an explicit follow-up pass, because hand-transcribing large generated
HTML via the read connector is costly and risks corruption. The design intent for each
is fully captured by the `README.md` + `.jsx` source above.

- New standalone HTML previews: `ui_kits/agri-discovery/index.html`,
  `ui_kits/agri-discovery/landing.html`, `ui_kits/area-discovery/index.html`,
  `ui_kits/broker/dashboard-v2.html`, `ui_kits/broker/demand-gaps.html`,
  `ui_kits/broker/area-intelligence.html`, `ui_kits/broker/broker-prototype.html`
- `_ds_manifest.json` refresh (the compiled card index — left at its 2026-06-18 state;
  the new surfaces above are not yet registered in it)
- Stale-on-remote `ui_kits/broker/index.html` (superseded by `area-intelligence.html`)
  — left in place locally so no preview shell is removed while its replacements are
  still deferred.

To complete the preview layer later: pull the 7 HTML files above + the refreshed
`_ds_manifest.json`, then delete the stale `ui_kits/broker/index.html`.
