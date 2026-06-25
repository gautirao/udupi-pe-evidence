# Contract: Validation Discipline

This contract defines the repository validation standards required for Antigravity Mode 3 runs.

## 1. Authoritative Frontend Correctness

Root `tsc --noEmit` is NOT authoritative. All frontend TypeScript verification MUST execute:
```bash
node node_modules/.bin/tsc --noEmit -p tsconfig.app.json
```

## 2. Baseline-vs-Branch Comparison

If TypeScript baseline errors already exist on `main`, agents must isolate net-new errors using a baseline-vs-branch comparison tuple:
```text
file + TS code + normalized message
```
Do not claim "0 net-new TS errors" unless this exact comparison methodology was executed.

## 3. Evidence Quality

A test is reported as `PASS` only if the command exited 0 AND assertions executed. If environment connection errors occur (e.g., `ERR_CONNECTION_REFUSED`), report `TEST_ENV_FAILURE`.
