## Implementation Summary
<1-2 paragraph description of changes made to resolve the issue>

## Intake Triage & Routing
```text
Summary: <1 line description>
Type: {bugfix | small-change | feature | refactor | perf | security | incident | ui | test}
Scope: {single-service | multi-service | cross-cutting}
Risk: {low | med | high} — <rationale>
Routing: <subagent execution chain>
```

## Evidence & Verification
- **Authoritative Typecheck**: `node node_modules/.bin/tsc --noEmit -p tsconfig.app.json` (<PASS / FAIL>)
- **Baseline Isolation**: <Details of baseline-vs-branch comparison tuple diffing>
- **Automated Tests**: <Commands run and exit codes>
- **Browser Verification**: <Manual observed URLs or screenshot evidence>

## Merge Recommendation
STATUS: READY_TO_MERGE / NEEDS_USER_DECISION
> **Note**: No agent or model tier may execute merge commands without explicit human user approval in the active chat turn.
