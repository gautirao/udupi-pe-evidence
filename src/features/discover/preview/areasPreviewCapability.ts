/**
 * Areas preview capability — Issue #1956 PR 1 (FE-1).
 *
 * THE SINGLE OWNER of the deployment preview capability read. No other file in
 * the repo may read `import.meta.env.VITE_DISCOVER_AREAS_PREVIEW` directly; a
 * static sweep in this module's test file pins that.
 *
 * AC1.2 — the canonical Areas journey mounts only when BOTH halves of a dual
 * gate are true:
 *   1. the DEPLOYMENT capability is enabled (this env var), and
 *   2. the URL carries the per-session opt-in `areasPreview=1`.
 * With the capability disabled the URL parameter alone has no effect whatsoever,
 * which is what makes an accidentally-shared preview link inert in production.
 *
 * Default across the repo is DISABLED, matching the `discover.opensearch.enabled`
 * precedent: absent, empty, or any unrecognised value is off. Only `"1"` or
 * `"true"` (case-insensitive, trimmed) enables.
 *
 * The env READ (`isAreasPreviewCapabilityEnabled`) and the PREDICATE
 * (`isAreasPreviewJourneyActive`) are deliberately separable so the predicate —
 * the part that encodes the actual gate semantics — is trivially unit-testable
 * without stubbing `import.meta.env`.
 *
 * TRUST BOUNDARY — this is a DEPLOYMENT FEATURE FLAG, NOT AN AUTHORIZATION CONTROL.
 * Vite inlines the value into the client bundle, so it is publicly readable and a
 * user can patch the bundle to force the gate true. That is acceptable here
 * because the gate mounts nothing and the data behind it is already public and
 * unauthenticated. The invariant PR 2+ must hold: this flag may gate RENDERING
 * only, never DATA ACCESS. Anything auth-sensitive placed behind it must be
 * enforced server-side as well.
 *
 * DELIBERATELY INDEPENDENT OF `node=`. The gate controls journey MOUNTING only.
 * Direct area search and canonical deep links legitimately produce a `node=`
 * while the journey is still incomplete, so a `node=`-sensitive mount gate would
 * expose partial work to shoppers. `node` is not an input here and must not
 * become one.
 */

/** Config key. Not open for substitution. */
export const AREAS_PREVIEW_ENV_KEY = 'VITE_DISCOVER_AREAS_PREVIEW';

const ENABLED_VALUES = ['1', 'true'];

/**
 * Pure normaliser over a raw config value, exported so the accepted-value
 * contract can be tested without touching `import.meta.env`.
 */
export function parseAreasPreviewCapability(rawValue: unknown): boolean {
  if (typeof rawValue !== 'string') {
    return false;
  }
  return ENABLED_VALUES.includes(rawValue.trim().toLowerCase());
}

/**
 * Reads the deployment capability from the Vite env. The ONLY read site of
 * VITE_DISCOVER_AREAS_PREVIEW in the codebase.
 *
 * Read at call time rather than captured in a module-level const so a test (or
 * a future runtime override) can stub the env without module-registry
 * gymnastics.
 */
export function isAreasPreviewCapabilityEnabled(): boolean {
  return parseAreasPreviewCapability(import.meta.env.VITE_DISCOVER_AREAS_PREVIEW);
}

export interface AreasPreviewGateInput {
  /** The deployment capability — normally isAreasPreviewCapabilityEnabled(). */
  capabilityEnabled: boolean;
  /** The URL flag — DiscoverUrlState.areasPreview (`areasPreview=1`). */
  areasPreview: boolean | undefined;
}

/**
 * The dual gate. AND, not OR: both halves are required, and nothing else is
 * consulted — in particular NOT `node`.
 */
export function isAreasPreviewJourneyActive({
  capabilityEnabled,
  areasPreview,
}: AreasPreviewGateInput): boolean {
  return capabilityEnabled && areasPreview === true;
}
