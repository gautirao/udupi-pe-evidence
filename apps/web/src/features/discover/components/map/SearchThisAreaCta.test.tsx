import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchThisAreaCta } from './SearchThisAreaCta';

describe('SearchThisAreaCta', () => {
  it('renders nothing while the viewport is not dirty (AC1 — no CTA from panning alone)', () => {
    const { container } = render(<SearchThisAreaCta isEligible isDirty={false} onActivate={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the CTA once the viewport is dirty and the level is eligible', () => {
    render(<SearchThisAreaCta isEligible isDirty onActivate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /search this area/i })).toBeInTheDocument();
  });

  it('calls onActivate exactly once per click (AC2 — one refetch per activation)', async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(<SearchThisAreaCta isEligible isDirty onActivate={onActivate} />);

    await user.click(screen.getByRole('button', { name: /search this area/i }));

    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when ineligible even though the viewport is dirty (MUST-HAVE #2 — City root/Direction/top-of-journey has no scoped result set)', () => {
    const { container } = render(<SearchThisAreaCta isEligible={false} isDirty onActivate={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when both ineligible and not dirty', () => {
    const { container } = render(<SearchThisAreaCta isEligible={false} isDirty={false} onActivate={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
