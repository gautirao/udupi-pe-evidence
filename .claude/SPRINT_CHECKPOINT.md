=== ROLLING CHECKPOINT START ===
Sprint: 2-bugfix-routing
Sprint identity: Model B — milestone-based
  Milestone: 2-bugfix-routing (#8, open)
  Sprint label: sprint-bugfix-routing
  Project: RE Trends (PVT_kwHOAAVnaM4BSWI7) — item added, Sprint iteration waived
Current sprint iteration ID: WAIVED
Project item IDs: #757 → PVTI_lAHOAAVnaM4BSWI7zgqPVv4
Sprint issues: #757 Bugfix: missing area-key propagation + locality/map state desync in broker listing flow
Execution order: PR1 (#757-routing-audit) → PR2 (#757-addresspicker-reconciliation)
Dependencies: PR2 soft-depends on PR1 areaKey helper (speculative); serialised

Enriched specs: SEE .claude/sprint-enriched-specs.md

Last completed PR: #762 fix(frontend): AddressPicker reconciliation + forward geocode + title/locality gate (PR2 of #757)
Previous PR: #761 feat(frontend): buildAreaKey helper + areaKey routing audit (PR1 of #757)
Status: SPRINT COMPLETE
Integration validation: PASS

Gate record: eng=PASS | cr=APPROVE (all 3 blocking + 2 advisory fixed) | sr=N/A | e2e-author=DONE | e2e=PASS | proc=N/A
Evidence refs: eng=frontend-engineer | cr=code-reviewer | e2e=qa
Tests passed: YES (5 unit + 6 smoke + 3 AR E2E)
E2E passed: YES (6 smoke + AR1 + AR2 + AR3)

Touched files (PR2):
- src/components/broker/AddressPicker.tsx (modified — AC1–AC5, localityOverridden, onLocalityConfirmed, unmount cleanup, handleSelectResult fix)
- src/pages/broker/EditListing.tsx (modified — D1 hybrid: titleManuallyEdited, confirmedLocality, step4 warning banner, step1Complete bugfix)
- src/components/broker/__tests__/AddressPicker.test.tsx (new — 5 unit tests: AC14 forward-geocode, AC15 prop reconciliation)
- e2e/broker-address-reconciliation.spec.ts (new — AR1, AR2, AR3)

Touched files (PR1):
- src/lib/areaKey.ts (new — buildAreaKey helper, widened signature)
- src/lib/areaKey.test.ts (new — 13 unit tests)
- e2e/area-overview.spec.ts (AO8 + AO9 added)

Key decisions:
- geocodedRef as useRef<Set<string>> (not useState) — prevents stale closure + render cascade on cache update
- async IIFE + cancelled flag (no setTimeout debounce) — compatible with React 18 act(async) in tests
- Single unified useEffect on [initialLocality, initialLatitude, initialLongitude, toast] for AC1+AC2
- localityOverridden is client-only component state (no Flyway migration)
- handleSelectResult always updates query and resets localityOverridden (fix: prior guard left query stale)
- step1Complete fixed to use priceRupees (local state) not listing.price (server state)
- D1 gate: titleManuallyEdited + confirmedLocality; warning only in current session (by design — resets on reload)
- AR3 E2E: beforeAll pre-confirms address (addressConfirmed=true) so step-3 indicator is enabled from step-2; test uses Change→search→pick flow to fire onLocalityConfirmed
- buildAreaKey returns empty string for falsy/whitespace inputs — no malformed keys (PR1)
- Pipe characters in input pass through (callers responsible; JSDoc documented) (PR1)
- AO8/AO9 need [smoke] tag to be included in local E2E gate — follow-up (PR1, still pending)

Sprint-level conventions:
- CSS display-toggle for wizard panels (preserves image upload state — RE-31)
- buildAreaKey produces raw pipe-separated string; callers encodeURIComponent() at call site
- E2E: new spec file e2e/broker-address-reconciliation.spec.ts (AR tests for PR2)
- buildAreaKey signature is string|null|undefined — geocoding callers may supply null

Known temporary exceptions:
- AO8/AO9 lack [smoke] tag — not exercised by local E2E gate; add tag as follow-up
- D1 gate does NOT apply retroactively on page reload (titleManuallyEdited stays false) — by design for MVP

Reverted PRs: NONE

Next PR: NONE — Sprint complete. Issue #757 fully resolved via PR1 (#761) + PR2 (#762).
=== ROLLING CHECKPOINT END ===
