# Current PR Capsule

PR: #931
Title: [FE][AUDIT+EPIC] Global UI theme alignment — migrate to mock design system

## Acceptance Criteria
- `src/index.css` `:root --primary` → dark navy `244 81% 4%` (mock: `#030213`)
- `src/index.css` `:root --primary-foreground` → white `0 0% 100%`
- `src/index.css` `:root --ring` → neutral gray `0 0% 71%`
- `src/index.css` `:root --sidebar-primary` + `--sidebar-ring` updated to dark navy / neutral gray
- `.dark` block: `--primary`, `--ring`, `--sidebar-primary` etc. updated to match mock dark-mode values
- `--pin-house` and `--chart-1` UNCHANGED (intentional orange)
- No regression on homepage appearance
- Buttons, chips, focus rings, marker clusters render in dark navy

## Out of Scope
- TSX/component file changes (cascade handles it)
- --accent, --secondary changes
- Typography or spacing changes

## Touched Files Hint
- src/index.css — ONLY file changed; CSS variable values in :root and .dark blocks
