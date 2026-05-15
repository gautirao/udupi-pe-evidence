# Runtime Probe — fresh-spawn subagent tool-availability check

## Purpose

Verify what tools an agent **actually** has at runtime, distinguishing three
distinct layers:

| Layer | Definition |
|---|---|
| **Declared** | The tool name appears in the agent's `tools:` frontmatter list (`.claude/agents/<name>.md`). |
| **Schema-visible** | The tool name appears in the agent's runtime function schema (visible to the spawned subagent itself). |
| **Callable** | An attempt to invoke the tool succeeds (returns a real result, not a silent drop or harness-level rejection). |

These are nested: `declared ⊇ schema-visible ⊇ callable`. Each inclusion can be
strict — the harness can drop names between layers. #1093 documented the case
where `Bash` was schema-visible but not callable, and `Write`/`Edit` were
declared but absent from the schema entirely.

## When this probe is REQUIRED

A runtime probe MUST be run **before** a PR is merged when the diff touches any
of:

- `.claude/agents/**`
- `.claude/skills/**`
- agent tool declarations (`tools:` frontmatter)
- subagent routing logic
- harness / tool-provisioning configuration
- authority flags (`may_*`)
- gate execution code
- OpenAI gate invocation
- Task / subagent routing

The probe evidence MUST appear in the WORKDONE_REVIEW packet's `[runtime_probe]`
section. Static evidence (agent definition diff, code review) is necessary but
not sufficient for runtime claims.

## Rule (binding)

> **Static evidence can prove only static claims. Runtime claims require runtime
> evidence before merge.**

If the change asserts "Team Lead now has Bash" or "specialist X now receives
tool Y at runtime", that assertion requires a fresh-spawn runtime probe before
the PR can merge. A frontmatter diff alone is insufficient evidence for any
runtime-availability claim.

## Behavioural-only rule (post-#1096)

For any runtime claim about `Task` callability, the probe MUST be **behavioural** — the agent under test must actually invoke a no-op specialist via `Task` and the specialist's verbatim sentinel response must be captured. Self-report of "Task is in my function schema" is explicitly **rejected** evidence. The #1093 false-positive arose precisely because schema-visible tools were treated as callable; the AT01 evidence in `.claude/handoffs/agent-team-probe/at01-evidence.txt` proved this in the opposite direction (an Agent Teams teammate's schema looked identical to a subagent's but the teammate could actually invoke Task).

The harness invariant **"`Task` is not available inside subagents"** (`.claude/hardening/team-lead-orchestration-stability-report.md`) is now the baseline assumption. Any change that asserts a subagent has Task callability is rejected at runtime-probe acceptance unless the probe shows a real sentinel return.

For Agent Teams Mode-3 (`/mode3-run`), the executor teammate's behavioural sentinel probe in `mode3-run.md` Phase 0.2 is the binding pre-flight. The lead reads the sentinel from `.claude/handoffs/issue-<N>/preflight-probe.txt`; the executor's plain pane output is not authoritative.

## Probe design

### Inputs
- `target_agent` — e.g. `team-lead`, `frontend-engineer`
- `target_model` — e.g. `haiku`, `sonnet`, `opus` (matches the production
  invocation pattern; do NOT probe on a different model than production uses)
- `tools_under_test` — list of tool names the change claims to affect (e.g.
  `["Task", "Bash", "Write", "Edit"]`)

### Hard constraints
- The probe MUST spawn a **fresh** subagent. Do NOT resume an existing agent via
  SendMessage and treat its toolkit as canonical — a resumed agent's schema may
  reflect prior session state, not the post-merge configuration.
- The probe MUST NOT be run by the same Main Agent session that just edited the
  target agent's frontmatter unless the harness reloads agent definitions
  between calls. When in doubt, run the probe in a fresh Claude Code session
  after merge.
- The probe MUST attempt actual invocation for each `tool_under_test` — schema
  inspection alone is insufficient.

### Probe steps (subagent prompt)

The probe asks the target subagent to perform, in order:

1. **Self-report declared tools.** State the tools listed in its function
   schema (the subagent's view of what it has).
2. **Bash callability probe.** Attempt `rtk pwd` (or any no-op command).
   Report: `BASH_CALLABLE` / `BASH_SCHEMA_ONLY` / `BASH_ABSENT`.
3. **Write callability probe.** Attempt to write a no-op probe artefact at
   `.claude/handoffs/issue-NNN/runtime-probe/probe-out.toml` containing a
   single line. Report: `WRITE_CALLABLE` / `WRITE_SCHEMA_ONLY` / `WRITE_ABSENT`.
4. **Edit callability probe.** Attempt to edit the artefact just written.
   Report: `EDIT_CALLABLE` / `EDIT_SCHEMA_ONLY` / `EDIT_ABSENT`.
5. **Task callability probe** (optional — skip if no specialist routing
   is in scope of the change). Attempt to invoke a no-op specialist.

### Probe output (structured text returned to Main Agent)

The probe subagent returns a structured block:

```
runtime_probe:
  target_agent = "<name>"
  target_model = "<model>"
  declared_tools = [...]            # from agent frontmatter (caller knows this)
  schema_visible_tools = [...]      # what the subagent sees in its schema
  callable_tools = [...]            # what actually executed without error
  results:
    Task = CALLABLE | SCHEMA_ONLY | ABSENT
    Bash = CALLABLE | SCHEMA_ONLY | ABSENT
    Read = CALLABLE | SCHEMA_ONLY | ABSENT
    Write = CALLABLE | SCHEMA_ONLY | ABSENT
    Edit = CALLABLE | SCHEMA_ONLY | ABSENT
    Grep = CALLABLE | SCHEMA_ONLY | ABSENT
    Glob = CALLABLE | SCHEMA_ONLY | ABSENT
  notes = "free-text observations (timing, error messages, etc.)"
```

Main Agent records the full block verbatim in the WORKDONE_REVIEW packet's
`[runtime_probe]` section.

## Probe acceptance criteria (per change)

The PR is **probe-acceptable** when ALL of the following hold:

1. The probe was run on the same `target_model` used in production for the
   affected workflow.
2. The probe attempted actual invocation for every tool in `tools_under_test`,
   not merely schema inspection.
3. The probe's `callable_tools` set matches the change's runtime claim:
   - If the change claims "tool X is now callable", `X ∈ callable_tools`.
   - If the change claims "the design no longer relies on tool Y", the absence
     of `Y` from `callable_tools` is acceptable.
4. Any divergence between `declared_tools`, `schema_visible_tools`, and
   `callable_tools` is documented in the probe report's `notes` field.

## No-bypass invariant

The RUNTIME_PROBE rule is additive. It does not replace or weaken any
existing gate. PLAN_REVIEW, scope-lock, code-reviewer, security-reviewer,
QA, WORKDONE_REVIEW, PR_REVIEW, and the Main Agent 8-point intake checklist
remain mandatory whenever they were mandatory before. The probe adds runtime
evidence for runtime claims; it never removes a check.

## When a probe is NOT required

The probe is NOT required when the PR touches none of the trigger paths above
— e.g. product code under `src/**`, `backend/**`, `supabase/**`, migrations,
E2E specs, dependency manifests, or workflow docs that do not assert runtime
tool behaviour. Routine PRs continue under the standard ROUTE_AND_RUN flow.

## Background

- #1090 — first surfaced the frontmatter-syntax issue (`Task(...)` compound
  form silently dropped). Fixed in PR #1092.
- #1093 — surfaced the harness-layer filtering issue (Bash schema-visible but
  not callable; Write/Edit not in schema). Path B design + this RUNTIME_PROBE
  rule are the resolution.
- #1086 — the original Mode-3 trial that exposed the gap when production
  fell back to Main Agent direct orchestration with user authorisation.
