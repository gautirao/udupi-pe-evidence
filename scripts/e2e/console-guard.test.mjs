// node --test for the canonical console + pageerror classifier (issue #2750 CANON (a), PC-2).
// Picked up by the existing `node --test scripts/e2e/*.test.mjs` (npm run test:e2e:guard:unit).
// The classifier lives in e2e/canonical/support/console-guard.mjs; an e2e/**/*.test.* file would
// trip the estate guard (FC-17), hence this location.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  IGNORE_RULES,
  appOriginsFromEnv,
  classifyConsoleEntry,
  isLoopbackOriginMismatch,
} from '../../e2e/canonical/support/console-guard.mjs';

const FE = 'http://localhost:5381';
const BE = 'http://localhost:8381';
const GW = 'http://localhost:29999';
const ctx = { appOrigins: [FE, BE, GW], frontendOrigin: FE, backendOrigin: BE, gatewayOrigin: GW };

const consoleErr = (text, locationUrl) => ({ kind: 'console', type: 'error', text, locationUrl });
const res = (status, locationUrl) =>
  consoleErr(`Failed to load resource: the server responded with a status of ${status} (X)`, locationUrl);

// ---- FAIL arms -----------------------------------------------------------------------------
test('R-PE: every pageerror fails (no ignore list), whatever the text', () => {
  for (const text of ['boom', 'ResizeObserver loop limit exceeded', 'AbortError: aborted', '']) {
    assert.deepEqual(classifyConsoleEntry({ kind: 'pageerror', text, locationUrl: '' }, ctx), {
      verdict: 'FAIL',
      rule: 'R-PE',
    });
  }
});

test('R-CE: console.error on an app origin fails', () => {
  assert.deepEqual(classifyConsoleEntry(consoleErr('boom', `${FE}/assets/index-abc.js`), ctx), {
    verdict: 'FAIL',
    rule: 'R-CE',
  });
  assert.equal(classifyConsoleEntry(consoleErr('boom', `${GW}/auth/v1/x`), ctx).verdict, 'FAIL');
});

test('R-CE: console.error with an EMPTY location fails', () => {
  assert.deepEqual(classifyConsoleEntry(consoleErr('boom', ''), ctx), { verdict: 'FAIL', rule: 'R-CE' });
});

test('R-5XX: resource load 5xx on an app origin fails (frontend and backend origins)', () => {
  for (const code of [500, 502, 503, 599]) {
    assert.deepEqual(classifyConsoleEntry(res(code, `${BE}/api/discover/listings`), ctx), {
      verdict: 'FAIL',
      rule: 'R-5XX',
    });
  }
  assert.equal(classifyConsoleEntry(res(500, `${FE}/x.js`), ctx).rule, 'R-5XX');
});

test('fail-closed: unparseable / non-4xx app resource lines fail (R-RES), never ignored', () => {
  const noStatus = consoleErr('Failed to load resource: net::ERR_CONNECTION_REFUSED', `${BE}/api/x`);
  assert.deepEqual(classifyConsoleEntry(noStatus, ctx), { verdict: 'FAIL', rule: 'R-RES' });
  assert.deepEqual(classifyConsoleEntry(res(302, `${FE}/x`), ctx), { verdict: 'FAIL', rule: 'R-RES' });
  // 4xx with an empty location is not provably an app-origin expected negative path.
  assert.deepEqual(classifyConsoleEntry(res(401, ''), ctx), { verdict: 'FAIL', rule: 'R-RES' });
});

test('fail-closed: a non-resource console.error from a non-app origin fails (R-CE-X)', () => {
  assert.deepEqual(classifyConsoleEntry(consoleErr('boom', 'https://evil.example.com/a.js'), ctx), {
    verdict: 'FAIL',
    rule: 'R-CE-X',
  });
});

test('fail-closed: empty appOrigins or unknown kind throws', () => {
  assert.throws(() => classifyConsoleEntry(consoleErr('x', FE), { appOrigins: [] }), /fail closed/);
  assert.throws(() => classifyConsoleEntry(consoleErr('x', FE), undefined), /fail closed/);
  assert.throws(() => classifyConsoleEntry({ kind: 'weird', type: 'error' }, ctx), /unknown entry kind/);
});

// ---- IGNORE arms (I1-I4) -------------------------------------------------------------------
test('I1: resource load failure from a non-app origin is ignored', () => {
  for (const url of [
    'https://tile.openstreetmap.org/12/1/2.png',
    'https://fonts.googleapis.com/css2?family=X',
    'https://fonts.gstatic.com/s/x.woff2',
  ]) {
    assert.deepEqual(classifyConsoleEntry(res(503, url), ctx), { verdict: 'IGNORE', rule: 'I1' });
    assert.deepEqual(classifyConsoleEntry(res(404, url), ctx), { verdict: 'IGNORE', rule: 'I1' });
  }
});

const TILE_ORIGINS = [
  'https://tile.openstreetmap.org',
  'https://a.tile.openstreetmap.org',
  'https://b.tile.openstreetmap.org',
  'https://c.tile.openstreetmap.org',
];
const ALLOWLISTED_ORIGINS = [...TILE_ORIGINS, 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

test('I1 exact-origin allowlist (i): arbitrary third-party origin 503 resource load FAILS', () => {
  assert.deepEqual(classifyConsoleEntry(res(503, 'https://cdn.example.com/x.png'), ctx), {
    verdict: 'FAIL',
    rule: 'R-RES-X',
  });
});

test('I1 exact-origin allowlist (ii): arbitrary third-party origin 404 resource load FAILS', () => {
  assert.deepEqual(classifyConsoleEntry(res(404, 'https://cdn.example.com/x.png'), ctx), {
    verdict: 'FAIL',
    rule: 'R-RES-X',
  });
});

test('I1 exact-origin allowlist (iii): each allowlisted origin 404 is IGNORE I1', () => {
  for (const o of ALLOWLISTED_ORIGINS) {
    assert.deepEqual(classifyConsoleEntry(res(404, `${o}/p`), ctx), { verdict: 'IGNORE', rule: 'I1' }, o);
  }
});

test('I1 exact-origin allowlist (iv): each allowlisted origin 503 is IGNORE I1', () => {
  for (const o of ALLOWLISTED_ORIGINS) {
    assert.deepEqual(classifyConsoleEntry(res(503, `${o}/p`), ctx), { verdict: 'IGNORE', rule: 'I1' }, o);
  }
});

test('I1 exact-origin allowlist (v): look-alike origins FAIL (suffix, other scheme, other port, other subdomain)', () => {
  for (const u of [
    'https://tile.openstreetmap.org.evil.example/p',
    'https://evil-tile.openstreetmap.org/p',
    'https://d.tile.openstreetmap.org/p',
    'http://tile.openstreetmap.org/p',
    'https://tile.openstreetmap.org:8443/p',
    'https://openstreetmap.org/p',
  ]) {
    assert.deepEqual(classifyConsoleEntry(res(503, u), ctx), { verdict: 'FAIL', rule: 'R-RES-X' }, u);
  }
});

// ---- I2 is an ENUMERATED allowlist (Codex round 1, finding c) -------------------------------------
// Derived from the console-guard.json attachments of the final-gate-3 run: every IGNORE'd app-origin 4xx was a 404 on the BACKEND
// origin for a local-dev-storage listing-image under listing-images/{e2e-fixtures|listings}/.../photo-N.jpg. The auth negatives
// come from the documented sources: useBrokerListingQuality (pre-session 401 retry), JwtConfig (anon 401 on the two authenticated
// discover GETs), and a bad-password sign-in (400 from the gateway token endpoint).
const IMG = '/api/dev/local-storage/public/listing-images';
const UUID_A = '482b6350-7831-45ed-9aac-1c758b15f540';
const UUID_B = 'd7671f0f-8531-4f9a-bf4b-a6c8c58b75e1';
const FIXTURE_IMAGES = [
  `${BE}${IMG}/e2e-fixtures/e2e00001-0000-0000-0000-000000000001/photo-1.jpg`,
  `${BE}${IMG}/e2e-fixtures/e2e00001-0000-0000-0000-000000000002/photo-2.jpg`,
  `${BE}${IMG}/listings/${UUID_A}/${UUID_B}/photo-3.jpg`,
];
const ALLOWLISTED_4XX = [
  ['I2a', 404, FIXTURE_IMAGES[0]],
  ['I2a', 404, FIXTURE_IMAGES[1]],
  ['I2a', 404, FIXTURE_IMAGES[2]],
  ['I2b', 401, `${BE}/api/broker/listing-quality`],
  ['I2c', 401, `${BE}/api/discover/markers`],
  ['I2c', 401, `${BE}/api/discover/listings`],
  ['I2d', 400, `${GW}/auth/v1/token`],
  ['I2d', 400, `${GW}/auth/v1/token?grant_type=password`],
];

test('I2a-I2d: each documented app-origin negative path is IGNORED under its own named rule', () => {
  for (const [rule, code, url] of ALLOWLISTED_4XX) {
    assert.deepEqual(classifyConsoleEntry(res(code, url), ctx), { verdict: 'IGNORE', rule }, `${code} ${url}`);
  }
});

test('I2 (c): an app-origin 4xx that is NOT enumerated FAILS as R-4XX - missing chunk/stylesheet, renamed API, wrong status', () => {
  for (const [code, url] of [
    [404, `${FE}/assets/missing.js`],
    [404, `${FE}/assets/index-abc.css`],
    [404, `${FE}/missing.png`],
    [404, `${BE}/api/discover/listingz`],
    [401, `${BE}/api/discover/listingz`],
    [404, `${BE}/api/discover/listings`],
    [404, `${BE}/api/discover/markers`],
    [403, `${BE}/api/discover/listings`],
    [403, `${BE}/api/broker/listing-quality`],
    [404, `${BE}/api/broker/listing-quality`],
    [401, `${BE}/api/broker/listing-qualityz`],
    [401, `${BE}/api/admin/listings`],
    [400, `${BE}/api/bookings`],
    [401, `${GW}/auth/v1/token`],
    [400, `${GW}/auth/v1/other`],
    [404, `${GW}/auth/v1/token`],
    [400, `${BE}/auth/v1/token`],
  ]) {
    assert.deepEqual(classifyConsoleEntry(res(code, url), ctx), { verdict: 'FAIL', rule: 'R-4XX' }, `${code} ${url}`);
  }
});

test('I2a is anchored: near-miss image paths FAIL (extension, depth, traversal, query, id shape, other directory)', () => {
  for (const url of [
    `${BE}${IMG}/e2e-fixtures/e2e00001-0000-0000-0000-000000000001/photo-1.png`,
    `${BE}${IMG}/e2e-fixtures/e2e00001-0000-0000-0000-000000000001/photo-1.jpg.map`,
    `${BE}${IMG}/e2e-fixtures/e2e00001-0000-0000-0000-000000000001/extra/photo-1.jpg`,
    `${BE}${IMG}/e2e-fixtures/e2e00001-0000-0000-0000-000000000001/photo-.jpg`,
    `${BE}${IMG}/e2e-fixtures/not-a-uuid/photo-1.jpg`,
    `${BE}${IMG}/listings/${UUID_A}/photo-1.jpg`,
    `${BE}${IMG}/listings/${UUID_A}/${UUID_B}/extra/photo-1.jpg`,
    `${BE}${IMG}/listings/${UUID_A}/${UUID_B}/photo-1.jpg?x=1`,
    `${BE}${IMG}/listings/${UUID_A}/${UUID_B}/photo-1.jpg#frag`,
    `${BE}${IMG}/other/${UUID_A}/${UUID_B}/photo-1.jpg`,
    `${BE}${IMG}/../secrets/photo-1.jpg`,
    `${BE}${IMG}x/e2e-fixtures/e2e00001-0000-0000-0000-000000000001/photo-1.jpg`,
    `${BE}/prefix${IMG}/e2e-fixtures/e2e00001-0000-0000-0000-000000000001/photo-1.jpg`,
    `${BE}/api/dev/local-storage/public/other-bucket/e2e-fixtures/e2e00001-0000-0000-0000-000000000001/photo-1.jpg`,
    `${BE}/api/dev/local-storage/upload`,
  ]) {
    assert.deepEqual(classifyConsoleEntry(res(404, url), ctx), { verdict: 'FAIL', rule: 'R-4XX' }, url);
  }
  // wrong status for an otherwise exact image path
  for (const code of [400, 401, 403, 410]) {
    assert.equal(classifyConsoleEntry(res(code, FIXTURE_IMAGES[0]), ctx).verdict, 'FAIL', String(code));
  }
});

test('I2 (c) discrimination: identical 404 text IGNOREs a fixture image on the BACKEND origin but FAILS any other path', () => {
  const text = 'Failed to load resource: the server responded with a status of 404 ()';
  assert.deepEqual(classifyConsoleEntry(consoleErr(text, FIXTURE_IMAGES[0]), ctx), { verdict: 'IGNORE', rule: 'I2a' });
  assert.deepEqual(classifyConsoleEntry(consoleErr(text, `${BE}/api/dev/local-storage/public/listing-docs/x.jpg`), ctx), { verdict: 'FAIL', rule: 'R-4XX' });
  assert.deepEqual(classifyConsoleEntry(consoleErr(text, `${BE}/api/discover/listingz`), ctx), { verdict: 'FAIL', rule: 'R-4XX' });
  assert.deepEqual(classifyConsoleEntry(consoleErr(text, `${FE}/assets/missing.js`), ctx), { verdict: 'FAIL', rule: 'R-4XX' });
});

test('I2 (c): a fixture-image-shaped path on the FRONTEND (or gateway) origin FAILS - the allowlist is backend-origin only', () => {
  const path = new URL(FIXTURE_IMAGES[0]).pathname;
  for (const origin of [FE, GW, 'http://localhost:1']) {
    const withOrigin = { ...ctx, appOrigins: [FE, BE, GW, 'http://localhost:1'] };
    const r = classifyConsoleEntry(res(404, `${origin}${path}`), withOrigin);
    assert.equal(r.verdict, 'FAIL', origin);
  }
  assert.deepEqual(classifyConsoleEntry(res(404, `${FE}${path}`), ctx), { verdict: 'FAIL', rule: 'R-4XX' });
  assert.deepEqual(classifyConsoleEntry(res(404, `${GW}${path}`), ctx), { verdict: 'FAIL', rule: 'R-4XX' });
});

test('I2 (c): the auth negatives are origin-bound - the broker/discover 401s on the gateway and the token 400 on the backend FAIL', () => {
  assert.equal(classifyConsoleEntry(res(401, `${GW}/api/broker/listing-quality`), ctx).verdict, 'FAIL');
  assert.equal(classifyConsoleEntry(res(401, `${FE}/api/discover/listings`), ctx).verdict, 'FAIL');
  assert.equal(classifyConsoleEntry(res(400, `${FE}/auth/v1/token`), ctx).verdict, 'FAIL');
  assert.equal(classifyConsoleEntry(res(400, `${BE}/auth/v1/token`), ctx).verdict, 'FAIL');
});

test('I2 (c) fail-closed: a ctx without the role origins ignores NO app-origin 4xx (even an allowlisted shape)', () => {
  const legacyCtx = { appOrigins: [FE, BE, GW] };
  for (const [, code, url] of ALLOWLISTED_4XX) {
    assert.deepEqual(classifyConsoleEntry(res(code, url), legacyCtx), { verdict: 'FAIL', rule: 'R-4XX' }, url);
  }
});

test('I2 (c): an empty-location 4xx and a non-parseable status are still R-RES (unchanged), 5xx still R-5XX on the allowlisted paths', () => {
  assert.deepEqual(classifyConsoleEntry(res(404, ''), ctx), { verdict: 'FAIL', rule: 'R-RES' });
  assert.deepEqual(classifyConsoleEntry(res(500, FIXTURE_IMAGES[0]), ctx), { verdict: 'FAIL', rule: 'R-5XX' });
  assert.deepEqual(classifyConsoleEntry(res(503, `${GW}/auth/v1/token`), ctx), { verdict: 'FAIL', rule: 'R-5XX' });
});

// ---- I2c matches the PATHNAME (query + hash stripped): the documented 401s carry a query (Codex round 2, 4300048147) ------------
// useDiscoverListings.ts:220 -> /api/discover/listings?${params}; useDiscoverFilteredMarkers.ts:142 -> /api/discover/markers?${params}.
const NODE_KEY_Q = '?nodeKey=a:IN|KA|Bengaluru|RR%20Nagar';
const POLYGON_Q = '?polygon=12.9,77.5;12.9,77.6;13.0,77.6&city=Bengaluru';

test('I2c (query): the documented anonymous 401 WITH a query is IGNORED under I2c (listings and markers, nodeKey and polygon)', () => {
  for (const url of [
    `${BE}/api/discover/listings${NODE_KEY_Q}`,
    `${BE}/api/discover/markers${NODE_KEY_Q}`,
    `${BE}/api/discover/listings${POLYGON_Q}`,
    `${BE}/api/discover/markers${POLYGON_Q}`,
    `${BE}/api/discover/listings${NODE_KEY_Q}#frag`,
  ]) {
    assert.deepEqual(classifyConsoleEntry(res(401, url), ctx), { verdict: 'IGNORE', rule: 'I2c' }, url);
  }
});

test('I2c (query): an UNDOCUMENTED app-origin 401 with a query FAILS R-4XX (path is still exact)', () => {
  for (const url of [
    `${BE}/api/discover/listingz${NODE_KEY_Q}`,
    `${BE}/api/discover/listings/extra${NODE_KEY_Q}`,
    `${BE}/api/admin/listings${NODE_KEY_Q}`,
    `${BE}/api/bookings${POLYGON_Q}`,
    `${BE}/prefix/api/discover/markers${POLYGON_Q}`,
    `${FE}/api/discover/listings${NODE_KEY_Q}`,
    `${GW}/api/discover/markers${POLYGON_Q}`,
  ]) {
    assert.deepEqual(classifyConsoleEntry(res(401, url), ctx), { verdict: 'FAIL', rule: 'R-4XX' }, url);
  }
});

test('I2c (query): the documented path WITH a query but a different status FAILS R-4XX (403/404/400)', () => {
  for (const code of [400, 403, 404, 410]) {
    for (const url of [`${BE}/api/discover/listings${NODE_KEY_Q}`, `${BE}/api/discover/markers${POLYGON_Q}`]) {
      assert.deepEqual(classifyConsoleEntry(res(code, url), ctx), { verdict: 'FAIL', rule: 'R-4XX' }, `${code} ${url}`);
    }
  }
});

test('I2c (query) discrimination: identical 401 text IGNOREs the documented path with a query but FAILS an undocumented path with the same query', () => {
  const text = 'Failed to load resource: the server responded with a status of 401 ()';
  assert.deepEqual(classifyConsoleEntry(consoleErr(text, `${BE}/api/discover/listings${NODE_KEY_Q}`), ctx), { verdict: 'IGNORE', rule: 'I2c' });
  assert.deepEqual(classifyConsoleEntry(consoleErr(text, `${BE}/api/discover/listingz${NODE_KEY_Q}`), ctx), { verdict: 'FAIL', rule: 'R-4XX' });
});

test('I2a/I2b stay queryless (verified: fixture images and /api/broker/listing-quality are requested without a query): a query FAILS R-4XX', () => {
  assert.deepEqual(classifyConsoleEntry(res(401, `${BE}/api/broker/listing-quality?x=1`), ctx), { verdict: 'FAIL', rule: 'R-4XX' });
  assert.deepEqual(classifyConsoleEntry(res(404, `${FIXTURE_IMAGES[0]}?x=1`), ctx), { verdict: 'FAIL', rule: 'R-4XX' });
});

test('I3: chrome-extension: and devtools: locations are ignored', () => {
  assert.deepEqual(classifyConsoleEntry(consoleErr('boom', 'chrome-extension://abc/x.js'), ctx), {
    verdict: 'IGNORE',
    rule: 'I3',
  });
  assert.deepEqual(classifyConsoleEntry(consoleErr('boom', 'devtools://devtools/x.js'), ctx), {
    verdict: 'IGNORE',
    rule: 'I3',
  });
});

test('I4: console types other than error are ignored', () => {
  for (const type of ['warning', 'info', 'log', 'debug']) {
    assert.deepEqual(
      classifyConsoleEntry({ kind: 'console', type, text: 'anything', locationUrl: `${FE}/a.js` }, ctx),
      { verdict: 'IGNORE', rule: 'I4' },
    );
  }
});

// ---- discrimination arm --------------------------------------------------------------------
test('discrimination: identical 500 text is FAIL from the app origin but IGNORE from a tile origin', () => {
  const text = 'Failed to load resource: the server responded with a status of 500 (Internal Server Error)';
  assert.equal(classifyConsoleEntry(consoleErr(text, `${BE}/api/discover/listings`), ctx).verdict, 'FAIL');
  assert.equal(
    classifyConsoleEntry(consoleErr(text, 'https://tile.openstreetmap.org/1/2/3.png'), ctx).verdict,
    'IGNORE',
  );
});

test('origin is read from locationUrl, never from the message text', () => {
  // Text names the app origin but the location is a third party: still IGNORE (I1).
  const spoofText = `Failed to load resource: ${BE}/api/x status of 500`;
  assert.equal(
    classifyConsoleEntry(consoleErr(spoofText, 'https://tile.openstreetmap.org/a.png'), ctx).rule,
    'I1',
  );
  // Text names a tile origin but the location is the app: FAIL.
  const tileText = 'Failed to load resource: https://tile.openstreetmap.org/a.png status of 500';
  assert.equal(classifyConsoleEntry(consoleErr(tileText, `${BE}/api/x`), ctx).rule, 'R-5XX');
});

// ---- origin derivation / single source -----------------------------------------------------
test('appOriginsFromEnv: exact origins, dedupes, records sources', () => {
  const { origins, sources } = appOriginsFromEnv({
    PLAYWRIGHT_BASE_URL: `${FE}/`,
    BACKEND_BASE_URL: `${BE}/api`,
    VITE_SUPABASE_URL: GW,
  });
  assert.deepEqual(origins, [FE, BE, GW]);
  assert.equal(sources[GW], 'VITE_SUPABASE_URL');
});

test('appOriginsFromEnv: missing or unparsable value throws (fail closed)', () => {
  const ok = { PLAYWRIGHT_BASE_URL: FE, BACKEND_BASE_URL: BE, VITE_SUPABASE_URL: GW };
  for (const name of Object.keys(ok)) {
    assert.throws(() => appOriginsFromEnv({ ...ok, [name]: undefined }), new RegExp(`${name} is unset`));
    assert.throws(() => appOriginsFromEnv({ ...ok, [name]: 'not a url' }), /not a parseable URL/);
  }
});

test('isLoopbackOriginMismatch: 127.0.0.1 page while the gate configured localhost', () => {
  assert.equal(isLoopbackOriginMismatch('http://127.0.0.1:5381/discover', ctx.appOrigins), true);
  assert.equal(isLoopbackOriginMismatch(`${FE}/discover`, ctx.appOrigins), false);
  assert.equal(isLoopbackOriginMismatch('about:blank', ctx.appOrigins), false);
  assert.equal(isLoopbackOriginMismatch('https://example.com/', ctx.appOrigins), false);
});

test('appOriginsFromEnv: role origins are derived from the SAME env vars (frontend, backend, auth gateway)', () => {
  const r = appOriginsFromEnv({ PLAYWRIGHT_BASE_URL: `${FE}/`, BACKEND_BASE_URL: `${BE}/api`, VITE_SUPABASE_URL: `${GW}/auth/v1` });
  assert.equal(r.frontendOrigin, FE);
  assert.equal(r.backendOrigin, BE);
  assert.equal(r.gatewayOrigin, GW);
  // classifier ctx built exactly as canonical-test.ts builds it
  const built = { appOrigins: r.origins, frontendOrigin: r.frontendOrigin, backendOrigin: r.backendOrigin, gatewayOrigin: r.gatewayOrigin };
  assert.deepEqual(classifyConsoleEntry(res(404, FIXTURE_IMAGES[0]), built), { verdict: 'IGNORE', rule: 'I2a' });
});

test('appOriginsFromEnv (Codex d): the manual invocation inputs work with VITE_SUPABASE_URL exported, and without it fail closed naming the variable AND the fix', () => {
  const manual = { PLAYWRIGHT_BASE_URL: 'http://localhost:5251', BACKEND_BASE_URL: 'http://localhost:8251' };
  // WITH the variable (what the README manual command now exports): derived, never guessed.
  const ok = appOriginsFromEnv({ ...manual, VITE_SUPABASE_URL: 'http://localhost:54321' });
  assert.equal(ok.gatewayOrigin, 'http://localhost:54321');
  assert.deepEqual(ok.origins, ['http://localhost:5251', 'http://localhost:8251', 'http://localhost:54321']);
  // WITHOUT it: no default, no derivation from another variable (VITE_API_BASE_URL / SUPABASE_URL are NOT consulted).
  assert.throws(
    () => appOriginsFromEnv({ ...manual, VITE_API_BASE_URL: 'http://localhost:8251', SUPABASE_URL: 'http://localhost:54321' }),
    (err) =>
      /VITE_SUPABASE_URL is unset/.test(err.message) &&
      /export VITE_SUPABASE_URL/.test(err.message) &&
      /e2e\/canonical\/README\.md/.test(err.message) &&
      /scripts\/run-e2e-gate\.sh/.test(err.message),
  );
  // An empty string is "unset" too (a stale `VITE_SUPABASE_URL=` in a shell must not pass).
  assert.throws(() => appOriginsFromEnv({ ...manual, VITE_SUPABASE_URL: '' }), /VITE_SUPABASE_URL is unset/);
});

test('IGNORE_RULES is the single source: ids I1, I2a-I2d, I3, I4, each with a one-line reason, frozen', () => {
  assert.deepEqual(
    IGNORE_RULES.map((r) => r.id),
    ['I1', 'I2a', 'I2b', 'I2c', 'I2d', 'I3', 'I4'],
  );
  for (const r of IGNORE_RULES) {
    assert.ok(r.reason.length > 20 && !r.reason.includes('\n'));
  }
  assert.ok(Object.isFrozen(IGNORE_RULES));
});
