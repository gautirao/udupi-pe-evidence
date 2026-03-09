import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, PlusCircle, List } from 'lucide-react';

/**
 * Dealer home page with quick-link cards.
 *
 * Guards:
 *  - Unauthenticated: ProtectedRoute redirects to /auth before this component renders.
 *  - Not dealer/admin: redirect to / (access not permitted).
 */
export default function DealerDashboard() {
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
      <div className="container max-w-4xl py-6 px-4">
        <h1 className="text-3xl font-bold">Dealer Dashboard</h1>
        <p className="text-muted-foreground mt-1 mb-8">Manage your property listings</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><PlusCircle className="h-5 w-5 text-primary" />New Listing</CardTitle>
              <CardDescription>
                Submit a new property listing for review and publication.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link to="/dealer/listings/new">Create Listing</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><List className="h-5 w-5 text-primary" />My Listings</CardTitle>
              <CardDescription>
                View and manage all the listings you have submitted.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link to="/dealer/listings">View Listings</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
