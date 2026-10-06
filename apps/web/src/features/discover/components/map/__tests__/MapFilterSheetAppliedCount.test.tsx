// Issue #1793 PR-A F1 — the staged-edit status line must not state a count the caller cannot vouch
// for. While school-radius results are pending (anon A1 loading / error), the applied markers count
// reads 0 as "unknown", so the line omits the number; a settled genuine zero still says 0.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MapFilterSheet } from '../MapFilterSheet';

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}

function renderEdited(overrides: Partial<React.ComponentProps<typeof MapFilterSheet>> = {}) {
  render(
    <MapFilterSheet
      open
      onOpenChange={vi.fn()}
      filters={{}}
      onApply={vi.fn()}
      appliedResultCount={0}
      {...overrides}
    />,
  );
  // Stage a draft that differs from the applied filters.
  fireEvent.click(screen.getByTestId('quick-chip-2-bhk'));
  return screen.getByTestId('map-filter-sheet-status');
}

describe('MapFilterSheet applied-count status line (#1793 PR-A F1)', () => {
  it('pending: omits the number entirely', () => {
    const status = renderEdited({ appliedCountPending: true });
    expect(status.textContent).toMatch(/Not applied yet/);
    expect(status.textContent).not.toMatch(/\d/);
  });

  it('not pending, genuine zero: still says the map shows 0 homes', () => {
    const status = renderEdited({ appliedCountPending: false });
    expect(status).toHaveTextContent('Not applied yet — the map still shows 0 homes');
  });

  it('prop omitted (default), genuine zero: unchanged "0 homes"', () => {
    const status = renderEdited();
    expect(status).toHaveTextContent('the map still shows 0 homes');
  });

  it('not pending, non-zero: states the count', () => {
    const status = renderEdited({ appliedResultCount: 7, appliedCountPending: false });
    expect(status).toHaveTextContent('Not applied yet — the map still shows 7 homes');
  });

  it('pending: the Apply button carries no digit either (draftResultCount unwired)', () => {
    renderEdited({ appliedCountPending: true });
    expect(screen.getByTestId('map-filter-sheet-apply').textContent).not.toMatch(/\d/);
  });
});
