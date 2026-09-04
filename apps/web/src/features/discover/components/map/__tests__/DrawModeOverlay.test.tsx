import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DrawModeOverlay, DRAW_MODE_COPY } from '../DrawModeOverlay';
import type { PolygonDraftBlock, PolygonDraftPhase } from '@/features/discover/state/polygonDraftPhase';

/**
 * Issue #2419 (PR-2) — draw-mode instructions and the blocked-draft surface.
 *
 * NO MOCK AUTHORITY for any copy here: the design kit has no point-placement
 * mode at all (`Experience.jsx:264` fabricates a finished polygon), and
 * FUNCTIONAL_AUDIT gap M8 records the same absence for the rejection state.
 * Every string is issue #2419's own wording. These tests therefore pin
 * BEHAVIOUR — which action appears in which state — rather than asserting the
 * sentences themselves, which are expected to change if design publishes
 * these states.
 */

const POLYGON: [number, number][] = [
  [12.9, 77.6],
  [13.0, 77.6],
  [13.0, 77.7],
];

function renderOverlay(
  phase: PolygonDraftPhase,
  block: PolygonDraftBlock | null = null,
  overrides: Partial<React.ComponentProps<typeof DrawModeOverlay>> = {},
) {
  const props = {
    phase,
    block,
    vertexCount: 0,
    isTouch: false,
    onCancelDraw: vi.fn(),
    onUndoVertex: vi.fn(),
    onRedraw: vi.fn(),
    onRetryValidation: vi.fn(),
    onDismissBlock: vi.fn(),
    topOffsetPx: 100,
    ...overrides,
  };
  return { ...render(<DrawModeOverlay {...props} />), props };
}

describe('DrawModeOverlay — quiet in every state it does not own', () => {
  // REVIEWING belongs to #2016's replace dialog; a second surface there would
  // be the "second confirmation flow" the issue forbids.
  it.each([
    ['IDLE', { status: 'IDLE' } as const],
    ['DRAWING is owned, but COMMITTED is not', { status: 'COMMITTED' } as const],
    [
      'REVIEWING — #2016 dialog owns it',
      { status: 'REVIEWING', polygon: POLYGON, isValidating: false, awaitingReplaceConfirm: true } as const,
    ],
  ])('renders nothing in %s', (_label, phase) => {
    const { container } = renderOverlay(phase);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing in INVALID without a block to explain', () => {
    const { container } = renderOverlay({ status: 'INVALID', polygon: POLYGON, block: { kind: 'policy', rejection: { reason: 'too_broad' } } }, null);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('DrawModeOverlay — DRAWING', () => {
  it('shows the instructions with Cancel and Undo', () => {
    renderOverlay({ status: 'DRAWING' }, null, { vertexCount: 2 });

    expect(screen.getByTestId('draw-mode-overlay')).toBeInTheDocument();
    expect(screen.getByText(DRAW_MODE_COPY.title)).toBeInTheDocument();
    expect(screen.getByTestId('draw-mode-cancel')).toBeEnabled();
    expect(screen.getByTestId('draw-mode-undo')).toBeEnabled();
  });

  // Offering to undo a point that does not exist would be a lie.
  it('disables Undo at zero vertices', () => {
    renderOverlay({ status: 'DRAWING' }, null, { vertexCount: 0 });

    expect(screen.getByTestId('draw-mode-undo')).toBeDisabled();
  });

  // #2419 specifies different wording for the two, and the honest
  // discriminator is the input device rather than the viewport width.
  it('uses touch wording on a coarse pointer and pointer wording otherwise', () => {
    const { unmount } = renderOverlay({ status: 'DRAWING' }, null, { isTouch: true });
    expect(screen.getByText(DRAW_MODE_COPY.touchBody)).toBeInTheDocument();
    unmount();

    renderOverlay({ status: 'DRAWING' }, null, { isTouch: false });
    expect(screen.getByText(DRAW_MODE_COPY.desktopBody)).toBeInTheDocument();
  });

  it('wires Cancel and Undo to their handlers', async () => {
    const user = userEvent.setup();
    const { props } = renderOverlay({ status: 'DRAWING' }, null, { vertexCount: 1 });

    await user.click(screen.getByTestId('draw-mode-undo'));
    await user.click(screen.getByTestId('draw-mode-cancel'));

    expect(props.onUndoVertex).toHaveBeenCalledTimes(1);
    expect(props.onCancelDraw).toHaveBeenCalledTimes(1);
  });
});

describe('DrawModeOverlay — blocked draft', () => {
  const invalid = (block: PolygonDraftBlock): PolygonDraftPhase => ({
    status: 'INVALID',
    polygon: POLYGON,
    block,
  });

  // Redraw is right ONLY when #2420 judged the shape and rejected it.
  it.each([['too_broad'], ['outside_searchable_city']] as const)(
    'offers Redraw for a %s policy rejection',
    (reason) => {
      renderOverlay(invalid({ kind: 'policy', rejection: { reason } }), {
        kind: 'policy',
        rejection: { reason },
      });

      expect(screen.getByTestId('draw-blocked-overlay')).toBeInTheDocument();
      expect(screen.getByTestId('draw-blocked-redraw')).toBeInTheDocument();
      expect(screen.queryByTestId('draw-blocked-retry')).not.toBeInTheDocument();
    },
  );

  // The drawing may be perfectly fine and the app never got a verdict, so
  // telling the shopper to redraw it would be a lie. Retry, not Redraw.
  it('offers Try again, NOT Redraw, for a retryable unverified block', () => {
    renderOverlay(invalid({ kind: 'unverified', retryable: true }), {
      kind: 'unverified',
      retryable: true,
    });

    expect(screen.getByTestId('draw-blocked-retry')).toBeInTheDocument();
    expect(screen.queryByTestId('draw-blocked-redraw')).not.toBeInTheDocument();
  });

  // Retrying a 401 changes nothing until the shopper signs in, and redrawing
  // does not help either — so neither action is offered.
  it('offers neither Redraw nor Try again for a non-retryable block', () => {
    renderOverlay(invalid({ kind: 'unverified', retryable: false }), {
      kind: 'unverified',
      retryable: false,
    });

    expect(screen.queryByTestId('draw-blocked-retry')).not.toBeInTheDocument();
    expect(screen.queryByTestId('draw-blocked-redraw')).not.toBeInTheDocument();
    expect(screen.getByTestId('draw-blocked-dismiss')).toBeInTheDocument();
  });

  it('never exposes a raw backend reason code to the shopper', () => {
    renderOverlay(invalid({ kind: 'policy', rejection: { reason: 'too_broad' } }), {
      kind: 'policy',
      rejection: { reason: 'too_broad' },
    });

    expect(screen.getByTestId('draw-blocked-overlay').textContent ?? '').not.toMatch(
      /polygon_|_scope_|too_broad|outside_searchable/,
    );
  });

  it('wires Redraw and Dismiss to their handlers', async () => {
    const user = userEvent.setup();
    const block: PolygonDraftBlock = { kind: 'policy', rejection: { reason: 'too_broad' } };
    const { props } = renderOverlay(invalid(block), block);

    await user.click(screen.getByTestId('draw-blocked-redraw'));
    await user.click(screen.getByTestId('draw-blocked-dismiss'));

    expect(props.onRedraw).toHaveBeenCalledTimes(1);
    expect(props.onDismissBlock).toHaveBeenCalledTimes(1);
  });
});
