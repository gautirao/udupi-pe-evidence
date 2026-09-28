import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments, scanForbiddenImports } from '@/test-utils/architectureGuards';

/**
 * Issue #2664 — freezes the CURRENT landed shape of the TrustReviewQueue
 * decomposition (issue #2663). This is NOT a re-refactor: TrustReviewQueue.tsx
 * already calls its query/mutation hooks directly at the page level (a
 * deliberate, non-goal-scoped choice per #2664's plan), and its 4 extracted
 * dialog/table components already receive `{view, commands}` rather than
 * importing the hooks themselves. This guard mechanically stops that from
 * getting WORSE:
 *
 *  (a) TrustReviewQueue.tsx itself must never call `useMutation(` or
 *      `.mutate(` directly — that workflow logic must live only in
 *      useTrustReviewMutations.ts.
 *  (b) none of the 4 presentational components may import
 *      useTrustBadgeQuery / useTrustIdentityQuery / useTrustReviewMutations
 *      directly — they must keep receiving data via the `{view, commands}`
 *      props TrustReviewQueue.tsx already passes them.
 */

const PAGE_PATH = path.resolve(__dirname, '../TrustReviewQueue.tsx');
const TRUST_REVIEW_DIR = path.resolve(__dirname, '../../../components/admin/trust-review');

const COMPONENT_FILES = [
  'BadgeRejectDialog.tsx',
  'BadgeReviewTable.tsx',
  'IdentityRejectDialog.tsx',
  'IdentityReviewTable.tsx',
].map((name) => path.join(TRUST_REVIEW_DIR, name));

const FORBIDDEN_HOOK_IMPORT_PATTERNS = [
  /useTrustBadgeQuery/,
  /useTrustIdentityQuery/,
  /useTrustReviewMutations/,
];

describe('TrustReviewQueue.tsx — no raw mutation calls in the page (Issue #2663 landed shape, frozen)', () => {
  const source = fs.readFileSync(PAGE_PATH, 'utf-8');
  const body = stripComments(source);

  it('calls no `useMutation(` directly', () => {
    expect(body).not.toMatch(/\buseMutation\(/);
  });

  it('calls no `.mutate(` directly', () => {
    expect(body).not.toMatch(/\.mutate\(/);
  });
});

describe('trust-review dialog/table components — no direct query/mutation hook imports (Issue #2663 landed shape, frozen)', () => {
  it.each(COMPONENT_FILES.map((f) => [path.basename(f), f] as const))(
    '%s does not import useTrustBadgeQuery/useTrustIdentityQuery/useTrustReviewMutations',
    (_name, filePath) => {
      const source = fs.readFileSync(filePath, 'utf-8');
      expect(scanForbiddenImports(source, FORBIDDEN_HOOK_IMPORT_PATTERNS)).toEqual([]);
    },
  );

  it('finds the 4 components (guard is not silently scanning an empty set)', () => {
    for (const filePath of COMPONENT_FILES) {
      expect(fs.existsSync(filePath), `${filePath} not found`).toBe(true);
    }
  });
});
