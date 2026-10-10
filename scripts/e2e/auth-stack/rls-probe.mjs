#!/usr/bin/env node
// scripts/e2e/auth-stack/rls-probe.mjs - issue #2750 FC-27 (b)(c) + S2 live probe through PostgREST (local canonical auth stack).
// Usage: node rls-probe.mjs --workdir <dir> --gw <http://localhost:PORT>
// Prints only statuses / counts / PostgREST error CODES. Never a token, key, password, phone or email value.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const dir = arg('workdir'), gw = arg('gw');
if (!dir || !gw) { console.error('usage: --workdir --gw'); process.exit(2); }
const creds = {};
for (const line of readFileSync(join(dir, 'creds.env'), 'utf8').split('\n')) { const m = /^export (\w+)=(.*)$/.exec(line); if (m) creds[m[1]] = m[2]; }
const anon = readFileSync(join(dir, 'anon.jwt'), 'utf8').trim();
const claimsOf = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString());
async function login(p) {
  const r = await fetch(`${gw}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: anon },
    body: JSON.stringify({ email: creds[`${p}_EMAIL`], password: creds[`${p}_PASSWORD`] }) });
  const tok = (await r.json()).access_token;
  if (typeof tok !== 'string' || tok.split('.').length !== 3) { console.log(`FAIL login as ${p} returned no access token (http ${r.status})`); process.exit(1); }
  return tok;
}
const rest = async (path, token, init = {}) => {
  const r = await fetch(`${gw}/rest/v1/${path}`, { ...init, headers: { apikey: anon, Authorization: `Bearer ${token ?? anon}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  let body; try { body = await r.json(); } catch { body = null; }
  return { status: r.status, body };
};
const adminTok = await login('ADMIN'), userTok = await login('SMOKE_USER');
const adminSub = claimsOf(adminTok).sub, userSub = claimsOf(userTok).sub;
let fails = 0;
const check = (label, ok, detail) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` [${detail}]` : ''}`); };
const code = (r) => (r.body && !Array.isArray(r.body) ? r.body.code : undefined);

// user_roles: AuthContext.tsx:36 path
let r = await rest(`user_roles?select=user_id,role`, userTok);
check('authenticated(user) reads ONLY its own user_roles row', r.status === 200 && r.body.length === 1 && r.body[0].user_id === userSub && r.body[0].role === 'user', `http=${r.status} rows=${r.body?.length}`);
r = await rest(`user_roles?select=role&user_id=eq.${userSub}`, userTok);
check('AuthContext path: user_roles?user_id=eq.<self> -> role user', r.status === 200 && r.body.length === 1 && r.body[0].role === 'user', `http=${r.status}`);
r = await rest(`user_roles?select=role&user_id=eq.${adminSub}`, userTok);
check('authenticated(user) cannot read ANOTHER user\'s role', r.status === 200 && r.body.length === 0, `http=${r.status} rows=${r.body?.length}`);
r = await rest(`user_roles?select=role&user_id=eq.${adminSub}`, adminTok);
check('AuthContext path: admin reads own role -> admin', r.status === 200 && r.body.length === 1 && r.body[0].role === 'admin', `http=${r.status}`);
r = await rest(`user_roles?select=user_id`, adminTok);
check('role differential: admin sees MORE than own user_roles rows (admin policy live)', r.status === 200 && r.body.length > 1, `rows=${r.body?.length}`);
r = await rest(`user_roles?select=user_id`, null);
check('anon denied on user_roles (no rows / no access)', (r.status >= 400) || (r.status === 200 && r.body.length === 0), `http=${r.status} rows=${Array.isArray(r.body) ? r.body.length : 'n/a'}`);

// profiles: AuthContext.tsx:66 path
r = await rest(`profiles?select=user_id,insights_access_until`, userTok);
check('authenticated(user) reads ONLY its own profiles row', r.status === 200 && r.body.length === 1 && r.body[0].user_id === userSub, `http=${r.status} rows=${r.body?.length}`);
r = await rest(`profiles?select=user_id`, adminTok);
check('role differential: admin sees more than own profiles row', r.status === 200 && r.body.length > 1, `rows=${r.body?.length}`);
r = await rest(`profiles?select=user_id`, null);
check('anon sees no profiles', (r.status >= 400) || (r.status === 200 && r.body.length === 0), `http=${r.status}`);

// property_listings: usePropertyListings.ts path (explicit allow-list projection + raw_posts embed)
const SAFE = 'id,title,locality,price,area_key,status,is_valid,is_duplicate,created_at';
r = await rest(`property_listings?select=${SAFE}&is_valid=eq.true&is_duplicate=eq.false&order=created_at.desc&limit=5`, userTok);
check('authenticated reads property_listings (allow-list projection)', r.status === 200 && r.body.length > 0, `http=${r.status} rows=${r.body?.length}`);
r = await rest(`property_listings?select=${SAFE},raw_posts(images)&is_valid=eq.true&limit=2`, userTok);
check('authenticated reads property_listings with raw_posts(images) embed (usePropertyListings shape)', r.status === 200, `http=${r.status} code=${code(r) ?? '-'}`);
r = await rest(`property_listings?select=locality,area_key&is_valid=eq.true&limit=3`, userTok);
check('authenticated useLocalities shape', r.status === 200 && r.body.length > 0, `http=${r.status} rows=${r.body?.length}`);
r = await rest(`property_listings?select=${SAFE}&limit=3`, null);
console.log(`INFO anon property_listings (allow-list projection): http=${r.status} rows=${Array.isArray(r.body) ? r.body.length : 'n/a'} (informational: RLS decides row visibility for anon)`);

// FC-27c live: revoked columns are not selectable by either browser role
for (const [who, tok] of [['authenticated(user)', userTok], ['authenticated(admin)', adminTok], ['anon', null]]) {
  for (const col of ['contact_phone', 'contact_info']) {
    r = await rest(`property_listings?select=${col}&limit=1`, tok);
    check(`FC-27c ${who} SELECT ${col} -> permission error`, [401, 403].includes(r.status) && code(r) === '42501', `http=${r.status} code=${code(r) ?? '-'}`);
  }
  r = await rest(`property_listings?select=*&limit=1`, tok);
  check(`FC-27c ${who} select=* -> permission error (V128 allow-list, no wildcard)`, [401, 403].includes(r.status) && code(r) === '42501', `http=${r.status} code=${code(r) ?? '-'}`);
}
r = await rest(`property_listings?select=id&contact_phone=not.is.null&limit=1`, userTok);
check('FC-27c authenticated cannot FILTER on contact_phone either', [401, 403].includes(r.status) && code(r) === '42501', `http=${r.status} code=${code(r) ?? '-'}`);
r = await rest(`property_listings?id=eq.00000000-0000-0000-0000-000000000000`, userTok, { method: 'PATCH', body: JSON.stringify({ contact_phone: 'x' }) });
check('FC-27c authenticated cannot UPDATE contact_phone', [401, 403].includes(r.status) && code(r) === '42501', `http=${r.status} code=${code(r) ?? '-'}`);

// auth.uid() inside SECURITY DEFINER admin RPCs (V128) proves the overlay's auth.uid() reads the verified claims
r = await rest(`rpc/admin_get_listing_contacts`, adminTok, { method: 'POST', body: JSON.stringify({ p_listing_ids: [] }) });
check('admin RPC admin_get_listing_contacts callable by admin (auth.uid() live)', r.status === 200, `http=${r.status}`);
r = await rest(`rpc/admin_get_listing_contacts`, userTok, { method: 'POST', body: JSON.stringify({ p_listing_ids: [] }) });
check('admin RPC denied for non-admin (is_admin(auth.uid()) false)', r.status >= 400, `http=${r.status}`);

// V141/V143 staging tables: RLS default-deny survives GRANT ALL
for (const t of ['agricultural_import_candidate', 'commercial_import_candidate', 'commercial_import_batch', 'agricultural_import_batch']) {
  const ru = await rest(`${t}?select=id&limit=1`, userTok), ra = await rest(`${t}?select=id&limit=1`, null);
  const rd = await rest(`${t}?select=id&limit=1`, adminTok);
  check(`${t}: positive control - admin CAN read (table is populated)`, rd.status === 200 && rd.body.length === 1, `admin=${rd.status}/${rd.body?.length}`);
  check(`${t}: non-admin authenticated and anon see no rows`, ru.status === 200 && ru.body.length === 0 && (ra.status >= 400 || ra.body.length === 0), `user=${ru.status}/${ru.body?.length} anon=${ra.status}`);
}
console.log(fails === 0 ? 'rls-probe: ALL EXPECTATIONS HELD' : `rls-probe: ${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
