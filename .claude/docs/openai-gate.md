# openai-gate.md — OpenAI Gate Automation CLI

## Overview

`openai_gate.py` submits route-and-run gate packets to the OpenAI API and returns a strict, machine-parseable verdict. It is the local automation layer for PLAN_REVIEW and other gate types.

## Security Model

- `OPENAI_API_KEY` is read from the environment ONLY. It is never written to disk, logged, or echoed in any code path, including error paths.
- All input files are scanned for likely secrets before submission. Matches produce pattern name + line number only — content is never echoed.
- Raw API responses are key-redacted before writing to disk.
- Transcripts and metadata files never include auth headers, keys, or request bodies.

## Prerequisites

```bash
# Python 3.11+ required
cd .claude/scripts
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Or with uv:

```bash
uv venv .claude/scripts/.venv
uv pip install -r .claude/scripts/requirements.txt
```

### Optional: pytest for running the test suite

`pytest` is intentionally NOT in `requirements.txt` — the script itself has no runtime dependency on it. If you want to run `.claude/scripts/tests/`, install it manually into your dev venv:

```bash
.claude/scripts/.venv/bin/pip install 'pytest>=7.0,<9.0'
.claude/scripts/.venv/bin/pytest .claude/scripts/tests/ -v
```

## Environment Setup

```bash
export OPENAI_API_KEY="sk-..."   # required for non-dry-run invocations
```

The key must be set before invocation. Missing key → exit 2 with message "OPENAI_API_KEY is not set".

## Usage

### Dry-run (no key required)

```bash
python .claude/scripts/openai_gate.py \
  --dry-run \
  --issue 1078 \
  --gate PLAN_REVIEW \
  --input .claude/handoffs/issue-1078/002-plan-review-request.toml
```

Prints preview of issue, gate, model, input-chars, output-dir. No API call.

### Live PLAN_REVIEW

```bash
python .claude/scripts/openai_gate.py \
  --issue 1078 \
  --gate PLAN_REVIEW \
  --input .claude/handoffs/issue-1078/002-plan-review-request.toml \
  --model gpt-4o-2024-08-06
```

On APPROVED verdict: writes `current-approved-plan.toml` and related state files.

### All CLI flags

| Flag | Default | Description |
|------|---------|-------------|
| `--issue` | required | GitHub issue number |
| `--gate` | required | Gate type: PLAN_REVIEW, WORKDONE_REVIEW, PR_REVIEW, SCOPE_CHANGE_REVIEW |
| `--input` | required | Path to TOML packet file |
| `--model` | gpt-4o-2024-08-06 | OpenAI model |
| `--dry-run` | false | Preview only, no API call, no key needed |
| `--max-attempts` | 1 | Max API call attempts |
| `--max-input-bytes` | 65536 | Max input file size (64 KB) |
| `--max-output-tokens` | 4000 | Max output tokens |
| `--timeout-seconds` | 60 | API call timeout |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success (see verdict.json) |
| 2 | OPENAI_API_KEY not set |
| 3 | Malformed/invalid API response |
| 4 | Input file not found |
| 5 | Input file too large |
| 6 | Input file contains likely secret |
| 7 | Network timeout |
| 8 | API error (auth/quota/5xx) |

## Artifacts

Run artifacts are written to `.claude/openai-gates/issue-<N>/<timestamp>-<gate>/`:

| File | Description |
|------|-------------|
| `input-packet.toml` | Copy of the input packet |
| `raw-response.txt` | Key-redacted raw API response |
| `verdict.json` | Compact allowlisted verdict shape (see below) |
| `verdict.toml` | Same compact shape in TOML format |
| `transcript.md` | Full human-readable run transcript (post-redaction) |
| `metadata.json` | Model, usage, timestamps (no secrets) |
| `error.json` | Present only on error runs |

The `INDEX.md` in `.claude/openai-gates/` is append-only — each run adds one row.

**Note:** Only `.gitkeep` and `README.md` are committed. All run artifacts are gitignored.

## Verdict artifact shape

`verdict.json` and `verdict.toml` contain exactly 13 fields (the compact allowlist). Full AI-generated narrative is available in `transcript.md`.

**Backward-compat note:** `verdict.json` is audit-only. Consumers must read `transcript.md` for the full human-readable narrative.

```json
{
  "gate": "PLAN_REVIEW",
  "issue": 1080,
  "verdict": "APPROVED",
  "model": "gpt-4o-2024-08-06",
  "ts_start": "2026-05-14T18:00:00Z",
  "ts_end": "2026-05-14T18:00:03Z",
  "request_id": "resp_abc123...",
  "confidence": null,
  "reasons_summary": "Approved. Implementation...",
  "blocking_issue_count": 0,
  "required_change_count": 0,
  "blocking_issues_summary": [],
  "required_changes_summary": []
}
```

**Field caps (applied before persistence):**

| Field | Cap |
|-------|-----|
| `reasons_summary` | 500 characters (marker-inclusive) |
| each item in `blocking_issues_summary` | 200 characters (marker-inclusive) |
| each item in `required_changes_summary` | 200 characters (marker-inclusive) |
| `blocking_issues_summary` list length | 5 items max |
| `required_changes_summary` list length | 5 items max |

**Truncation policy:** body is clipped to `cap - len("... [truncated]")` then the marker is appended. Total field length is always `<= cap`.

**Count fields:** `blocking_issue_count` and `required_change_count` reflect the TRUE total from the API response, not the truncated list length.

**`confidence`:** Forward-compat placeholder. The OpenAI Responses API does not supply confidence scores for text generations. This field is reserved for future use and is always `null` in `verdict.json` and `""` (empty string) in `verdict.toml`.

**`request_id`:** Captured from `response.id` (OpenAI Responses API). `null` in `verdict.json` / `""` in `verdict.toml` when the SDK response object has no `id` attribute.

**TOML null sentinel:** TOML 1.0 has no `null` keyword. Fields that are `null` in `verdict.json` are serialized as `""` (empty string) in `verdict.toml`. Consumers reading `verdict.toml` should treat `""` as "not set". Use `verdict.json` when you need the distinction between `null` and an empty string.

## Approved-Plan Materialization

> **TOML injection hardening:** All AI-controlled string fields in `last-chatgpt-verdict.toml` (notably `next_action` and `approved_at`) are serialized via `_toml_str_value`, which escapes double-quotes, backslashes, newlines, carriage returns, and tabs — preventing TOML injection from adversarial `next_action` payloads.

PLAN_REVIEW APPROVED verdict writes:
- `.claude/state/current-approved-plan.toml` — byte-copy of input packet
- `.claude/state/last-chatgpt-verdict.toml` — verdict summary
- `.claude/state/active/EXECUTOR_PROMPT.md` — rendered from template
- `.claude/state/active/RESUME_CHECKPOINT.md` — checkpoint for resume

Any other verdict (REVISION_REQUIRED, BLOCKED, etc.) — these files are NOT written or touched.

## Running Tests

```bash
pytest .claude/scripts/tests/ -v
```

All tests use mocked OpenAI client. No live API call or key required in CI.

## SDK Notes

See `.claude/scripts/SPIKE_NOTES.md` for spike findings. Verified shape:

```python
# openai >= 1.50, < 2.0
response = client.responses.create(
    model="gpt-4o-2024-08-06",
    input=prompt,
    text={"format": {"type": "json_schema", "name": "VerdictSchema",
                     "schema": schema, "strict": True}},
    max_output_tokens=4000,
    timeout=60.0,
)
result = json.loads(response.output_text)
```
