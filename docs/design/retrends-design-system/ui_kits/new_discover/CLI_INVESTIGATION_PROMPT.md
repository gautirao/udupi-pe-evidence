# CLI Prompt — Investigate the Discover Experience prototype before planning implementation

Copy everything below the line into your CLI agent.

---

You are investigating an interactive design prototype **before writing any production code**. Your only deliverable this session is an implementation plan grounded in what the prototype actually does. Do not modify the prototype. Do not scaffold the real app yet.

## Where the design lives

Root: `ui_kits/new_discover/`

- `experience.html` — the runnable prototype. Open this in a browser. It is the single source of truth for behavior.
- `src/exp-journeys.js` — the journey/state model (the spine: which states exist, which create history entries, which replace, which are drafts).
- `src/exp-data.js` — fixture data (areas, schools, listings, agricultural parcels, price bands).
- `src/Experience.jsx` — shell: mode state, history stack, cross-journey persistence.
- `src/ExpModeBar.jsx` — the Areas · Schools · Agricultural switcher.
- `src/ExpPanel.jsx` — results list, filters, back-to-results restoration.
- `src/ExpMap.jsx` — map, markers, clustering, mobile tap → listing preview sheet.
- `src/ExpSchools.jsx` — Schools-first journey (radius chips, school primary / listing secondary markers).
- `src/ExpAgri.jsx` — Agricultural journey (distance bands, hidden Buy/Rent).
- `src/components/cards.jsx`, `src/components/shared.jsx` — presentational pieces.

Supporting documents, read in this order:

1. `HANDOFF_INDEX.html` — map of the whole handoff.
2. `DESIGN_INTENT.md` — why the journeys are shaped this way.
3. `FUNCTIONAL_AUDIT.html` — the six resolved contradictions, the 9 explicit non-goals, the state/action matrix, and 13 open engineering questions. **This is the most important document.** The 13 questions are your agenda.
4. `DESIGN_STATE_MANIFEST.json` — enumerated states, machine-readable.
5. `NONREGRESSION_MATRIX.md` + `SCHOOLS_NONREGRESSION.md` — behaviors that must not break.
6. `VISUAL_RULES.md` — spacing, type, marker, and z-order rules.

Design system tokens live at the project root: `styles.css` and `tokens/`. The prototype consumes them; production must too.

## How to investigate — visually, not by reading code alone

Drive the prototype through every path and screenshot each distinct state. Reading the JSX is necessary but insufficient: the contradictions in this design were only visible when states were exercised in sequence.

Walk these explicitly:

**Areas-first (7 paths)** — single area select; multi-area select; area → listing detail → back to results (verify scroll position and list state are restored, not rebuilt); filter change while multiple areas are selected; zero-result recovery (confirm the recovery never silently changes scope kind); Buy → Rent switch (two separate inventories, monthly pricing on Rent); map cluster expand/collapse.

**Schools-first** — pick a school; change radius chips repeatedly (confirm each press *replaces* committed state and adds **no** history entry, and that chip counts come from the same filter-aware source as the results list); "Choose another school"; carry a multi-area selection from Areas into Schools and confirm it survives; confirm area markers name schools primary, listings secondary.

**Agricultural** — distance-band changes (same replace-not-push rule); confirm Buy/Rent is hidden but the previous residential value is preserved and restored on return to Areas.

**Mobile** — narrow the viewport; tap map markers and confirm a listing preview sheet opens; check the panel/map relationship and hit targets.

**Cross-journey** — switch modes in every direction and record exactly what persists, what resets, and what the back stack contains after each switch.

For each state capture: a screenshot, the mode, the committed scope, whether it pushed history, and what the back button does from there.

## What to produce

A single `IMPLEMENTATION_PLAN.md` containing:

1. **State model** — your proposed production state machine, mapped one-to-one against `DESIGN_STATE_MANIFEST.json`. Mark every transition as push / replace / draft / presentation-only. Any transition you cannot classify from the prototype is an open question, not a guess.
2. **Component tree** — production components mapped to prototype files, noting where the prototype's structure is a prototyping shortcut vs. an intentional boundary.
3. **Data contracts** — the shapes the UI needs, derived from `exp-data.js`, separating what is genuinely server-owned (inventory, school radius counts, clustering, agricultural bands) from what is client-derived. Flag every count the UI shows and say who computes it.
4. **Answers to the 13 engineering questions** in `FUNCTIONAL_AUDIT.html`, each with a recommendation and a cost note. Where the design deliberately deferred (URL addressability, reload survival), say what you need the design to decide before you can build.
5. **Non-goals, restated** — the 9 documented non-goals, so scope creep is visible if it happens.
6. **Risks** — ordered by likelihood of forcing a design change. Call out anything where the prototype's behavior is cheap in a fixture and expensive against a real backend (clustering, filter-aware counts, multi-area queries).

## Rules

- Treat the prototype as normative. If the code and the docs disagree, the prototype's observable behavior wins — and log the discrepancy.
- Do not invent states, filters, or affordances that are not in the prototype.
- Do not implement any of the 9 non-goals.
- Never redesign to make implementation easier. Raise it as a question instead.
- Ask before assuming any backend capability.
