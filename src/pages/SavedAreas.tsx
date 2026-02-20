import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

/**
 * "My Saved Areas" placeholder page for authenticated users.
 *
 * Guards:
 *  - Unauthenticated: ProtectedRoute redirects to /auth before this component renders.
 */
export default function SavedAreas() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container max-w-4xl py-12 px-4">
        <h1 className="text-3xl font-bold mb-4">My Saved Areas</h1>
        <p className="text-muted-foreground mt-4">
          Coming Soon — area tracking is not yet available.
        </p>
        <div className="mt-6">
          <Button asChild>
            <Link to="/insights">View Insights</Link>
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
