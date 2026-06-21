import { useState } from 'react';
import { Link } from 'react-router-dom';
// Issue #1531 — additive LEAD_INTENT telemetry wiring (fire-and-forget; no existing behaviour changed).
import { useDiscoverTelemetry } from '@/hooks/useDiscoverTelemetry';
import { addDays, format } from 'date-fns';
import { AlertCircle, Calendar, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCreateBooking, TIME_SLOTS } from '@/hooks/useBookings';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface RequestViewingModalProps {
  listingId: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Modal for requesting a property viewing.
 *
 * - Auth wall: shows sign-in prompt if user is not authenticated.
 * - Form: future date (min: tomorrow, max: 90 days) + time slot + optional message.
 * - Calls POST /api/bookings via useCreateBooking hook.
 */
export function RequestViewingModal({ listingId, open, onClose }: RequestViewingModalProps) {
  const { user } = useAuth();
  const createBooking = useCreateBooking();

  // Issue #1531 — additive LEAD_INTENT telemetry (fire-and-forget; never throws).
  const { emitLeadIntent } = useDiscoverTelemetry();

  const today = new Date();
  const minDate = format(addDays(today, 1), 'yyyy-MM-dd');
  const maxDate = format(addDays(today, 90), 'yyyy-MM-dd');

  const [requestedDate, setRequestedDate] = useState('');
  const [requestedTimeSlot, setRequestedTimeSlot] = useState('');
  const [requesterMessage, setRequesterMessage] = useState('');

  function resetForm() {
    setRequestedDate('');
    setRequestedTimeSlot('');
    setRequesterMessage('');
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Issue #1531 — additive LEAD_INTENT telemetry (fire-and-forget; never throws).
    // Emits at intent moment (form submit), before the booking mutation resolves.
    // No PII sent: no email/phone/name/userId/raw price. listingId is omitted (not in allow-list).
    emitLeadIntent();

    createBooking.mutate(
      {
        listingId,
        requestedDate,
        requestedTimeSlot,
        requesterMessage: requesterMessage.trim() || undefined,
      },
      { onSuccess: handleClose },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Request a Viewing
          </DialogTitle>
          <DialogDescription>
            Choose a date and time slot to visit this property.
          </DialogDescription>
        </DialogHeader>

        {!user ? (
          <div className="py-6 text-center space-y-4">
            <p className="text-muted-foreground">
              Please sign in to request a viewing.
            </p>
            <Button asChild>
              <Link to="/auth">Sign In</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="requested-date">Preferred Date</Label>
              <input
                id="requested-date"
                type="date"
                min={minDate}
                max={maxDate}
                value={requestedDate}
                onChange={(e) => setRequestedDate(e.target.value)}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="time-slot">Preferred Time Slot</Label>
              <Select
                value={requestedTimeSlot}
                onValueChange={setRequestedTimeSlot}
                required
              >
                <SelectTrigger id="time-slot">
                  <SelectValue placeholder="Select a time slot" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((slot) => (
                    <SelectItem key={slot} value={slot}>
                      {slot}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="requester-message">Message (optional)</Label>
              <Textarea
                id="requester-message"
                placeholder="Any questions or notes for the broker..."
                value={requesterMessage}
                onChange={(e) => setRequesterMessage(e.target.value)}
                maxLength={500}
                rows={3}
              />
              <p className="text-xs text-muted-foreground text-right">
                {requesterMessage.length}/500
              </p>
            </div>

            <p className="text-sm text-muted-foreground">
              The broker will review your request and confirm or suggest an alternative time.
            </p>

            {createBooking.isError && (
              <div className="flex items-center gap-2 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                Failed to send request. Please try again.
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={handleClose}
                disabled={createBooking.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={!requestedDate || !requestedTimeSlot || createBooking.isPending}
              >
                {createBooking.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {createBooking.isPending ? 'Sending...' : 'Send Request'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
