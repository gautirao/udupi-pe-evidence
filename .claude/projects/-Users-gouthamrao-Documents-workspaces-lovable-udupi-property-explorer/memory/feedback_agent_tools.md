---
name: Agent tool requirements
description: Agents should use jcodemunch and rtk tools wherever possible
type: feedback
---

Always instruct spawned agents to use jcodemunch MCP tools for code navigation and rtk for CLI commands where applicable.

**Why:** User explicitly requested this in session on 2026-03-29.

**How to apply:** When writing agent prompts, include an explicit note like: "Use jcodemunch MCP tools (search_symbols, get_file_content, etc.) for code navigation. Use rtk for CLI/git commands where available."
