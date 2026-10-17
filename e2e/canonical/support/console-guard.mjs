/**
 * Canonical console + uncaught-pageerror classifier (issue #2750, slice CANON (a)).
 *
 * PURE module: no Playwright import, no I/O, no module state. It is imported by
 * canonical-test.ts (the `consoleGuard` auto fixture) and by the node --test file
 * scripts/e2e/console-guard.test.mjs. IGNORE_RULES below is the SINGLE SOURCE of
 * the documented ignore list (e2e/canonical/README.md mirrors it).
 *
 * Classification rule (origin decisions read the entry's `locationUrl`, i.e.
 * ConsoleMessage.location().url, NEVER the message text):
 *
 *   R-PE   every `pageerror` (uncaught exception / unhandled rejection) -> FAIL. No ignore list.
 *   R-CE   console type 'error' that is not a resource-load line, on an app origin or with
 *          an empty location -> FAIL.
 *   R-5XX  console 'Failed to load resource: ... status of 5xx' on an app origin -> FAIL.
 *   R-4XX  console 'Failed to load resource: ... status of 4xx' on an app origin that is NOT one of the
 *          ENUMERATED negative paths I2a-I2d below -> FAIL (a missing chunk/stylesheet, a renamed or
 *          deleted API route, a wrong status all land here). Codex round 1 (c): this used to be a blanket
 *          "any app-origin 4xx is ignorable" rule, which hid exactly those regressions.
 *
 * Fail-closed additions (strictly narrower ignore set than the plan text, never wider):
 *   R-RES  a resource-load line on an app origin or with an empty location whose status is not a
 *          parseable 4xx (e.g. net::ERR_*, 3xx, no status) -> FAIL (not provably an expected 4xx).
 *   R-RES-X a resource-load line from a non-app origin that is NOT in THIRD_PARTY_ALLOWLIST -> FAIL.
 *   R-CE-X a non-resource console 'error' from a NON-app origin -> FAIL (only resource-load noise
 *          from third parties is ignorable, I1).
 *
 * There is NO environment knob, NO report-only mode and NO global disable. A new ignore entry
 * may only be an exact origin or an anchored regex plus a one-line reason plus reviewer approval.
 */

export const RESOURCE_PREFIX = 'Failed to load resource:';

/**
 * I1 EXACT-origin allowlist of third-party hosts whose resource-load failures are ignorable.
 * Tile origins: Leaflet <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"> (no `subdomains`
 * option set, so Leaflet's default 'abc' applies -> a./b./c.) at apps/web/src/components/map/PropertyMap.tsx:3084,
 * poi/PoiMiniMap.tsx:209, listing/ListingDetailBoundaryMap.tsx:68, dealer/BoundaryDrawStep.tsx:144,
 * broker/AddressPicker.tsx:561. The bare apex is kept for the unsubstituted template host. Fonts: Google Fonts.
 * Any other non-app origin's resource-load failure FAILS (R-RES-X).
 */
export const THIRD_PARTY_ALLOWLIST = Object.freeze([
  'https://tile.openstreetmap.org',
  'https://a.tile.openstreetmap.org',
  'https://b.tile.openstreetmap.org',
  'https://c.tile.openstreetmap.org',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
]);

/**
 * I2 ENUMERATED app-origin 4xx allowlist. Each entry is an EXACT origin ROLE (frontend / backend / auth gateway, derived from
 * PLAYWRIGHT_BASE_URL / BACKEND_BASE_URL / VITE_SUPABASE_URL, see appOriginsFromEnv), an exact status, and an ANCHORED path test
 * on URL.pathname (no query, no fragment unless stated). The console message carries no HTTP method, so every entry is
 * method-agnostic by construction. Anything else on an app origin is R-4XX.
 *
 *  I2a  404 backend  local-dev-storage listing images. The gate's backend runs the filesystem-backed local-dev storage stub
 *       (LOCAL_DEV_STORAGE_ENABLED) and the seeded fixture / journey listings reference photo objects the stub does not hold.
 *       Observed shapes (evidence/final-gate-3 console-guard.json, 52 entries, all 404, all backend origin):
 *         /api/dev/local-storage/public/listing-images/e2e-fixtures/<uuid>/photo-N.jpg
 *         /api/dev/local-storage/public/listing-images/listings/<uuid>/<uuid>/photo-N.jpg
 *  I2b  401 backend  GET /api/broker/listing-quality before Supabase restored the session (documented pre-session 401, then one
 *       retry): apps/web/src/hooks/useBrokerListingQuality.ts.
 *  I2c  401 backend  anonymous GET /api/discover/markers and /api/discover/listings: the two discover GETs that are deliberately
 *       NOT permitAll (apps/api/.../security/JwtConfig.java:109-114), fetched before the session is restored. These requests
 *       always carry a query (?nodeKey=..., ?polygon=...), so I2c matches the PATHNAME with query and hash stripped.
 *       I2a and I2b stay noQuery (fixture image URLs and /api/broker/listing-quality are queryless).
 *  I2d  400 gateway  /auth/v1/token with a bad password (GoTrue answers 400); specs assert this through waitForResponse.
 */
const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const FIXTURE_IMAGE_PATH = new RegExp(
  `^/api/dev/local-storage/public/listing-images/(?:e2e-fixtures/${UUID}|listings/${UUID}/${UUID})/photo-[0-9]+\\.jpg$`,
);
const I2_ALLOWLIST = Object.freeze([
  Object.freeze({ id: 'I2a', role: 'backendOrigin', status: 404, noQuery: true, test: (p) => FIXTURE_IMAGE_PATH.test(p) }),
  Object.freeze({ id: 'I2b', role: 'backendOrigin', status: 401, noQuery: true, test: (p) => p === '/api/broker/listing-quality' }),
  Object.freeze({
    id: 'I2c',
    role: 'backendOrigin',
    status: 401,
    // Codex round 2 / I2c: the documented requests ALWAYS carry a query (useDiscoverListings.ts:220 `/api/discover/listings?${params}`,
    // useDiscoverFilteredMarkers.ts:142 `/api/discover/markers?${params}`; e.g. ?nodeKey=a:IN|KA|Bengaluru|RR%20Nagar, ?polygon=...), so the
    // rule matches URL.pathname with query and hash stripped. The path stays EXACT; origin role and status stay exact.
    noQuery: false,
    test: (p) => p === '/api/discover/markers' || p === '/api/discover/listings',
  }),
  // The token call carries ?grant_type=password, so the query is permitted here (path stays exact).
  Object.freeze({ id: 'I2d', role: 'gatewayOrigin', status: 400, noQuery: false, test: (p) => p === '/auth/v1/token' }),
]);

/** Ignore rules (single source). `reason` is a one-line justification shown in the README. */
export const IGNORE_RULES = Object.freeze([
  Object.freeze({
    id: 'I1',
    reason:
      "'Failed to load resource' from an EXACT allowlisted third-party origin (https://tile.openstreetmap.org and https://a/b/c.tile.openstreetmap.org, https://fonts.googleapis.com, https://fonts.gstatic.com): third-party network the gate does not control; any other non-app origin FAILS as R-RES-X.",
  }),
  Object.freeze({
    id: 'I2a',
    reason:
      "404 on the BACKEND origin for ^/api/dev/local-storage/public/listing-images/(e2e-fixtures/<uuid>|listings/<uuid>/<uuid>)/photo-N.jpg$ only: the local-dev storage stub does not hold the fixture listing photos; any other 404 FAILS as R-4XX.",
  }),
  Object.freeze({
    id: 'I2b',
    reason:
      "401 on the BACKEND origin for /api/broker/listing-quality only: the documented pre-session 401 that useBrokerListingQuality retries once while Supabase restores the session.",
  }),
  Object.freeze({
    id: 'I2c',
    reason:
      "401 on the BACKEND origin for the pathnames /api/discover/markers and /api/discover/listings only (query string and hash ignored, as the real requests carry ?nodeKey=/?polygon=): the two authenticated discover GETs (not permitAll, JwtConfig) fetched anonymously before the session is restored.",
  }),
  Object.freeze({
    id: 'I2d',
    reason:
      "400 on the auth GATEWAY origin for /auth/v1/token only: the bad-password sign-in negative path (GoTrue); every other app-origin 4xx FAILS as R-4XX.",
  }),
  Object.freeze({
    id: 'I3',
    reason: 'location.url scheme chrome-extension: or devtools: is browser noise (defensive; bundled Chromium has no extensions).',
  }),
  Object.freeze({
    id: 'I4',
    reason: "console types other than 'error' (warning/info/log/debug) are out of scope by owner condition.",
  }),
]);

function ignore(id) {
  return { verdict: 'IGNORE', rule: id };
}
function fail(rule) {
  return { verdict: 'FAIL', rule };
}

function safeOrigin(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.origin === 'null' ? null : u.origin;
  } catch {
    return null;
  }
}

function schemeOf(url) {
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(url || '');
  return m ? m[1].toLowerCase() : '';
}

/**
 * @param {{kind: 'pageerror'|'console', type?: string, text?: string, locationUrl?: string}} entry
 * @param {{appOrigins: string[], frontendOrigin?: string, backendOrigin?: string, gatewayOrigin?: string}} ctx
 *        appOrigins: exact URL origins of the app, backend and auth gateway; the three role origins (from appOriginsFromEnv)
 *        bind each I2 allowlist entry to ONE origin. A missing role origin ignores nothing.
 * @returns {{verdict: 'FAIL'|'IGNORE', rule: string}}
 */
export function classifyConsoleEntry(entry, ctx) {
  const appOrigins = ctx && Array.isArray(ctx.appOrigins) ? ctx.appOrigins : [];
  if (appOrigins.length === 0) {
    throw new Error('[console-guard] appOrigins is empty: refusing to classify (fail closed).');
  }
  if (entry.kind === 'pageerror') return fail('R-PE');
  if (entry.kind !== 'console') {
    throw new Error(`[console-guard] unknown entry kind: ${String(entry.kind)}`);
  }
  if (entry.type !== 'error') return ignore('I4');

  const locationUrl = entry.locationUrl || '';
  const scheme = schemeOf(locationUrl);
  if (scheme === 'chrome-extension' || scheme === 'devtools') return ignore('I3');

  const origin = safeOrigin(locationUrl);
  const onApp = origin !== null && appOrigins.includes(origin);
  const text = entry.text || '';

  if (text.startsWith(RESOURCE_PREFIX)) {
    if (origin !== null && !onApp) {
      return THIRD_PARTY_ALLOWLIST.includes(origin) ? ignore('I1') : fail('R-RES-X');
    }
    const status = /status of (\d{3})/.exec(text);
    const code = status ? Number(status[1]) : NaN;
    if (code >= 500 && code <= 599 && onApp) return fail('R-5XX');
    if (onApp && code >= 400 && code <= 499) {
      // Fail closed: an allowlist entry applies only when the ctx names that role's exact origin (a ctx without the role
      // origins ignores nothing) and the URL is on it, with the exact status and an anchored pathname.
      let u = null;
      try {
        u = new URL(locationUrl);
      } catch {
        u = null;
      }
      if (u !== null) {
        for (const rule of I2_ALLOWLIST) {
          const roleOrigin = ctx[rule.role];
          if (typeof roleOrigin !== 'string' || roleOrigin === '' || origin !== roleOrigin) continue;
          if (code !== rule.status) continue;
          if (rule.noQuery && (u.search !== '' || u.hash !== '')) continue;
          if (rule.test(u.pathname)) return ignore(rule.id);
        }
      }
      return fail('R-4XX');
    }
    return fail('R-RES');
  }

  if (locationUrl === '' || onApp) return fail('R-CE');
  return fail('R-CE-X');
}

/**
 * Derive the app origin set from the process env. Fail closed: any missing or unparsable
 * value throws; nothing is defaulted. Records which env var supplied each origin.
 * @param {Record<string, string|undefined>} env
 * @returns {{origins: string[], sources: Record<string, string>, frontendOrigin: string, backendOrigin: string, gatewayOrigin: string}}
 */
export function appOriginsFromEnv(env) {
  const names = ['PLAYWRIGHT_BASE_URL', 'BACKEND_BASE_URL', 'VITE_SUPABASE_URL'];
  const origins = [];
  const sources = {};
  for (const name of names) {
    const raw = env[name];
    if (!raw) {
      throw new Error(
        `[console-guard] ${name} is unset: cannot determine app-owned origins (fail closed; nothing is defaulted or guessed). ` +
          `Run canonical specs through scripts/run-e2e-gate.sh, or, for the manual sequence in e2e/canonical/README.md, ` +
          `export ${name} in the shell that runs Playwright (the same value the frontend was built and is served with).`,
      );
    }
    const origin = safeOrigin(raw);
    if (origin === null) {
      throw new Error(`[console-guard] ${name} is not a parseable URL (fail closed).`);
    }
    if (!origins.includes(origin)) origins.push(origin);
    sources[origin] = sources[origin] ? `${sources[origin]},${name}` : name;
  }
  return {
    origins,
    sources,
    frontendOrigin: safeOrigin(env.PLAYWRIGHT_BASE_URL),
    backendOrigin: safeOrigin(env.BACKEND_BASE_URL),
    gatewayOrigin: safeOrigin(env.VITE_SUPABASE_URL),
  };
}

/**
 * Hazard guard: a page that is on a loopback host whose origin is NOT in appOrigins
 * (e.g. 127.0.0.1 while the gate configured localhost) would make every app error look
 * third-party. Returns true when the page URL is such a mismatch.
 */
export function isLoopbackOriginMismatch(pageUrl, appOrigins) {
  const origin = safeOrigin(pageUrl);
  if (origin === null) return false;
  let host = '';
  try {
    host = new URL(pageUrl).hostname;
  } catch {
    return false;
  }
  const loopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
  return loopback && !appOrigins.includes(origin);
}
