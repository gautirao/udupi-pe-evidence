# #1956 planning artifacts — authoritative execution contract

These files were previously kept only under the gitignored
`.claude/handoffs/issue-1956/` directory and existed on local disk alone,
with no durable, version-controlled copy. This directory is the committed,
durable record.

- `pr-delivery-plan-pr-b.md` — the locked revision 4.2 six-PR delivery plan
  for #1956 (summarized in GitHub issue #2026).
- `final-mock-reconciliation.md` — the three-way design reconciliation
  (summarized in GitHub issue #2027).
- `team-lead-plan-pr-b.toml` — the structured PLAN_REVIEW-approved plan
  packet underlying the above.

Authority chain: #2025 (current upstream prerequisite) → #2026 (this
directory's `pr-delivery-plan-pr-b.md`, six-PR plan) → #2027 (this
directory's `final-mock-reconciliation.md`) → #1956 / #2014 (product
contract).

These are frozen snapshots as of 2026-07-28. If the locked plan is amended,
update both the GitHub issue and this file in the same PR so they never
diverge.
