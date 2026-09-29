import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { DiscoverPageShell } from '../DiscoverPageShell';

vi.mock('@/components/layout/PublicDiscoverLayout', () => ({
  PublicDiscoverLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="public-discover-layout-mock">{children}</div>
  ),
}));

vi.mock('@/components/discover/DiscoverControlBar', () => ({
  DiscoverControlBar: (props: { mobileMapTrigger?: { onOpenMap: () => void } }) => (
    <div
      data-testid="discover-control-bar-mock"
      data-has-mobile-trigger={props.mobileMapTrigger ? 'true' : 'false'}
    />
  ),
}));

function baseProps() {
  return {
    isMobileShell: false,
    hostsHeaderControls: false,
    headerHostsJourneyTabs: false,
    mobileMapOpen: false,
    mobileMapTrigger: undefined,
    mapSurface: <div data-testid="map-surface-slot" />,
    panelSurface: <div data-testid="panel-surface-slot" />,
    overlaySurface: <div data-testid="overlay-surface-slot" />,
  };
}

describe('DiscoverPageShell', () => {
  it('renders all 3 surface slots inside the layout', () => {
    render(<DiscoverPageShell {...baseProps()} />);
    expect(screen.getByTestId('public-discover-layout-mock')).toBeInTheDocument();
    expect(screen.getByTestId('map-surface-slot')).toBeInTheDocument();
    expect(screen.getByTestId('panel-surface-slot')).toBeInTheDocument();
    expect(screen.getByTestId('overlay-surface-slot')).toBeInTheDocument();
  });

  it('mounts the mobile control-bar row only when isMobileShell is true', () => {
    const { rerender } = render(<DiscoverPageShell {...baseProps()} isMobileShell={false} />);
    expect(screen.queryByTestId('discover-control-bar-row')).not.toBeInTheDocument();

    rerender(<DiscoverPageShell {...baseProps()} isMobileShell />);
    expect(screen.getByTestId('discover-control-bar-row')).toBeInTheDocument();
    expect(screen.getByTestId('discover-control-bar-mock')).toBeInTheDocument();
  });

  it('forwards mobileMapTrigger through to DiscoverControlBar unchanged', () => {
    const trigger = { onOpenMap: vi.fn(), triggerRef: createRef<HTMLButtonElement>() };
    render(<DiscoverPageShell {...baseProps()} isMobileShell mobileMapTrigger={trigger} />);
    expect(screen.getByTestId('discover-control-bar-mock')).toHaveAttribute(
      'data-has-mobile-trigger',
      'true',
    );
  });

  it('the map wrapper is `contents` (invisible to layout) when mobileMapOpen is false', () => {
    const { container } = render(<DiscoverPageShell {...baseProps()} mobileMapOpen={false} />);
    const wrapper = screen.getByTestId('map-surface-slot').parentElement;
    expect(wrapper?.className).toBe('contents');
    expect(container.querySelector('.z-\\[60\\]')).not.toBeInTheDocument();
  });

  it('the map wrapper becomes a fixed full-screen z-[60] overlay when mobileMapOpen is true', () => {
    render(<DiscoverPageShell {...baseProps()} mobileMapOpen />);
    const wrapper = screen.getByTestId('map-surface-slot').parentElement;
    expect(wrapper?.className).toContain('fixed');
    expect(wrapper?.className).toContain('z-[60]');
  });
});
