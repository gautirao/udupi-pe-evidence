/**
 * Issue #1793 PR-C — RequestPropertyCard: flag gating, consent gating, public POST contract
 * (no Authorization header), and every failure mode. Uses the real api client with a stubbed
 * global fetch so the request that leaves the browser is what is asserted.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { getSession } = vi.hoisted(() => ({
  // A live session token exists: the public POST must STILL not carry it.
  getSession: vi.fn(async () => ({ data: { session: { access_token: 'SECRET-SESSION-TOKEN' } } })),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession } },
}));

import {
  RequestPropertyCard,
  PROPERTY_REQUEST_CONSENT_VERSION,
  PROPERTY_REQUEST_DELETION_EMAIL,
  type RequestPropertyContext,
} from '../RequestPropertyCard';

const PHONE = '9876543210';

const areaContext: RequestPropertyContext = {
  city: 'udupi',
  areaKey: 'kalsanka|city|udupi',
  areaLabel: 'Kalsanka',
  journey: 'AREA',
  intent: 'BUY',
  contextLabel: 'Kalsanka, udupi',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function renderCard(context: RequestPropertyContext = areaContext) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RequestPropertyCard context={context} />
    </QueryClientProvider>,
  );
}

async function expand(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Request a property' }));
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/what are you looking for/i), '3BHK near the school');
  await user.type(screen.getByLabelText(/minimum budget/i), '5000000');
  await user.type(screen.getByLabelText(/maximum budget/i), '8000000');
  await user.type(screen.getByLabelText(/phone number/i), PHONE);
}

async function tickConsent(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('checkbox', { name: /i agree to share this information/i }));
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_PROPERTY_REQUESTS_ENABLED', 'true');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('RequestPropertyCard — flag', () => {
  it('renders nothing when VITE_PROPERTY_REQUESTS_ENABLED is absent or not exactly "true"', () => {
    vi.stubEnv('VITE_PROPERTY_REQUESTS_ENABLED', '');
    const { container, unmount } = renderCard();
    expect(container).toBeEmptyDOMElement();
    unmount();
    vi.stubEnv('VITE_PROPERTY_REQUESTS_ENABLED', 'false');
    const second = renderCard();
    expect(second.container).toBeEmptyDOMElement();
  });

  it('renders the collapsed card when the flag is "true"', () => {
    renderCard();
    expect(screen.getByRole('heading', { name: "Can't find what you need?" })).toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: 'Request a property' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText(/phone number/i)).not.toBeInTheDocument();
  });
});

describe('RequestPropertyCard — requirement helper and consent legibility', () => {
  it('tells buyers not to put phone numbers in the free-text requirement (SR LOW) and wires it as the field description', async () => {
    const user = userEvent.setup();
    renderCard();
    await expand(user);
    const helper = screen.getByText(/do not put phone numbers here/i);
    expect(helper).toBeInTheDocument();
    const describedBy = screen.getByLabelText(/what are you looking for/i).getAttribute('aria-describedby') ?? '';
    expect(describedBy.split(' ')).toContain(helper.id);
  });

  it('consent detail uses the foreground token (not muted) for legibility, with no colour literal (UI NB1)', async () => {
    const user = userEvent.setup();
    renderCard();
    await expand(user);
    const detail = screen.getByText(/we collect your requirement/i);
    expect(detail.className).toContain('text-foreground/80');
    expect(detail.className).not.toContain('text-muted-foreground');
    expect(detail.className).not.toMatch(/\[#|rgb|hsl\(/);
  });
});

describe('RequestPropertyCard — expanded form and consent', () => {
  it('expands inline, shows the read-only context line and the consent copy with the exact deletion address', async () => {
    const user = userEvent.setup();
    renderCard();
    await expand(user);
    expect(screen.getByRole('button', { name: 'Request a property' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Buy · Kalsanka, udupi/)).toBeInTheDocument();

    expect(PROPERTY_REQUEST_DELETION_EMAIL).toBe('remove-my-search@propertysignal.in');
    const mail = screen.getByRole('link', { name: 'remove-my-search@propertysignal.in' });
    expect(mail).toHaveAttribute('href', 'mailto:remove-my-search@propertysignal.in');

    const consentText = document.body.textContent ?? '';
    expect(consentText).toMatch(/requirement, budget and phone\/WhatsApp number/i);
    expect(consentText).toMatch(/try to match you with a founding broker/i);
    expect(consentText).toMatch(/not a promise that anyone will contact you/i);
    expect(consentText).toMatch(/stored encrypted/i);
    expect(consentText).toMatch(/never shown publicly/i);
    expect(consentText).toMatch(/shared only with a broker matched to your request/i);
    expect(consentText).toMatch(/12 months/i);
    expect(consentText).not.toMatch(/verified broker will/i);
    expect(consentText).not.toMatch(/we will contact you/i);
    expect(PROPERTY_REQUEST_CONSENT_VERSION.length).toBeGreaterThan(0);
    expect(PROPERTY_REQUEST_CONSENT_VERSION.length).toBeLessThanOrEqual(32);
  });

  it('keeps submit disabled until consent is ticked, and a click on it sends nothing', async () => {
    const user = userEvent.setup();
    renderCard();
    await expand(user);
    await fillValid(user);
    const submit = screen.getByRole('button', { name: 'Send request' });
    expect(submit).toBeDisabled();
    await user.click(submit);
    expect(fetchMock).not.toHaveBeenCalled();
    await tickConsent(user);
    expect(submit).toBeEnabled();
    await user.click(screen.getByRole('checkbox', { name: /i agree to share this information/i }));
    expect(submit).toBeDisabled();
  });

  it('rejects an invalid phone client-side with an aria-invalid field error and sends nothing', async () => {
    const user = userEvent.setup();
    renderCard();
    await expand(user);
    await user.type(screen.getByLabelText(/phone number/i), '12345');
    await tickConsent(user);
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/phone number/i)).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('RequestPropertyCard — public POST contract', () => {
  it('201: posts the context + buyer fields + consentVersion WITHOUT an Authorization header, then shows an inline status and moves focus to it', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'r-1', status: 'NEW', createdAt: '2026-10-06T00:00:00Z' }, 201));
    const user = userEvent.setup();
    renderCard();
    await expand(user);
    await fillValid(user);
    await tickConsent(user);
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toMatch(/\/api\/public\/property-requests$/);
    expect(init.method).toBe('POST');
    const headerNames = Object.keys(init.headers).map((h) => h.toLowerCase());
    expect(headerNames).not.toContain('authorization');
    expect(JSON.stringify(init.headers)).not.toContain('SECRET-SESSION-TOKEN');
    expect(JSON.parse(init.body as string)).toEqual({
      city: 'udupi',
      areaKey: 'kalsanka|city|udupi',
      areaLabel: 'Kalsanka',
      journey: 'AREA',
      intent: 'BUY',
      requirement: '3BHK near the school',
      budgetMin: 5000000,
      budgetMax: 8000000,
      phone: PHONE,
      contactVia: 'PHONE',
      consent: true,
      consentVersion: PROPERTY_REQUEST_CONSENT_VERSION,
    });

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/request received/i);
    expect(status).toHaveTextContent(/not a guarantee/i);
    await waitFor(() => expect(within(status).getByRole('heading')).toHaveFocus());
    expect(screen.queryByRole('button', { name: 'Send request' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('normalises a spaced +91 phone and honours the WhatsApp choice and RENT/MAP context (no area key/label)', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'r-2', status: 'NEW', createdAt: '2026-10-06T00:00:00Z' }, 201));
    const user = userEvent.setup();
    renderCard({
      city: 'udupi',
      areaKey: null,
      areaLabel: null,
      journey: 'MAP',
      intent: 'RENT',
      contextLabel: 'Drawn area, udupi',
    });
    await expand(user);
    await user.type(screen.getByLabelText(/phone number/i), '+91 98765 43210');
    await user.click(screen.getByRole('radio', { name: 'WhatsApp' }));
    await tickConsent(user);
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({
      journey: 'MAP',
      intent: 'RENT',
      phone: '+919876543210',
      contactVia: 'WHATSAPP',
      consent: true,
    });
    expect(body.areaKey ?? null).toBeNull();
    expect(body.areaLabel ?? null).toBeNull();
    expect(body).not.toHaveProperty('requirement');
  });

  it('SCHOOL context carries the school name and radius in areaLabel (the DTO has no school field)', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'r-3', status: 'NEW', createdAt: '2026-10-06T00:00:00Z' }, 201));
    const user = userEvent.setup();
    renderCard({
      city: 'udupi',
      areaKey: 'manipal|city|udupi',
      areaLabel: 'Manipal · near Manipal Public School (3 km)',
      journey: 'SCHOOL',
      intent: 'BUY',
      contextLabel: 'Manipal Public School, within 3 km',
    });
    await expand(user);
    await user.type(screen.getByLabelText(/phone number/i), PHONE);
    await tickConsent(user);
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.journey).toBe('SCHOOL');
    expect(body.areaLabel).toContain('Manipal Public School');
    expect(body.areaLabel).toContain('3 km');
  });

  it('never writes the phone to the console', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'boom' }, 500));
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const user = userEvent.setup();
    renderCard();
    await expand(user);
    await fillValid(user);
    await tickConsent(user);
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    await screen.findByRole('alert');
    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(PHONE);
    }
  });

  it('prevents a double submit: one request while pending, button disabled and reads "Sending…"', async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => { resolve = r; }));
    const user = userEvent.setup();
    renderCard();
    await expand(user);
    await fillValid(user);
    await tickConsent(user);
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    const pending = await screen.findByRole('button', { name: /sending…/i });
    expect(pending).toBeDisabled();
    await user.click(pending);
    await user.keyboard('{Enter}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve(json({ id: 'r-4', status: 'NEW', createdAt: '2026-10-06T00:00:00Z' }, 201));
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });
});

const PHONE_IN_REQUIREMENT_MESSAGE = 'Please enter contact numbers only in the Phone / WhatsApp field.';

describe('RequestPropertyCard — free-text phone rejection mirrors the server rule (#1793 PR-C r2)', () => {
  async function submitWithRequirement(requirement: string) {
    const user = userEvent.setup();
    renderCard();
    await expand(user);
    const field = screen.getByLabelText(/what are you looking for/i);
    // paste, not type: user-event's type() reads "(" / "{" / "[" as keyboard-syntax.
    await user.click(field);
    await user.paste(requirement);
    await user.type(screen.getByLabelText(/phone number/i), PHONE);
    await tickConsent(user);
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    return { user, field };
  }

  it.each([
    'Call me on 9876543210',
    '+91 98765 43210',
    '98765-43210',
    '98765.43210',
    '9876 543 210',
    '(98765) 43210',
    '09876543210',
    'whatsapp 919876543210 please',
    '9876543210 9123456780',
    'Call 9876543210 9123456780',
    '98765 43210 98765 43210',
    // A phone whose split chunk ends in "00" is still a phone (only ALL-"00" chunks make a range).
    '98765 43200',
    '+91 98765 43200',
    '98765-43200',
    '9876543200',
    'Call me on 9876543200',
    'pin 600028 1200 sqft',
  ])('rejects %j: exact inline error on the requirement field, focus moves there, NO POST', async (text) => {
    const { field } = await submitWithRequirement(text);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(PHONE_IN_REQUIREMENT_MESSAGE)).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    const describedBy = (field.getAttribute('aria-describedby') ?? '').split(' ');
    expect(
      describedBy.some((id) => document.getElementById(id)?.textContent === PHONE_IN_REQUIREMENT_MESSAGE),
    ).toBe(true);
    await waitFor(() => expect(field).toHaveFocus());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each([
    '3 BHK',
    '1200 sqft',
    '50 lakh',
    '2020-2024',
    '6000000 - 9000000',
    '₹50,00,000',
    'budget 45-60 lakh',
    '2 BHK near 5th cross, 560078',
    '98765432',
    '1234567890',
    '1200 1500 2000 sqft options',
    '9000000 7500000',
    // Multi-chunk spans where EVERY chunk ends in "00" are ranges, not phones.
    'Rent 60000-75000',
    'budget 80000 - 95000',
    '65000 75000',
    '2 to 3 BHK under 80 lakh',
  ])('accepts %j: the request is sent', async (text) => {
    fetchMock.mockResolvedValueOnce(json({ id: 'r-ok', status: 'NEW', createdAt: 'x' }, 201));
    await submitWithRequirement(text);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(PHONE_IN_REQUIREMENT_MESSAGE)).not.toBeInTheDocument();
  });

  it('the inline error clears when the buyer edits the requirement, and a corrected requirement then sends', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'r-fix', status: 'NEW', createdAt: 'x' }, 201));
    const { user, field } = await submitWithRequirement('Call me on 9876543210');
    expect(screen.getByText(PHONE_IN_REQUIREMENT_MESSAGE)).toBeInTheDocument();
    await user.clear(field);
    expect(field).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText(PHONE_IN_REQUIREMENT_MESSAGE)).not.toBeInTheDocument();
    await user.type(field, '3 BHK');
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it('typing in the requirement after a submit error keeps focus there (clearing an error never moves focus)', async () => {
    const user = userEvent.setup();
    renderCard();
    await expand(user);
    const field = screen.getByLabelText(/what are you looking for/i);
    await user.click(field);
    await user.paste('Call me on 9876543210');
    await tickConsent(user);
    // Phone left empty: both requirement and phone fail.
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(field).toHaveFocus());
    expect(screen.getByLabelText(/phone number/i)).toHaveAttribute('aria-invalid', 'true');
    await user.keyboard('x');
    expect(field).not.toHaveAttribute('aria-invalid');
    expect(field).toHaveFocus();
    expect(screen.getByLabelText(/phone number/i)).not.toHaveFocus();
    expect(screen.getByLabelText(/phone number/i)).toHaveAttribute('aria-invalid', 'true');
  });

  // r3: the browser's default focus() scroll can leave the field behind the sticky panel header. The
  // card focuses WITHOUT the default scroll and scrolls ONLY the field's nearest scrollable ancestor so the
  // field clears that container's sticky header. scrollIntoView is forbidden: it also scrolls every outer
  // ancestor and the document, shifting the whole app shell. (Real-browser proof: e2e T12; jsdom has no
  // layout, so this asserts the mechanism with stubbed geometry.)
  it('focuses the first invalid field with preventScroll and sets ONLY the panel container scrollTop below its sticky header (never scrollIntoView)', async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, writable: true, value: scrollIntoView });
    const windowScrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
    try {
      const user = userEvent.setup();
      const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
      render(
        <QueryClientProvider client={client}>
          <div data-testid="outer-scroller" style={{ overflowY: 'auto' }}>
            <div data-testid="panel-scroller" style={{ overflowY: 'auto' }}>
              <div data-testid="sticky-header" style={{ position: 'sticky' }} />
              <RequestPropertyCard context={areaContext} />
            </div>
          </div>
        </QueryClientProvider>,
      );
      const panel = screen.getByTestId('panel-scroller');
      const outer = screen.getByTestId('outer-scroller');
      const sticky = screen.getByTestId('sticky-header');
      const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) });
      // Both ancestors overflow; the NEAREST (panel) must be the one that is scrolled.
      let panelScrollTop = 0;
      let outerScrollTop = 0;
      Object.defineProperty(panel, 'scrollHeight', { configurable: true, value: 2000 });
      Object.defineProperty(panel, 'clientHeight', { configurable: true, value: 600 });
      Object.defineProperty(panel, 'scrollTop', { configurable: true, get: () => panelScrollTop, set: (v: number) => { panelScrollTop = v; } });
      Object.defineProperty(outer, 'scrollHeight', { configurable: true, value: 3000 });
      Object.defineProperty(outer, 'clientHeight', { configurable: true, value: 900 });
      Object.defineProperty(outer, 'scrollTop', { configurable: true, get: () => outerScrollTop, set: (v: number) => { outerScrollTop = v; } });
      panel.getBoundingClientRect = () => rect(100, 700);
      sticky.getBoundingClientRect = () => rect(100, 380); // sticky bottom is 280px below the container top

      await expand(user);
      const field = screen.getByLabelText(/what are you looking for/i);
      field.getBoundingClientRect = () => rect(500, 580); // 400px below the container top
      await user.click(field);
      await user.paste('Call me on 9876543210');
      await user.type(screen.getByLabelText(/phone number/i), PHONE);
      await tickConsent(user);
      await user.click(screen.getByRole('button', { name: 'Send request' }));

      await waitFor(() => expect(field).toHaveFocus());
      const idx = focusSpy.mock.contexts.lastIndexOf(field);
      expect(focusSpy.mock.calls[idx][0]).toEqual({ preventScroll: true });
      // desired offset = max(clientHeight/3 = 200, stickyBottom 280 + 16 clearance) = 296; field is at 400 => scroll 104.
      expect(panelScrollTop).toBe(104);
      expect(outerScrollTop).toBe(0);
      expect(scrollIntoView).not.toHaveBeenCalled();
      expect(windowScrollTo).not.toHaveBeenCalled();
    } finally {
      // jsdom does not implement scrollIntoView; remove our stand-in so other tests see the original.
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it('with no scrollable ancestor the field is focused with preventScroll and nothing is scrolled', async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, writable: true, value: scrollIntoView });
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
    try {
      const { field } = await submitWithRequirement('Call me on 9876543210');
      await waitFor(() => expect(field).toHaveFocus());
      const idx = focusSpy.mock.contexts.lastIndexOf(field);
      expect(focusSpy.mock.calls[idx][0]).toEqual({ preventScroll: true });
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it('a server 400 field error for requirement with that message surfaces on the same field', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ error: 'VALIDATION_FAILED', fields: [{ field: 'requirement', message: PHONE_IN_REQUIREMENT_MESSAGE }] }, 400),
    );
    const user = userEvent.setup();
    renderCard();
    await expand(user);
    await fillValid(user);
    await tickConsent(user);
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText(PHONE_IN_REQUIREMENT_MESSAGE)).toBeInTheDocument();
    const field = screen.getByLabelText(/what are you looking for/i);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(field).toHaveFocus());
  });
});

describe('RequestPropertyCard — failures never look like success or zero results', () => {
  it('400: maps fields[] to per-field errors (budgetRangeValid -> budget) plus a summary; no success state', async () => {
    fetchMock.mockResolvedValueOnce(
      json(
        {
          error: 'VALIDATION_FAILED',
          fields: [
            { field: 'phone', message: 'phone must be 10 to 14 digits, optionally prefixed with +' },
            { field: 'budgetRangeValid', message: 'budgetMax must be greater than or equal to budgetMin' },
            { field: 'requirement', message: 'requirement must be at most 500 characters' },
          ],
        },
        400,
      ),
    );
    const user = userEvent.setup();
    renderCard();
    await expand(user);
    await fillValid(user);
    await tickConsent(user);
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    expect(await screen.findByText('Please fix the highlighted fields.')).toBeInTheDocument();
    const phone = screen.getByLabelText(/phone number/i);
    expect(phone).toHaveAttribute('aria-invalid', 'true');
    const describedBy = phone.getAttribute('aria-describedby') ?? '';
    expect(describedBy.split(' ').some((id) => document.getElementById(id)?.textContent?.includes('10 to 14 digits'))).toBe(true);
    // The backend message quotes DTO field names; the buyer sees a friendly sentence instead (CR LOW).
    expect(screen.getByText('Maximum budget must be at least the minimum.')).toBeInTheDocument();
    expect(screen.queryByText(/budgetMax|budgetMin|budgetRangeValid/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/maximum budget/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/what are you looking for/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    // Form (and the buyer's typed values) stays so they can fix it.
    expect(screen.getByLabelText(/phone number/i)).toHaveValue(PHONE);
  });

  it('400 with fields the card does not render (areaLabel, city): their messages show in the alert, as plain text', async () => {
    fetchMock.mockResolvedValueOnce(
      json(
        {
          error: 'VALIDATION_FAILED',
          fields: [
            { field: 'areaLabel', message: 'areaLabel must be at most 200 characters' },
            { field: 'city', message: '<b>city</b> is not supported' },
          ],
        },
        400,
      ),
    );
    const user = userEvent.setup();
    renderCard();
    await expand(user);
    await fillValid(user);
    await tickConsent(user);
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Please fix the highlighted fields.');
    expect(within(alert).getByText('areaLabel must be at most 200 characters')).toBeInTheDocument();
    expect(within(alert).getByText('<b>city</b> is not supported')).toBeInTheDocument();
    expect(alert.querySelector('b')).toBeNull();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('429: friendly rate-limit message in an alert, no Retry button, no success', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'RATE_LIMIT_EXCEEDED' }, 429));
    const user = userEvent.setup();
    renderCard();
    await expand(user);
    await fillValid(user);
    await tickConsent(user);
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Too many requests from this device or number. Please try again later.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each([
    ['500', () => json({ error: 'x' }, 500)],
    ['404 (feature off server-side)', () => json({ error: 'NOT_FOUND' }, 404)],
  ])('%s: error alert + Retry; Retry re-submits the same payload and only then shows success', async (_name, make) => {
    fetchMock.mockResolvedValueOnce(make()).mockResolvedValueOnce(json({ id: 'r-5', status: 'NEW', createdAt: 'x' }, 201));
    const user = userEvent.setup();
    renderCard();
    await expand(user);
    await fillValid(user);
    await tickConsent(user);
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('We could not send your request. Please try again.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = (fetchMock.mock.calls[0][1] as RequestInit).body;
    const second = (fetchMock.mock.calls[1][1] as RequestInit).body;
    expect(second).toBe(first);
  });

  it('500 -> edit the phone -> Retry sends the CURRENT phone, not the stale one (CR F4)', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'x' }, 500)).mockResolvedValueOnce(json({ id: 'r-6', status: 'NEW', createdAt: 'x' }, 201));
    const user = userEvent.setup();
    renderCard();
    await expand(user);
    await fillValid(user);
    await tickConsent(user);
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    const alert = await screen.findByRole('alert');
    const phone = screen.getByLabelText(/phone number/i);
    await user.clear(phone);
    await user.type(phone, '9123456789');
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const second = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(first.phone).toBe(PHONE);
    expect(second.phone).toBe('9123456789');
    expect(second.consent).toBe(true);
    expect(second.consentVersion).toBe(PROPERTY_REQUEST_CONSENT_VERSION);
  });

  it('500 -> untick consent -> Retry is disabled and sends NO POST (SR MEDIUM: never bypass withdrawn consent)', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'x' }, 500));
    const user = userEvent.setup();
    renderCard();
    await expand(user);
    await fillValid(user);
    await tickConsent(user);
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    const alert = await screen.findByRole('alert');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await tickConsent(user); // untick
    const retry = within(alert).getByRole('button', { name: 'Retry' });
    expect(retry).toBeDisabled();
    await user.click(retry);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Re-ticking restores Retry.
    await tickConsent(user);
    expect(within(screen.getByRole('alert')).getByRole('button', { name: 'Retry' })).toBeEnabled();
  });

  it('a server field error is cleared as soon as the buyer edits that field (no stale error after a fix)', async () => {
    fetchMock.mockResolvedValueOnce(
      json(
        {
          error: 'VALIDATION_FAILED',
          fields: [
            { field: 'phone', message: 'phone must be 10 to 14 digits, optionally prefixed with +' },
            { field: 'budgetRangeValid', message: 'budgetMax must be greater than or equal to budgetMin' },
          ],
        },
        400,
      ),
    );
    const user = userEvent.setup();
    renderCard();
    await expand(user);
    await fillValid(user);
    await tickConsent(user);
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    await screen.findByText('Please fix the highlighted fields.');
    expect(screen.getByLabelText(/phone number/i)).toHaveAttribute('aria-invalid', 'true');
    await user.type(screen.getByLabelText(/phone number/i), '1');
    expect(screen.getByLabelText(/phone number/i)).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText(/10 to 14 digits, optionally/)).not.toBeInTheDocument();
    // The budget range message belongs to both bounds: editing either clears it.
    expect(screen.getByLabelText(/maximum budget/i)).toHaveAttribute('aria-invalid', 'true');
    await user.type(screen.getByLabelText(/minimum budget/i), '0');
    expect(screen.getByLabelText(/maximum budget/i)).not.toHaveAttribute('aria-invalid');
  });

  it('network failure (fetch rejects): error alert + Retry, never success', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const user = userEvent.setup();
    renderCard();
    await expand(user);
    await fillValid(user);
    await tickConsent(user);
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send request' })).toBeEnabled();
  });

  it("consent unticked shows the hint 'Tick the box above to send'; ticking removes it", async () => {
    const user = userEvent.setup();
    renderCard();
    await expand(user);
    expect(screen.getByText('Tick the box above to send')).toBeInTheDocument();
    await tickConsent(user);
    expect(screen.queryByText('Tick the box above to send')).toBeNull();
  });

  it('while consent is unticked the Send button is described by the hint element; after ticking it has no aria-describedby', async () => {
    const user = userEvent.setup();
    renderCard();
    await expand(user);
    const submit = screen.getByRole('button', { name: 'Send request' });
    const hintId = submit.getAttribute('aria-describedby');
    expect(hintId).toBeTruthy();
    expect(document.getElementById(hintId ?? '')?.textContent).toBe('Tick the box above to send');
    await tickConsent(user);
    expect(submit.getAttribute('aria-describedby')).toBeNull();
  });

  it('the submit HANDLER refuses a submit event while consent is unticked (no POST); the same form sends exactly once after ticking', async () => {
    fetchMock.mockResolvedValue(json({ id: 'r-consent', status: 'NEW', createdAt: 'x' }, 201));
    const user = userEvent.setup();
    renderCard();
    await expand(user);
    await fillValid(user);
    const form = screen.getByRole('button', { name: 'Send request' }).closest('form');
    expect(form).not.toBeNull();

    // Leg A (credited, handler protection only): fireEvent.submit with consent unticked sends nothing.
    fireEvent.submit(form!);
    expect(fetchMock).toHaveBeenCalledTimes(0);

    // Leg B (UNCREDITED, proves nothing about the Enter journey across a disabled button):
    await user.type(screen.getByLabelText(/phone number/i), '{Enter}');
    expect(fetchMock).toHaveBeenCalledTimes(0);

    // Leg C (credited positive control): tick consent and fire submit -> sends once with consent: true.
    await tickConsent(user);
    fireEvent.submit(form!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.consent).toBe(true);
    expect(body.phone).toBe(PHONE);
  });

  it("429 shows only the rate-limit alert: no 'We could not send your request' text and no Retry button", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'RATE_LIMIT_EXCEEDED' }, 429));
    const user = userEvent.setup();
    renderCard();
    await expand(user);
    await fillValid(user);
    await tickConsent(user);
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Too many requests from this device or number. Please try again later.');
    expect(screen.queryByText('We could not send your request. Please try again.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });
});

