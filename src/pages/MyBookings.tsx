import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Calendar, Clock } from 'lucide-react';
import { useMyBookings, BookingResponse } from '@/hooks/useBookings';

// ─── Status badge helpers ─────────────────────────────────────────────────────

const STATUS_LABEL: Record<BookingResponse['status'], string> = {
  REQUESTED: 'Requested',
  CONFIRMED: 'Confirmed',
  DECLINED: 'Declined',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
};

const STATUS_CLASS: Record<BookingResponse['status'], string> = {
  REQUESTED: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  CONFIRMED: 'text-green-600 border-green-400',
  DECLINED: 'text-destructive border-destructive',
  CANCELLED: 'text-muted-foreground border-muted',
  COMPLETED: 'text-blue-600 border-blue-400',
};

// ─── Booking card ─────────────────────────────────────────────────────────────

function BookingCard({ booking }: { booking: BookingResponse }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1 min-w-0">
              <p className="text-sm font-medium truncate">
                Listing{' '}
                <span className="font-mono text-xs text-muted-foreground">
                  {booking.listingId}
                </span>
              </p>
              <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {booking.requestedDate}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {booking.requestedTimeSlot}
                </span>
              </div>
            </div>
            <Badge variant="outline" className={STATUS_CLASS[booking.status]}>
              {STATUS_LABEL[booking.status]}
            </Badge>
          </div>

          {booking.status === 'DECLINED' && booking.declineReason && (
            <p className="text-sm text-muted-foreground">
              Declined: {booking.declineReason}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyBookings() {
  const { data: bookings, isLoading, isError } = useMyBookings();

  return (
    <AppLayout>
      <div className="container max-w-4xl py-12 px-4">
        <h1 className="text-3xl font-bold mb-8">My Bookings</h1>

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading your bookings...</span>
          </div>
        ) : isError ? (
          <p className="text-destructive">
            Failed to load bookings. Please try again later.
          </p>
        ) : !bookings || bookings.length === 0 ? (
          <p className="text-muted-foreground">
            You have no viewing requests yet.
          </p>
        ) : (
          <div className="space-y-3">
            {bookings.map((booking) => (
              <BookingCard key={booking.id} booking={booking} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
