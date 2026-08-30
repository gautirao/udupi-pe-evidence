import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useLandingPageState } from '../useLandingPageState';
import { DEFAULT_CITY } from '@/lib/localityUtils';
import { getDiscoverRoute } from '@/lib/navUtils';

const mockNavigate = vi.hoisted(() => vi.fn());
let mockIsLoading = false;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isLoading: mockIsLoading }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('useLandingPageState (Issue #2399 — home-state owner)', () => {
  beforeEach(() => {
    mockIsLoading = false;
    mockNavigate.mockReset();
  });

  it('defaults selectedCity to DEFAULT_CITY and locality to empty', () => {
    const { result } = renderHook(() => useLandingPageState(), { wrapper });
    expect(result.current.selectedCity).toBe(DEFAULT_CITY);
    expect(result.current.locality).toBe('');
    expect(result.current.showAuthLoader).toBe(false);
  });

  it('setSelectedCity and setLocality update state', () => {
    const { result } = renderHook(() => useLandingPageState(), { wrapper });
    act(() => {
      result.current.setSelectedCity('mangalore');
      result.current.setLocality('Kadri');
    });
    expect(result.current.selectedCity).toBe('mangalore');
    expect(result.current.locality).toBe('Kadri');
  });

  it('handleExplore navigates to the Discover route for the selected city', () => {
    const { result } = renderHook(() => useLandingPageState(), { wrapper });
    act(() => {
      result.current.setSelectedCity('bangalore');
    });
    act(() => {
      result.current.handleExplore();
    });
    expect(mockNavigate).toHaveBeenCalledWith(getDiscoverRoute('bangalore'));
  });

  it('does not show the auth loader immediately when auth is loading (delayed-show gate)', () => {
    mockIsLoading = true;
    const { result } = renderHook(() => useLandingPageState(), { wrapper });
    // Before the 200ms delay elapses, showAuthLoader must still be false.
    expect(result.current.showAuthLoader).toBe(false);
  });

  it('shows the auth loader after 200ms when auth is still loading', () => {
    vi.useFakeTimers();
    try {
      mockIsLoading = true;
      const { result } = renderHook(() => useLandingPageState(), { wrapper });
      act(() => {
        vi.advanceTimersByTime(201);
      });
      expect(result.current.showAuthLoader).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resets showAuthLoader to false once auth finishes loading', () => {
    vi.useFakeTimers();
    try {
      mockIsLoading = true;
      const { result, rerender } = renderHook(() => useLandingPageState(), { wrapper });
      act(() => {
        vi.advanceTimersByTime(201);
      });
      expect(result.current.showAuthLoader).toBe(true);

      mockIsLoading = false;
      rerender();
      expect(result.current.showAuthLoader).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
