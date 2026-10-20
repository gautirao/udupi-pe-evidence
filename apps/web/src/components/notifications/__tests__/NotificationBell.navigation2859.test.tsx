/**
 * #2859 B2 (handoff 285902) W5 — clicking a listing notification lands on /listing/<id>.
 * Replaces e2e/journey/listing-lifecycle.spec.ts L5.b (csv195).
 *
 * Real: NotificationBell, the Radix Popover, react-router's REAL navigate inside a MemoryRouter with a
 * /listing/:id route probe (useNavigate is NOT mocked, unlike NotificationBell.test.tsx).
 * Injected: the useNotifications hooks (the list is in-test data; the server-side notification row with
 * metadata.listing_id is proved by ListingModerationLifecycleIT, L5.c).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

const notifications = vi.hoisted(() => [
  {
    id: 'n-plain', type: 'system', title: 'Welcome to ReTrends 2859', message: 'No listing attached',
    metadata: JSON.stringify({ foo: 'bar' }), isRead: true, createdAt: '2026-10-01T00:00:00Z',
  },
  {
    id: 'n-approved', type: 'listing_approved', title: 'Listing approved', message: "Your listing 'Synthetic 2859' is live.",
    metadata: JSON.stringify({ listing_id: 'abc-2859' }), isRead: true, createdAt: '2026-10-01T00:00:00Z',
  },
]);

vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => ({ data: notifications, isLoading: false, isError: false, refetch: vi.fn() }),
  useUnreadCount: () => ({ data: { count: 0 } }),
  useMarkAsRead: () => ({ mutate: vi.fn() }),
  useMarkAllAsRead: () => ({ mutate: vi.fn(), isPending: false }),
}));

// R_jsdom: re-opening the real Radix Popover after a close stalled this jsdom worker (timed out at 5 s in
// development). File-scoped pass-through: same open / onOpenChange contract, content mounted only while
// open. The real Popover open gesture stays covered by NotificationBell.test.tsx; L5.b is narrowed to
// "item click -> real router navigation, with a Popover pass-through".
vi.mock('@/components/ui/popover', async () => {
  const React = await import('react');
  const Ctx = React.createContext<{ open: boolean; onOpenChange: (o: boolean) => void }>({
    open: false,
    onOpenChange: () => {},
  });
  return {
    Popover: ({ open, onOpenChange, children }: { open: boolean; onOpenChange: (o: boolean) => void; children: React.ReactNode }) =>
      React.createElement(Ctx.Provider, { value: { open, onOpenChange } }, children),
    PopoverTrigger: ({ children }: { children: React.ReactNode }) => {
      const ctx = React.useContext(Ctx);
      return React.createElement('span', { onClick: () => ctx.onOpenChange(!ctx.open) }, children);
    },
    PopoverContent: ({ children }: { children: React.ReactNode }) => {
      const ctx = React.useContext(Ctx);
      return ctx.open ? React.createElement('div', { 'data-testid': 'popover-content' }, children) : null;
    },
  };
});

import { NotificationBell } from '../NotificationBell';

function ListingProbe() {
  const { id } = useParams();
  return <div data-testid="listing-route-probe">listing-route:{id}</div>;
}
function PathProbe() {
  return <div data-testid="path-probe">{useLocation().pathname}</div>;
}

describe('NotificationBell — notification click navigation (#2859 B2 csv195 L5.b)', () => {
  it('L5.b: a notification without listing_id leaves the route unchanged; the listing_approved item lands on /listing/<id>', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/broker/dashboard']}>
        <PathProbe />
        <Routes>
          <Route path="/broker/dashboard" element={<NotificationBell />} />
          <Route path="/listing/:id" element={<ListingProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    // control: no listing_id -> stays on the dashboard
    await user.click(screen.getByRole('button'));
    await user.click(await screen.findByText('Welcome to ReTrends 2859'));
    expect(screen.getByTestId('path-probe')).toHaveTextContent('/broker/dashboard');
    expect(screen.queryByTestId('listing-route-probe')).not.toBeInTheDocument();

    // listing_approved with metadata.listing_id -> the listing route renders
    await user.click(screen.getByRole('button'));
    await user.click(await screen.findByText('Listing approved'));
    expect(await screen.findByTestId('listing-route-probe')).toHaveTextContent('listing-route:abc-2859');
    expect(screen.getByTestId('path-probe')).toHaveTextContent('/listing/abc-2859');
  });
});
