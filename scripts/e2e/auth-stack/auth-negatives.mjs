#!/usr/bin/env node
// scripts/e2e/auth-stack/auth-negatives.mjs - issue #2750 FC-27(a) live probe: the real backend rejects forged tokens.
// Usage: node auth-negatives.mjs --workdir <dir> --gw <http://localhost:PORT> --backend <http://localhost:PORT>
// Reads creds.env + keys from <dir>. Prints ONLY status codes / labels - never a token, key or password.
// Exit 0 only if every expectation holds.
import { readFileSync } from 'node:fs';
import { createPrivateKey } from 'node:crypto';
import { join } from 'node:path';
import { signJwt, KID } from './mint-keys.mjs';

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const dir = arg('workdir'), gw = arg('gw'), be = arg('backend');
if (!dir || !gw || !be) { console.error('usage: --workdir --gw --backend'); process.exit(2); }

const creds = {};
for (const line of readFileSync(join(dir, 'creds.env'), 'utf8').split('\n')) {
  const m = /^export (\w+)=(.*)$/.exec(line); if (m) creds[m[1]] = m[2];
}
const anon = readFileSync(join(dir, 'anon.jwt'), 'utf8').trim();
const realPriv = createPrivateKey({ key: JSON.parse(readFileSync(join(dir, 'jwt_keys.json'), 'utf8'))[0], format: 'jwk' });
const foreignPriv = createPrivateKey({ key: JSON.parse(readFileSync(join(dir, 'foreign_private.jwk.json'), 'utf8')), format: 'jwk' });

async function login(prefix) {
  const r = await fetch(`${gw}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: anon },
    body: JSON.stringify({ email: creds[`${prefix}_EMAIL`], password: creds[`${prefix}_PASSWORD`] }),
  });
  const tok = (await r.json()).access_token;
  if (typeof tok !== 'string' || tok.split('.').length !== 3) {
    console.log(`FAIL login as ${prefix} returned no access token (http ${r.status}); no negative can be judged`);
    process.exit(1);
  }
  return tok;
}
const claimsOf = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString());
const get = async (path, token) => (await fetch(`${be}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })).status;

const adminTok = await login('ADMIN'), userTok = await login('SMOKE_USER');
const c = claimsOf(adminTok);
const now = Math.floor(Date.now() / 1000);
// Flip a character in the MIDDLE of the signature. The last base64url character of a 256-byte RS256 signature carries
// 2 padding bits, so flipping it can leave the decoded bytes identical (a vacuous "tamper").
const flip = (t) => {
  const [h, b, sig] = t.split('.');
  const i = Math.floor(sig.length / 2);
  return `${h}.${b}.${sig.slice(0, i)}${sig[i] === 'A' ? 'B' : 'A'}${sig.slice(i + 1)}`;
};
const variants = {
  'tampered-signature': flip(adminTok),
  'foreign-rs256-key-same-kid': signJwt(foreignPriv, { ...c, iat: now, exp: now + 3600 }, KID),
  'foreign-issuer (valid sig, real key)': signJwt(realPriv, { ...c, iss: 'https://evil.example.invalid/auth/v1', iat: now, exp: now + 3600 }),
  'foreign-issuer + foreign-key': signJwt(foreignPriv, { ...c, iss: 'https://evil.example.invalid/auth/v1', iat: now, exp: now + 3600 }, KID),
  'expired (valid sig, real key)': signJwt(realPriv, { ...c, iat: now - 7200, exp: now - 3600 }),
};
const AUTHED = '/api/listings/mine', ADMINONLY = '/api/admin/listings/stale';
const rows = [];
const expect = (label, got, want) => { const ok = got === want; rows.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: got ${got} want ${want}`); };

expect(`valid admin token -> ${AUTHED}`, await get(AUTHED, adminTok), 200);
expect(`valid user token  -> ${AUTHED}`, await get(AUTHED, userTok), 200);
expect(`role gate: admin   -> ${ADMINONLY}`, await get(ADMINONLY, adminTok), 200);
expect(`role gate: user    -> ${ADMINONLY}`, await get(ADMINONLY, userTok), 403);
for (const [label, tok] of Object.entries(variants)) expect(`${label} -> ${AUTHED}`, await get(AUTHED, tok), 401);
expect(`no token -> ${AUTHED}`, await get(AUTHED, null), 401);
expect(`no token -> ${ADMINONLY}`, await get(ADMINONLY, null), 401);
console.log(rows.every(Boolean) ? 'auth-negatives: ALL EXPECTATIONS HELD' : 'auth-negatives: FAILED');
process.exit(rows.every(Boolean) ? 0 : 1);
