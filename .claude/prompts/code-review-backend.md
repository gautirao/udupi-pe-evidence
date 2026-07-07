# Backend Review Brief Template

Use the `code-reviewer` agent with the following review brief.

```
review_mode: backend

stack_context:
- Java 21
- Spring Boot 3.x
- JPA/Hibernate
- PostgreSQL
- Flyway
- Maven
- REST APIs
- JUnit
- Mockito

pr_summary:
- <insert 2-6 bullet summary of what changed>

change_intent:
- <insert the functional goal of the change>
- <what behavior is being added/fixed/refactored>
- <what the code is supposed to achieve>

changed_files:
- <file 1>
- <file 2>
- <file 3>

focus_areas:
- correctness and edge cases
- Java best practices
- Spring Boot best practices
- controller/service/repository boundaries
- DTO vs entity separation
- request validation
- exception handling and error mapping
- transaction boundaries
- JPA/Hibernate pitfalls
- N+1 or repeated query risks
- query/repository correctness
- null safety / Optional usage
- idempotency / side effects where relevant
- security concerns on changed endpoints/flows
- regression risk for changed public APIs or service contracts
- missing or weak tests for changed paths
- code smells and maintainability issues

review_instructions:
- Review this as a senior backend reviewer.
- Be strict about real correctness and architecture issues.
- Flag stack-specific Spring Boot and Java best-practice violations when they materially matter.
- Explicitly name code smells when present, such as fat controller, god service, long method, duplicated logic, leaky abstraction, hidden side effects, poor exception semantics, or magic values.
- Do not invent hypothetical issues.
- Do not suggest speculative redesigns.
- Ground every finding in changed code, impacted callers, missing tests, or explicit repo rules.
- Prefer minimal safe fixes over large redesign suggestions.
- Pay special attention to whether business logic is in the wrong layer.
- Pay special attention to transaction placement, validation, DTO boundaries, and persistence/query behavior.
- If a public contract changed, verify callers/tests were updated or flag regression risk.
- If you notice a pre-existing issue, include it only if it makes this change unsafe, and label it [pre-existing].
- Return findings using the reviewer's exact required output format.

additional_context:
- known_repo_rules: <optional — see ROUTE_AND_RUN.md § Known repo rules (Code-Reviewer Invocation Protocol) for established patterns>
- areas_to_ignore: <optional>
- risk_notes: <optional>
- ac_checklist: <sprint executor only — paste enriched spec AC bullets; reviewer must mark each PRESENT or MISSING; MISSING without OUT OF SCOPE justification = BLOCKING>
```
