/**
 * Issue #2858 B2 (L163) — RequestPropertyCard focus geometry unit tests (B2-N27, B2-N28).
 * Pins the clientHeight/3 fallback when no sticky header is present and skipping a non-overflowing
 * overflow:auto ancestor in scrollInvalidFieldIntoPanel.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { getSession } = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: null } })),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession } },
}));

import { RequestPropertyCard, type RequestPropertyContext } from '../RequestPropertyCard';

const PHONE = '9876543210';

const areaContext: RequestPropertyContext = {
  city: 'udupi',
  areaKey: 'kalsanka|city|udupi',
  areaLabel: 'Kalsanka',
  journey: 'AREA',
  intent: 'BUY',
  contextLabel: 'Kalsanka, udupi',
};

const rect = (top: number, bottom: number) => ({
  top,
  bottom,
  left: 0,
  right: 0,
  width: 0,
  height: bottom - top,
  x: 0,
  y: top,
  toJSON: () => ({}),
});

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  vi.stubEnv('VITE_PROPERTY_REQUESTS_ENABLED', 'true');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('RequestPropertyCard — focus geometry branches (L163 B2-N27, B2-N28)', () => {
  it('with no sticky header the invalid field lands a third of the way down the nearest scrollable container', async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    });
    const windowScrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    try {
      const user = userEvent.setup();
      const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
      render(
        <QueryClientProvider client={client}>
          <div data-testid="panel-scroller" style={{ overflowY: 'auto' }}>
            <RequestPropertyCard context={areaContext} />
          </div>
        </QueryClientProvider>,
      );
      const panel = screen.getByTestId('panel-scroller');
      let panelScrollTop = 0;
      Object.defineProperty(panel, 'scrollHeight', { configurable: true, value: 2000 });
      Object.defineProperty(panel, 'clientHeight', { configurable: true, value: 600 });
      Object.defineProperty(panel, 'scrollTop', {
        configurable: true,
        get: () => panelScrollTop,
        set: (v: number) => {
          panelScrollTop = v;
        },
      });
      panel.getBoundingClientRect = () => rect(100, 700);

      await user.click(screen.getByRole('button', { name: 'Request a property' }));
      const field = screen.getByLabelText(/what are you looking for/i);
      field.getBoundingClientRect = () => rect(500, 580); // offset 400 below container top
      await user.click(field);
      await user.paste('Call me on 9876543210');
      await user.type(screen.getByLabelText(/phone number/i), PHONE);
      await user.click(screen.getByRole('checkbox', { name: /i agree to share this information/i }));
      await user.click(screen.getByRole('button', { name: 'Send request' }));

      await waitFor(() => expect(field).toHaveFocus());
      // desired offset = max(clientHeight/3 = 200, stickyBottom 0 + 16) = 200; field offset 400 => scrollTop = 200.
      expect(panelScrollTop).toBe(200);
      expect(scrollIntoView).not.toHaveBeenCalled();
      expect(windowScrollTo).not.toHaveBeenCalled();
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it('an overflow:auto ancestor that does not overflow is skipped; the next overflowing ancestor is scrolled', async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    });
    const windowScrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    try {
      const user = userEvent.setup();
      const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
      render(
        <QueryClientProvider client={client}>
          <div data-testid="outer-scroller" style={{ overflowY: 'auto' }}>
            <div data-testid="inner-scroller" style={{ overflowY: 'auto' }}>
              <RequestPropertyCard context={areaContext} />
            </div>
          </div>
        </QueryClientProvider>,
      );
      const outer = screen.getByTestId('outer-scroller');
      const inner = screen.getByTestId('inner-scroller');
      let outerScrollTop = 0;
      let innerScrollTop = 0;
      Object.defineProperty(inner, 'scrollHeight', { configurable: true, value: 300 });
      Object.defineProperty(inner, 'clientHeight', { configurable: true, value: 300 });
      Object.defineProperty(inner, 'scrollTop', {
        configurable: true,
        get: () => innerScrollTop,
        set: (v: number) => {
          innerScrollTop = v;
        },
      });
      Object.defineProperty(outer, 'scrollHeight', { configurable: true, value: 3000 });
      Object.defineProperty(outer, 'clientHeight', { configurable: true, value: 900 });
      Object.defineProperty(outer, 'scrollTop', {
        configurable: true,
        get: () => outerScrollTop,
        set: (v: number) => {
          outerScrollTop = v;
        },
      });
      inner.getBoundingClientRect = () => rect(60, 360);
      outer.getBoundingClientRect = () => rect(50, 950);

      await user.click(screen.getByRole('button', { name: 'Request a property' }));
      const field = screen.getByLabelText(/what are you looking for/i);
      field.getBoundingClientRect = () => rect(650, 730); // offset 600 relative to outer (top 50)
      await user.click(field);
      await user.paste('Call me on 9876543210');
      await user.type(screen.getByLabelText(/phone number/i), PHONE);
      await user.click(screen.getByRole('checkbox', { name: /i agree to share this information/i }));
      await user.click(screen.getByRole('button', { name: 'Send request' }));

      await waitFor(() => expect(field).toHaveFocus());
      // outer desiredOffset = max(900/3 = 300, 16) = 300; field offset = 650 - 50 = 600 => outerScrollTop = 300.
      expect(outerScrollTop).toBe(300);
      expect(innerScrollTop).toBe(0);
      expect(scrollIntoView).not.toHaveBeenCalled();
      expect(windowScrollTo).not.toHaveBeenCalled();
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });
});
