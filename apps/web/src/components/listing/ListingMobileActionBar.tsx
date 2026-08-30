import { Calendar, Heart, Share2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ListingMobileActionBarProps {
  saved: boolean;
  onToggleSaved: () => void;
  /**
   * Issue #2159 (phase 2, PR #2180) — the desktop gallery overlay already has a
   * working share button wired to this same handler (ListingDetail.tsx's
   * `handleShare`, copies the page URL); mobile had no share affordance at
   * all. Wires the SAME existing handler in — no new share mechanism.
   * Optional so this component doesn't break for any other caller that
   * hasn't been updated to pass it.
   */
  onShare?: () => void;
  /** True right after `onShare` succeeds — mirrors the desktop copy-feedback state. */
  shareCopied?: boolean;
}

/**
 * Fixed mobile CTA bar mirroring the sidebar actions (#1797 binding decision:
 * mobile_bottom_bar = INCLUDE). Hidden on md+ where the sticky sidebar is visible.
 *
 * The "Request viewing" button does NOT duplicate the booking form or mutation — it
 * scrolls to and focuses the same inline ViewingRequestPanel rendered in the sidebar,
 * so there is exactly one booking state machine on the page.
 */
export function ListingMobileActionBar({ saved, onToggleSaved, onShare, shareCopied = false }: ListingMobileActionBarProps) {
  function scrollToViewingPanel() {
    const el = document.getElementById('viewing-request-panel');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Move focus into the panel so keyboard/screen-reader users land on the form,
    // not just a visual scroll.
    const focusable = el.querySelector<HTMLElement>('button, input, textarea, [tabindex]');
    focusable?.focus({ preventScroll: true });
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-2 border-t border-border bg-card px-4 py-2.5 shadow-[0_-4px_16px_rgba(17,24,39,0.08)] md:hidden"
      style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}
      data-testid="listing-mobile-action-bar"
    >
      <button
        type="button"
        onClick={onToggleSaved}
        aria-pressed={saved}
        aria-label={saved ? 'Remove from saved' : 'Save listing'}
        className="flex h-11 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-card"
      >
        <Heart className={cn('h-5 w-5', saved ? 'fill-current text-rose-500' : 'text-foreground')} aria-hidden="true" />
      </button>
      {onShare && (
        <button
          type="button"
          onClick={onShare}
          aria-label="Share listing"
          data-testid="mobile-share-btn"
          className="flex h-11 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-card"
        >
          {shareCopied ? (
            <Check className="h-5 w-5 text-foreground" aria-hidden="true" />
          ) : (
            <Share2 className="h-5 w-5 text-foreground" aria-hidden="true" />
          )}
        </button>
      )}
      <button
        type="button"
        onClick={scrollToViewingPanel}
        data-testid="mobile-request-viewing-btn"
        className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-copper text-sm font-semibold text-copper-foreground hover:bg-copper-hover"
      >
        <Calendar className="h-4 w-4" aria-hidden="true" />
        Request viewing
      </button>
    </div>
  );
}
