import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessRoute } from '@/lib/routeAccess';
import { AppLayout } from '@/components/layout/AppLayout';
import { AgriculturalListingForm } from '@/components/broker/AgriculturalListingForm';
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

  if (!canAccessRoute('/broker/listings/new/agricultural', role)) {
    return <Navigate to="/" replace />;
  }

  return (
    <AppLayout>
      <AgriculturalListingForm
        onSwitchToGenericFlow={() => navigate('/broker/listings/new')}
        navigate={navigate}
      />
    </AppLayout>
  );
}
