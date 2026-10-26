import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessRoute } from '@/lib/routeAccess';
import { AppLayout } from '@/components/layout/AppLayout';
import { AgriculturalListingForm } from '@/components/broker/AgriculturalListingForm';
import { parseDemandPrefill, buildPrefillSearch } from '@/lib/demandPrefill';
import { Loader2 } from 'lucide-react';

/**
 * Issue #1627 — direct, refresh-safe deep link to the agricultural
 * single-page create flow at /broker/listings/new/agricultural. Mounts the
 * AgriculturalListingForm directly, mirroring CommercialNewListingPage.tsx
 * (#1741 follow-up) — same AppLayout composition, same role guard pattern.
 *
 * The canAccessRoute check here is redundant with the <ProtectedRoute>
 * wrapper in App.tsx — kept for parity with NewListing.tsx's own
 * belt-and-suspenders guard at the page level.
 */
export default function AgriculturalNewListingPage() {
  const { userRole, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = userRole as string | null;

  // #1748 — Agricultural itself seeds no fields (fixed type, sale-only), but
  // "Switch flow" must still carry the demand-gap prefill back to the selector so
  // its recommendation/params survive switching away and back (parity with Back).
  const prefillSearch = buildPrefillSearch(parseDemandPrefill(searchParams));

  // #2811 — refresh-safe draft continuity: read `draftId` from the URL so a
  // browser refresh (or shared/bookmarked link) rehydrates the existing draft
  // instead of stranding the broker on a blank form. Mirrors NewListing.tsx
  // (#2053) and CommercialNewListingPage.tsx (#2215): REPLACE (not push) so
  // browser Back returns to the page before `/broker/listings/new/agricultural`,
  // and `new URLSearchParams(searchParams)` so any existing demand-gap prefill
  // params stay intact alongside `draftId`.
  const initialDraftId = searchParams.get('draftId');
  const handleDraftPersisted = (id: string) => {
    if (searchParams.get('draftId') === id) return;
    const next = new URLSearchParams(searchParams);
    next.set('draftId', id);
    setSearchParams(next, { replace: true });
  };

  if (authLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!canAccessRoute('/broker/listings/new/agricultural', role)) {
    return <Navigate to="/" replace />;
  }

  return (
    <AppLayout>
      <AgriculturalListingForm
        onSwitchToGenericFlow={() => navigate(`/broker/listings/new${prefillSearch}`)}
        navigate={navigate}
        initialDraftId={initialDraftId}
        onDraftPersisted={handleDraftPersisted}
      />
    </AppLayout>
  );
}
