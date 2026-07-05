# Discover City Landing Visual Polish — Audit & Verification Evidence

This folder contains the automated verification evidence and visual comparison against the approved ReTrends UI Kit (`docs/design/retrends-design-system/ui_kits/discover/index.html`) following the implementation of visual polish on the neutral city landing page after #1745.

## 1. Summary of Changes & Mock Alignment

| Section / Component | Previous State | Polished ReTrends Alignment State |
| :--- | :--- | :--- |
| **Editorial Hero** | Basic spacing, helper copy placed below controls card | Tightened spacing (`mb-3.5`), Fraunces typography, and moved pricing helper text (`Showing sale prices in ₹...`) **above** the controls card per `DiscoverPanel.jsx`. |
| **Controls Alignment** | Mismatched heights between `CitySelect` and `IntentSelector` | Added `h-11` (44px) exact height matching and flex centering to `IntentSelector` buttons when `fill` is active for exact baseline/top alignment. |
| **Section Hierarchy & Order** | Macro-region buttons placed above journey CTA cards | Reordered sections per UI Kit: **Journey CTA cards first** (`Choose how you want to search`), followed by **Macro-region cards second** (`Or start with a region`) with a subtle divider. |
| **Macro-Region Cards** | Small 2-3 column grid of basic buttons | Rebuilt as vertical rich cards (`RegionCard` in `cards.jsx`) with 44x44 icon boxes, editorial cues (e.g. *Airport & northern growth corridor*), monospace counts, and hover lift/border animations. |
| **Macro-Region Map Bubbles** | Regular copper markers or fallback points | Rebuilt in `AreaMarkerLayer.tsx` as 86x86 circular navy ReTrends bubbles with bold monospace property counts and short region labels. |
| **Loading & Error States** | Basic text or small skeletons | Updated loading skeletons to full card dimensions (`h-[72px] rounded-xl`) and error state to a calm, bordered box (`bg-muted/30 p-4 rounded-xl`). |

## 2. Automated Test Evidence

All automated unit, routing, and end-to-end tests completed successfully with **0 exit code** and **all assertions executed**:

### Unit & Routing Tests
```toml
[test_evidence]
test_type = "unit/integration"
command = "npm test -- src/components/discover/__tests__/DiscoverRightPanel.test.tsx src/components/discover/__tests__/DiscoverRightPanel.routing.test.tsx src/pages/__tests__/MapDiscovery.issue1745-batchB-overviewClick.test.tsx"
exit_code = 0
assertions_executed = true
status = "PASS"
notes = "87/87 tests passed across DiscoverRightPanel, routing state machine, and overview area click routing."
```

### End-to-End Playwright Verification
```toml
[test_evidence]
test_type = "e2e"
command = "npm run test:e2e:local -- --project=full capture-discover-city-landing-polish.spec.ts"
exit_code = 0
assertions_executed = true
status = "PASS"
evidence_path = "docs/audit/evidence/discover-city-landing-polish/"
notes = "4/4 full e2e browser tests passed across desktop (1440x900) and tablet (768x1024) viewports."
```

## 3. Screenshot Evidence Inventory

The following full-page screenshots were captured during automated e2e execution:

1. [Desktop City Landing](./1_desktop_city_landing.png) — Desktop landing page at 1440x900 viewport showing hero, controls card, journey CTAs first, and macro-regions second.
2. [Tablet City Landing](./2_tablet_city_landing.png) — Tablet landing page at 768x1024 viewport verifying responsive centered layout (`max-w-[580px]`).
3. [Hover Intent Switcher](./3_hover_intent_switcher.png) — Hover interaction state over the Buy/Rent segmented control.
4. [Hover Journey Card](./4_hover_journey_card.png) — Hover interaction state over the *Explore by neighbourhood* journey CTA card showing shadow lift and border highlight.
5. [Macro Region Selected](./5_macro_region_selected.png) — Active state after clicking *North Bangalore* region card, verifying visual highlight (`border-[hsl(var(--copper))] bg-[hsl(var(--copper)/0.08)]`) and URL state lockstep (`&scope=north`).
6. [Macro Region Cleared](./6_macro_region_cleared.png) — State after clicking the *Clear* affordance, verifying URL state resets cleanly without full page reload.
