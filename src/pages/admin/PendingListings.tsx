import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Loader2, CheckCircle2, XCircle, ClipboardList, RotateCcw } from 'lucide-react';
import { formatPrice, formatRelativeDate } from '@/lib/formatters';

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

const REJECTION_CODES: { value: string; label: string }[] = [
  { value: 'INCOMPLETE_INFO', label: 'Incomplete info' },
  { value: 'DUPLICATE_LISTING', label: 'Duplicate listing' },
  { value: 'INVALID_PHOTOS', label: 'Invalid photos' },
  { value: 'POLICY_VIOLATION', label: 'Policy violation' },
  { value: 'OTHER', label: 'Other' },
];

export default function PendingListings() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [rejectTarget, setRejectTarget] = useState<PendingListing | null>(null);
  const [rejectionReasonCode, setRejectionReasonCode] = useState('');
  const [rejectionNote, setRejectionNote] = useState('');

  const [returnForEditsTarget, setReturnForEditsTarget] = useState<PendingListing | null>(null);
  const [returnForEditsNote, setReturnForEditsNote] = useState('');

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
    mutationFn: (id: string) => api.post(`/api/admin/listings/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-listings'] });
      toast({ title: 'Listing Approved', description: 'The listing is now live.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Approval Failed', description: error.message, variant: 'destructive' });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, code, note }: { id: string; code: string; note: string }) => {
      const reason = note.trim() ? `${code}: ${note.trim()}` : code;
      return api.post(`/api/admin/listings/${id}/reject`, { rejectionReason: reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-listings'] });
      setRejectTarget(null);
      setRejectionReasonCode('');
      setRejectionNote('');
      toast({ title: 'Listing Rejected', description: 'The broker has been notified.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Rejection Failed', description: error.message, variant: 'destructive' });
    },
  });

  const returnForEditsMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api.post(`/api/admin/listings/${id}/return-for-edits`, { note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-listings'] });
      setReturnForEditsTarget(null);
      setReturnForEditsNote('');
      toast({ title: 'Returned for edits', description: 'The broker has been notified.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Return failed', description: error.message, variant: 'destructive' });
    },
  });

  const handleRejectSubmit = () => {
    if (!rejectTarget || !rejectionReasonCode) return;
    rejectMutation.mutate({ id: rejectTarget.id, code: rejectionReasonCode, note: rejectionNote });
  };

  const handleReturnForEditsSubmit = () => {
    if (!returnForEditsTarget || !returnForEditsNote.trim()) return;
    returnForEditsMutation.mutate({ id: returnForEditsTarget.id, note: returnForEditsNote.trim() });
  };

  const isBusy = approveMutation.isPending || rejectMutation.isPending || returnForEditsMutation.isPending;

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
                          className="text-amber-600 border-amber-200 hover:bg-amber-50"
                          disabled={isBusy}
                          onClick={() => {
                            setReturnForEditsTarget(listing);
                            setReturnForEditsNote('');
                          }}
                        >
                          <RotateCcw className="h-4 w-4 mr-1" />
                          Return for Edits
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-200 hover:bg-red-50"
                          disabled={isBusy}
                          onClick={() => {
                            setRejectTarget(listing);
                            setRejectionReasonCode('');
                            setRejectionNote('');
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

        {/* Return for Edits Dialog */}
        <Dialog
          open={!!returnForEditsTarget}
          onOpenChange={(open) => {
            if (!open) {
              setReturnForEditsTarget(null);
              setReturnForEditsNote('');
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Return for Edits</DialogTitle>
              <DialogDescription>
                Explain what the broker needs to fix before resubmitting.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="return-note">Note</Label>
              <Textarea
                id="return-note"
                placeholder="e.g., Please add clearer photos and confirm the exact locality..."
                value={returnForEditsNote}
                onChange={(e) => setReturnForEditsNote(e.target.value)}
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setReturnForEditsTarget(null);
                  setReturnForEditsNote('');
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={!returnForEditsNote.trim() || returnForEditsMutation.isPending}
                onClick={handleReturnForEditsSubmit}
              >
                {returnForEditsMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                )}
                Return for Edits
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reject Dialog */}
        <Dialog
          open={!!rejectTarget}
          onOpenChange={(open) => {
            if (!open) {
              setRejectTarget(null);
              setRejectionReasonCode('');
              setRejectionNote('');
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Listing</DialogTitle>
              <DialogDescription>
                Select a reason for rejection. The broker will be notified.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="rejection-reason-code">Reason</Label>
                <Select value={rejectionReasonCode} onValueChange={setRejectionReasonCode}>
                  <SelectTrigger id="rejection-reason-code">
                    <SelectValue placeholder="Select a reason..." />
                  </SelectTrigger>
                  <SelectContent>
                    {REJECTION_CODES.map(({ value, label }) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rejection-note">Additional note (optional)</Label>
                <Textarea
                  id="rejection-note"
                  placeholder="Add any additional context for the broker..."
                  value={rejectionNote}
                  onChange={(e) => setRejectionNote(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setRejectTarget(null);
                  setRejectionReasonCode('');
                  setRejectionNote('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={!rejectionReasonCode || rejectMutation.isPending}
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
