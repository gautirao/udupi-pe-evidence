# Antigravity Mode 3 Parity Infrastructure

This directory contains the disciplined workflow configuration for Antigravity (Google Antigravity / Gemini CLI), designed to provide full conceptual and practical parity with Claude's `/mode3-run` workflow.

## Design Decision: Directory Structure

Antigravity natively discovers `.agents/` for standard trigger-matched workspace skills and `AGENTS.md` for global navigation rules. However, to maintain process discipline, issue lifecycle, validation expectations, and cross-tool handoff compatibility with Claude's `.claude/` ecosystem, this repository adopts a dedicated `.antigravity/` workflow infrastructure.

This provides an exact structural parallel to `.claude/`:
- `.antigravity/commands/` mirrors `.claude/commands/` and `.claude/skills/`
- `.antigravity/agents/` mirrors `.claude/agents/`
- `.antigravity/contracts/` mirrors `.claude/mode3/contracts/`
- `.antigravity/templates/` mirrors `.claude/templates/`
- `.antigravity/scripts/` mirrors `.claude/scripts/`

See `docs/ai-workflows/antigravity-mode3-parity.md` for full operational documentation, cross-tool handoff protocols, and architecture comparisons.
