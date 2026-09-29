import { useMediaQuery } from '@/hooks/useMediaQuery';

/** Width, in px, below which the collapsed desktop header has no room for the control bar (single source for both the header's JS gate and the panel's fallback gate). */
export const DISCOVER_HEADER_HOSTS_CONTROLS_MIN_WIDTH = 1366;

/**
 * True once the viewport is wide enough for the collapsed desktop header to host
 * the control bar (city/Buy-Rent/search) + journey tabs. Takes `isMobileShell` as
 * a parameter rather than reading `useDiscoverShell()` itself, so callers under
 * `surfaces/panel/**` (forbidden from reaching into the Discover context facade)
 * can still derive the same boolean from their own prop-threaded `isMobileShell`.
 */
export function useDiscoverHeaderHostsControls(isMobileShell: boolean): boolean {
  const isWideEnough = useMediaQuery(`(min-width: ${DISCOVER_HEADER_HOSTS_CONTROLS_MIN_WIDTH}px)`);
  return !isMobileShell && isWideEnough;
}
