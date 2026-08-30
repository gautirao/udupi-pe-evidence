import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessRoute } from '@/lib/routeAccess';
import { useGetListing } from '@/hooks/useBrokerListings';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Lock } from 'lucide-react';
import { EditListingForm } from './editListing/EditListingForm';

const LOCKED_STATUSES = ['PENDING_REVIEW', 'LIVE'];

export default function EditListing() {
  const { id } = useParams<{ id: string }>();
  const { userRole, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const { data: listing, isLoading: listingLoading, isError } = useGetListing(id ?? '');

  // Auth guard
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
  if (!canAccessRoute('/broker/listings/123/edit', role)) {
    return <Navigate to="/" replace />;
  }

  if (listingLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (isError || !listing) {
    return (
      <AppLayout>
        <div className="container max-w-2xl py-8 px-4">
          <Alert variant="destructive">
            <AlertDescription>
              Listing not found or could not be loaded.
            </AlertDescription>
          </Alert>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/broker/listings')}>
              Back to Listings
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Locked state: listing cannot be edited
  if (LOCKED_STATUSES.includes(listing.status)) {
    return (
      <AppLayout>
        <div className="container max-w-2xl py-8 px-4">
          <Card>
            <CardHeader>
              <CardTitle>Edit Listing</CardTitle>
            </CardHeader>
            <CardContent>
              <Alert>
                <Lock className="h-4 w-4" />
                <AlertDescription>
                  This listing is locked and cannot be edited. Listings with status{' '}
                  <strong>{listing.status}</strong> are read-only.
                </AlertDescription>
              </Alert>
              <div className="mt-4">
                <Button variant="outline" onClick={() => navigate('/broker/listings')}>
                  Back to Listings
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return <AppLayout><EditListingForm listing={listing} /></AppLayout>;
}
