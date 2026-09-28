/**
 * Issue #2658 (C2) — differential coverage for useAreaSetScopeCommands,
 * pinning behavior extracted verbatim from AreaSelectedPanel.tsx
 * (Issues #2017, #2596).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockCommitResultScope = vi.fn();
const mockOpenAreaSetDraft = vi.fn();

vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverActions: () => ({ commitResultScope: mockCommitResultScope }),
  useDiscoverShell: () => ({ openAreaSetDraft: mockOpenAreaSetDraft }),
}));

import { useAreaSetScopeCommands } from '../useAreaSetScopeCommands';

describe('#2658 C2 — useAreaSetScopeCommands', () => {
  beforeEach(() => {
    mockCommitResultScope.mockClear();
    mockOpenAreaSetDraft.mockClear();
  });

  it('editAreas opens the AREA_SET draft', () => {
    const { result } = renderHook(() => useAreaSetScopeCommands({ multiAreaKeys: null }));
    result.current.commands.editAreas();
    expect(mockOpenAreaSetDraft).toHaveBeenCalledTimes(1);
  });

  it('addNearbyAreas also opens the AREA_SET draft', () => {
    const { result } = renderHook(() => useAreaSetScopeCommands({ multiAreaKeys: null }));
    result.current.commands.addNearbyAreas();
    expect(mockOpenAreaSetDraft).toHaveBeenCalledTimes(1);
  });

  it('removeCommittedArea: commits the remaining keys when 2+ areas remain', () => {
    const { result } = renderHook(() =>
      useAreaSetScopeCommands({ multiAreaKeys: ['a', 'b', 'c'] }),
    );
    result.current.commands.removeCommittedArea('b');
    expect(mockCommitResultScope).toHaveBeenCalledWith({ kind: 'AREA_SET', areaKeys: ['a', 'c'] });
  });

  it('removeCommittedArea: clears the scope (commits null) when removing the last remaining area', () => {
    const { result } = renderHook(() => useAreaSetScopeCommands({ multiAreaKeys: ['a'] }));
    result.current.commands.removeCommittedArea('a');
    expect(mockCommitResultScope).toHaveBeenCalledWith(null);
  });

  it('removeCommittedArea: is a no-op-safe against a null multiAreaKeys (defensive; clears the scope)', () => {
    const { result } = renderHook(() => useAreaSetScopeCommands({ multiAreaKeys: null }));
    result.current.commands.removeCommittedArea('anything');
    expect(mockCommitResultScope).toHaveBeenCalledWith(null);
  });
});
