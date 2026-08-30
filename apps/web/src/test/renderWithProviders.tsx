import React from 'react';
import { render, RenderOptions, RenderResult } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, MemoryRouterProps } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/contexts/AuthContext';
import { AuthModalProvider } from '@/contexts/AuthModalContext';

/**
 * Issue #1825 Slice 2 (Cluster A) — shared test-render helper.
 *
 * Since #1566, PropertyCard calls useSavedListingIds/useSaveListing/useUnsaveListing
 * (useAuth + useQueryClient) and useAuthModal. Any test that renders a tree containing
 * PropertyCard needs the full provider stack below or it throws
 * "useAuth must be used within an AuthProvider".
 *
 * Provider stack (outer -> inner):
 *   QueryClientProvider (fresh QueryClient per render call, retry disabled)
 *   -> TooltipProvider
 *   -> Router (MemoryRouter by default; BrowserRouter available for callers that
 *      previously relied on it — AuthModalProvider needs useLocation/useNavigate)
 *   -> AuthProvider (defaults unauthenticated — matches every current caller's assumptions)
 *   -> AuthModalProvider
 */

export function makeTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Initial MemoryRouter path. Ignored when router="browser". Defaults to '/'. */
  route?: string;
  /** Additional props forwarded to MemoryRouter (only used when router="memory"). */
  routerProps?: Omit<MemoryRouterProps, 'children'>;
  /** Router implementation to mount. Defaults to 'memory'. */
  router?: 'memory' | 'browser';
  /** Supply a pre-built QueryClient instead of the default fresh one. */
  queryClient?: QueryClient;
}

export function renderWithProviders(
  ui: React.ReactElement,
  options: RenderWithProvidersOptions = {},
): RenderResult {
  const { route, routerProps, router = 'memory', queryClient, ...renderOptions } = options;
  const client = queryClient ?? makeTestQueryClient();

  const RouterWrapper = ({ children }: { children: React.ReactNode }) => {
    if (router === 'browser') {
      return <BrowserRouter>{children}</BrowserRouter>;
    }
    return (
      <MemoryRouter initialEntries={route ? [route] : ['/']} {...routerProps}>
        {children}
      </MemoryRouter>
    );
  };

  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <RouterWrapper>
          <AuthProvider>
            <AuthModalProvider>{ui}</AuthModalProvider>
          </AuthProvider>
        </RouterWrapper>
      </TooltipProvider>
    </QueryClientProvider>,
    renderOptions,
  );
}
