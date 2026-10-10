#!/usr/bin/env node
// scripts/e2e/auth-stack/mint-keys.mjs - issue #2750
// Mints a PER-RUN RS256 keypair and the anon / service_role JWTs for the local canonical auth stack.
// Node stdlib only. Usage: node mint-keys.mjs <outDir> <issuer> [--foreign]
//   <outDir> must be a fresh directory OUTSIDE the repo (the gate passes a mktemp -d dir); it is chmod 0700,
//   every file 0600. Nothing here ever prints a key or token value.
//   --foreign additionally writes foreign_private.jwk.json: a SECOND keypair with the SAME kid, used only by
//   the FC-27 negative tests (a token signed by a foreign key must be rejected).
// Outputs: jwt_keys.json (private JWK array for GOTRUE_JWT_KEYS), jwks.json (public JWKS for PostgREST),
//          anon.jwt, service_role.jwt.
import { generateKeyPairSync, createSign } from 'node:crypto';
import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const KID = 'e2e-canonical-rs256';

const b64u = (b) => Buffer.from(b).toString('base64url');

export function signJwt(privateKey, claims, kid = KID) {
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
  const body = b64u(JSON.stringify(claims));
  const signer = createSign('RSA-SHA256');
  signer.update(`${head}.${body}`);
  return `${head}.${body}.${signer.sign(privateKey).toString('base64url')}`;
}

export function newKeypair() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = privateKey.export({ format: 'jwk' });
  return { privateKey, publicKey, jwk };
}

function write(dir, name, text) {
  const p = join(dir, name);
  writeFileSync(p, text, { mode: 0o600 });
  chmodSync(p, 0o600);
}

export function mintKeys(outDir, issuer, { foreign = false } = {}) {
  const dir = resolve(outDir);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const { privateKey, jwk } = newKeypair();
  const priv = { ...jwk, kid: KID, alg: 'RS256', use: 'sig', key_ops: ['sign', 'verify'] };
  const pub = { kty: priv.kty, n: priv.n, e: priv.e, kid: KID, alg: 'RS256', use: 'sig' };
  write(dir, 'jwt_keys.json', JSON.stringify([priv]));
  write(dir, 'jwks.json', JSON.stringify({ keys: [pub] }));
  const now = Math.floor(Date.now() / 1000);
  const base = { iss: issuer, aud: 'authenticated', iat: now, exp: now + 24 * 3600 };
  write(dir, 'anon.jwt', signJwt(privateKey, { ...base, role: 'anon' }));
  write(dir, 'service_role.jwt', signJwt(privateKey, { ...base, role: 'service_role' }));
  if (foreign) {
    const f = newKeypair();
    write(dir, 'foreign_private.jwk.json', JSON.stringify({ ...f.jwk, kid: KID, alg: 'RS256' }));
  }
  return dir;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [outDir, issuer, ...flags] = process.argv.slice(2);
  if (!outDir || !issuer) {
    console.error('usage: mint-keys.mjs <outDir> <issuer> [--foreign]');
    process.exit(2);
  }
  mintKeys(outDir, issuer, { foreign: flags.includes('--foreign') });
  console.log('mint-keys: ok (values not printed)');
}
