import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessRoute } from '@/lib/routeAccess';
import { AppLayout } from '@/components/layout/AppLayout';
import { ResidentialListingForm } from '@/components/broker/ResidentialListingForm';
import { parseDemandPrefill, buildPrefillSearch, residentialSubtypeFromPropertyType } from '@/lib/demandPrefill';
import { Loader2 } from 'lucide-react';

/**
 * Issue #1719 — direct, refresh-safe deep link to the residential
 * single-page create flow at /broker/listings/new/residential. Mounts the
 * EXISTING ResidentialListingForm (#1626/#1730) directly, mirroring
 * CommercialNewListingPage.tsx (#1741) / AgriculturalNewListingPage.tsx
 * (#1627/#1743) — same AppLayout composition, same role guard pattern —
 * so all three property families now have a dedicated deep-link page
 * reachable both directly and via NewListingJourneySelector.
 *
 * The canAccessRoute check here is redundant with the <ProtectedRoute>
 * wrapper in App.tsx — kept for parity with the sibling pages' own
 * belt-and-suspenders guard at the page level.
 */
export default function ResidentialNewListingPage() {
  const { userRole, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = userRole as string | null;

  // #1748 — seed supported fields from demand-gap prefill forwarded by the
  // journey selector. Only a valid residential subtype overrides the default;
  // an incompatible/unknown propertyType is ignored (keeps 'apartment').
  const prefill = parseDemandPrefill(searchParams);
  const initialPropertyType = residentialSubtypeFromPropertyType(prefill.propertyType) ?? 'apartment';
  // #1748 — "Switch flow" returns to the selector; carry the prefill context back
  // so the selector keeps its recommendation/params (parity with browser Back).
  const prefillSearch = buildPrefillSearch(prefill);

  // Issue #2039 (AC2) — a draft id recovered from the route's own URL at
  // mount, if the broker is landing here via a refresh/reload of a URL that
  // already carries one (see onDraftPersisted below for how it gets there).
  const initialDraftId = searchParams.get('draftId');

  // Issue #2039 (AC1) — after the draft-create POST succeeds, stash the new
  // id into the URL via history REPLACE (not push — a first save should not
  // grow the back-button stack), MERGING it into the existing search params
  // rather than replacing them, so the areaKey/propertyType/listingPurpose
  // prefill forwarded from the journey selector survives.
  const handleDraftPersisted = (id: string) => {
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

  if (!canAccessRoute('/broker/listings/new/residential', role)) {
    return <Navigate to="/" replace />;
  }

  return (
    <AppLayout>
      <ResidentialListingForm
        initialPropertyType={initialPropertyType}
        initialListingPurpose={prefill.listingPurpose}
        initialDraftId={initialDraftId}
        onDraftPersisted={handleDraftPersisted}
        onSwitchToGenericFlow={() => navigate(`/broker/listings/new${prefillSearch}`)}
        navigate={navigate}
      />
    </AppLayout>
  );
}
