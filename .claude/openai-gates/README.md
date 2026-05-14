# .claude/openai-gates/

This directory stores durable artifacts from OpenAI gate automation runs.

## Structure

```
.claude/openai-gates/
  INDEX.md                          # Append-only index of all runs
  issue-<N>/
    <timestamp>-<gate>/
      input-packet.toml             # Copy of the input packet
      raw-response.txt              # Key-redacted raw API response
      verdict.json                  # Parsed verdict
      verdict.toml                  # TOML verdict summary
      transcript.md                 # Human-readable transcript
      metadata.json                 # Model, usage, timestamps (no secrets)
      error.json                    # Present only on error runs
```

## Gitignore Policy

Only `.gitkeep` and this `README.md` are committed. All run artifacts
(subdirectories, INDEX.md) are gitignored. This prevents API keys, raw
responses, or sensitive gate packets from ever being committed.

To inspect past runs locally:
```bash
ls .claude/openai-gates/
cat .claude/openai-gates/INDEX.md
cat .claude/openai-gates/issue-1078/<timestamp>-PLAN_REVIEW/verdict.json
```

## Security

- Raw responses are key-redacted before writing.
- Transcripts and metadata never contain auth headers, keys, or request bodies.
- Input packets are scanned for secrets before submission (see `openai_gate.py`).
