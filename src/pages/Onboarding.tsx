import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, MapPin, Building2, Home } from 'lucide-react';

/**
 * First-run intent screen shown after signup.
 * Lets the user choose between browsing (stays 'user') or listing (goes to /dealer/setup).
 *
 * Guards:
 *  - Unauthenticated: ProtectedRoute redirects to /auth before this component renders.
 *  - Already dealer/admin: redirect to / (onboarding is not relevant).
 */
export default function Onboarding() {
  const { isDealer, isAdmin, isLoading } = useAuth();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (isDealer || isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <AppLayout>
      <div className="container max-w-4xl py-16 px-4">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold tracking-tight mb-3">What brings you here?</h1>
          <p className="text-muted-foreground text-lg">
            Choose how you want to use Udupi Property Explorer.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {/* Browse path */}
          <Card
            className="cursor-pointer transition-colors hover:border-primary"
            onClick={() => navigate('/')}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-center h-12 w-12 rounded-lg bg-primary/10 mb-3">
                <MapPin className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Browse &amp; Invest</CardTitle>
              <CardDescription>
                Explore listings on the map, save areas you care about, and track market trends.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" variant="outline" onClick={() => navigate('/')}>
                Start Browsing
              </Button>
            </CardContent>
          </Card>

          {/* Owner path */}
          <Card
            className="cursor-pointer transition-colors hover:border-primary"
            onClick={() => navigate('/dealer/listings/new')}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-center h-12 w-12 rounded-lg bg-primary/10 mb-3">
                <Home className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>List Your Property</CardTitle>
              <CardDescription>
                List up to 3 of your own properties. No dealer registration needed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" variant="outline" onClick={(e) => { e.stopPropagation(); navigate('/dealer/listings/new'); }}>
                List as Owner
              </Button>
            </CardContent>
          </Card>

          {/* Dealer path */}
          <Card
            className="cursor-pointer transition-colors hover:border-primary"
            onClick={() => navigate('/dealer/setup')}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-center h-12 w-12 rounded-lg bg-primary/10 mb-3">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>List a Property</CardTitle>
              <CardDescription>
                Register as a dealer to create listings, get approved, and manage viewings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => navigate('/dealer/setup')}>
                Become a Dealer
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
