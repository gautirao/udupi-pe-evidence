import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProcessPostsConsoleController } from '../useProcessPostsConsoleController';

vi.mock('@/components/admin/DebugConsole', () => ({
  useDebugLogs: () => ({
    logs: [],
    addLog: vi.fn(),
    clearLogs: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    ai: vi.fn(),
  }),
}));

describe('useProcessPostsConsoleController', () => {
  it('starts expanded (not collapsed)', () => {
    const { result } = renderHook(() => useProcessPostsConsoleController());
    expect(result.current.isCollapsed).toBe(false);
  });

  it('toggle() flips isCollapsed', () => {
    const { result } = renderHook(() => useProcessPostsConsoleController());
    act(() => result.current.toggle());
    expect(result.current.isCollapsed).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.isCollapsed).toBe(false);
  });

  it('expand() always sets isCollapsed to false', () => {
    const { result } = renderHook(() => useProcessPostsConsoleController());
    act(() => result.current.toggle());
    expect(result.current.isCollapsed).toBe(true);
    act(() => result.current.expand());
    expect(result.current.isCollapsed).toBe(false);
  });
});
