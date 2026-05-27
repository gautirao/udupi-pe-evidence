# Team Lead Orchestration Stability — Hardening Log

> **Status note:** This document is retained as a dated design/history record. Some recommendations were superseded by the current Mode-3 Agent Teams / routing-authority workflow. Treat current workflow contracts and `.claude/commands/mode3-run.md` as authoritative.

Branch: `hardening/team-lead-orchestration-stability`
Base sha: `0eb211e8af3eaca2d503a90fa31da6ef86cccbfb`
Started: 2026-05-15

## Baseline
- `.claude/agents/team-lead.md` frontmatter: `tools: Task, Read, Grep, Glob` ✅
- model: opus (Mode 3 caller passes `model: "haiku"`)
- permissionMode: default
- Authority flags (line 15): explicit "no Bash/Write/Edit" — Path B
- No product code changes on branch.

## Probe Design — Behavioural

A passing probe REQUIRES evidence the specialist actually executed. Specialist must echo a sentinel string. Self-report by Team Lead is rejected.

### Sentinel protocol
Team Lead is instructed:
> Invoke subagent_type=qa-fast via Task. Pass prompt:
> "Sentinel probe. Reply with EXACTLY this line and nothing else: PROBE_OK_<TRIAL_ID>"
> Then return the specialist's verbatim response prefixed with `SPECIALIST_RESPONSE:`.

Pass = Team Lead's final message contains `SPECIALIST_RESPONSE: PROBE_OK_<TRIAL_ID>`.
Fail modes:
- F1: Team Lead reports Task tool not available
- F2: Team Lead claims success but returns no sentinel
- F3: Specialist invoked but returned non-sentinel content
- F4: Team Lead refuses (policy/scope)
- F5: Other / harness error

## Trials
| #   | model   | target        | prompt-variant      | result | failure-mode | verbatim error |
|-----|---------|---------------|---------------------|--------|--------------|----------------|
| T01 | haiku   | qa-fast       | full Mode-3         | FAIL   | F1 Task absent | "Task tool not available in this runtime environment" |
| T02 | haiku   | qa-fast       | full Mode-3         | FAIL   | F1 Task absent | "Task is not available inside subagents" |
| T03 | haiku   | qa-fast       | full Mode-3         | FAIL   | F1 Task absent | "no Task tool in my available function set" |
| T04 | sonnet  | qa-fast       | concise             | FAIL   | F1 Task absent | "Task tool is not available in this environment" |
| T05 | default (opus) | qa-fast | concise             | FAIL   | F1 Task absent | "Task tool is not available in this agent's tool set" |
| T06 | haiku   | qa-fast       | minimal (no framing)| FAIL   | F1 Task absent | "Tool 'Task' is not available" |
| T07 | haiku   | code-reviewer | concise, different target | FAIL | F1 Task absent | "No such tool available: Task. Task is not available inside subagents." |

**Pass rate: 0/7 across all models, prompts, targets.** Failure mode is deterministic and harness-level, not stochastic. The canonical error string (T07, T02) confirms: `Task is not available inside subagents`.
