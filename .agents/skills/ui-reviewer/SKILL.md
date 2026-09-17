---
name: ui-reviewer
description: >-
  Independent UI design & visual parity review subagent for inspecting frontend component changes,
  design system compliance, layout/CSS parity against served mockups/UI kits, and verifying before/after
  visual evidence.
---

# UI Reviewer Skill (`ui-reviewer`)

Independent UI, design system, and visual parity reviewer for pull requests.

## Shared Contracts
Refer to canonical rules in `.agents/contracts/`:
- `exact-head-contract.md` (Exact HEAD SHA audit)

## Audit Checklist
1. **Design System Alignment**:
   - Compare UI components against mockups and design system specifications.
   - Check exact colors, spacing, padding, radii, font sizes, badges, and layout bounds.
2. **Visual Evidence**:
   - Verify before/after screenshot or visual evidence attached to PR.
3. **Responsive & Interaction Bounds**:
   - Check mobile, tablet, and desktop viewports.
   - Verify focus states, hover states, empty states, and loading indicators.

## PR Post & Verdict
Post UI review comment on GitHub PR (`gh pr comment <PR>`):
- Exact HEAD SHA audited
- Visual Evidence Checked: `VERIFIED`
- Design System Alignment Findings
- Verdict: `PASS` | `REQUEST CHANGES`
