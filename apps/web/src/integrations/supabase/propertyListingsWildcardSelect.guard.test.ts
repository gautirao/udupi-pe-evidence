/**
 * Structural guard — issue #2280 AC10.
 *
 * Flyway V128 revoked table-wide SELECT grants on `public.property_listings`
 * for the anon/authenticated PostgREST roles and re-granted access
 * column-by-column over `PROPERTY_LISTING_COLUMNS`, deliberately excluding
 * `contact_phone`/`contact_info`. A `.from('property_listings').select('*', ...)`
 * (or any select whose string literal STARTS with a wildcard) either errors
 * against the DB grants or, if grants are ever loosened again, silently leaks
 * both PII columns to the browser — the exact vulnerability this issue fixes.
 *
 * WHY THIS TEST EXISTS: to stop a future contributor from reintroducing that
 * pattern by hand-editing a hook back to `select('*, raw_posts(...))')`
 * instead of `propertyListingSelect(...)`, without anyone noticing until a
 * browser 403 (or worse, a data leak) shows up in production.
 *
 * IF THIS TEST FAILS: a file under `src/` calls
 * `.from('property_listings')` and then `.select(...)` with a string literal
 * that starts with `*`. Replace that `.select(...)` call with
 * `propertyListingSelect(embed?)` from
 * `src/integrations/supabase/propertyListingColumns.ts` (adding any new
 * column there too, and to V128's re-grant list, if the table has grown a
 * genuinely new column that should be publicly selectable). Do not silence
 * this test by weakening the pattern below — it is intentionally scoped to
 * the wildcard-string case, which is the only case that can actually break
 * against the current grants.
 *
 * Scope note: an argument-less `.select()` (or `.select('*')`) is flagged
 * UNCONDITIONALLY whenever the nearest preceding `.from(...)` targets
 * `property_listings` — on a plain read as well as after a mutation verb.
 * On every other table (facebook_groups, raw_posts, feed_runs, ...) V128
 * never touched the grants, so a bare `.select()` — mutation-trailing
 * (`.select().single()`) or a plain read (`.select().eq(...)`) — is
 * legitimate and unrelated to this issue; flagging it there would just be
 * unfalsifiable-by-design friction.
 *
 * On `property_listings` specifically, a bare `.select()` IS the wildcard
 * bug in disguise, on EITHER shape:
 *   - after a mutation verb: supabase-js has no way to express "no
 *     projection", so `.update(...).select()` defaults to `columns=*`.
 *     PostgREST expands that `*` into the UPDATE/INSERT's RETURNING list,
 *     which now includes the two grant-revoked columns — so the whole write
 *     42501s and rolls back, even though nothing in the call looks like a
 *     literal `'*'`. (This is exactly how the AC10 guard, as originally
 *     scoped, missed the production bug fixed by this same issue: two admin
 *     mutations used `.update(...).eq(...).select().single()` and broke in
 *     production because of this mechanism — see PROD_DEFECT note in
 *     propertyListingColumns.ts history / issue #2280 code review.)
 *   - on a plain read with no mutation in between: `.from('property_listings')
 *     .select().eq(...)` expands to the same `columns=*` request and hits the
 *     same revoked columns for the same underlying reason — there is no
 *     legitimate reason, post-V128, to call `.select()` with no projection
 *     argument against this table on a read OR a write (code review finding
 *     F-CR8: the mutation-adjacency requirement was itself a blind spot, since
 *     this guard was already widened once for missing exactly this kind of
 *     coverage).
 *
 * IF THIS TEST FAILS FOR A BARE `.select()` ON property_listings: for a
 * mutation, the write almost certainly doesn't need the returned row (check
 * the caller) — drop `.select()`/`.select('*')` entirely; `.update(...).eq(...)`
 * with no trailing `.select()` uses `Prefer: return=minimal` and never hits
 * the RETURNING/grants problem. For a plain read, or if the mutated row IS
 * needed, use `.select(propertyListingSelect(embed?))` instead, exactly as
 * the SELECT-side hooks in this file already do.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const SRC_ROOT = join(__dirname, '..', '..'); // src/integrations/supabase/ -> src/
const SKIP_DIRS = new Set(['__tests__', 'node_modules']);
const CODE_EXTENSIONS = new Set(['.ts', '.tsx']);

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (CODE_EXTENSIONS.has(extname(entry)) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx')) {
      out.push(full);
    }
  }
  return out;
}

/** Extracts the full text between the parens of a call, given the index of the '(' right after the call name. Handles nested parens (e.g. `propertyListingSelect('raw_posts(images)')`). */
function extractBalancedArgs(text: string, openParenIndex: number): string {
  let depth = 0;
  let start = -1;
  for (let i = openParenIndex; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) return text.slice(start, i);
    }
  }
  return text.slice(start === -1 ? openParenIndex + 1 : start);
}

/** A wildcard select: the argument, once trimmed, is a string literal starting with `*`. */
function isWildcardSelectArg(args: string): boolean {
  return /^['"`]\s*\*/.test(args.trim());
}

/**
 * An argument-less `.select()` — no string at all. On tables V128 never
 * touched, this is a legitimate "return the mutated row" idiom
 * (`.select().single()`) or an equally legitimate "select everything visible"
 * plain read, and is NOT flagged (see the `nearest.table !== 'property_listings'`
 * gate at the call site). On `property_listings` specifically it is ALWAYS a
 * violation — on a read as much as after a mutation verb — because
 * supabase-js has no way to express "no projection": an argument-less
 * `.select()` always defaults to `columns=*`, which hits the same
 * V128-revoked columns regardless of which verb it follows. See the file
 * header comment for the full mechanism (F-CR8).
 */
function isBareSelectArg(args: string): boolean {
  return args.trim() === '';
}

/**
 * Blanks out `//` line comments and `/* ... *\/` block comments —
 * replacing every character with a space (newlines preserved) so all
 * offsets stay identical to the original text. String/template-literal
 * *contents* are left untouched (we still need `.from('property_listings')`
 * and wildcard string args like `'*, raw_posts(...)'` to remain matchable);
 * only tracked, not blanked, so a `//`/`/*` inside a string isn't
 * misread as starting a real comment.
 *
 * Without this, F-CR8's unconditional bare-`.select()` rule on
 * property_listings would false-positive on prose like "intentionally skips
 * `.select()`" inside a comment, since the detector is a plain text/regex
 * scan, not an AST — a bare `.select(` substring in a comment is textually
 * indistinguishable from one in real code. Run every file through this
 * before matching `.from(`/`.select(`.
 */
function stripComments(text: string): string {
  let out = '';
  let inLineComment = false;
  let inBlockComment = false;
  let inString: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        out += ch;
      } else {
        out += ' ';
      }
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        out += '  ';
        i++;
      } else {
        out += ch === '\n' ? '\n' : ' ';
      }
      continue;
    }
    if (inString) {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        i++;
        continue;
      }
      if (ch === inString) {
        inString = null;
      }
      continue;
    }
    if (ch === '/' && next === '/') {
      inLineComment = true;
      out += '  ';
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      out += '  ';
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      out += ch;
      continue;
    }
    out += ch;
  }
  return out;
}

interface Violation {
  file: string;
  snippet: string;
}

function findWildcardPropertyListingSelects(): Violation[] {
  const violations: Violation[] = [];
  const fromRe = /\.from\(\s*['"`]([\w.]+)['"`]\s*\)/g;
  const selectRe = /\.select\(/g;

  for (const file of listSourceFiles(SRC_ROOT)) {
    // Blank out comments before matching, so a bare `.select()` mentioned in
    // prose (e.g. "intentionally skips `.select()`") can't trigger F-CR8's
    // unconditional rule; string literals are left intact so
    // `.from('property_listings')` and wildcard args like `'*, ...'` still match.
    const text = stripComments(readFileSync(file, 'utf8'));

    const fromMatches: { index: number; table: string }[] = [];
    for (const m of text.matchAll(fromRe)) {
      fromMatches.push({ index: m.index!, table: m[1] });
    }
    if (fromMatches.length === 0) continue;

    for (const m of text.matchAll(selectRe)) {
      const selectIndex = m.index!;
      // Nearest preceding .from(...) call, regardless of table.
      let nearest: { index: number; table: string } | null = null;
      for (const fm of fromMatches) {
        if (fm.index <= selectIndex && (nearest === null || fm.index > nearest.index)) {
          nearest = fm;
        }
      }
      if (!nearest || nearest.table !== 'property_listings') continue;

      const openParenIndex = selectIndex + m[0].length - 1;
      const args = extractBalancedArgs(text, openParenIndex);
      if (isWildcardSelectArg(args) || isBareSelectArg(args)) {
        violations.push({
          file: file.replace(SRC_ROOT, 'src'),
          snippet: text.slice(Math.max(0, selectIndex - 40), selectIndex + args.length + 10).replace(/\s+/g, ' '),
        });
      }
    }
  }
  return violations;
}

describe('property_listings — no wildcard select() (issue #2280 AC10)', () => {
  it('no file under src/ requests select("*"...) against property_listings', () => {
    const violations = findWildcardPropertyListingSelects();
    if (violations.length > 0) {
      const details = violations.map((v) => `  - ${v.file}: ...${v.snippet}...`).join('\n');
      throw new Error(
        `Found ${violations.length} wildcard select() against property_listings — this either errors ` +
          `against the V128 column-grant revocation or leaks contact_phone/contact_info if grants are ` +
          `ever loosened.\n` +
          `If this is an argument-less .select() (or .select('*')) on property_listings — on a plain ` +
          `read (e.g. .select().eq(...)) OR chained after .update(...)/.insert(...)/.upsert(...): that is ` +
          `a "*" expansion in disguise. supabase-js has no way to express "no projection", so a bare ` +
          `.select() always defaults to columns=*. On a mutation, PostgREST puts the two revoked columns ` +
          `in the RETURNING list and the whole write 42501s and rolls back; on a plain read, the same ` +
          `columns=* request hits the same revoked-column grants directly. If this is a mutation and ` +
          `nothing consumes the returned row, delete .select() entirely (Prefer: return=minimal — no ` +
          `RETURNING, no grants problem). Otherwise — read or write, row needed or not — use ` +
          `.select(propertyListingSelect(embed?)) instead.\n` +
          `Otherwise, replace the literal wildcard with propertyListingSelect(embed?) from ` +
          `src/integrations/supabase/propertyListingColumns.ts:\n${details}`,
      );
    }
    expect(violations).toEqual([]);
  });

  // Self-check: proves the detector can actually fire, independent of the
  // real source tree. Without this, a bug in the regex/extraction logic
  // above could make the guard above vacuously pass forever.
  it('self-check: the detector recognises a synthetic wildcard-select violation', () => {
    const violationsFinder = (text: string) => {
      const fromRe = /\.from\(\s*['"`]([\w.]+)['"`]\s*\)/g;
      const selectRe = /\.select\(/g;
      const fromMatches = [...text.matchAll(fromRe)].map((m) => ({ index: m.index!, table: m[1] }));
      const hits: string[] = [];
      for (const m of text.matchAll(selectRe)) {
        const selectIndex = m.index!;
        let nearest: { index: number; table: string } | null = null;
        for (const fm of fromMatches) {
          if (fm.index <= selectIndex && (nearest === null || fm.index > nearest.index)) nearest = fm;
        }
        if (!nearest || nearest.table !== 'property_listings') continue;
        const openParenIndex = selectIndex + m[0].length - 1;
        const args = extractBalancedArgs(text, openParenIndex);
        if (isWildcardSelectArg(args) || isBareSelectArg(args)) hits.push(args);
      }
      return hits;
    };

    const bad = `supabase.from('property_listings').select('*, raw_posts(images)').eq('is_valid', true)`;
    const good = `supabase.from('property_listings').select(propertyListingSelect('raw_posts(images)')).eq('is_valid', true)`;

    expect(violationsFinder(bad)).toEqual(["'*, raw_posts(images)'"]);
    expect(violationsFinder(good)).toEqual([]);
  });

  // Self-check: proves the widened (F-CR2 + F-CR8) rule flags EVERY bare
  // `.select()`/`.select('*')` on property_listings — mutation-trailing AND
  // plain-read — while leaving the same bare `.select()` idiom alone on
  // every other table, on both reads and mutations.
  it('self-check: flags a bare .select() on property_listings on both reads and mutations, and nowhere else', () => {
    const badUpdate = `await supabase.from('property_listings').update(updates).eq('id', id).select().single();`;
    const badUpdateStar = `await supabase.from('property_listings').update(updates).eq('id', id).select('*').single();`;
    const badInsert = `await supabase.from('property_listings').insert(row).select().single();`;
    const badUpsert = `await supabase.from('property_listings').upsert(row).select().single();`;
    // F-CR8: a plain read with a forgotten projection argument — no mutation
    // verb in between — is the same columns=* expansion against the same
    // revoked columns, and must be flagged too.
    const badPlainReadWithFilter = `await supabase.from('property_listings').select().eq('is_valid', true);`;
    const badPlainReadAlone = `await supabase.from('property_listings').select();`;
    const fixedNoSelect = `await supabase.from('property_listings').update(updates).eq('id', id);`;
    const fixedProjected = `await supabase.from('property_listings').update(updates).eq('id', id).select(propertyListingSelect()).single();`;
    const otherTableBareSelect = `await supabase.from('facebook_groups').update(updates).eq('id', id).select().single();`;
    const otherTableMutationBareSelect = `await supabase.from('feed_runs').update(updates).eq('id', id).select();`;
    const otherTableBareSelectRawPosts = `await supabase.from('raw_posts').select().eq('id', id);`;

    const check = (text: string) => {
      const fromRe = /\.from\(\s*['"`]([\w.]+)['"`]\s*\)/g;
      const selectRe = /\.select\(/g;
      const fromMatches = [...text.matchAll(fromRe)].map((m) => ({ index: m.index!, table: m[1] }));
      for (const m of text.matchAll(selectRe)) {
        const selectIndex = m.index!;
        let nearest: { index: number; table: string } | null = null;
        for (const fm of fromMatches) {
          if (fm.index <= selectIndex && (nearest === null || fm.index > nearest.index)) nearest = fm;
        }
        if (!nearest || nearest.table !== 'property_listings') continue;
        const openParenIndex = selectIndex + m[0].length - 1;
        const args = extractBalancedArgs(text, openParenIndex);
        if (isWildcardSelectArg(args) || isBareSelectArg(args)) return true;
      }
      return false;
    };

    expect(check(badUpdate)).toBe(true);
    expect(check(badUpdateStar)).toBe(true);
    expect(check(badInsert)).toBe(true);
    expect(check(badUpsert)).toBe(true);
    expect(check(badPlainReadWithFilter)).toBe(true);
    expect(check(badPlainReadAlone)).toBe(true);
    expect(check(fixedNoSelect)).toBe(false);
    expect(check(fixedProjected)).toBe(false);
    expect(check(otherTableBareSelect)).toBe(false);
    expect(check(otherTableMutationBareSelect)).toBe(false);
    expect(check(otherTableBareSelectRawPosts)).toBe(false);
  });
});
