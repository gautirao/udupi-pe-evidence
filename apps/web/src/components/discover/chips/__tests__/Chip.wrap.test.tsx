/**
 * Issue #2459 AC6 rule 5 (owner ruling, PR #2502) — the `wrap` opt-in on the shared Chip.
 *
 * The ruling permitted editing this shared primitive on ONE condition: that every existing caller
 * keeps today's behaviour. So the load-bearing test here is not the wrapping one — it is the
 * DEFAULT one. `renders byte-identical class output` below pins the default label span to the
 * exact literal `Chip.tsx` carried before this change (`max-w-[160px] truncate`), which is what
 * makes "existing callers are unaffected" a measured claim rather than an assurance.
 *
 * Keyboard and ARIA are asserted on BOTH arms rather than only the new one: a presentation prop
 * that silently changed the accessible name or the four-key handler for the one caller that opts
 * in would be a regression the default-arm tests could not see.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { Chip } from '../Chip';

const LABEL = 'Mixed built-up/warehouse/plot: 100,000 – 200,000 sq ft';

function renderChip(overrides: Partial<React.ComponentProps<typeof Chip>> = {}) {
  const onClear = vi.fn();
  const onArrow = vi.fn();
  const utils = render(
    <Chip
      id="area"
      icon={<span className="text-[10px] font-bold leading-none">SQ</span>}
      label={LABEL}
      onClear={onClear}
      testId="chip-area"
      dismissTestId="chip-area-dismiss"
      tabIndex={0}
      onFocus={() => {}}
      onArrow={onArrow}
      chipRef={() => {}}
      {...overrides}
    />,
  );
  return { onClear, onArrow, ...utils };
}

/** The label span is the only child carrying the chip's text. */
function labelSpan(): HTMLElement {
  const chip = screen.getByTestId('chip-area');
  const span = Array.from(chip.querySelectorAll('span')).find((s) => s.textContent === LABEL);
  if (span === undefined) throw new Error('label span not found');
  return span as HTMLElement;
}

describe('Chip — default callers are unchanged by the wrap opt-in (#2459)', () => {
  it('renders byte-identical class output to the pre-change literal when wrap is omitted', () => {
    renderChip();
    // Chip.tsx carried exactly `className="max-w-[160px] truncate"` before this change. Asserting
    // the resolved string — not merely "contains truncate" — is what proves the cn() call added
    // nothing and reordered nothing for the ~dozen callers that never pass the prop.
    expect(labelSpan().getAttribute('class')).toBe('max-w-[160px] truncate');
  });

  it('treats an omitted wrap and an explicit wrap={false} as the same render', () => {
    const { container: omitted } = renderChip();
    const omittedHtml = omitted.innerHTML;
    const { container: explicit } = renderChip({ wrap: false });
    expect(explicit.innerHTML).toBe(omittedHtml);
  });

  it('keeps role, accessible name and dismiss label unchanged', () => {
    renderChip();
    expect(screen.getByRole('group', { name: `Active filter: ${LABEL}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Remove ${LABEL}` })).toBeInTheDocument();
  });

  it('keeps the four-key keyboard contract unchanged', async () => {
    const user = userEvent.setup();
    const { onClear, onArrow } = renderChip();
    const chip = screen.getByTestId('chip-area');
    chip.focus();

    await user.keyboard('{ArrowRight}');
    expect(onArrow).toHaveBeenCalledWith(1);
    await user.keyboard('{ArrowLeft}');
    expect(onArrow).toHaveBeenCalledWith(-1);

    await user.keyboard('{Backspace}');
    await user.keyboard('{Delete}');
    await user.keyboard('{Enter}');
    expect(onClear).toHaveBeenCalledTimes(3);
  });
});

describe('Chip — the wrap opt-in (#2459 AC6 rule 5)', () => {
  it('swaps truncation for wrapping at the SAME max width', () => {
    renderChip({ wrap: true });
    const cls = labelSpan().getAttribute('class') ?? '';

    // Width is the thing the ruling refused to change — the trade bought is vertical.
    expect(cls).toContain('max-w-[160px]');
    expect(cls).toContain('whitespace-normal');
    // Required, not decorative: `built-up/warehouse/plot:` is a 24-character token with no space
    // to wrap at, and would overflow the box rather than wrap inside it.
    expect(cls).toContain('break-words');
    expect(cls).not.toContain('truncate');
  });

  it('does not alter the label text — no abbreviation, rounding or rewritten numbers', () => {
    renderChip({ wrap: true });
    expect(labelSpan().textContent).toBe(LABEL);
    // The two withdrawn variants would both have failed here: one shortened the vocabulary, the
    // other rendered 100,000 as 100k.
    expect(labelSpan().textContent).toContain('100,000 – 200,000 sq ft');
  });

  it('leaves role, accessible name, dismiss label and keyboard identical to the default arm', async () => {
    const user = userEvent.setup();
    const { onClear, onArrow } = renderChip({ wrap: true });

    expect(screen.getByRole('group', { name: `Active filter: ${LABEL}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Remove ${LABEL}` })).toBeInTheDocument();

    screen.getByTestId('chip-area').focus();
    await user.keyboard('{ArrowRight}');
    expect(onArrow).toHaveBeenCalledWith(1);
    await user.keyboard('{Enter}');
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
