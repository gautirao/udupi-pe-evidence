import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

/**
 * "My Listings" placeholder page for dealers.
 *
 * Guards:
 *  - Unauthenticated: ProtectedRoute redirects to /auth before this component renders.
 *  - Not dealer/admin: redirect to / (access not permitted).
 */
export default function DealerListings() {
  const { isDealer, isAdmin, isLoading } = useAuth();

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!isDealer && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <AppLayout>
      <div className="container max-w-4xl py-12 px-4">
        <h1 className="text-3xl font-bold mb-8">My Listings</h1>
        <p className="text-muted-foreground mt-4">
          Your listings will appear here once the listings feature is available.
        </p>
        <div className="mt-6">
          <Button asChild>
            <Link to="/dealer/listings/new">Create New Listing</Link>
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
