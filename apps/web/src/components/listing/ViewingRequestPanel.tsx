import { useEffect, useState } from 'react';
import { addDays, format } from 'date-fns';
import { AlertCircle, Calendar, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useAuthModal } from '@/contexts/AuthModalContext';
import { useDiscoverTelemetry } from '@/hooks/useDiscoverTelemetry';
import { useCreateBooking, TIME_SLOTS } from '@/hooks/useBookings';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { User } from '@supabase/supabase-js';

export interface ViewingRequestPanelProps {
  listingId: string;
  /** Signed-in buyer's Supabase user, or null for an anonymous visitor (Option A: same
   *  interactive panel either way — see #1797 binding decisions). */
  user: User | null;
}

const QUICK_PICK_COUNT = 5;
/** Mirrors the backend booking contract: requests must be for tomorrow .. +90 days. */
const REQUEST_WINDOW_DAYS = 90;
/** sessionStorage key prefix for anon date/time intent preservation. Date + time slot
 *  ONLY — never name/email/phone. Cleared as soon as it is restored post-sign-in. */
const INTENT_KEY_PREFIX = 'viewing-intent:';

/** Format '09:00-10:00' → '9 AM', '14:00-15:00' → '2 PM' */
function formatTimeLabel(slot: string): string {
  const hour = parseInt(slot.split('-')[0].split(':')[0], 10);
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return format(new Date(y, m - 1, d), 'EEE, d MMM');
}

interface MiniCalendarProps {
  selected: string | null;
  minDate: string;
  maxDate: string;
  onSelect: (iso: string) => void;
  disabled?: boolean;
}

/** Bounded single-month calendar for picking a date beyond the quick-pick pills. */
function MiniCalendar({ selected, minDate, maxDate, onSelect, disabled }: MiniCalendarProps) {
  const parseIso = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const minD = parseIso(minDate);
  const maxD = parseIso(maxDate);
  const initial = selected ? parseIso(selected) : minD;
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  const first = new Date(viewYear, viewMonth, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(viewYear, viewMonth, d));

  const canPrev = first > new Date(minD.getFullYear(), minD.getMonth(), 1);
  const canNext = first < new Date(maxD.getFullYear(), maxD.getMonth(), 1);

  const goPrev = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };
  const goNext = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3" data-testid="viewing-mini-calendar">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          disabled={!canPrev || disabled}
          onClick={goPrev}
          className="rounded p-1 text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs font-semibold text-foreground">{format(first, 'MMMM yyyy')}</span>
        <button
          type="button"
          aria-label="Next month"
          disabled={!canNext || disabled}
          onClick={goNext}
          className="rounded p-1 text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="mb-1 grid grid-cols-7 gap-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i} className="text-center text-[0.6rem] font-semibold text-muted-foreground">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <span key={`empty-${i}`} />;
          const iso = format(d, 'yyyy-MM-dd');
          const inRange = iso >= minDate && iso <= maxDate;
          const isSelected = selected === iso;
          return (
            <button
              key={iso}
              type="button"
              disabled={!inRange || disabled}
              onClick={() => onSelect(iso)}
              aria-pressed={isSelected}
              data-testid={`viewing-calendar-day-${iso}`}
              className={cn(
                'h-7 rounded text-xs font-medium transition-colors',
                isSelected
                  ? 'bg-primary text-primary-foreground'
                  : inRange
                  ? 'text-foreground hover:bg-muted'
                  : 'cursor-not-allowed text-muted-foreground/40',
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Inline viewing-request panel — replaces the former RequestViewingModal dialog for the
 * residential/typed listing detail page (#1797). Fully inline: quick date chips, a
 * bounded mini-calendar for dates beyond the quick-pick window, time-slot chips, an
 * optional message, and idle → pending → success/error states — no modal, no double
 * entry of date/time.
 *
 * Anon buyers (Option A, #1797 binding decision) see the exact same interactive panel.
 * "Send" persists ONLY the chosen date + time slot to sessionStorage (no PII) and routes
 * to sign-in; the selection is restored once the buyer is authenticated.
 */
export function ViewingRequestPanel({ listingId, user }: ViewingRequestPanelProps) {
  const { openAuthModal } = useAuthModal();
  const { emitLeadIntent } = useDiscoverTelemetry();
  const createBooking = useCreateBooking();

  const today = new Date();
  const minDate = format(addDays(today, 1), 'yyyy-MM-dd');
  const maxDate = format(addDays(today, REQUEST_WINDOW_DAYS), 'yyyy-MM-dd');
  const intentKey = `${INTENT_KEY_PREFIX}${listingId}`;

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [message, setMessage] = useState('');
  const [succeeded, setSucceeded] = useState<{ date: string; time: string } | null>(null);

  const quickPicks = Array.from({ length: QUICK_PICK_COUNT }, (_, i) => {
    const d = addDays(today, i + 1);
    return {
      iso: format(d, 'yyyy-MM-dd'),
      weekday: i === 0 ? 'Tom' : format(d, 'EEE'),
      dayNum: format(d, 'd'),
    };
  });
  const quickIsoSet = new Set(quickPicks.map((p) => p.iso));

  // Restore a previously-picked date/time once the buyer signs in (anon → auth handoff).
  // The stored value contains ONLY date + time slot — no name/email/phone (no PII) — and
  // is removed immediately so it is never replayed twice.
  //
  // Trigger keys: [user, listingId] — one-shot restore gated on auth becoming available
  // for THIS listing. `intentKey`/`minDate`/`maxDate`/`quickIsoSet` are read fresh inside
  // the effect body (derived from listingId/today's date, recomputed every render) rather
  // than tracked as separate triggers — including them would re-fire this restore on every
  // render (quickIsoSet is a brand-new Set each render). `setSelectedDate`/`setSelectedTime`/
  // `setShowCalendar` are useState setters (stable, exempt). Dep-array/naming only — no
  // authorization logic changed.
  useEffect(() => {
    if (!user) return;
    try {
      const raw = sessionStorage.getItem(intentKey);
      if (!raw) return;
      sessionStorage.removeItem(intentKey);
      const parsed = JSON.parse(raw) as { date?: string; timeSlot?: string };
      if (parsed.date && parsed.date >= minDate && parsed.date <= maxDate) {
        setSelectedDate(parsed.date);
        if (!quickIsoSet.has(parsed.date)) setShowCalendar(true);
      }
      if (parsed.timeSlot && TIME_SLOTS.includes(parsed.timeSlot)) {
        setSelectedTime(parsed.timeSlot);
      }
    } catch {
      // sessionStorage unavailable/corrupt (private mode etc.) — buyer just re-picks.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see trigger-key note above
  }, [user, listingId]);

  function selectDate(iso: string) {
    setSelectedDate((cur) => (cur === iso ? null : iso));
    setSelectedTime(null);
  }

  function reset() {
    setSucceeded(null);
    setSelectedDate(null);
    setSelectedTime(null);
    setMessage('');
    setShowCalendar(false);
    createBooking.reset();
  }

  function handleSubmit() {
    if (!selectedDate || !selectedTime || createBooking.isPending) return;

    if (!user) {
      // Anon "Send" — preserve intent (date + time slot only, no PII) and route to sign-in.
      // POST /api/bookings requires a JWT; there is no anon submit path (no auth broadening).
      try {
        sessionStorage.setItem(intentKey, JSON.stringify({ date: selectedDate, timeSlot: selectedTime }));
      } catch {
        // Private-mode/storage-disabled — proceed without persisted intent.
      }
      openAuthModal({ returnTo: `/listing/${listingId}`, redirect: `/listing/${listingId}` });
      return;
    }

    const date = selectedDate;
    const time = selectedTime;

    // Issue #1531 — additive LEAD_INTENT telemetry (fire-and-forget; never throws; no PII).
    emitLeadIntent();

    createBooking.mutate(
      { listingId, requestedDate: date, requestedTimeSlot: time, requesterMessage: message.trim() || undefined },
      {
        onSuccess: () => {
          // Reset the form on success so a stale selection can never trigger a duplicate booking.
          setSucceeded({ date, time });
          setSelectedDate(null);
          setSelectedTime(null);
          setMessage('');
          setShowCalendar(false);
        },
      },
    );
  }

  if (succeeded) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="viewing-request-success"
        className="rounded-xl bg-evergreen-tint p-4"
      >
        <div className="flex gap-2.5">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-evergreen" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-foreground">Viewing request sent</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We've passed on your preferred time — {formatDateLabel(succeeded.date)}, {formatTimeLabel(succeeded.time)}.
              {' '}This is a request, not a confirmed booking: the lister will get back to you to lock in a final time.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="mt-3" onClick={reset} data-testid="viewing-request-reset">
          Request another time
        </Button>
      </div>
    );
  }

  const canSubmit = !!selectedDate && !!selectedTime && !createBooking.isPending;
  const isPending = createBooking.isPending;

  return (
    <div>
      <h2 className="font-serif text-lg font-semibold text-foreground">Request a viewing time</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Pick a preferred day and time in the next 2 weeks — the lister confirms the final slot.
      </p>

      {/* Quick-pick day pills */}
      <div className="mt-4 grid grid-cols-5 gap-2">
        {quickPicks.map((p) => {
          const active = selectedDate === p.iso;
          return (
            <button
              key={p.iso}
              type="button"
              onClick={() => selectDate(p.iso)}
              aria-pressed={active}
              disabled={isPending}
              data-testid={`viewing-date-pill-${p.iso}`}
              className={cn(
                'flex flex-col items-center rounded-lg border px-1 py-2 text-center transition-colors',
                active ? 'border-primary bg-secondary text-secondary-foreground' : 'border-border bg-card hover:bg-muted',
                isPending && 'cursor-not-allowed opacity-60',
              )}
            >
              <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">{p.weekday}</span>
              <span className="text-sm font-semibold">{p.dayNum}</span>
            </button>
          );
        })}
      </div>

      {/* More dates toggle + mini calendar */}
      <button
        type="button"
        onClick={() => setShowCalendar((v) => !v)}
        disabled={isPending}
        data-testid="viewing-calendar-toggle"
        className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Calendar className="h-3.5 w-3.5" />
        {showCalendar ? 'Hide calendar' : 'Choose another date'}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showCalendar && 'rotate-180')} />
      </button>
      {showCalendar && (
        <>
          <MiniCalendar selected={selectedDate} minDate={minDate} maxDate={maxDate} onSelect={selectDate} disabled={isPending} />
          <p className="mt-1.5 text-xs text-muted-foreground">Requests open through {formatDateLabel(maxDate)}.</p>
        </>
      )}

      {/* Selected-date echo when chosen outside the quick pills */}
      {selectedDate && !quickIsoSet.has(selectedDate) && (
        <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
          <Calendar className="h-3 w-3" aria-hidden="true" />
          {formatDateLabel(selectedDate)}
        </div>
      )}

      {/* Time slots — single-source TIME_SLOTS from useBookings (no divergence) */}
      {selectedDate && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Pick a preferred time</p>
          <div className="grid grid-cols-3 gap-2">
            {TIME_SLOTS.map((slot) => {
              const timeActive = selectedTime === slot;
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setSelectedTime(timeActive ? null : slot)}
                  aria-pressed={timeActive}
                  disabled={isPending}
                  data-testid={`viewing-time-slot-${slot}`}
                  className={cn(
                    'rounded-lg border px-2 py-1.5 text-center text-xs font-medium transition-colors',
                    timeActive
                      ? 'border-primary bg-secondary text-secondary-foreground'
                      : 'border-border bg-card text-foreground hover:bg-muted',
                    isPending && 'cursor-not-allowed opacity-60',
                  )}
                >
                  {formatTimeLabel(slot)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Optional message — parity with the former modal: maxLength 500 + counter */}
      {selectedDate && selectedTime && (
        <div className="mt-4 space-y-1.5">
          <Label htmlFor="viewing-message">Message (optional)</Label>
          <Textarea
            id="viewing-message"
            data-testid="viewing-message-input"
            placeholder="Any questions or notes for the lister..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
            rows={3}
            disabled={isPending}
          />
          <p className="text-right text-xs text-muted-foreground">{message.length}/500</p>
        </div>
      )}

      {createBooking.isError && (
        <div
          role="alert"
          data-testid="viewing-request-error"
          className="mt-3 flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          Failed to send your request. Please try again.
        </div>
      )}

      <Button
        className="mt-4 w-full bg-copper text-copper-foreground hover:bg-copper-hover"
        disabled={!canSubmit}
        onClick={handleSubmit}
        data-testid="request-viewing-btn"
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sending request...
          </>
        ) : (
          <>
            <Calendar className="mr-2 h-4 w-4" />
            {user ? 'Request viewing time' : 'Sign in to request viewing'}
          </>
        )}
      </Button>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {!selectedDate
          ? 'Pick a day to see available times.'
          : !selectedTime
          ? 'Now pick a preferred time.'
          : user
          ? 'This is a request, not a confirmed booking — the lister confirms the final slot.'
          : "We'll save your pick and take you to sign in — you won't lose your selection."}
      </p>
    </div>
  );
}
