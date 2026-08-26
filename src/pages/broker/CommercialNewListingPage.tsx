import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessRoute } from '@/lib/routeAccess';
import { AppLayout } from '@/components/layout/AppLayout';
import { CommercialListingForm } from '@/components/broker/CommercialListingForm';
import { parseDemandPrefill, buildPrefillSearch, commercialTypeFromPropertyType } from '@/lib/demandPrefill';
import { Loader2 } from 'lucide-react';

/**
 * #1741 follow-up — direct, refresh-safe deep link to the commercial
 * single-page create flow at /broker/listings/new/commercial. Mounts the
 * EXISTING CommercialListingForm (#1684/#1730) directly, mirroring the
 * COMMERCIAL_TYPES branch in NewListing.tsx (same AppLayout composition,
 * same role guard pattern) instead of requiring the user to land on
 * /broker/listings/new and pick a commercial property type first.
 *
 * The canAccessRoute check here is redundant with the <ProtectedRoute>
 * wrapper in App.tsx — kept for parity with NewListing.tsx's own
 * belt-and-suspenders guard at the page level.
 */
export default function CommercialNewListingPage() {
  const { userRole, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = userRole as string | null;

  // #1748 — seed supported fields from demand-gap prefill forwarded by the
  // journey selector. Only a valid commercial type overrides the default;
  // an incompatible/unknown propertyType is ignored (keeps 'commercial').
  const prefill = parseDemandPrefill(searchParams);
  const initialPropertyType = commercialTypeFromPropertyType(prefill.propertyType) ?? 'commercial';
  // #1748 — "Switch flow" returns to the selector; carry the prefill context back
  // so the selector keeps its recommendation/params (parity with browser Back).
  const prefillSearch = buildPrefillSearch(prefill);

  // #2348 — a draft id recovered from the route's own URL at mount, if the
  // broker is landing here via a refresh/reload of a URL that already
  // carries one (see onDraftPersisted below for how it gets there). Mirrors
  // ResidentialNewListingPage.tsx (issue #2039).
  const initialDraftId = searchParams.get('draftId');

  // #2348 — after the draft-create POST succeeds, stash the new id into the
  // URL via history REPLACE (not push — a first save should not grow the
  // back-button stack), MERGING it into the existing search params rather
  // than replacing them, so the areaKey/propertyType/listingPurpose prefill
  // forwarded from the journey selector survives.
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

  if (!canAccessRoute('/broker/listings/new/commercial', role)) {
    return <Navigate to="/" replace />;
  }

  return (
    <AppLayout>
      <CommercialListingForm
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
