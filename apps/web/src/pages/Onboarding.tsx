import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, MapPin, Building2, Home } from 'lucide-react';

/**
 * First-run intent screen shown after signup.
 * Lets the user choose between browsing (stays 'user') or listing (goes to /broker/setup).
 *
 * Guards:
 *  - Unauthenticated: ProtectedRoute redirects to /auth before this component renders.
 *  - Already dealer/admin: redirect to / (onboarding is not relevant).
 */
export default function Onboarding() {
  const { user, isBroker, isAdmin, isLoading } = useAuth();
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

  if (isBroker || isAdmin) {
    return <Navigate to="/" replace />;
  }

  const handleSelect = (path: string) => {
    if (user) {
      localStorage.setItem(`onboarding_done_${user.id}`, 'true');
    }
    navigate(path);
  };

  return (
    <AppLayout>
      <div className="container max-w-4xl py-12 px-4">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold tracking-tight">Welcome to Udupi Property Tracker</h1>
          <p className="text-muted-foreground mt-2 text-lg">
            How would you like to use the platform today?
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Consumer path */}
          <Card
            className="cursor-pointer transition-colors hover:border-primary"
            onClick={() => handleSelect('/')}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-center h-12 w-12 rounded-lg bg-primary/10 mb-3">
                <MapPin className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Browse & Invest</CardTitle>
              <CardDescription>
                Explore listings on the map, save areas you care about, and track market trends.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" variant="outline" onClick={(e) => { e.stopPropagation(); handleSelect('/'); }}>
                Start Browsing
              </Button>
            </CardContent>
          </Card>

          {/* Owner path */}
          <Card
            className="cursor-pointer transition-colors hover:border-primary"
            onClick={() => handleSelect('/broker/listings/new')}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-center h-12 w-12 rounded-lg bg-primary/10 mb-3">
                <Home className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>List Your Property</CardTitle>
              <CardDescription>
                List up to 3 of your own properties. No broker registration needed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" variant="outline" onClick={(e) => { e.stopPropagation(); handleSelect('/broker/listings/new'); }}>
                List as Owner
              </Button>
            </CardContent>
          </Card>

          {/* Dealer path */}
          <Card
            className="cursor-pointer transition-colors hover:border-primary"
            onClick={() => handleSelect('/broker/setup')}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-center h-12 w-12 rounded-lg bg-primary/10 mb-3">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>List a Property</CardTitle>
              <CardDescription>
                Register as a broker to create listings, get approved, and manage viewings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={(e) => { e.stopPropagation(); handleSelect('/broker/setup'); }}>
                Become a Broker
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
