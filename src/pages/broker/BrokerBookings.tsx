import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Loader2, Calendar, Clock } from 'lucide-react';
import {
  useBrokerBookings,
  useConfirmBooking,
  useDeclineBooking,
  useCancelBooking,
} from '@/hooks/useBookings';

/**
 * Broker booking management page.
 *
 * Guards:
 *  - Unauthenticated: ProtectedRoute redirects to /auth before this component renders.
 *  - Not dealer/admin: redirect to / (access not permitted).
 *
 * Sections:
 *  - Pending Requests (REQUESTED): Confirm + Decline actions.
 *  - Confirmed Bookings (CONFIRMED): Cancel action.
 */
export default function BrokerBookings() {
  const { isBroker, isAdmin, isLoading: authLoading, userRole } = useAuth();
  const [searchParams] = useSearchParams();
  const listingId = searchParams.get('listingId') ?? undefined;
  const { data: bookings, isLoading: bookingsLoading, isError } = useBrokerBookings(listingId);
  const confirmBooking = useConfirmBooking();
  const declineBooking = useDeclineBooking();
  const cancelBooking = useCancelBooking();

  if (authLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!isBroker && !isAdmin && userRole !== 'user') {
    return <Navigate to="/" replace />;
  }

  const requestedBookings = (bookings ?? []).filter((b) => b.status === 'REQUESTED');
  const confirmedBookings = (bookings ?? []).filter((b) => b.status === 'CONFIRMED');

  return (
    <AppLayout>
      <div className="container max-w-4xl py-6 px-4">
        <h1 className="text-3xl font-bold mb-8">
          {listingId ? 'Booking Requests — This Listing' : 'Booking Requests'}
        </h1>

        {/* Pending Requests */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            Pending Requests
            {requestedBookings.length > 0 && (
              <Badge>{requestedBookings.length}</Badge>
            )}
          </h2>

          {isError && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>
                Failed to load bookings. Please try again.
              </AlertDescription>
            </Alert>
          )}

          {bookingsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading...</span>
            </div>
          ) : requestedBookings.length === 0 ? (
            <p className="text-muted-foreground">No pending booking requests.</p>
          ) : (
            <div className="space-y-3">
              {requestedBookings.map((booking) => (
                <Card key={booking.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1 min-w-0">
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
                        {booking.requesterMessage && (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            &ldquo;{booking.requesterMessage}&rdquo;
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => confirmBooking.mutate(booking.id)}
                          disabled={confirmBooking.isPending || declineBooking.isPending}
                        >
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => declineBooking.mutate({ id: booking.id })}
                          disabled={confirmBooking.isPending || declineBooking.isPending}
                        >
                          Decline
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Confirmed Bookings */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Confirmed Bookings</h2>

          {isError && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>
                Failed to load bookings. Please try again.
              </AlertDescription>
            </Alert>
          )}

          {bookingsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading...</span>
            </div>
          ) : confirmedBookings.length === 0 ? (
            <p className="text-muted-foreground">No confirmed bookings yet.</p>
          ) : (
            <div className="space-y-3">
              {confirmedBookings.map((booking) => (
                <Card key={booking.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {booking.requestedDate}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {booking.requestedTimeSlot}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-green-600 border-green-400"
                        >
                          Confirmed
                        </Badge>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive border-destructive/50 hover:bg-destructive/10"
                            disabled={cancelBooking.isPending}
                          >
                            Cancel
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This can't be undone. The broker will be notified.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep it</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => cancelBooking.mutate(booking.id)}
                            >
                              Yes, cancel
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
