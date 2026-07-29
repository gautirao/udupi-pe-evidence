/**
 * Issue #1956 PR 2 (Slice 3) — NavigationResolutionNotice.
 *
 * Non-blocking stale/invalid-node recovery notice. `blocking` is always
 * literally `false` on the input — this component never gates the
 * destination surface, it renders nothing when there is nothing to say.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NavigationResolutionNotice } from '../NavigationResolutionNotice';

describe('NavigationResolutionNotice', () => {
  it('renders nothing when notice is null (the common/exact-hit case)', () => {
    const { container } = render(<NavigationResolutionNotice notice={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders an ancestor-recovery message with aria-live=polite', () => {
    render(
      <NavigationResolutionNotice
        notice={{
          blocking: false,
          rung: 'ancestor',
          requestedNodeKey: 'a:stale-area',
          resolvedNodeKey: 'd:n',
        }}
      />,
    );
    const notice = screen.getByTestId('navigation-resolution-notice');
    expect(notice).toHaveAttribute('aria-live', 'polite');
    expect(notice.textContent).toMatch(/nearest parent/i);
  });

  it('renders a city-root-recovery message distinctly from the ancestor case', () => {
    render(
      <NavigationResolutionNotice
        notice={{
          blocking: false,
          rung: 'city-root',
          requestedNodeKey: 'a:long-gone',
          resolvedNodeKey: null,
        }}
      />,
    );
    expect(screen.getByTestId('navigation-resolution-notice').textContent).toMatch(/showing the city instead/i);
  });
});
