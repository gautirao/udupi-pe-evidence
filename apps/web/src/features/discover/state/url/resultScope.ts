/**
 * Result-scope URL domain — Issue #2016.
 *
 * Owns the `r`-prefixed result-scope params, kept distinct from the existing
 * navigation `scope` param (residential scope axis — see compatibility.ts)
 * to avoid a key collision (compatibility.ts:L44-47 documents that hazard):
 *   rscope – 'areas' | 'poly' | 'vp' — absent means no committed result scope.
 *   rareas – comma-joined AREA_SET areaKeys.
 *   rpoly  – POLYGON coordinates: "lat:lon" pairs semicolon-joined, 5dp fixed
 *            precision, capped at MAX_POLYGON_VERTICES (silently truncated).
 *   rvp    – VIEWPORT bounds "s,w,n,e".
 *   rprev  – the prior committed scope, encoded "kind:payload" (e.g.
 *            "areas:hebbal,nagawara"), written by commitResultScope so J3.5's
 *            "Return to selected areas" restores the exact prior scope BY
 *            NAME, never inferred from the camera.
 *
 * `rscope` is authoritative on read: only the payload key matching it is ever
 * honoured. ResultScope is one discriminated field, so a hand-edited/
 * malformed URL carrying multiple payload keys (e.g. both `rareas` and
 * `rpoly`) can never produce two active scopes — the non-matching keys are
 * simply ignored on read, and commitResultScope's next write clears and
 * rewrites all four payload keys atomically, so the stale ones cannot
 * survive a subsequent commit.
 *
 * Draft state (in-progress polygon drawing, live camera movement while
 * drawing) is DRAFT-ONLY local component state, owned by
 * useDiscoverPageState.ts — per J3.2 (`delta.history: "no entry"`), there is
 * deliberately no URL-writing path for a draft update at all, so this module
 * exports nothing for it.
 */
import { useCallback, useMemo } from 'react';
import type { UrlDomainCtx, UrlDomainModule } from './_shared';
import type { DiscoverUrlActions, DiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import type { ResultScope } from '@/features/discover/state/resultScope';

const LAT_LON_PRECISION = 5;
const MAX_POLYGON_VERTICES = 40;

type ResultScopeState = Pick<DiscoverUrlState, 'resultScope'>;
type ResultScopeActions = Pick<DiscoverUrlActions, 'commitResultScope'>;

type NonNullResultScope = Exclude<ResultScope, null>;

function encodeAreaSet(areaKeys: string[]): string {
  return areaKeys.join(',');
}

function decodeAreaSet(raw: string | null): Extract<ResultScope, { kind: 'AREA_SET' }> | null {
  if (!raw) return null;
  const areaKeys = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return areaKeys.length > 0 ? { kind: 'AREA_SET', areaKeys } : null;
}

function encodePolygon(coordinates: [number, number][]): string {
  // Cap + silently truncate — matches the existing polygon geometry's
  // assumption that only the vertex list (never a repeated closing point)
  // is carried through app state; ring-closing happens at WKT-build time.
  return coordinates
    .slice(0, MAX_POLYGON_VERTICES)
    .map(([lat, lon]) => `${lat.toFixed(LAT_LON_PRECISION)}:${lon.toFixed(LAT_LON_PRECISION)}`)
    .join(';');
}

function decodePolygon(raw: string | null): Extract<ResultScope, { kind: 'POLYGON' }> | null {
  if (!raw) return null;
  const coordinates: [number, number][] = [];
  for (const pair of raw.split(';')) {
    if (!pair) continue;
    const [latRaw, lonRaw] = pair.split(':');
    const lat = parseFloat(latRaw);
    const lon = parseFloat(lonRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    coordinates.push([lat, lon]);
  }
  // A polygon needs >= 3 vertices to be geometrically meaningful.
  return coordinates.length >= 3 ? { kind: 'POLYGON', coordinates } : null;
}

function encodeViewport(bounds: { s: number; w: number; n: number; e: number }): string {
  return `${bounds.s},${bounds.w},${bounds.n},${bounds.e}`;
}

function decodeViewport(raw: string | null): Extract<ResultScope, { kind: 'VIEWPORT' }> | null {
  if (!raw) return null;
  const parts = raw.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [s, w, n, e] = parts;
  return { kind: 'VIEWPORT', bounds: { s, w, n, e } };
}

/** Encodes a non-null committed scope for the `rprev` param: "kind:payload". */
function encodeForPrev(scope: NonNullResultScope): string {
  switch (scope.kind) {
    case 'AREA_SET':
      return `areas:${encodeAreaSet(scope.areaKeys)}`;
    case 'POLYGON':
      return `poly:${encodePolygon(scope.coordinates)}`;
    case 'VIEWPORT':
      return `vp:${encodeViewport(scope.bounds)}`;
  }
}

function decodePrev(raw: string | null): ResultScope {
  if (!raw) return null;
  const sep = raw.indexOf(':');
  if (sep < 0) return null;
  const kind = raw.slice(0, sep);
  const payload = raw.slice(sep + 1);
  if (kind === 'areas') return decodeAreaSet(payload);
  if (kind === 'poly') return decodePolygon(payload);
  if (kind === 'vp') return decodeViewport(payload);
  return null;
}

/**
 * `rscope` is authoritative — only the matching payload key is ever read.
 *
 * Takes the four raw param STRINGS (not a URLSearchParams instance) so a
 * render-time caller can useMemo on those primitives directly — a
 * URLSearchParams object (and therefore any ResultScope decoded fresh from
 * it) has a NEW identity every render even when its content is unchanged
 * (Issue #2016 code-review Finding 4: an identity-based `===` check downstream
 * — e.g. useDiscoverPageState.ts's filters.polygon sync effect — would
 * otherwise fire every render and loop).
 */
function deriveActiveScope(
  rscope: string | null,
  rareas: string | null,
  rpoly: string | null,
  rvp: string | null,
): ResultScope {
  if (rscope === 'areas') return decodeAreaSet(rareas);
  if (rscope === 'poly') return decodePolygon(rpoly);
  if (rscope === 'vp') return decodeViewport(rvp);
  return null;
}

/** Write-time convenience wrapper over `deriveActiveScope` for a live URLSearchParams. */
function readActiveScope(urlParams: URLSearchParams): ResultScope {
  return deriveActiveScope(
    urlParams.get('rscope'),
    urlParams.get('rareas'),
    urlParams.get('rpoly'),
    urlParams.get('rvp'),
  );
}

/**
 * Pure: applies a result-scope commit — clearing every stale payload key,
 * moving the outgoing scope into `rprev`, writing the new scope's payload —
 * onto an ALREADY IN-PROGRESS `URLSearchParams` mutation (`next`).
 *
 * Extracted (Issue #2016 code-review Finding 5) so a scope commit can be
 * folded into the SAME `setUrlParams` updater/history entry as a sibling
 * navigation write (e.g. area.ts's `selectArea`/`deselectArea`) instead of
 * firing as a second, independent `setUrlParams` call in the same render —
 * two independent calls race on react-router-dom's functional-updater `prev`
 * (see _shared.ts's `liveUrlParamsRef` doc for the general hazard) and can
 * silently clobber each other's delta or push a second, unwanted history
 * entry. `commitResultScope` below is still correct as a STANDALONE action
 * for call sites where a scope commit is the ONLY url write that render.
 */
export function applyResultScopeCommit(next: URLSearchParams, scope: ResultScope): void {
  const outgoing = readActiveScope(next);

  next.delete('rscope');
  next.delete('rareas');
  next.delete('rpoly');
  next.delete('rvp');
  next.delete('rprev');

  if (outgoing) {
    next.set('rprev', encodeForPrev(outgoing));
  }

  if (scope) {
    if (scope.kind === 'AREA_SET') {
      next.set('rscope', 'areas');
      next.set('rareas', encodeAreaSet(scope.areaKeys));
    } else if (scope.kind === 'POLYGON') {
      next.set('rscope', 'poly');
      next.set('rpoly', encodePolygon(scope.coordinates));
    } else {
      next.set('rscope', 'vp');
      next.set('rvp', encodeViewport(scope.bounds));
    }
  }
}

export function useResultScopeUrlDomain(
  ctx: UrlDomainCtx,
): UrlDomainModule<ResultScopeState, ResultScopeActions> {
  const { urlParams, setUrlParams } = ctx;

  // Issue #2016 code-review Finding 4 — memoize by the raw param STRINGS
  // (stable primitives across renders when the URL hasn't changed), not by
  // re-decoding urlParams (a fresh URLSearchParams instance) on every
  // render, which would give `active`/`previous` a new object identity even
  // when nothing changed and break any downstream `===`/dependency-array
  // check (e.g. useDiscoverPageState.ts's filters.polygon sync effect).
  const rscope = urlParams.get('rscope');
  const rareas = urlParams.get('rareas');
  const rpoly = urlParams.get('rpoly');
  const rvp = urlParams.get('rvp');
  const rprev = urlParams.get('rprev');
  const active = useMemo(
    () => deriveActiveScope(rscope, rareas, rpoly, rvp),
    [rscope, rareas, rpoly, rvp],
  );
  const previous = useMemo(() => decodePrev(rprev), [rprev]);

  const commitResultScope = useCallback(
    (scope: ResultScope, opts?: { history: 'push' | 'replace' }) => {
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          applyResultScopeCommit(next, scope);
          return next;
        },
        // PUSH by default — one history entry per committed scope change (J3.4/J3.5).
        // Issue #2015 AC7 — VIEWPORT activation passes `{ history: 'replace' }` so
        // rapid pan/zoom -> "Search this area" commits don't spam the back-button;
        // scope-boundary transitions (Return to Area, AREA_SET/POLYGON selection)
        // omit opts and keep the original PUSH behavior.
        { replace: opts?.history === 'replace' },
      );
    },
    [setUrlParams],
  );

  return {
    state: { resultScope: { active, previous } },
    actions: { commitResultScope },
  };
}
