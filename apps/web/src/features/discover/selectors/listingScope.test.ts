import { describe, it, expect } from 'vitest';
import { resolveScope } from './listingScope';
import * as canonical from '@/features/discover/presentation/resolveScope';

describe('selectors/listingScope (#2142 Commit 2 — thin re-export, not a physical move)', () => {
  it('re-exports the SAME function reference as the canonical module (no divergent copy)', () => {
    expect(resolveScope).toBe(canonical.resolveScope);
  });

  it('forwards a real call through correctly (no scope -> none)', () => {
    const result = resolveScope(null, { regionKeys: new Set(), groupSlugs: new Set() });
    expect(result.kind).toBe('none');
  });
});
