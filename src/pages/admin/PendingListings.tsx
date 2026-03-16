import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2, XCircle, ClipboardList } from 'lucide-react';
import { formatPrice, formatRelativeDate } from '@/lib/formatters';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8085';

interface PendingListing {
  id: string;
  title: string | null;
  property_type: string;
  locality: string | null;
  price: number | null;
  price_unit: string | null;
  description: string | null;
  created_at: string;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function adminAction(path: string, body?: unknown): Promise<void> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let errorMsg = `Request failed (${response.status})`;
    try {
      const data = await response.json();
      if (data.error) errorMsg = data.error;
    } catch {
      // use default message
    }
    throw new Error(errorMsg);
  }
}

export default function PendingListings() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [rejectTarget, setRejectTarget] = useState<PendingListing | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const { data: listings = [], isLoading } = useQuery({
    queryKey: ['pending-listings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('property_listings')
        .select('id, title, property_type, locality, price, price_unit, description, created_at')
        .eq('status', 'PENDING_REVIEW')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as PendingListing[];
    },
    enabled: isAdmin,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => adminAction(`/api/admin/listings/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-listings'] });
      toast({ title: 'Listing Approved', description: 'The listing is now live.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Approval Failed', description: error.message, variant: 'destructive' });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminAction(`/api/admin/listings/${id}/reject`, { rejectionReason: reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-listings'] });
      setRejectTarget(null);
      setRejectionReason('');
      toast({ title: 'Listing Rejected', description: 'The broker has been notified.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Rejection Failed', description: error.message, variant: 'destructive' });
    },
  });

  const handleRejectSubmit = () => {
    if (!rejectTarget || !rejectionReason.trim()) return;
    rejectMutation.mutate({ id: rejectTarget.id, reason: rejectionReason.trim() });
  };

  const isBusy = approveMutation.isPending || rejectMutation.isPending;

  return (
    <AppLayout>
      <div className="container py-6 max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-primary" />
              Pending Approval
            </h1>
            <p className="text-muted-foreground">
              Review broker-submitted listings
            </p>
          </div>
          <Badge variant="secondary" className="text-sm">
            {listings.length} pending
          </Badge>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : listings.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No listings pending review.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Locality</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listings.map((listing) => (
                  <TableRow key={listing.id}>
                    <TableCell className="font-medium max-w-[200px] truncate">
                      {listing.title || listing.description?.slice(0, 60) || 'Untitled'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{listing.property_type}</Badge>
                    </TableCell>
                    <TableCell>{listing.locality || '—'}</TableCell>
                    <TableCell>
                      {listing.price ? formatPrice(listing.price, listing.price_unit) : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatRelativeDate(listing.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-600 border-green-200 hover:bg-green-50"
                          disabled={isBusy}
                          onClick={() => approveMutation.mutate(listing.id)}
                        >
                          {approveMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                          )}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-200 hover:bg-red-50"
                          disabled={isBusy}
                          onClick={() => {
                            setRejectTarget(listing);
                            setRejectionReason('');
                          }}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* Reject Dialog */}
        <Dialog
          open={!!rejectTarget}
          onOpenChange={(open) => {
            if (!open) {
              setRejectTarget(null);
              setRejectionReason('');
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Listing</DialogTitle>
              <DialogDescription>
                Provide a reason for rejection. The broker will be notified.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="rejection-reason">Reason</Label>
              <Textarea
                id="rejection-reason"
                placeholder="e.g., Incomplete address, missing price details..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setRejectTarget(null);
                  setRejectionReason('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={!rejectionReason.trim() || rejectMutation.isPending}
                onClick={handleRejectSubmit}
              >
                {rejectMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                )}
                Reject Listing
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
