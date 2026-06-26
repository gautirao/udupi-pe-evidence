import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getRoleAwareDefaultLanding, getSafeReturnTo } from '@/lib/authUtils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAdmin, isBroker, isLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const rawReturnTo = searchParams.get('returnTo');
  const safeReturnTo = getSafeReturnTo(rawReturnTo);

  useEffect(() => {
    if (isLoading) return;

    let timeout: ReturnType<typeof setTimeout>;
    let unsubscribe: (() => void) | undefined;

    const resolveTarget = (user: any) => {
      return safeReturnTo ?? getRoleAwareDefaultLanding(user, isAdmin, isBroker);
    };

    const handleCallback = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate(resolveTarget(session.user), { replace: true });
        return;
      }

      // No session yet — listen for auth state change with timeout
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          navigate(resolveTarget(session.user), { replace: true });
        }
      });
      unsubscribe = () => subscription.unsubscribe();

      timeout = setTimeout(() => {
        setError('Authentication timed out. Please try signing in again.');
      }, 10000);
    };

    handleCallback();

    return () => {
      clearTimeout(timeout);
      unsubscribe?.();
    };
  }, [navigate, safeReturnTo, isAdmin, isBroker, isLoading]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <Alert variant="destructive">
            <AlertTitle>Authentication Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button className="w-full" onClick={() => navigate('/auth', { replace: true })}>
            Back to Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  );
}
