/**
 * Issue #1793 PR-C — "Request a property" card, shown ONLY inside a settled, successful,
 * empty result (the callers own that gate; see ListingsBody / SchoolRadiusEmptyState).
 *
 * Collapsed by default; expands inline into the form (no Dialog/Sheet/Popover — it already lives
 * inside the mobile sheet). The buyer supplies only: requirement, budget, phone, contact channel,
 * consent. Everything else (city, area, journey, intent) is the committed search context passed
 * in by the caller. Renders nothing unless the feature flag is on.
 *
 * COPY + VERSION CO-LOCATION: the consent copy below and PROPERTY_REQUEST_CONSENT_VERSION live in
 * this one file on purpose — changing the wording must be a conscious decision to bump the version
 * that is stored with every request. If you edit the consent copy, bump the version.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import {
  classifyPropertyRequestError,
  isPropertyRequestsEnabled,
  useCreatePropertyRequest,
  type CreatePropertyRequestPayload,
  type PropertyRequestContactVia,
  type PropertyRequestFailure,
  type PropertyRequestIntent,
  type PropertyRequestJourney,
} from '@/hooks/useCreatePropertyRequest';

/** Stored with every request. <= 32 chars (backend limit). Bump when the consent copy changes. */
export const PROPERTY_REQUEST_CONSENT_VERSION = 'property-request-v1';
/** Deletion contact — hardcoded on purpose; asserted verbatim by a test. */
export const PROPERTY_REQUEST_DELETION_EMAIL = 'remove-my-search@propertysignal.in';

const CONSENT_LABEL = 'I agree to share this information as described below.';
const CONSENT_DETAIL =
  'We collect your requirement, budget and phone/WhatsApp number so we can try to match you with a founding broker. ' +
  'This is not a promise that anyone will contact you. Your phone number is stored encrypted, is never shown publicly, ' +
  'and is shared only with a broker matched to your request. We keep your request for 12 months. To delete it, email ';

const REQUIREMENT_MAX = 500;
const PHONE_PATTERN = /^\+?[0-9]{10,14}$/;
const DIGITS_PATTERN = /^[0-9]{1,15}$/;

export interface RequestPropertyContext {
  city: string;
  /** Real area key, or null (MAP scopes never invent one). */
  areaKey: string | null;
  /** Real area label, or null. For SCHOOL the school name + radius ride here (the DTO has no school field). */
  areaLabel: string | null;
  journey: PropertyRequestJourney;
  intent: PropertyRequestIntent;
  /** Read-only display text, e.g. "Kalsanka, udupi" / "Drawn area, udupi". Never sent. */
  contextLabel: string;
}

export interface RequestPropertyCardProps {
  context: RequestPropertyContext;
  /** Additive layout hook for the host (spacing only). */
  className?: string;
}

type FieldKey = 'requirement' | 'budgetMin' | 'budgetMax' | 'phone' | 'contactVia' | 'consent';
type FieldErrors = Partial<Record<FieldKey, string>>;

const FIELD_ORDER: FieldKey[] = ['requirement', 'budgetMin', 'budgetMax', 'phone', 'contactVia', 'consent'];

const SERVER_FIELD_TO_KEY: Record<string, FieldKey> = {
  requirement: 'requirement',
  budgetMin: 'budgetMin',
  budgetMax: 'budgetMax',
  budgetRangeValid: 'budgetMax',
  phone: 'phone',
  contactVia: 'contactVia',
  consent: 'consent',
};

const BUDGET_RANGE_MESSAGE = 'Maximum budget must be at least the minimum.';
/** Backend validation messages quote the DTO field names; those mean nothing to a buyer. */
const INTERNAL_FIELD_NAME = /\b(budgetMin|budgetMax|budgetRangeValid)\b/;

/** Buyer-facing text for a server field message: budget messages are rewritten, the rest pass through as plain text. */
function friendlyServerMessage(field: string, message: string): string {
  if (field === 'budgetRangeValid') return BUDGET_RANGE_MESSAGE;
  if (INTERNAL_FIELD_NAME.test(message)) {
    if (field === 'budgetMin') return 'Enter a valid minimum budget.';
    if (field === 'budgetMax') return 'Enter a valid maximum budget.';
    return BUDGET_RANGE_MESSAGE;
  }
  return message;
}

function serverFieldErrors(failure: PropertyRequestFailure | null): FieldErrors {
  if (failure?.kind !== 'validation') return {};
  const out: FieldErrors = {};
  for (const { field, message } of failure.fields) {
    const key = SERVER_FIELD_TO_KEY[field];
    if (key && !out[key]) out[key] = friendlyServerMessage(field, message);
  }
  return out;
}

/** Server messages for fields the card has no input for (areaLabel, city, ...): shown in the alert so they never dead-end. */
function unmappedServerMessages(failure: PropertyRequestFailure | null): string[] {
  if (failure?.kind !== 'validation') return [];
  return failure.fields.filter(({ field }) => !SERVER_FIELD_TO_KEY[field]).map(({ message }) => message);
}

function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-().]/g, '');
}

export const PHONE_IN_REQUIREMENT_MESSAGE = 'Please enter contact numbers only in the Phone / WhatsApp field.';

const isAsciiDigit = (ch: string) => ch >= '0' && ch <= '9';
const isGroupSeparator = (ch: string) => ch === ' ' || ch === '.' || ch === '-' || ch === '(' || ch === ')';

const MAX_PHONE_DIGITS = 12;

/** Indian mobile shapes only: 10 digits [6-9]…, 91 + 10, or trunk-0 + 10. Mirrors the server rule exactly. */
function isPhoneDigitRun(d: string): boolean {
  if (d.length === 10) return /^[6-9]/.test(d);
  if (d.length === 12) return d.startsWith('91') && /^[6-9]/.test(d.slice(2));
  if (d.length === 11) return d.startsWith('0') && /^[6-9]/.test(d.slice(1));
  return false;
}

/**
 * UX mirror of the backend's free-text phone rejection (the server stays authoritative). Finds maximal
 * groups of ASCII digits joined only by [space . - ( )] (a group starts and ends on a digit; a leading
 * '+' does not change the digits). Within a group the digits are split into chunks (runs between
 * separators) and ANY contiguous span of chunks whose concatenated digits form an Indian mobile number
 * flags the text, so two numbers pasted back to back ("9876543210 9123456780") are caught. A span stops
 * extending once it exceeds 12 digits (the longest mobile shape), which bounds the work per group.
 *
 * A span of 2+ chunks is exempt (a range, e.g. "60000-75000") only if ALL of its chunks end in "00";
 * otherwise the normal shape test applies, so "98765 43200" is still rejected. Single-chunk spans are
 * unaffected ("9876543200" is rejected). Must stay identical to the backend ContactNumberRule.
 */
export function containsPhoneLikeNumber(text: string): boolean {
  let i = 0;
  while (i < text.length) {
    if (!isAsciiDigit(text[i])) {
      i += 1;
      continue;
    }
    const chunks: string[] = [];
    let current = '';
    let end = i;
    let j = i;
    while (j < text.length && (isAsciiDigit(text[j]) || isGroupSeparator(text[j]))) {
      if (isAsciiDigit(text[j])) {
        current += text[j];
        end = j + 1;
      } else if (current) {
        chunks.push(current);
        current = '';
      }
      j += 1;
    }
    if (current) chunks.push(current);
    for (let s = 0; s < chunks.length; s += 1) {
      let span = '';
      let allChunksEndInDoubleZero = true;
      for (let e = s; e < chunks.length; e += 1) {
        span += chunks[e];
        if (!chunks[e].endsWith('00')) allChunksEndInDoubleZero = false;
        if (span.length > MAX_PHONE_DIGITS) break;
        // A multi-chunk span whose chunks ALL end in "00" is a range ("60000-75000"), not a phone.
        if (isPhoneDigitRun(span) && (e === s || !allChunksEndInDoubleZero)) return true;
      }
    }
    i = end;
  }
  return false;
}

function nearestScrollableAncestor(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}

/** Breathing room kept between a sticky header's bottom edge and the focused field. */
const STICKY_CLEARANCE_PX = 16;

/**
 * Focuses a form field WITHOUT the browser's default minimal scroll (which can leave it under the
 * discover panel's sticky header - Back/breadcrumb + filter chips), then scrolls ONLY the field's nearest
 * scrollable ancestor so the field sits clearly below that container's sticky element(s). Deliberately NOT
 * scrollIntoView: that also scrolls every outer ancestor and the document, shifting the whole app shell.
 * No scrollable ancestor => nothing extra (the field is already in view).
 */
function focusFieldClearOfStickyHeader(el: HTMLElement | null): void {
  if (!el) return;
  el.focus({ preventScroll: true });
  const container = nearestScrollableAncestor(el);
  if (!container) return;
  const containerTop = container.getBoundingClientRect().top;
  let stickyBottom = 0;
  for (const node of container.querySelectorAll<HTMLElement>('*')) {
    if (node.contains(el) || getComputedStyle(node).position !== 'sticky') continue;
    stickyBottom = Math.max(stickyBottom, node.getBoundingClientRect().bottom - containerTop);
  }
  // Land the field a third of the way down the visible container, but never under the sticky header.
  const desiredOffset = Math.max(container.clientHeight / 3, stickyBottom + STICKY_CLEARANCE_PX);
  const fieldOffset = el.getBoundingClientRect().top - containerTop;
  container.scrollTop += fieldOffset - desiredOffset;
}

function contextKey(c: RequestPropertyContext): string {
  return [c.journey, c.intent, c.city, c.areaKey ?? '', c.areaLabel ?? '', c.contextLabel].join('\u0001');
}

/** Flag-gated entry point. Re-keys on scope identity so a draft never submits against a previous scope. */
export function RequestPropertyCard({ context, className }: RequestPropertyCardProps) {
  if (!isPropertyRequestsEnabled()) return null;
  return <RequestPropertyCardInner key={contextKey(context)} context={context} className={className} />;
}

function RequestPropertyCardInner({ context, className }: RequestPropertyCardProps) {
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const mutation = useCreatePropertyRequest();

  const [expanded, setExpanded] = useState(false);
  const [requirement, setRequirement] = useState('');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [phone, setPhone] = useState('');
  const [contactVia, setContactVia] = useState<PropertyRequestContactVia>('PHONE');
  const [consent, setConsent] = useState(false);
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  // Server field errors describe the values that were SENT. Once the buyer edits a field, its server
  // error is stale, so it is dismissed until the next submit (which resets this).
  const [dismissedServerFields, setDismissedServerFields] = useState<ReadonlySet<FieldKey>>(new Set());
  // Bumped when a submit fails client-side validation, so focus moves to the first invalid field (even if
  // the same field fails twice). Edits that clear an error never bump it.
  const [focusRequest, setFocusRequest] = useState(0);

  const formRef = useRef<HTMLFormElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  const failure = mutation.isError ? classifyPropertyRequestError(mutation.error) : null;
  const liveServerErrors: FieldErrors = {};
  for (const [key, message] of Object.entries(serverFieldErrors(failure))) {
    // Object.entries widens the key to string; every key came from SERVER_FIELD_TO_KEY (a FieldKey).
    if (!dismissedServerFields.has(key as FieldKey)) liveServerErrors[key as FieldKey] = message;
  }
  const fieldErrors: FieldErrors = { ...liveServerErrors, ...clientErrors };
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;
  const unmappedMessages = unmappedServerMessages(failure);
  const isPending = mutation.isPending;

  // Focus management after an async outcome (state-driven, so an effect is the right tool).
  useEffect(() => {
    if (mutation.isSuccess) successHeadingRef.current?.focus();
  }, [mutation.isSuccess]);

  const failureKind = failure?.kind ?? null;
  useEffect(() => {
    if (failureKind === 'rate-limit' || failureKind === 'unavailable') alertRef.current?.focus();
  }, [failureKind]);

  const firstInvalid: FieldKey | null = hasFieldErrors
    ? FIELD_ORDER.find((k) => fieldErrors[k]) ?? null
    : null;
  // Focus moves ONLY when a submit produces errors (client: focusRequest bump; server: a new error
  // identity) - never when errors clear while the buyer is typing. The ref carries the latest first-invalid
  // field without making it an effect dependency.
  const firstInvalidRef = useRef<FieldKey | null>(null);
  useEffect(() => {
    firstInvalidRef.current = firstInvalid;
  });
  const serverError = mutation.error;
  useEffect(() => {
    if (focusRequest === 0 && !serverError) return;
    const key = firstInvalidRef.current;
    if (key) focusFieldClearOfStickyHeader(document.getElementById(`${uid}-${key}`));
  }, [focusRequest, serverError, uid]);

  function collapse() {
    setExpanded(false);
    triggerRef.current?.focus();
  }

  /** Marks the server error of the edited field(s) stale. */
  function dismissServerError(...keys: FieldKey[]) {
    setDismissedServerFields((prev) => {
      if (keys.every((k) => prev.has(k))) return prev;
      return new Set([...prev, ...keys]);
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending || !consent) return;

    const normalizedPhone = normalizePhone(phone);
    const errors: FieldErrors = {};
    if (containsPhoneLikeNumber(requirement)) errors.requirement = PHONE_IN_REQUIREMENT_MESSAGE;
    if (!PHONE_PATTERN.test(normalizedPhone)) errors.phone = 'Enter a phone number with 10 to 14 digits.';
    if (budgetMin && !DIGITS_PATTERN.test(budgetMin)) errors.budgetMin = 'Use digits only.';
    if (budgetMax && !DIGITS_PATTERN.test(budgetMax)) errors.budgetMax = 'Use digits only.';
    setClientErrors(errors);
    if (Object.keys(errors).length > 0) {
      setFocusRequest((n) => n + 1);
      return;
    }

    const payload: CreatePropertyRequestPayload = {
      city: context.city,
      areaKey: context.areaKey,
      areaLabel: context.areaLabel,
      journey: context.journey,
      intent: context.intent,
      phone: normalizedPhone,
      contactVia,
      consent: true,
      consentVersion: PROPERTY_REQUEST_CONSENT_VERSION,
    };
    const trimmed = requirement.trim();
    if (trimmed) payload.requirement = trimmed;
    if (budgetMin) payload.budgetMin = Number(budgetMin);
    if (budgetMax) payload.budgetMax = Number(budgetMax);

    setDismissedServerFields(new Set());
    mutation.mutate(payload);
  }

  const intentLabel = context.intent === 'RENT' ? 'Rent' : 'Buy';
  const formId = id('form');

  if (mutation.isSuccess) {
    return (
      <Card className={cn('rounded-xl border border-border bg-evergreen-tint/60 p-4 text-left', className)}>
        <div role="status">
          <CheckCircle2 className="mb-2 h-5 w-5 text-evergreen" aria-hidden="true" />
          <h3 ref={successHeadingRef} tabIndex={-1} className="text-sm font-semibold text-evergreen outline-none">
            Request received
          </h3>
          <p className="mt-1 text-sm text-foreground">
            We have saved your requirement and will try to match you with a founding broker. This is not a
            guarantee of a call.
          </p>
        </div>
      </Card>
    );
  }

  const describedBy = (key: FieldKey, extra?: string) =>
    [fieldErrors[key] ? id(`${key}-error`) : null, extra].filter(Boolean).join(' ') || undefined;
  const fieldError = (key: FieldKey) =>
    fieldErrors[key] ? (
      <p id={id(`${key}-error`)} className="mt-1 text-xs text-destructive">
        {fieldErrors[key]}
      </p>
    ) : null;

  return (
    <Card
      className={cn('rounded-xl border border-border bg-card p-4 text-left', className)}
      data-testid="request-property-card"
    >
      <h3 className="text-sm font-semibold text-foreground">Can&apos;t find what you need?</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Tell us what you are looking for. We are building a network of founding brokers and will try to match
        your requirement.
      </p>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="lg"
        className="mt-3 w-full"
        aria-expanded={expanded}
        aria-controls={formId}
        onClick={() => setExpanded((v) => !v)}
      >
        Request a property
      </Button>

      {expanded && (
        <form ref={formRef} id={formId} className="mt-4 flex w-full flex-col gap-4" onSubmit={handleSubmit} noValidate aria-busy={isPending}>
          <p className="text-xs text-muted-foreground">{`${intentLabel} · ${context.contextLabel}`}</p>

          <div>
            <Label htmlFor={id('requirement')}>What are you looking for?</Label>
            <Textarea
              id={id('requirement')}
              className="mt-1"
              maxLength={REQUIREMENT_MAX}
              value={requirement}
              onChange={(e) => {
                setRequirement(e.target.value);
                dismissServerError('requirement');
                // The client-side phone-in-requirement error describes the text that was submitted; editing makes it stale.
                setClientErrors((prev) => {
                  if (!prev.requirement) return prev;
                  const next = { ...prev };
                  delete next.requirement;
                  return next;
                });
              }}
              aria-invalid={fieldErrors.requirement ? true : undefined}
              aria-describedby={describedBy('requirement', `${id('requirement-help')} ${id('requirement-count')}`)}
            />
            <div className="mt-1 flex items-start justify-between gap-3">
              <p id={id('requirement-help')} className="text-xs text-muted-foreground">
                Please do not put phone numbers here. Use the phone number field below.
              </p>
              <p id={id('requirement-count')} className="shrink-0 text-right text-xs text-muted-foreground">
                {requirement.length}/{REQUIREMENT_MAX}
              </p>
            </div>
            {fieldError('requirement')}
          </div>

          <fieldset className="min-w-0">
            <legend className="text-sm font-medium text-foreground">Budget (₹)</legend>
            <div className="mt-1 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
              <div>
                <Label htmlFor={id('budgetMin')}>Minimum budget</Label>
                <Input
                  id={id('budgetMin')}
                  className="mt-1 h-11"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={budgetMin}
                  onChange={(e) => {
                    setBudgetMin(e.target.value);
                    // The range message is keyed to the max field; editing either bound makes it stale.
                    dismissServerError('budgetMin', 'budgetMax');
                  }}
                  aria-invalid={fieldErrors.budgetMin ? true : undefined}
                  aria-describedby={describedBy('budgetMin')}
                />
                {fieldError('budgetMin')}
              </div>
              <div>
                <Label htmlFor={id('budgetMax')}>Maximum budget</Label>
                <Input
                  id={id('budgetMax')}
                  className="mt-1 h-11"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={budgetMax}
                  onChange={(e) => {
                    setBudgetMax(e.target.value);
                    dismissServerError('budgetMin', 'budgetMax');
                  }}
                  aria-invalid={fieldErrors.budgetMax ? true : undefined}
                  aria-describedby={describedBy('budgetMax')}
                />
                {fieldError('budgetMax')}
              </div>
            </div>
          </fieldset>

          <div>
            <Label htmlFor={id('phone')}>Phone number</Label>
            <Input
              id={id('phone')}
              className="mt-1 h-11"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                dismissServerError('phone');
              }}
              aria-invalid={fieldErrors.phone ? true : undefined}
              aria-describedby={describedBy('phone', id('phone-help'))}
            />
            <p id={id('phone-help')} className="mt-1 text-xs text-muted-foreground">
              10 digits, with or without +91
            </p>
            {fieldError('phone')}
          </div>

          <div>
            <p id={id('contact-label')} className="text-sm font-medium text-foreground">
              Contact me on
            </p>
            <RadioGroup
              id={id('contactVia')}
              className="mt-1 gap-0"
              aria-labelledby={id('contact-label')}
              value={contactVia}
              onValueChange={(v) => {
                setContactVia(v === 'WHATSAPP' ? 'WHATSAPP' : 'PHONE');
                dismissServerError('contactVia');
              }}
            >
              <label htmlFor={id('via-phone')} className="flex min-h-11 items-center gap-3 text-sm">
                <RadioGroupItem id={id('via-phone')} value="PHONE" />
                Phone call
              </label>
              <label htmlFor={id('via-whatsapp')} className="flex min-h-11 items-center gap-3 text-sm">
                <RadioGroupItem id={id('via-whatsapp')} value="WHATSAPP" />
                WhatsApp
              </label>
            </RadioGroup>
            {fieldError('contactVia')}
          </div>

          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <label htmlFor={id('consent')} className="flex min-h-11 items-start gap-3 text-sm font-medium">
              <Checkbox
                id={id('consent')}
                className="mt-0.5"
                checked={consent}
                onCheckedChange={(v) => {
                  setConsent(v === true);
                  dismissServerError('consent');
                }}
                aria-describedby={describedBy('consent', id('consent-detail'))}
              />
              <span>{CONSENT_LABEL}</span>
            </label>
            <p id={id('consent-detail')} className="mt-1 text-xs text-foreground/80">
              {CONSENT_DETAIL}
              <a
                className="font-medium text-foreground underline underline-offset-2"
                href={`mailto:${PROPERTY_REQUEST_DELETION_EMAIL}`}
              >
                {PROPERTY_REQUEST_DELETION_EMAIL}
              </a>
              .
            </p>
            {fieldError('consent')}
          </div>

          {failure?.kind === 'validation' && (
            <Alert variant="destructive" className="border-destructive/30 bg-destructive/5" ref={alertRef} tabIndex={-1}>
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <div className="text-sm">
                <p>Please fix the highlighted fields.</p>
                {unmappedMessages.length > 0 && (
                  <ul className="mt-1 list-disc pl-4">
                    {unmappedMessages.map((m, i) => (
                      <li key={`${i}-${m}`}>{m}</li>
                    ))}
                  </ul>
                )}
              </div>
            </Alert>
          )}
          {failure?.kind === 'rate-limit' && (
            <Alert variant="destructive" className="border-destructive/30 bg-destructive/5" ref={alertRef} tabIndex={-1}>
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <div className="text-sm">Too many requests from this device or number. Please try again later.</div>
            </Alert>
          )}
          {failure?.kind === 'unavailable' && (
            <Alert variant="destructive" className="border-destructive/30 bg-destructive/5" ref={alertRef} tabIndex={-1}>
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <div className="flex flex-col gap-2 text-sm">
                <span>We could not send your request. Please try again.</span>
                {/* Native submit: goes through handleSubmit (current fields, current consent, pending guard). */}
                <Button type="submit" variant="outline" size="lg" disabled={isPending || !consent}>
                  Retry
                </Button>
                {!consent && (
                  <span className="text-xs text-foreground/80">Tick the consent box above to retry.</span>
                )}
              </div>
            </Alert>
          )}

          <div className="flex flex-col gap-2">
            <Button
              type="submit"
              size="lg"
              disabled={!consent || isPending}
              aria-describedby={!consent ? id('submit-hint') : undefined}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Sending…
                </>
              ) : (
                'Send request'
              )}
            </Button>
            {!consent && (
              <p id={id('submit-hint')} className="text-xs text-muted-foreground">
                Tick the box above to send
              </p>
            )}
            <Button type="button" variant="ghost" size="lg" onClick={collapse} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
