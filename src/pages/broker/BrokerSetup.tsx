import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { api, ApiError } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

interface SetupErrorBody {
  field?: string;
  error?: string;
}

/**
 * Broker registration form.
 *
 * Guards:
 *  - Unauthenticated: ProtectedRoute redirects to /auth before this component renders.
 *  - Already dealer/admin: redirect to / (setup is not needed).
 *
 * On success: calls refreshRole() so AuthContext reflects the new role immediately,
 * then navigates to / where broker nav links will appear.
 */
export default function BrokerSetup() {
  const { user, isDealer, isAdmin, isLoading, refreshRole } = useAuth();
  const navigate = useNavigate();

  const [phone, setPhone] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const fullName =
    (user?.user_metadata?.full_name as string | undefined) ??
    user?.email ??
    '';

  const canSubmit = phone.trim().length > 0 && acceptedTerms && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // acceptedTerms is always true here (form guard above); role is assigned server-side.
      await api.post('/api/broker/setup', { phone: phone.trim(), acceptedTerms: true });

      // Refresh role in AuthContext so isDealer becomes true before navigation.
      await refreshRole();

      navigate('/broker/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setError('You are already registered as a broker.');
        } else if (err.status === 400) {
          const body = err.body as SetupErrorBody;
          setError(body?.error ?? 'Please check your inputs and try again.');
        } else {
          setError('Something went wrong. Please try again later.');
        }
      } else {
        setError('Something went wrong. Please try again later.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppLayout>
      <div className="container max-w-lg py-12 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Broker Registration</CardTitle>
            <CardDescription>
              Complete your profile to start listing properties on Udupi Property Explorer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Full name — read-only, sourced from account */}
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  readOnly
                  className="bg-muted cursor-default"
                />
                <p className="text-xs text-muted-foreground">
                  Sourced from your account profile.
                </p>
              </div>

              {/* Phone number */}
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number *</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+919876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  maxLength={15}
                  required
                  autoComplete="tel"
                />
                <p className="text-xs text-muted-foreground">
                  Indian mobile number. Displayed on your listings for buyer contact.
                </p>
              </div>

              {/* Terms acceptance */}
              <div className="flex items-start gap-3 pt-1">
                <Checkbox
                  id="terms"
                  checked={acceptedTerms}
                  onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                />
                <Label htmlFor="terms" className="text-sm leading-5 cursor-pointer font-normal">
                  I agree to the listing terms and confirm I am authorised to list the properties I
                  will submit.
                </Label>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" disabled={!canSubmit}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Become a Broker
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
