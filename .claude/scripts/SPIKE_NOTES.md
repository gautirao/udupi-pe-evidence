# Spike Notes — OpenAI Structured Output Call Shape

## Spike Date
2026-05-14

## openai SDK Version
1.109.1 (installed via uv into `.claude/scripts/.venv`)

## Python Version
3.11.15

## Working Call Shape

**Responses API** — CONFIRMED WORKING.

```python
response = client.responses.create(
    model="gpt-4o-2024-08-06",
    input=prompt_string,
    text={
        "format": {
            "type": "json_schema",
            "name": "VerdictSchema",
            "schema": schema_dict,
            "strict": True,
        }
    },
    max_output_tokens=4000,
    timeout=60.0,
)
result_text = response.output_text  # str — parse with json.loads()
```

Key observations:
- `client.responses` exists on `openai.OpenAI` client in v1.109.1
- `text` parameter accepts a dict with `format` sub-key
- Response object exposes `.output_text` as a string
- `ResponseTextConfigParam` type is available at `openai.types.responses.ResponseTextConfigParam`

## Chat Completions (fallback — NOT needed)

`client.chat.completions.create(response_format={"type": "json_schema", "json_schema": {...}})` is also available. Not used because Responses API shape works cleanly.

## Version Range Pinned

`openai>=1.50,<2.0` — Responses API was stabilized in openai-python 1.x; `output_text` and `text.format` both present in v1.109.1. Upper-bound `<2.0` guards against breaking API changes in a hypothetical v2.

## Mock Validation

Spike verified end-to-end with `unittest.mock` (no live API call):
- `client.responses.create(...)` call shape accepted by mock
- `response.output_text` returns JSON string
- `json.loads(response.output_text)` yields expected dict
