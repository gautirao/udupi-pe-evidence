import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { api, ApiError } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

function maskToken(token: string): string {
  if (token.length <= 20) return token;
  return `${token.slice(0, 10)}...${token.slice(-10)}`;
}

export default function BackendTest() {
  const { user } = useAuth();
  const [jwt, setJwt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ status: number; body: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8085';

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setJwt(session?.access_token ?? null);
    });
  }, []);

  const testHealth = async (withAuth: boolean) => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const response = await api.get<unknown>('/actuator/health', {
        skipAuth: !withAuth,
      });
      setResult({ status: 200, body: JSON.stringify(response, null, 2) });
    } catch (err) {
      if (err instanceof ApiError) {
        setResult({ status: err.status, body: JSON.stringify(err.body, null, 2) });
      } else {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto max-w-2xl p-6 space-y-6">
      <h1 className="text-2xl font-bold">Backend Connection Test</h1>

      <Card>
        <CardHeader>
          <CardTitle>Session Info</CardTitle>
          <CardDescription>Current authentication state</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Email:</span>
            <Badge variant="secondary">{user?.email ?? 'Not signed in'}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">JWT:</span>
            <code className="text-xs bg-muted px-2 py-1 rounded">
              {jwt ? maskToken(jwt) : 'No token'}
            </code>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">API Base URL:</span>
            <Badge variant="outline">{apiBaseUrl}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API Tests</CardTitle>
          <CardDescription>Test connectivity to the Spring Boot backend</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Button onClick={() => testHealth(false)} disabled={loading} variant="outline">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Test Health (No Auth)
            </Button>
            <Button onClick={() => testHealth(true)} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Test Health (With JWT)
            </Button>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>Request Failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {result && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Status:</span>
                <Badge variant={result.status === 200 ? 'default' : 'destructive'}>
                  {result.status}
                </Badge>
              </div>
              <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-48">
                {result.body}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
