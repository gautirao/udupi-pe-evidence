import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessRoute } from '@/lib/routeAccess';
import { AppLayout } from '@/components/layout/AppLayout';
import { ResidentialListingForm } from '@/components/broker/ResidentialListingForm';
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
  const role = userRole as string | null;

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
        initialPropertyType="apartment"
        onSwitchToGenericFlow={() => navigate('/broker/listings/new')}
        navigate={navigate}
      />
    </AppLayout>
  );
}
