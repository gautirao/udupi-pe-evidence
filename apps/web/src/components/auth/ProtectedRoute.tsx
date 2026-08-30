import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { canAccessRoute, getDefaultLandingForRole, PolicyRole } from '@/lib/routeAccess';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { user, isLoading, isAdmin, isBroker, userRole } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    const returnUrl = `${location.pathname}${location.search || ''}`;
    return <Navigate to={`/auth?redirect=${encodeURIComponent(returnUrl)}`} state={{ from: location }} replace />;
  }

  const effectiveRole = (userRole || (isAdmin ? 'admin' : isBroker ? 'broker' : 'user')) as PolicyRole;
  const landing = getDefaultLandingForRole(effectiveRole);

  if (requireAdmin && !isAdmin) {
    return <Navigate to={landing} replace />;
  }

  if (!canAccessRoute(location.pathname, effectiveRole)) {
    return <Navigate to={landing} replace />;
  }

  return <>{children}</>;
}