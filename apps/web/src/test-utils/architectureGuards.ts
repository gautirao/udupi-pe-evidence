/**
 * Issue #2664 — shared helpers for architecture "guard" tests.
 *
 * Every guard test in this repo (Discover's composition/controller/surface
 * scanners, Edit Listing's architecture baseline, and the two new guards
 * this issue adds) is a plain source-text scanner: strip comments, count
 * hook-call occurrences, or find forbidden import specifiers. That logic was
 * duplicated inline in each guard file. This module is the single source of
 * truth for it — guards import these functions instead of redefining them,
 * so a fix to the scanning logic (e.g. a comment-stripping edge case) lands
 * once instead of N times.
 *
 * These are plain, framework-free, text-level scanners — not an AST parser.
 * Known limitation (carried over unchanged from the guards this replaces): a
 * string literal containing e.g. `"useState("` would also be counted, since
 * the strip is text-level, not AST-level. None of the files these guards
 * read today contain such a literal.
 */

/**
 * Strips `/* *\/`-style block comments and `//` line comments from source
 * text so prose *about* a rule (e.g. this file's own header, or a hook
 * file's JSDoc referencing `useState(` in an explanation) never
 * satisfies — or trips — a guard that scans for real code.
 *
 * Deliberately broader than the single-star-block-only, full-line-only
 * variant `compositionHookScope.guard.test.ts` used before adopting this
 * module: this version also strips single-star `/* *\/` blocks and inline
 * trailing `//` comments after real code on the same line. That caller's 7
 * assertions produce identical results either way against the file it
 * scans today (no single-star blocks, no code-then-trailing-`//` lines in
 * it), but this is a real semantic broadening, not a byte-identical
 * extraction — worth knowing before reusing this against a new file that
 * does have either shape.
 */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

/**
 * Counts occurrences of `pattern` in `source` after stripping comments. A
 * plain source-text count is a faithful, dependency-free proxy for "how many
 * times does this file call this hook" for the single-component/single-hook
 * modules these guards scan.
 *
 * `pattern` must be a global (`/g`) RegExp — the caller owns the exact
 * hook-call shape (e.g. `/\buseState(<[^>]*>)?\(/g`).
 */
export function countHookCalls(source: string, pattern: RegExp): number {
  const withoutComments = stripComments(source);
  const matches = withoutComments.match(pattern);
  return matches ? matches.length : 0;
}

/** One parsed `import ... from '...'` statement. */
export interface ImportStatement {
  /** The clause between `import` and `from`, e.g. `type { Foo }` or `{ bar }`. */
  clause: string;
  /** The module specifier, e.g. `@/hooks/useDiscoverAreas`. */
  spec: string;
  /** `import type ... from` — carries no runtime behaviour. */
  typeOnly: boolean;
}

/**
 * Parses every top-level `import ... from '...';` (including bare
 * side-effect imports) out of `source`, after stripping comments.
 */
export function importsOf(source: string): ImportStatement[] {
  const body = stripComments(source);
  const withBindings = [...body.matchAll(/^import\s+([\s\S]*?)\s*from\s+'([^']+)';/gm)].map(
    ([, clause, spec]) => ({ clause: clause.trim(), spec, typeOnly: /^type\b/.test(clause.trim()) }),
  );
  // Side-effect imports (`import 'x';`) have no bindings but DO execute the
  // module — a "no dependency on X in any form" rule must still see them.
  const bare = [...body.matchAll(/^import\s+'([^']+)';/gm)].map(([, spec]) => ({
    clause: '',
    spec,
    typeOnly: false,
  }));
  return [...withBindings, ...bare];
}

/**
 * Scans `source` for VALUE (non-type-only) import statements whose module
 * specifier matches any of `forbiddenPatterns`, generalizing the
 * import-direction scan used by controllerLayering.guard.test.ts and
 * surfaceLayering.guard.test.ts. Returns the matched specifiers (one entry
 * per matching import statement — a file importing the same forbidden
 * specifier twice yields two entries).
 *
 * `import type { X } from '...'` is never flagged: a type carries no
 * runtime behaviour, so it can't be the fetch/mutate/routing dependency a
 * guard is checking for.
 *
 * Spec-only constraint: matches the import's module SPECIFIER, never the
 * imported binding names. A forbidden hook reached through a barrel
 * re-export (e.g. `import { useTrustBadgeQuery } from
 * '@/components/admin/trust-review'` instead of its own file) would not be
 * flagged. Not reachable by any guard using this helper today — every
 * hook they check lives in its own same-named file, imported by full path
 * — but a future guard author pointing this at a barrel export should add
 * a binding-name check first.
 */
export function scanForbiddenImports(source: string, forbiddenPatterns: RegExp[]): string[] {
  const matched: string[] = [];
  for (const imp of importsOf(source)) {
    if (imp.typeOnly) continue;
    if (forbiddenPatterns.some((pattern) => pattern.test(imp.spec))) {
      matched.push(imp.spec);
    }
  }
  return matched;
}

/**
 * Counts the top-level members of a TypeScript `interface <interfaceName>`
 * declared in `source`. A top-level member is a line ending in `;` at
 * 2-space indent directly inside the interface body — a nested type's own
 * `;`-terminated lines are indented further and are not counted.
 *
 * Lifted unchanged from EditListingForm.architecture.baseline.test.ts, which
 * used it to pin the `{view, commands}` contract shape's member ceilings.
 */
export function countTopLevelInterfaceMembers(source: string, interfaceName: string): number {
  const interfaceMatch = source.match(new RegExp(`interface ${interfaceName} \\{([\\s\\S]*?)\\n\\}`));
  if (!interfaceMatch) {
    throw new Error(`${interfaceName} interface not found`);
  }
  const body = interfaceMatch[1];
  const withoutComments = body
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
  return withoutComments.split('\n').filter((line) => /^ {2}\S.*;\s*$/.test(line)).length;
}
