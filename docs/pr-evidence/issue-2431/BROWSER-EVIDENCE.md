# Issue #2431 — Browser evidence, and a blocking finding

Captured against the live stack (`dev-worktree-stack.sh --frontend-port 5201 --backend-port
8101`) at branch `05d7e1cc`, Playwright/Chromium, both required viewports. Raw output:
`screenshots/playwright-results.json`.

## What the browser confirms

| | desktop 1366x768 | mobile 390x844 |
|---|---|---|
| `subtype=SHOP` survives cold load + navigation | yes | yes |
| `type=commercial` survives | yes | yes |
| "Property Type" control rendered | yes | yes |
| Shop / Office controls present | **no** | **no** |

The URL contract works in the real app on both viewports: a shared
`?city=udupi&type=commercial&subtype=SHOP&journey=area-first` link keeps both params intact
through journey entry, group selection and the listings drill-in.

The backend filter also demonstrably applies — the group row reads "Kunjibettu & Udupi, 1
listing" against a city-wide total of 141, because `type=commercial` narrowed it.

## BLOCKING FINDING — the Shop/Office affordance is not reachable by a buyer

The lane brief specified adding the affordance "inside the existing `PropertyTypeFilter` under
the Commercial family". That was done, and it is unit-tested. **But `PropertyTypeFilter` is not
the control a buyer sees in the Discover journey.**

What actually renders in the panel, at both viewports:

```
quick-chip-all, quick-chip-apartment, quick-chip-villa, quick-chip-land,
quick-chip-ready-to-move, quick-chip-2-bhk, quick-chip-3-bhk,
quick-chip-budget-any, quick-chip-budget-5000000, ...
```

That chip row comes from `AreaSelectedPanel.tsx`, whose `PROPERTY_TYPE_LABELS` map is:

```ts
const PROPERTY_TYPE_LABELS: Record<string, string> = {
  apartment: 'Apartments',
  villa: 'Villas',
  land: 'Plots',
};
```

There is **no commercial entry at all**. `PropertyTypeFilter.tsx` reaches the screen only via
`MapFilters`, which is rendered by `useDiscoverFilterChromeController` — a surface that did not
mount in any flow reachable here (area-first journey → group → "Browse all listings").

### Consequence for the Definition of Done

> - [ ] Shop and Office are selectable and distinguishable in Discover.

This is **not met by the frontend change as scoped**. Everything behind the control works and
is tested end to end — the URL contract, the request wiring, the query, both read models, both
engines. What is missing is a control the buyer can actually click, because the panel they see
does not offer the Commercial family in the first place.

### Why this was not fixed here

Adding Commercial (and then Shop/Office) to the `AreaSelectedPanel` chip row is a different
change from the one this lane was scoped to: it introduces new buyer-facing chips, which is
design territory that overlaps #2429 (the design companion, still pending) and #2430 (which
owns commercial labelling and `propertyTypeConfig.ts`). Making that call unilaterally would
expand this PR into the surface two other lanes own, and would invent commercial chip
labelling ahead of the design that is meant to define it.

It is surfaced here as a decision for the owner rather than silently absorbed or quietly left
unmentioned.

### Options

1. **Extend `AreaSelectedPanel`'s chip row** in this PR to include Commercial, plus Shop/Office
   when Commercial is active. Smallest path to the DoD; needs a ruling because it crosses into
   #2429/#2430 territory and invents chip copy.
2. **Land this PR as the contract and read model**, and let the lane that owns the buyer panel
   surface the control against the #2429 design. Everything here is ready for it: the filter
   state, the URL param and the request wiring are all in place, so that lane adds a control
   and nothing else.
3. **Mount the existing `MapFilters` chrome** in the Discover journey. Largest blast radius and
   almost certainly wrong to decide from inside this issue.

Recommendation: **option 2**, with option 1 acceptable if the owner wants the DoD closed in one
PR and will accept chip copy landing ahead of #2429.

## Screenshots

- `screenshots/desktop-1366x768-discover-panel.png`
- `screenshots/mobile-390x844-discover-panel.png`

Both show the live panel with the subtype params intact in the address bar and the chip row
that lacks any commercial option.

---

## Back / Forward restoration — real browser history, both viewports

`history.back()` and `history.forward()` are exactly what a buyer's Back and Forward buttons do.
The subtype control itself is not reachable in the panel (see the finding above), so this drives
the URL contract directly and asserts what the app reads back out of the URL at each step.

Raw output: `screenshots/backforward-results.json`. Command exited 0 with
`ALL_VIEWPORTS_RESTORATION_PASS = true`.

| Step | Expected `subtype` | desktop 1366x768 | mobile 390x844 |
|---|---|---|---|
| 1. load without subtype | absent | absent | absent |
| 2. navigate to `subtype=SHOP` | SHOP | SHOP | SHOP |
| 3. navigate to `subtype=OFFICE` | OFFICE | OFFICE | OFFICE |
| 4. **Back** | SHOP | SHOP | SHOP |
| 5. **Back** again | absent | absent | absent |
| 6. **Forward** | SHOP | SHOP | SHOP |
| 7. **Forward** again | OFFICE | OFFICE | OFFICE |

Every step matches on both viewports, including the two that would catch the most likely
defects: step 5 (Back past the first subtype must return to *no* filter, not to a sticky
leftover value) and step 6 (Forward must restore the intermediate entry rather than jumping to
the newest one).

Screenshots: `screenshots/*-back-restores-shop.png`, `screenshots/*-forward-restores-office.png`.
