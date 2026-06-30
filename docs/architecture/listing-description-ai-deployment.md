# Architecture Decision & Deployment Model: AI-Assisted Listing Descriptions

**Status:** Proposed (Milestone M38 planning — issue #1625, M38-10C)
**Author:** Architecture (design-only)
**Target Implementation:** Issue #1629 (NOT this issue)
**Scope:** Architecture & deployment specification only. Zero application/persistence/schema code changes in this issue.
**Related:** `docs/architecture/listing-typed-detail-data-capture.md` (#1624 ADR, M38-03) §12 "AI description-generation boundary" — this doc is the home for the per-family blocked-claim sets that §12 references; it does not duplicate #1624's persistence architecture.

---

## 1. Executive Summary & Recommended Posture

The Udupi Property Explorer platform offers brokers and dealers an **optional** drafting aid that turns the structured facts they have already confirmed in the listing form into an **editable description draft**. The aid is a convenience, never a system of record and never a gate on listing creation or publish.

The recommended production posture is deliberately conservative and matches the binding direction of issue #1625:

1. **Template or Noop by default in production.** No large-language-model (LLM) inference runs on the production path unless a feature flag is explicitly turned on.
2. **LLM behind a feature flag only.** `LISTING_DESCRIPTION_AI_ENABLED` defaults to `false`. An LLM-backed provider is enabled only by deliberate, reversible configuration.
3. **No production dependency on Ollama / Llama / Qwen for M38.** No self-hosted model server is part of the production deployment topology for M38. No model weights (`.gguf` / `.bin`) are committed to the repository.
4. **Confirmed-facts-in, editable-text-out.** The aid receives only structured fields the broker has already entered and confirmed; it returns only editable free text. It never writes structured columns, legal/record fields, verification/trust state, or publish state. This is exactly the boundary #1624 §12 sets.
5. **Never block listing creation.** Persistence and publish operate completely independently of drafting-aid availability. If the aid is disabled, times out, or fails, the broker writes the description manually.

This document **supersedes** the earlier "self-hosted open-source model as the authoritative primary production engine" recommendation. That posture is now explicitly rejected (see §11) because it creates a production operational dependency on a self-hosted Llama/Qwen/Ollama server, which #1625 places out of scope.

---

## 2. Provider Model (s1)

All generation requests pass through one backend boundary interface so that listing-flow business logic is fully decoupled from any inference runtime or vendor. The model is **family-agnostic**: there is exactly **one** provider abstraction. The backend shapes the payload per property family (residential / commercial / agricultural); there is **no separate model deployment per listing family**.

```java
// Conceptual Spring-style contract — illustrative, implemented in #1629, not here.
public interface ListingDescriptionProvider {
    ProviderName providerName();
    boolean isAvailable();
    ListingGenerationResult generate(ListingGenerationRequest request);
}

// EXACTLY FOUR providers. No SELF_HOSTED_LLM. No production model server.
public enum ProviderName {
    NOOP,        // returns empty/no draft; default-safe; CI and globally-disabled mode
    TEMPLATE,    // deterministic string composition from confirmed facts; safe production default
    LOCAL_LLM,   // DEVELOPMENT ONLY: Ollama / llama.cpp-compatible REST; never a prod dependency
    REMOTE       // OPTIONAL, LATER, behind approval; not required for M38
}

public enum GenerationMode {
    GENERATE, REGENERATE, REWRITE_SHORTER, REWRITE_MORE_FACTUAL,
    REWRITE_WARMER, REWRITE_MORE_BUSINESS_LIKE, SUGGEST_TITLE
}

public enum GenerationStatus { SUCCESS, FALLBACK, FAILED }

public record ListingGenerationRequest(
    UUID listingId,
    ListingFamily family,            // RESIDENTIAL | COMMERCIAL | AGRICULTURAL
    ConfirmedFactsPayload confirmedFacts,
    Locale locale,
    GenerationMode mode
) {}

public record ListingGenerationResult(
    GenerationStatus status,
    String descriptionDraft,         // editable free text only
    String titleSuggestion,          // optional, editable free text only (if approved)
    ProviderName providerUsed,
    boolean fallbackUsed,
    long generationLatencyMs
) {}
```

### The four providers

| Provider | Role | Environment | Required for M38? |
|----------|------|-------------|-------------------|
| **NoopProvider** | Returns no draft; leaves the field unchanged. Default-safe; used in CI, tests, and when the feature is globally disabled. | All | Yes (default-safe baseline) |
| **TemplateProvider** | Deterministic string composition strictly from confirmed fields. Zero external dependency. Recommended safe production default when a draft is wanted. | All | Yes |
| **LocalLlmProvider** | Talks to a local Ollama / llama.cpp-compatible REST endpoint on a developer workstation. **Development only.** Never part of the production deployment topology. | Dev only | No |
| **RemoteProvider** | Adapter for an external commercial/managed LLM API. **Optional, later, behind explicit approval.** Not part of M38. | Optional/later | No |

**Canonical naming (config → enum → class).** Each provider has three representations that #1629 must wire 1:1. The `LISTING_DESCRIPTION_PROVIDER` config literal is **kebab-case**, the `ProviderName` enum is **UPPER_SNAKE**, and the Spring class is **PascalCase + `Provider`**:

| Config literal (`LISTING_DESCRIPTION_PROVIDER`) | `ProviderName` enum | Provider class |
|---|---|---|
| `noop` | `NOOP` | `NoopProvider` |
| `template` | `TEMPLATE` | `TemplateProvider` |
| `local-ollama` | `LOCAL_LLM` | `LocalLlmProvider` |
| `remote` | `REMOTE` | `RemoteProvider` |

The local-LLM provider is deliberately runtime-agnostic at the enum/class level (`LOCAL_LLM` / `LocalLlmProvider`) while the config literal `local-ollama` names the dev runtime it targets; the mapping above is the single source of truth. Example mapping: config value `local-ollama` → `ProviderName.LOCAL_LLM` → `LocalLlmProvider`.

Rewrite modes (shorter, more factual, warmer, more business-like) and the optional title suggestion are behaviours of whichever provider is active; with `TemplateProvider` they map to deterministic template variants, and with `NoopProvider` they are no-ops.

---

## 3. Production Recommendation: Template or Noop by default (s2)

**Recommendation:** in production, the default provider is **Template** (or **Noop** where no draft is desired). An LLM-backed provider (`LocalLlmProvider` in dev, `RemoteProvider` later) is enabled **only** behind `LISTING_DESCRIPTION_AI_ENABLED=true`, which defaults to `false`.

This satisfies the hard constraints from #1625: no production dependency on Ollama/Llama/Qwen, no model weights committed to the repo, `LocalLlmProvider` dev-only, `RemoteProvider` optional/later.

### Options compared (the five the issue lists)

| Option | Cost | Latency | Reliability | Privacy | Deployment | Verdict |
|--------|------|---------|-------------|---------|------------|---------|
| **Noop only** | Zero | Instant | Perfect (no-op) | Perfect (nothing leaves) | Trivial | ✅ Default-safe baseline. No draft value, but never harms. |
| **Template (deterministic)** | Zero marginal | Instant, in-process | Perfect (deterministic) | Perfect (nothing leaves the backend) | Trivial — pure backend code | ✅ **Recommended production default when a draft is wanted.** Grounded by construction; cannot hallucinate. |
| **Remote API** | Recurring per-token | Network-bound | External SLA dependency | Data leaves to a vendor | Adapter + secret mgmt + approval | ⬜ Optional, later, behind approval. Premature until template draft quality proves insufficient AND privacy/cost are signed off. |
| **Local model hosted separately** (self-hosted Ollama/Qwen server) | Fixed server rent + ops | Variable under load | Self-run uptime burden | Good (stays self-hosted) | Heavy: provision, patch, monitor a model server | ⬜ **Rejected as a production dependency for M38** (§10). Operational and availability cost not justified at current stage; #1625 places it out of scope. |
| **Local model inside backend** (weights in-process) | RAM/CPU pressure on the app | Blocks app threads | Couples app health to inference | Good | Bloats the deployable; weights in repo/image | ⬜ Rejected. Couples core listing service health to inference; weights must not ship in the repo/image. |

**Why Template/Noop default.** At MVP/early-growth stage, the dominant constraints are correctness, safety, privacy, and not blocking the core flow — not narrative polish. A deterministic template draft is grounded by construction (it can only restate confirmed fields), costs nothing, adds no external failure domain, and ships no model weights. An LLM raises cost, latency, an external/ops failure domain, and a privacy surface — none justified until template drafts are demonstrably insufficient. The architecture keeps the LLM path one flag away, so upgrading later is reversible and low-risk.

> **Tradeoff record.** **Chosen:** Template/Noop default, LLM behind flag. **Rejected:** self-hosted LLM as primary production engine (operational/availability cost; out of scope per #1625). **Deferred:** RemoteProvider until template quality proves insufficient and privacy/cost are approved. **Main risk:** template drafts read as generic — mitigated by per-family templates and the always-available manual edit.

---

## 4. Confirmed-Facts Payload (s3)

The aid receives **only confirmed structured fields already entered and confirmed in the listing form**. There is **no** structured-field-extraction architecture: WhatsApp messages, pasted text, voice notes, and any free-text are **never** a source of truth for field extraction. Broker contact details are excluded. The backend builds a `ConfirmedFactsPayload` from typed columns/DTO fields only (the same typed model #1624 defines), shaped per family.

> The aid composes copy *from* already-confirmed facts. It never parses or extracts facts *out of* unstructured input. Structured facts always originate from typed columns.

### Worked example — Residential (apartment, sale)

```json
{
  "family": "RESIDENTIAL",
  "propertyType": "APARTMENT",
  "listingPurpose": "SALE",
  "bhk": 3,
  "bathrooms": 2,
  "builtUpAreaSqft": 1450,
  "floor": 6,
  "totalFloors": 12,
  "furnishing": "SEMI_FURNISHED",
  "facing": "EAST",
  "locality": "Manipal",
  "city": "Udupi",
  "coveredParking": 1,
  "askingPriceInr": 9500000,
  "negotiable": true
}
```

### Worked example — Commercial (office, lease)

```json
{
  "family": "COMMERCIAL",
  "propertyType": "OFFICE",
  "listingPurpose": "LEASE",
  "carpetAreaSqft": 2200,
  "floor": 3,
  "totalFloors": 5,
  "furnishing": "BARE_SHELL",
  "washrooms": 2,
  "powerBackup": true,
  "liftAvailable": true,
  "locality": "Kinnimulki",
  "city": "Udupi",
  "monthlyRentInr": 120000,
  "depositMonths": 6,
  "negotiable": true
}
```

### Worked example — Agricultural (land, sale)

```json
{
  "family": "AGRICULTURAL",
  "propertyType": "AGRICULTURAL_LAND",
  "listingPurpose": "SALE",
  "landAreaAcres": 2.5,
  "areaUnit": "ACRE",
  "locality": "Brahmavar",
  "city": "Udupi",
  "roadAccess": true,
  "waterSource": "BOREWELL",
  "currentCultivation": "COCONUT",
  "boundaryFencingStatus": "PARTLY_FENCED",
  "askingPriceInr": 8500000,
  "negotiable": true
}
```

Each payload contains **only** confirmed, structured fields. Promotional claims, free-text broker comments, and any contact details are excluded by construction.

---

## 5. Backend Flow & Boundary (s4)

The generation endpoint/service is a **new backend service/endpoint, to be built in issue #1629 — not in this issue.** It lives in the Spring Boot backend (per project invariant: all business logic lives in Spring Boot; the frontend is untrusted and the backend validates the JWT and treats input as untrusted). The call sequence:

```
[FE] Broker clicks "Generate / Regenerate / Rewrite"
   │  (sends listingId + selected GenerationMode; NOT free text as a fact source)
   ▼
[BE] Endpoint authenticates JWT, authorizes broker owns the listing
   ▼
[BE] Loads / receives the CONFIRMED structured fields (typed columns / DTO)
   ▼
[BE] Builds the safe ConfirmedFactsPayload (per-family shaping; contact details excluded)
   ▼
[BE] Runs blocked-claims guardrails (§6) over what may be expressed
   ▼
[BE] Calls the CONFIGURED provider (Noop / Template / LocalLlm[dev] / Remote[later])
   │      with a REQUIRED timeout
   ▼
[Provider] Returns an editable description draft (+ optional editable title)
   ▼
[FE] Shows the draft in an EDITABLE field
   ▼
[Broker] Edits if desired and DECIDES whether to save
```

**Save target — no schema change.** When the broker saves, the text lands in the **existing live `description` free-text column** (`Listing.java:118-119`). There is **no** persistence or schema change in this issue, and none is required by this design. The optional title suggestion, if approved, lands in the existing editable title field. Generation is a request/response convenience; it does not persist anything on its own.

---

## 6. Output Boundary (s5)

- The aid **may** return an **editable description draft**, and **optionally (if approved) an editable title suggestion**.
- AI output lands **only** in editable free-text fields that require an **explicit human save**.
- The aid **must never** write: structured listing fields, legal/document fields, verification/trust fields, or publish state.
- **No auto-publish.** Generation never changes listing state.
- **Structured facts always render from typed columns** (#1624's typed model) — they are **never** parsed back out of AI-generated text.

This is precisely the "OUT / never written by AI" boundary of #1624 §12: structured columns, legal/record fields, and verification/trust state are out; output is editable title/description free-text only, as a draft requiring explicit human save.

---

## 7. Safety Guardrails — Blocked Claims (s6)

Input is restricted to confirmed fields, and the expressible output is constrained by a blocked-claims policy. A claim is allowed **only when the underlying fact is explicitly present in the confirmed payload AND is safe to display as a broker-entered fact** (never as a platform-verified assertion). This doc is the **home for the per-family blocked-claim sets** that #1624 §12 references.

### Global blocked-claims list

Never assert any of the following unless the exact fact is explicitly present in the confirmed payload and is safe to show as broker-entered (never as platform verification):

- legal verification
- clear title
- approved layout
- document verification
- school proximity
- beach / sea / river view
- premium builder
- high rental yield
- guaranteed ROI
- guaranteed footfall
- verified approvals
- high-yield soil
- guaranteed appreciation
- land records verified
- conversion verified

### Family-specific blocked-claim sets

- **Residential:** no fake school/proximity claims, no legal/verification claims (no "title verified", "approved layout", "documents verified", fabricated school distances or premium-builder assertions).
- **Commercial:** no guaranteed **footfall**, no guaranteed **ROI**, no rental/gross **yield** guarantees, no **approvals** claims (fire-safety/municipal), no **occupancy** guarantees.
- **Agricultural:** no **clear-title** claims, no **conversion**-status claims, no **water-source** guarantees, no **crop-yield** guarantees, no **appreciation** claims.

These align with #1624 ADR §12 ("Never invent (per family)") and the per-family design-source disclaimers. Verification/trust badges are out of scope for AI entirely — the platform displays no ownership/document verification badges anywhere (#1624 §12, cross-file note).

> **LLM output-side guardrail enforcement.** For LLM-backed providers (`LocalLlmProvider` in dev, `RemoteProvider` later), guardrails must be enforced **both before provider invocation and after generation**. The input payload is already restricted to confirmed facts at payload-construction time. The generated draft must additionally be checked for blocked claims **before it is returned to the frontend** — an LLM can hallucinate claims not present in the payload. `TemplateProvider` is deterministic and should be written so it **cannot emit blocked claims by construction** (template slots map strictly to confirmed payload fields; no free-form inference step). This two-phase enforcement (payload restriction + post-generation scan) is the responsibility of the backend generation service built in #1629.

---

## 8. Privacy & Observability (s7)

- **No broker contact details** are ever sent to a provider (excluded when building `ConfirmedFactsPayload`).
- **No full prompt/response logging by default.** Default logs capture only: `listingId`, `providerUsed`, `latency`, `status`, `errorCategory`, `modelName` (when a model is used), `fallbackUsed (y/n)`.
- **Debug/eval logging is disabled by default**, must be redacted, and is permitted in **non-production only** (or behind a separate security approval). Controlled by `LISTING_DESCRIPTION_LOG_PROMPTS` (default `false`).
- **Timeout is REQUIRED** on any provider call (`LISTING_DESCRIPTION_TIMEOUT_MS`).
- **Rate-limit** the endpoint if needed (`LISTING_DESCRIPTION_RATE_LIMIT_PER_HOUR`, optional).
- **Provider latency/error metrics** are captured **if/when** a provider is actually implemented later; for Template/Noop the metrics are trivial.
- All output is treated as an **editable draft only**.

---

## 9. Fallback & Degradation (s8)

Listing creation and publish **must** work when the aid is disabled, times out, or fails. The broker can **always** write the description manually. Errors are friendly and **non-blocking**; timeouts **must not** block save or publish.

### Deterministic fallback cascade

```
[Broker requests a draft]
        │
        ▼
 Configured provider (Noop | Template | LocalLlm[dev] | Remote[later])
        │  success → editable draft shown in the form
        │
        │  timeout / unavailable / error
        ▼
 TemplateProvider (if configured)
        │  success → deterministic editable draft shown
        │
        │  error / not configured
        ▼
 NoopProvider — leave the description field unchanged
        │
        ▼
 Broker writes/edits manually (always available, never blocked)
```

The cascade is deterministic and side-effect-free: failure at any stage degrades to a manual, fully functional flow.

> **Note — Template secondary stage.** The Template fallback stage applies only when a **non-Template (LLM) provider** is the configured primary; it is what an LLM call degrades to on timeout/error. When `TemplateProvider` is itself the configured primary, that stage is a no-op (the primary already produced the deterministic draft). `TemplateProvider` is in-process, deterministic, and zero-dependency, so it is not expected to fail; the Noop/manual stage is the final safety net regardless.

---

## 10. Configuration Keys (s9)

Canonical keys follow a single `LISTING_DESCRIPTION_*` convention. The six required keys:

```toml
# --- Required (canonical) ---
LISTING_DESCRIPTION_AI_ENABLED=false           # master flag; default false (Template/Noop only)
LISTING_DESCRIPTION_PROVIDER=template           # noop | template | local-ollama | remote
LISTING_DESCRIPTION_TIMEOUT_MS=8000             # REQUIRED provider-call timeout
LISTING_DESCRIPTION_MAX_INPUT_CHARS=4000        # cap on built payload size
LISTING_DESCRIPTION_LOG_PROMPTS=false           # default false; redacted + non-prod only when true
LISTING_DESCRIPTION_REQUIRE_CONFIRMATION=true   # default true; output is a draft requiring explicit save
```

`LISTING_DESCRIPTION_PROVIDER` accepts exactly the four-provider values: `noop | template | local-ollama | remote` (per the canonical config→enum→class mapping in §2). **`self_hosted` is removed** — there is no self-hosted production provider value.

```toml
# --- Optional / dev-only (MUST NOT imply a production LLM dependency) ---
LISTING_DESCRIPTION_MODEL=qwen3:4b                                  # dev/optional: only meaningful for local-ollama in dev
LISTING_DESCRIPTION_BASE_URL=http://localhost:11434/v1/chat/completions  # dev/optional: local runtime only
LISTING_DESCRIPTION_MAX_OUTPUT_CHARS=1200                           # optional: output cap
LISTING_DESCRIPTION_RATE_LIMIT_PER_HOUR=10                          # optional: endpoint rate limit
```

The optional keys are meaningful only for the dev-only `local-ollama` provider or the later, approval-gated `remote` provider. Setting them does **not** introduce any production LLM dependency: with `LISTING_DESCRIPTION_AI_ENABLED=false` and `LISTING_DESCRIPTION_PROVIDER=template|noop` (the production default), they are inert.

> **`LISTING_DESCRIPTION_AI_ENABLED` semantics.** `LISTING_DESCRIPTION_AI_ENABLED=false` means no LLM-backed provider is allowed. It does **not** prevent the safe `TemplateProvider` or `NoopProvider` from operating — those are deterministic, zero-dependency, and remain valid safe modes regardless of this flag. This flag is an **LLM-safety flag**, not a description-helper on/off switch. If the product later needs to hide the description-helper UI entirely, that should use a **separate UI/product feature flag** rather than overloading this LLM safety flag.

---

## 11. Implementation Sequence for #1629 + Rejected Alternatives (s10)

> **Issue #1629 must NOT be implemented in this issue.** This document is design-only. The sequence below is the follow-up plan for #1629. (The earlier "M38-08" framing is stale and is replaced by **#1629**.)

### Ordered plan for #1629

1. **Provider abstraction + config + NoopProvider first.** Land the `ListingDescriptionProvider` interface, the config keys (§10), and the default-safe `NoopProvider`. Feature flag defaults `false`.
2. **`ConfirmedFactsPayload` builder + blocked-claims validator.** Per-family payload shaping from typed columns (#1624); global + per-family blocked-claims guardrails (§7).
3. **TemplateProvider.** Deterministic per-family drafts and rewrite-mode variants; the safe production default when a draft is wanted.
4. **(Dev-only) LocalLlmProvider.** Ollama / llama.cpp-compatible adapter, behind the flag, for development experimentation only. No production topology change; no weights in the repo.
5. **Frontend generate / regenerate / rewrite editable-draft UX.** Buttons for generate, regenerate, rewrite shorter, rewrite more factual, rewrite warmer (residential), rewrite more business-like (commercial), and optional title suggestion — all landing in editable fields requiring explicit save.
6. **Observability / timeout / rate-limit / rollout.** Minimal metrics (§8), required timeout, optional rate limit, flagged rollout.
7. **RemoteProvider — optional, later, behind approval.** Only if template drafts prove insufficient and privacy/cost are signed off.

### Rejected alternatives

1. **Self-hosted LLM as the authoritative primary production engine.** *Rejected.* Creates a standing production dependency on a self-hosted Llama/Qwen/Ollama server (provisioning, patching, uptime, latency-under-load, capacity), which the current stage does not justify and which **violates the explicit "no Ollama/Llama/Qwen in production for M38" constraint** of #1625. Self-hosting may be revisited far later as a cost optimization only if a remote LLM is first proven valuable and volume justifies owning the infrastructure.
2. **Remote commercial API as a mandatory MVP dependency.** *Rejected for MVP.* Recurring per-token cost, external SLA dependency, and a data-privacy surface, none justified before template draft quality is shown insufficient. Kept as an optional, approval-gated, later adapter.
3. **Client-side in-browser LLM weights.** *Rejected.* High mobile RAM/bandwidth burden for field dealers; ships weights to untrusted clients; no guardrail enforcement on the client.
4. **Unconstrained free-text prompting / structured-field extraction.** *Rejected.* Prompt-injection and fabrication risk; #1625 explicitly does not introduce a structured-field-extraction architecture. Input is confirmed structured fields only.

---

## 12. Cross-Doc Consistency (#1624 §12)

This document is consistent with and is referenced by `docs/architecture/listing-typed-detail-data-capture.md` (#1624 ADR) §12:

- **IN:** confirmed structured fields only, as a grounded `ConfirmedFactsPayload` (§4–§5 here; #1624 §12 "IN").
- **OUT / never written by AI:** structured columns, legal/record fields, verification/trust state, publish state; output lands only in editable title/description free-text requiring explicit human save (§6 here; #1624 §12 "OUT").
- **Per-family blocked-claim sets** for residential, commercial, and agricultural live **here** in §7 (this is the home #1624 §12 designates).
- **Works with AI disabled** — persistence and publish are independent of provider availability (§3, §9 here; #1624 §12).

This doc supersedes the earlier self-hosted-primary posture; #1624's persistence architecture (hybrid typed tables) is referenced, not duplicated, and is unchanged by this document.
