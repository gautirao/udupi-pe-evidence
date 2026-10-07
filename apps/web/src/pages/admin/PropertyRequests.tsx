/**
 * Issue #1793 PR-C — admin read-only list of buyer property requests.
 *
 * PII + XSS contract:
 *  - only `phoneMasked` (as sent by the backend) is ever rendered — no reveal, copy or export;
 *  - requirement / areaLabel / city are buyer-supplied free text: they are rendered as React text
 *    nodes ONLY (no dangerouslySetInnerHTML, no linkify, no title= attributes).
 * Route registration (flag-gated, ProtectedRoute requireAdmin) lives in App.tsx.
 */
import { AlertCircle, ClipboardList } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiError } from '@/lib/api';
import { formatPrice } from '@/lib/formatters';
import {
  ADMIN_PROPERTY_REQUESTS_LIMIT,
  useAdminPropertyRequests,
  type AdminPropertyRequest,
} from '@/hooks/useCreatePropertyRequest';

function formatTs(ts: string): string {
  return new Date(ts).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatBudget(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${formatPrice(min)} – ${formatPrice(max)}`;
  if (max != null) return `Up to ${formatPrice(max)}`;
  if (min != null) return `From ${formatPrice(min)}`;
  return '—';
}

const JOURNEY_LABEL: Record<AdminPropertyRequest['journey'], string> = {
  AREA: 'Area',
  SCHOOL: 'School',
  MAP: 'Map',
};

export default function PropertyRequests() {
  const { data, isLoading, isError, error, refetch, isFetching } = useAdminPropertyRequests();
  const isForbidden = error instanceof ApiError && error.status === 403;

  return (
    <AppLayout>
      <div className="container max-w-6xl px-4 py-8">
        <div className="mb-1 flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-bold">Property Requests</h1>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">Read-only. Phone numbers are masked.</p>

        {isLoading ? (
          <div data-testid="property-requests-loading" className="space-y-2" aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div
            className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-12 text-center"
            role="alert"
          >
            <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
            {isForbidden ? (
              <h2 className="text-base font-semibold text-foreground">You do not have access to this page.</h2>
            ) : (
              <>
                <h2 className="text-base font-semibold text-foreground">We could not load property requests</h2>
                <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
                  Retry
                </Button>
              </>
            )}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="rounded-xl border border-border px-4 py-12 text-center">
            <p className="text-base font-medium text-foreground">No property requests yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Requests appear here when a buyer submits the form from a zero-result search.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Received</TableHead>
                    <TableHead>Intent</TableHead>
                    <TableHead>Journey</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Budget</TableHead>
                    <TableHead>Requirement</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatTs(r.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{r.intent === 'RENT' ? 'Rent' : 'Buy'}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{JOURNEY_LABEL[r.journey] ?? r.journey}</TableCell>
                      <TableCell className="text-xs">
                        <div>{r.areaLabel ?? '—'}</div>
                        <div className="text-muted-foreground">{r.city}</div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatBudget(r.budgetMin, r.budgetMax)}
                      </TableCell>
                      <TableCell className="max-w-xs text-xs">
                        <span className="line-clamp-3 break-words">{r.requirement ?? '—'}</span>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="font-mono">{r.phoneMasked}</div>
                        <div className="text-muted-foreground">
                          {r.contactVia === 'WHATSAPP' ? 'WhatsApp' : 'Phone'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{r.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {data.length >= ADMIN_PROPERTY_REQUESTS_LIMIT && (
              <p className="mt-2 text-xs text-muted-foreground">Showing the latest {data.length} requests.</p>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
