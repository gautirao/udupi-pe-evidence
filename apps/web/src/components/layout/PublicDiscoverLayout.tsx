import React from 'react';
import { PublicHeader } from './PublicHeader';

/**
 * Public-facing shell for the consumer Discover experience (Issue #1588).
 *
 * Pairs the {@link PublicHeader} marketing chrome with a flex-column body so the
 * map/panel surface fills the viewport below the header (no `calc(100vh-…)` magic
 * number). Used ONLY by the public `/discover` route; broker/admin/internal pages
 * continue to use {@link AppLayout}.
 */
export function PublicDiscoverLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col bg-background">
      <PublicHeader />
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
