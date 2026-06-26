import { useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Home, Building2 } from 'lucide-react';
import { AuthForms } from '@/components/auth/AuthForms';
import { getRoleAwareDefaultLanding, getSafeReturnTo } from '@/lib/authUtils';

export default function Auth() {
  const { user, isAdmin, isBroker } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const rawReturnTo = searchParams.get('returnTo') ?? searchParams.get('redirect');
  const safeReturnTo = getSafeReturnTo(rawReturnTo);

  const stateFrom = location.state?.from
    ? `${location.state.from.pathname}${location.state.from.search || ''}`
    : null;

  const explicitTarget = safeReturnTo ?? stateFrom;

  useEffect(() => {
    if (user) {
      const target = explicitTarget ?? getRoleAwareDefaultLanding(user, isAdmin, isBroker);
      navigate(target, { replace: true });
    }
  }, [user, navigate, explicitTarget, isAdmin, isBroker]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background via-secondary/30 to-accent/10 p-4">
      {/* Hero Section */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="p-3 rounded-xl bg-primary/10">
            <MapPin className="h-8 w-8 text-primary" />
          </div>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Udupi Property Tracker
        </h1>
        <p className="text-muted-foreground mt-2 max-w-md">
          Track land and house prices across Udupi district with real-time insights from local listings
        </p>
      </div>

      {/* Auth Card */}
      <Card className="w-full max-w-md shadow-xl border-border/50">
        <CardContent className="pt-6 pb-6">
          <AuthForms returnTo={explicitTarget} />
        </CardContent>
      </Card>

      {/* Features Preview */}
      <div className="mt-8 flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Home className="h-4 w-4 text-primary" />
          <span>House Listings</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-accent" />
          <span>Interactive Map</span>
        </div>
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-accent" />
          <span>Price Analytics</span>
        </div>
      </div>
    </div>
  );
}
