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
- Read-only import. No production source was modified. No app component was overwritten.

## Not imported (deliberately skipped)

The following were intentionally **not** pulled — binary or compiled artifacts with no
value as a text design reference (and the bundle would exceed the connector's 256 KiB
text cap):

- `_ds_bundle.js` — compiled/minified component runtime (build artifact, not source).
- `screenshots/*.png` (3 files) — broker listing-quality screenshots (binary).
- `uploads/*.png` (5 files) — pasted reference images (binary).
- `.thumbnail` — project thumbnail (binary).

If any of these are needed later (e.g. a screenshot for visual reference), they can be
pulled individually from the source project.
