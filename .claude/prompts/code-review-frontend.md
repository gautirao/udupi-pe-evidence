# Frontend Review Brief Template

Use the `code-reviewer` agent with the following review brief.

```
review_mode: frontend

stack_context:
- React 18
- Vite
- TypeScript
- React Router
- TanStack Query
- React Hook Form
- Zod
- Tailwind
- shadcn/ui
- Vitest
- Testing Library

pr_summary:
- <insert 2-6 bullet summary of what changed>

change_intent:
- <insert the functional goal of the change>
- <what behavior is being added/fixed/refactored>
- <what the UI/data flow is supposed to achieve>

changed_files:
- <file 1>
- <file 2>
- <file 3>

focus_areas:
- correctness
- React best practices
- Vite/TypeScript best practices
- component responsibility
- hook correctness
- useEffect/useMemo/useCallback correctness
- stale closure / dependency issues
- state ownership
- derived state misuse
- server state vs UI state separation
- async data loading / error / empty / success states
- mutation handling and query invalidation
- form behavior and validation
- accessibility
- TypeScript safety
- rendering/performance concerns that are materially relevant
- regression risk for changed props, hooks, routes, or shared UI contracts
- missing or weak tests for changed behavior
- code smells and maintainability concerns

review_instructions:
- Review this as a senior frontend reviewer.
- Be strict about real correctness, hook usage, state ownership, and async state handling issues.
- Flag React/Vite/TypeScript best-practice violations when they materially matter.
- Explicitly name code smells when present, such as overgrown component, effect doing too much, duplicated fetch logic, local state mirroring props, local state mirroring server state, business logic in UI layer, brittle conditional rendering, or weak typing.
- Do not invent hypothetical issues.
- Do not suggest speculative redesigns.
- Ground every finding in changed code, impacted callers, missing tests, or explicit repo rules.
- Prefer minimal safe fixes over large redesign suggestions.
- Pay special attention to whether the component owns too much state or mixes UI and data logic.
- Pay special attention to loading, error, empty, and success states where async behavior exists.
- Pay special attention to query invalidation/cache consistency after mutations.
- If a shared hook/component/prop contract changed, verify impacted callers/tests or flag regression risk.
- If you notice a pre-existing issue, include it only if it makes this change unsafe, and label it [pre-existing].
- Return findings using the reviewer's exact required output format.

additional_context:
- known_repo_rules: <optional — see code-review-orchestrator.md for established patterns>
- areas_to_ignore: <optional>
- risk_notes: <optional>
```
