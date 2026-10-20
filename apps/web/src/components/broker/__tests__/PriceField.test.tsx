/**
 * #2859 B3 — PriceField replacement for e2e/broker-listing-form.spec.ts P1-P4 (csv16).
 *
 * Expected texts / positions are COMPUTED from the same formulas the component
 * uses (log-scale 1e6..1e8 over 1000 steps; nearest 10k; lakh/crore with toFixed(2)),
 * never hard-coded, so the test follows the product rule rather than a snapshot.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PriceField } from '../PriceField';

const LOG_MIN = 6;
const LOG_MAX = 8;
const STEPS = 1000;
const toPos = (r: number) =>
  Math.round(((Math.log10(Math.max(1e6, Math.min(r, 1e8))) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * STEPS);
const toRupees = (pos: number) =>
  Math.round(Math.pow(10, LOG_MIN + (pos / STEPS) * (LOG_MAX - LOG_MIN)) / 10_000) * 10_000;
const toText = (r: number) => {
  if (r >= 10_000_000) {
    const cr = r / 10_000_000;
    return `${cr % 1 === 0 ? cr : cr.toFixed(2)} crore`;
  }
  const l = r / 100_000;
  return `${l % 1 === 0 ? l : l.toFixed(2)} lakh`;
};

describe('PriceField — slider + lakh/crore text (#2859 B3 csv16)', () => {
  it('P1/P2 renders the slider and reflects initialRupees 50,00,000 in text and aria-valuenow', () => {
    render(<PriceField initialRupees={5_000_000} onChange={vi.fn()} />);
    const slider = screen.getByRole('slider');
    expect(slider).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue(toText(5_000_000)); // "50 lakh"
    expect(toText(5_000_000)).toBe('50 lakh');
    expect(slider).toHaveAttribute('aria-valuenow', String(toPos(5_000_000)));
    // control: with no initial price the text is empty and the slider sits at the default 500
    render(<PriceField id="price2" onChange={vi.fn()} />);
    const sliders = screen.getAllByRole('slider');
    expect(sliders[1]).toHaveAttribute('aria-valuenow', '500');
    expect(screen.getAllByRole('textbox')[1]).toHaveValue('');
  });

  it('P3 keyboard ArrowRight on the thumb moves the position and rewrites the text (still lakh/crore)', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PriceField initialRupees={5_000_000} onChange={onChange} />);
    const slider = screen.getByRole('slider');
    const start = toPos(5_000_000);
    expect(slider).toHaveAttribute('aria-valuenow', String(start));
    slider.focus();
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    const end = start + 3;
    expect(slider).toHaveAttribute('aria-valuenow', String(end));
    const expectedText = toText(toRupees(end));
    expect(expectedText).not.toBe('50 lakh');
    expect(screen.getByRole('textbox')).toHaveValue(expectedText);
    expect(expectedText).toMatch(/lakh|crore/);
    expect(onChange).toHaveBeenLastCalledWith(toRupees(end));
  });

  it('P4 typing "1 crore" moves aria-valuenow from the 50-lakh position to the 1-crore position', () => {
    const onChange = vi.fn();
    render(<PriceField initialRupees={5_000_000} onChange={onChange} />);
    const slider = screen.getByRole('slider');
    const before = String(toPos(5_000_000));
    expect(slider).toHaveAttribute('aria-valuenow', before);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '1 crore' } });
    const after = String(toPos(10_000_000));
    expect(after).not.toBe(before);
    expect(slider).toHaveAttribute('aria-valuenow', after);
    expect(onChange).toHaveBeenLastCalledWith(10_000_000);
    // control: an unparseable entry does not move the slider
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'abc' } });
    expect(slider).toHaveAttribute('aria-valuenow', after);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
