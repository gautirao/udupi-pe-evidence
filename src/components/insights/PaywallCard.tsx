import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Shown in the Insights right column when the user's trial has expired.
 * Calls POST /api/payments/insights-pass; on success refreshes auth state
 * in-place (SPA-safe) and navigates to /trends so the access gate re-evaluates.
 * On error, toasts a "coming soon" message — the payment endpoint may not be live yet.
 */
export function PaywallCard() {
  const [isPending, setIsPending] = useState(false);
  const { toast } = useToast();
  const { refreshAuth } = useAuth();
  const navigate = useNavigate();

  async function handleUpgrade() {
    setIsPending(true);
    try {
      await api.post('/api/payments/insights-pass');
      toast({ title: 'Access extended!', description: 'Loading your insights...' });
      await refreshAuth();
      navigate('/trends');
    } catch {
      toast({
        title: 'Payment coming soon',
        description: 'Full payment integration is not yet active. Check back soon.',
        variant: 'destructive',
      });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card className="border-2 border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
        <Lock className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-xl font-semibold">Insights Access Required</h3>
        <p className="text-muted-foreground max-w-sm">
          Your free trial has ended. Upgrade to continue accessing price trends,
          new listings, and recommendations.
        </p>
        <Button onClick={handleUpgrade} disabled={isPending} size="lg">
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isPending ? 'Processing...' : 'Upgrade — ₹499 / 30 days'}
        </Button>
        <p className="text-xs text-muted-foreground">
          Saved areas and filters remain accessible below.
        </p>
      </CardContent>
    </Card>
  );
}
