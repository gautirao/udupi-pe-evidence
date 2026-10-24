import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import Onboarding from '../Onboarding';
import BrokerSetup from '../broker/BrokerSetup';
import { api, ApiError } from '@/lib/api';

const mockUseAuth = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-layout">{children}</div>
  ),
}));

vi.mock('@/lib/api', () => {
  class MockApiError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, body: unknown, message = `API Error ${status}`) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.body = body;
    }
  }
  return {
    ApiError: MockApiError,
    api: {
      post: vi.fn(),
    },
  };
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

describe('Onboarding (/onboarding) and BrokerSetup (/broker/setup) journeys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  describe('Onboarding (/onboarding)', () => {
    it('redirects already-registered broker or admin users to /', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'broker-1', email: 'broker@example.com' },
        isBroker: true,
        isAdmin: false,
        isLoading: false,
      });

      render(
        <MemoryRouter initialEntries={['/onboarding']}>
          <Routes>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>,
      );

      expect(screen.getByTestId('location-probe')).toHaveTextContent('/');
    });

    it('records onboarding_done_<userId> in localStorage and routes to /, /broker/listings/new, or /broker/setup', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-42', email: 'buyer@example.com' },
        isBroker: false,
        isAdmin: false,
        isLoading: false,
      });

      const { unmount } = render(
        <MemoryRouter initialEntries={['/onboarding']}>
          <Routes>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/" element={<LocationProbe />} />
            <Route path="/broker/listings/new" element={<LocationProbe />} />
            <Route path="/broker/setup" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>,
      );

      expect(screen.getByRole('heading', { name: /Welcome to Udupi Property Tracker/i })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Become a Broker/i }));

      expect(window.localStorage.getItem('onboarding_done_user-42')).toBe('true');
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/broker/setup');
      unmount();

      window.localStorage.clear();
      render(
        <MemoryRouter initialEntries={['/onboarding']}>
          <Routes>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/broker/listings/new" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>,
      );

      fireEvent.click(screen.getByRole('button', { name: /List as Owner/i }));
      expect(window.localStorage.getItem('onboarding_done_user-42')).toBe('true');
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/broker/listings/new');
    });
  });

  describe('BrokerSetup (/broker/setup)', () => {
    it('redirects existing brokers and admins to /', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'admin-1', email: 'admin@example.com' },
        isBroker: false,
        isAdmin: true,
        isLoading: false,
        refreshRole: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={['/broker/setup']}>
          <Routes>
            <Route path="/broker/setup" element={<BrokerSetup />} />
            <Route path="/" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>,
      );

      expect(screen.getByTestId('location-probe')).toHaveTextContent('/');
    });

    it('submits trimmed phone + acceptedTerms to POST /api/broker/setup, refreshes role, and navigates to /broker/dashboard', async () => {
      const refreshRole = vi.fn().mockResolvedValue(undefined);
      mockUseAuth.mockReturnValue({
        user: {
          id: 'user-99',
          email: 'newbroker@example.com',
          user_metadata: { full_name: 'Rao Estates' },
        },
        isBroker: false,
        isAdmin: false,
        isLoading: false,
        refreshRole,
      });
      vi.mocked(api.post).mockResolvedValueOnce({ status: 'ok' });

      render(
        <MemoryRouter initialEntries={['/broker/setup']}>
          <Routes>
            <Route path="/broker/setup" element={<BrokerSetup />} />
            <Route path="/broker/dashboard" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>,
      );

      expect(screen.getByLabelText(/Full Name/i)).toHaveValue('Rao Estates');
      const submitBtn = screen.getByRole('button', { name: /Become a Broker/i });
      expect(submitBtn).toBeDisabled();

      fireEvent.change(screen.getByLabelText(/Phone Number/i), {
        target: { value: '  +919876543210  ' },
      });
      expect(submitBtn).toBeDisabled();

      fireEvent.click(screen.getByRole('checkbox'));
      expect(submitBtn).not.toBeDisabled();

      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/broker/setup', {
          phone: '+919876543210',
          acceptedTerms: true,
        });
      });
      expect(refreshRole).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(screen.getByTestId('location-probe')).toHaveTextContent('/broker/dashboard');
      });
    });

    it('renders explicit conflict and validation errors when POST /api/broker/setup fails with 409 or 400', async () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-99', email: 'newbroker@example.com' },
        isBroker: false,
        isAdmin: false,
        isLoading: false,
        refreshRole: vi.fn(),
      });
      vi.mocked(api.post).mockRejectedValueOnce(new ApiError(409, { error: 'Already broker' }));

      render(
        <MemoryRouter initialEntries={['/broker/setup']}>
          <Routes>
            <Route path="/broker/setup" element={<BrokerSetup />} />
          </Routes>
        </MemoryRouter>,
      );

      fireEvent.change(screen.getByLabelText(/Phone Number/i), {
        target: { value: '+919876543210' },
      });
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: /Become a Broker/i }));

      expect(await screen.findByText(/You are already registered as a broker\./i)).toBeInTheDocument();

      vi.mocked(api.post).mockRejectedValueOnce(
        new ApiError(400, { field: 'phone', error: 'Invalid Indian mobile number' }),
      );
      fireEvent.click(screen.getByRole('button', { name: /Become a Broker/i }));
      expect(await screen.findByText(/Invalid Indian mobile number/i)).toBeInTheDocument();
    });
  });
});
