#!/usr/bin/env node
// scripts/e2e/check-local-auth.mjs - issue #2750 FC-25 / FC-26 / FC-28 (local canonical auth stack).
//
// The canonical gate authenticates against a LOCAL GoTrue/PostgREST gateway (scripts/e2e/auth-stack). These guards make
// sure that switch lives ONLY in the gate's process env and can never leak into, or be mistaken for, production.
//
//   --phase=env     FC-25  refuse (exit 3, "NOT A GATE RUN") a non-loopback VITE_SUPABASE_URL, a non-loopback issuer
//                          (E2E_AUTH_ISSUER_URI, or --issuer), or ANY inherited SPRING_SECURITY_OAUTH2_* variable.
//                          Prints variable NAMES only, never a value.
//   --phase=config  FC-26  application*.yml issuer is byte-identical to the hosted template, and no committed config
//                          outside the e2e-canonical CI job references the local gateway. `--root <dir>` points the scan
//                          at a temp COPY for the live mutation test.
//   --phase=bundle  FC-28  `--dist <dir> --gateway <url>`: the built bundle contains the gateway URL and no "supabase.co"
//                          host, except the two supabase-js vendor wildcard tokens "*.supabase.co" / "*.supabase.in".
//
// Exit codes: 0 pass, 1 guard violated (config/bundle), 3 NOT A GATE RUN (env), 2 usage.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ISSUER_TEMPLATE = 'issuer-uri: https://${SUPABASE_PROJECT_REF}.supabase.co/auth/v1';


/** Same rule as playwright.canonical.config.ts isLoopbackHostname (kept in lock-step by check-local-auth.test.mjs). */
export function isLoopbackHostname(hostname) {
  const h = String(hostname).toLowerCase();
  if (h === 'localhost' || h === '[::1]' || h === '::1') return true;
  const m = h.match(/^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  return !!m && m.slice(1).every((o) => Number(o) <= 255);
}
export function isLoopbackUrl(raw) {
  try { return isLoopbackHostname(new URL(raw).hostname); } catch { return false; }
}

/** FC-25: returns [{rule,name,reason}] - NAMES only. */
export function checkEnv(env, { issuer } = {}) {
  const v = [];
  if (env.VITE_SUPABASE_URL && !isLoopbackUrl(env.VITE_SUPABASE_URL)) {
    v.push({ rule: 'FC-25a', name: 'VITE_SUPABASE_URL', reason: 'is set but is not a loopback URL (the canonical gate authenticates against the LOCAL gateway only)' });
  }
  if (env.E2E_AUTH_ISSUER_URI && !isLoopbackUrl(env.E2E_AUTH_ISSUER_URI)) {
    v.push({ rule: 'FC-25b', name: 'E2E_AUTH_ISSUER_URI', reason: 'is set but is not a loopback issuer URL' });
  }
  if (issuer !== undefined && !isLoopbackUrl(issuer)) {
    v.push({ rule: 'FC-25b', name: '--issuer', reason: 'the resolved issuer is not a loopback URL' });
  }
  for (const name of Object.keys(env).sort()) {
    if (/^SPRING_SECURITY_OAUTH2_/i.test(name)) {
      v.push({ rule: 'FC-25c', name, reason: 'is inherited from the caller; it would override the issuer the gate sets for the local stack (unset it)' });
    }
  }
  return v;
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'target', 'test-results', 'playwright-report', '.claude', 'coverage']);
function* walk(dir, root) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p, root); else yield p;
  }
}

/** Remove the top-level `jobs.e2e-canonical:` block (2-space indented key) from a workflow's text. */
export function stripE2eCanonicalJob(text) {
  const lines = text.split('\n'); const out = []; let skipping = false;
  for (const line of lines) {
    const m = /^( {2})([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (m) skipping = m[2] === 'e2e-canonical';
    else if (/^\S/.test(line)) skipping = false; // a new top-level key ends the jobs map
    if (!skipping) out.push(line);
  }
  return out.join('\n');
}

const LOCAL_GATEWAY_RES = [
  /(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?\/(auth|rest)\/v1/i,
  /SPRING_SECURITY_OAUTH2_RESOURCESERVER/i,
];
/** FC-26: returns [{file,reason}] */
export function checkConfig(root) {
  const bad = [];
  const res = join(root, 'apps/api/src/main/resources');
  let found = 0;
  if (existsSync(res)) {
    for (const f of readdirSync(res)) {
      if (!/^application.*\.(ya?ml)$/.test(f)) continue;
      const text = readFileSync(join(res, f), 'utf8');
      const issuerLines = text.split('\n').filter((l) => /issuer-uri\s*:/.test(l)).map((l) => l.trim());
      for (const l of issuerLines) {
        found++;
        if (l !== ISSUER_TEMPLATE) bad.push({ file: `apps/api/src/main/resources/${f}`, reason: 'issuer-uri is not byte-identical to the hosted template' });
      }
    }
  }
  if (found === 0) bad.push({ file: 'apps/api/src/main/resources/application*.yml', reason: 'no issuer-uri line found (the guard would be vacuous)' });
  const scan = [];
  for (const base of ['apps/api/src/main/resources', 'apps/api/src/test/resources', 'apps/web', '.github/workflows', '.']) {
    const dir = join(root, base);
    if (!existsSync(dir)) continue;
    if (base === '.') { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isFile()) scan.push(p); } continue; }
    for (const p of walk(dir, root)) scan.push(p);
  }
  const isConfig = (p) => /(\.ya?ml|\.properties|\.toml|\.json)$/.test(p) || /(^|[\\/])\.env[^\\/]*$/.test(p) || /(^|[\\/])(render\.yaml|Dockerfile)$/.test(p);
  const skipFile = (rel) => /(^|\/)(package-lock\.json|tsconfig[^/]*\.json)$/.test(rel) || rel.startsWith('apps/web/src/') || rel.startsWith('apps/web/public/') || rel.startsWith('apps/web/e2e/');
  for (const p of new Set(scan)) {
    const rel = relative(root, p).split(sep).join('/');
    if (!isConfig(p) || skipFile(rel)) continue;
    let text = readFileSync(p, 'utf8');
    if (rel.startsWith('.github/workflows/')) text = stripE2eCanonicalJob(text);
    for (const re of LOCAL_GATEWAY_RES) {
      if (re.test(text)) bad.push({ file: rel, reason: `references the local auth gateway / oauth2 resource-server override (${re.source.slice(0, 40)}...) outside the e2e-canonical job` });
    }
  }
  return bad;
}

/** FC-28 */
export function checkBundle(dist, gateway) {
  const bad = []; let hasGateway = false; let files = 0;
  if (!existsSync(dist)) return [{ file: dist, reason: 'dist directory does not exist' }];
  for (const p of walk(dist, dist)) {
    if (!/\.(js|mjs|html|css|json|map|txt)$/.test(p)) continue;
    files++;
    const text = readFileSync(p, 'utf8');
    const rel = relative(dist, p).split(sep).join('/');
    if (text.includes(gateway)) hasGateway = true;
    // Spike finding: the @supabase/supabase-js vendor chunk legitimately ships the wildcard allow-list tokens
    // "*.supabase.co" / "*.supabase.in" (a default trusted-domain list, not a project URL), so a bare "no supabase.co"
    // can never pass on a clean build. Those two exact wildcard tokens are the ONLY allowed occurrences; any other
    // "supabase.co|in|red" substring (a project URL, a bare host, a scheme URL) fails.
    const stripped = text.split('*.supabase.co').join('').split('*.supabase.in').join('');
    if (/supabase\.(co|in|red)/i.test(stripped)) bad.push({ file: rel, reason: 'contains a "supabase.co" host other than the supabase-js wildcard allow-list tokens (a hosted Supabase URL is baked into the canonical build)' });
  }
  if (files === 0) bad.push({ file: dist, reason: 'no bundle files found (the guard would be vacuous)' });
  if (!hasGateway) bad.push({ file: dist, reason: `no file contains the local gateway URL (${gateway}); the build is not local-auth` });
  return bad;
}

function main(argv) {
  const arg = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
  const eqArg = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
  const phase = eqArg('phase') ?? arg('phase');
  if (phase === 'env') {
    const v = checkEnv(process.env, { issuer: arg('issuer') });
    if (v.length === 0) { console.log('check-local-auth env: OK (VITE_SUPABASE_URL/issuer loopback or unset; no inherited SPRING_SECURITY_OAUTH2_*)'); return 0; }
    for (const x of v) console.error(`NOT A GATE RUN: ${x.rule} ${x.name} ${x.reason}`);
    return 3;
  }
  if (phase === 'config') {
    const root = resolve(arg('root') ?? fileURLToPath(new URL('../..', import.meta.url)));
    const bad = checkConfig(root);
    if (bad.length === 0) { console.log(`check-local-auth config: OK (${root})`); return 0; }
    for (const b of bad) console.error(`FC-26 VIOLATION ${b.file}: ${b.reason}`);
    return 1;
  }
  if (phase === 'bundle') {
    const dist = arg('dist'), gw = arg('gateway');
    if (!dist || !gw) { console.error('usage: --phase=bundle --dist <dir> --gateway <url>'); return 2; }
    const bad = checkBundle(resolve(dist), gw);
    if (bad.length === 0) { console.log(`check-local-auth bundle: OK (gateway URL present, no supabase.co) ${dist}`); return 0; }
    for (const b of bad) console.error(`FC-28 VIOLATION ${b.file}: ${b.reason}`);
    return 1;
  }
  console.error('usage: check-local-auth.mjs --phase=env [--issuer <url>] | --phase=config [--root <dir>] | --phase=bundle --dist <dir> --gateway <url>');
  return 2;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
