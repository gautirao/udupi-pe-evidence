import { useEffect, useRef } from 'react';

export interface UseMobileMapOverlayShellOptions {
  /** True while the mobile Map overlay is open (isMobileShell && mobileView === 'MAP'). */
  isOpen: boolean;
  /** Called to close the overlay (sets mobileView back to 'LIST'). */
  onClose: () => void;
}

/**
 * Issue #1953 (build step 4) — a11y + scroll-lock mechanics for the mobile
 * Map full-screen overlay. Deliberately separate from DiscoverMapMount's
 * mount/unmount decision (`shouldMount`) — this hook only owns the overlay
 * CHROME behaviour once Map is open:
 *
 *  - Escape closes the overlay.
 *  - Background scrolling is locked (`document.body` overflow hidden) while
 *    open, and restored to its prior value on close/unmount.
 *  - Focus returns to the trigger element that opened the overlay (the
 *    "Map" action in List view) on the open -> close transition, whether
 *    closed via Escape or the in-overlay "List" button.
 *
 * Returns a ref the caller attaches to the trigger button ("Map" action in
 * List view); the overlay itself does not need to know about it.
 */
export function useMobileMapOverlayShell({ isOpen, onClose }: UseMobileMapOverlayShellOptions) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const wasOpenRef = useRef(isOpen);

  // Escape closes the overlay.
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Background scroll lock, released on close or unmount.
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  // Focus-return strictly on the open -> close transition (not on first
  // mount while already closed, and not on re-renders while staying open).
  useEffect(() => {
    if (wasOpenRef.current && !isOpen) {
      triggerRef.current?.focus();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  return { triggerRef };
}
