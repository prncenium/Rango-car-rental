import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getPublicAvailability, getPublicCarDetail } from '../../api/cars';
import { downloadOwnBookingAgreement, requestBooking, type RequestedBooking } from '../../api/bookings';
import { getCurrentUser } from '../../api/auth.api';
import { ApiError } from '../../lib/apiClient';
import { PublicLayout } from './PublicLayout';
import { AvailabilityCalendar } from '../../components/public/AvailabilityCalendar';
import { EmptyState } from '../../components/public/EmptyState';
import { PriceQuote } from '../../components/public/PriceQuote';
import { TermsModal } from '../../components/public/TermsModal';
import { Badge, Button } from '../../components/ui';
import { useAuthStore } from '../../store/auth.store';
import { addDaysIso, addMonthsIso, diffDays, monthStartIso, todayIso } from '../../lib/dateUtc';

const MAX_BOOKING_DURATION_DAYS = 90; // spec 04 guardDateRangeValid default (no client-facing config endpoint to read this from)

function currentMonthStart(): string {
  const t = todayIso();
  return monthStartIso(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1);
}

// Guard-failure -> human copy, per spec 05 §3.4's table, extended with the
// guards server/src/services/booking.service.ts's requestBooking() actually
// implements beyond the spec's own list (spec 05 §7 rule 9: never a raw code).
function guardCopy(error: ApiError): string {
  const details = (error.details ?? {}) as { guard?: string; rule?: string; bookingId?: string };

  if (error.status === 404) {
    return "This car is no longer available to book.";
  }
  if (details.guard === 'guardNotOwnRental') {
    return "You can't book your own listing.";
  }
  if (details.guard === 'guardDateRangeValid') {
    if (details.rule === 'START_NOT_PAST') return "Start date can't be in the past.";
    if (details.rule === 'MAX_DURATION') return `Bookings can't be longer than ${MAX_BOOKING_DURATION_DAYS} days.`;
    if (details.rule === 'MAX_ADVANCE') return 'Start date is too far in the future.';
    return 'End date must be after start date.';
  }
  if (details.guard === 'guardNoExistingRequestForRange') {
    return 'You already have a request or booking covering these dates for this car.';
  }
  if (details.guard === 'guardOpenRequestCap') {
    return "You have too many open requests right now. Wait for one to be reviewed before sending another.";
  }
  if (details.guard === 'guardNoUnresolvedNoShow') {
    return 'An unresolved no-show on your account is blocking new requests.';
  }
  if (details.guard === 'guardNoOverdueRental') {
    return 'An overdue rental on your account is blocking new requests.';
  }
  if (details.guard === 'guardNoOverlappingRentalAnyCar') {
    return 'You already hold a confirmed or active rental during these dates.';
  }
  if (error.code === 'VALIDATION_FAILED') {
    return 'Please check the dates and try again.';
  }
  return 'Something went wrong sending your request. Please try again.';
}

export function BookingRequestPage() {
  const { carId } = useParams<{ carId: string }>();
  const navigate = useNavigate();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const clear = useAuthStore((state) => state.clear);

  const [visibleMonth, setVisibleMonth] = useState(currentMonthStart());
  const [selectedStart, setSelectedStart] = useState<string | undefined>(undefined);
  const [selectedEnd, setSelectedEnd] = useState<string | undefined>(undefined);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  // Resolve 'unknown' session state once, so a page refresh doesn't bounce an
  // authenticated user to /login before their session has had a chance to
  // resolve (spec 05 §1's redirect rule is a client convenience, not the
  // real gate — the server re-checks regardless).
  useEffect(() => {
    if (status !== 'unknown') return;
    getCurrentUser()
      .then(setUser)
      .catch(() => clear());
  }, [status, setUser, clear]);

  useEffect(() => {
    if (status === 'guest' && carId) {
      navigate(`/login?next=/cars/${carId}/request`, { replace: true });
    }
  }, [status, carId, navigate]);

  const carQuery = useQuery({
    queryKey: ['public-car', carId],
    queryFn: () => getPublicCarDetail(carId!),
    enabled: Boolean(carId) && status === 'authenticated',
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 404) && failureCount < 2,
  });

  const availabilityQuery = useQuery({
    queryKey: ['car-availability', carId, visibleMonth],
    queryFn: () => getPublicAvailability(carId!, visibleMonth, addMonthsIso(visibleMonth, 1)),
    enabled: Boolean(carId) && carQuery.isSuccess,
  });

  const mutation = useMutation({
    mutationFn: () =>
      requestBooking({
        carId: carId!,
        startDate: selectedStart!,
        endDate: addDaysIso(selectedEnd!, 1),
        agreedToTerms: true,
      }),
    onError: (error) => {
      setSubmitError(error instanceof ApiError ? guardCopy(error) : 'Something went wrong. Please try again.');
    },
  });

  if (status !== 'authenticated') {
    return null;
  }

  const is404 = carQuery.error instanceof ApiError && carQuery.error.status === 404;
  const blockedDays = new Set(availabilityQuery.data?.blockedDays ?? []);
  const today = todayIso();
  const maxSelectableIso = addDaysIso(today, 365); // matches server's default maxAdvanceDays fallback

  const endDateForApi = selectedStart && selectedEnd ? addDaysIso(selectedEnd, 1) : undefined;
  const days = selectedStart && endDateForApi ? diffDays(selectedStart, endDateForApi) : 0;
  const withinMaxDuration = days > 0 && days <= MAX_BOOKING_DURATION_DAYS;

  if (is404) {
    return (
      <PublicLayout>
        <div className="mx-auto max-w-2xl px-4 py-24 sm:px-6 lg:px-8">
          <EmptyState
            title="This car is no longer available to book"
            description="It may have been delisted since you last viewed it."
            action={{ label: 'Back to search', onClick: () => navigate('/cars') }}
          />
        </div>
      </PublicLayout>
    );
  }

  if (carQuery.isError) {
    return (
      <PublicLayout>
        <div className="mx-auto max-w-2xl px-4 py-24 sm:px-6 lg:px-8">
          <EmptyState
            title="Couldn't load this listing"
            description="Something went wrong reaching the server. Please try again shortly."
            action={{ label: 'Retry', onClick: () => carQuery.refetch() }}
          />
        </div>
      </PublicLayout>
    );
  }

  if (carQuery.isLoading || !carQuery.data) {
    return (
      <PublicLayout>
        <div className="mx-auto max-w-4xl animate-pulse space-y-4 px-4 py-10 sm:px-6 lg:px-8">
          <div className="h-8 w-2/3 rounded-sm bg-surface-sunken" />
          <div className="h-64 w-full rounded-lg bg-surface-sunken" />
        </div>
      </PublicLayout>
    );
  }

  const car = carQuery.data;

  if (mutation.isSuccess) {
    return (
      <PublicLayout>
        <SuccessPanel booking={mutation.data} carLabel={`${car.make} ${car.model}`} />
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="font-display text-heading-lg text-neutral-900">
          Request to book — {car.make} {car.model}
        </h1>

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
          {/* Date selection */}
          <div className="rounded-lg border border-border bg-surface-card p-5">
            <h2 className="text-body-sm font-medium text-neutral-700">Choose your dates</h2>
            <p className="mt-1 text-caption text-neutral-500">
              Pick your first day, then your last day. Unavailable days can't be selected.
            </p>
            <div className="mt-3">
              <AvailabilityCalendar
                mode="selectable"
                visibleMonth={visibleMonth}
                onVisibleMonthChange={setVisibleMonth}
                blockedDays={blockedDays}
                todayIsoValue={today}
                minSelectableIso={today}
                maxSelectableIso={maxSelectableIso}
                selectedStart={selectedStart}
                selectedEnd={selectedEnd}
                onSelect={(start, end) => {
                  setSelectedStart(start);
                  setSelectedEnd(end);
                  setSubmitError(null);
                }}
              />
            </div>
            {selectedStart && selectedEnd && !withinMaxDuration && (
              <p role="alert" className="mt-3 text-body-sm text-status-danger-fg">
                Bookings can't be longer than {MAX_BOOKING_DURATION_DAYS} days. Pick a shorter range.
              </p>
            )}
          </div>

          {/* Quote preview / confirm */}
          <div className="h-fit rounded-lg border border-border bg-surface-card p-5 lg:sticky lg:top-24">
            {selectedStart && selectedEnd ? (
              <>
                <p className="text-body-sm text-neutral-700">
                  {selectedStart} → {selectedEnd} ({days} day{days === 1 ? '' : 's'})
                </p>
                <div className="mt-3">
                  <PriceQuote ratePerDay={car.rentalPricePerDay} days={days} extraKmRatePerKm={car.extraKmRatePerKm} />
                </div>
              </>
            ) : (
              <p className="text-body-sm text-neutral-500">Select your dates to see a price estimate.</p>
            )}

            <div className="mt-4 rounded-sm bg-status-pending-bg px-3 py-2.5 text-body-sm text-status-pending-fg">
              This is a request, not a reservation. You'll be contacted to confirm in person.
            </div>

            {submitError && (
              <p role="alert" className="mt-3 text-body-sm text-status-danger-fg">
                {submitError}
              </p>
            )}

            <Button
              variant="primary"
              size="lg"
              className="mt-4 w-full"
              disabled={!selectedStart || !selectedEnd || !withinMaxDuration || !agreedToTerms || mutation.isPending}
              isLoading={mutation.isPending}
              onClick={() => {
                setSubmitError(null);
                mutation.mutate();
              }}
            >
              Send request
            </Button>
          </div>
        </div>

        {/* Customer acknowledgement — same fields/wording as the printed
            rental agreement's acknowledgement section (docs/legal/terms-and-conditions.md),
            shown here as a review step rather than a form to type into: every
            field that already has a value is auto-filled and read-only,
            never re-collected from the renter (spec 04 D10-style rule — this
            page still only ever sends carId/startDate/endDate/agreedToTerms).
            Registration number and the three godown-signed fields aren't
            knowable yet, exactly like the rest of this app defers disclosure
            until there is a real booking (spec 04 §4's godown-mediated model). */}
        {selectedStart && selectedEnd && (
          <div className="mt-8 rounded-lg border border-border bg-surface-card p-5">
            <h2 className="font-display text-heading-sm text-neutral-900">Customer acknowledgement</h2>
            <p className="mt-2 text-body-sm text-neutral-600">
              I confirm that I have read and understood the Safety Rules, Guidelines, and Terms &amp; Conditions. I
              agree to take reasonable care of the vehicle and accept responsibility for applicable charges,
              damages, fines, penalties, or other costs arising from my use of the vehicle, as specified in the
              rental agreement and subject to applicable law.
            </p>

            <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-body-sm sm:grid-cols-2">
              <AckField label="Customer Name" value={user?.name} />
              <AckField label="Mobile Number" value={user?.phone} />
              <AckField label="Driving Licence No." value={user?.drivingLicence.numberMasked} mono />
              <AckField label="Vehicle Registration No." value="Provided once your request is confirmed" muted />
              <AckField label="Rental Start Date" value={selectedStart} />
              <AckField label="Rental Return Date" value={selectedEnd} />
              <AckField label="Security Deposit" value={`₹${car.depositAmount.toLocaleString('en-IN')}`} />
              <AckField label="Customer Signature" value="Signed physically at godown handover" muted />
              <AckField label="Rental Company Representative" value="Signed physically at godown handover" muted />
              <AckField label="Date" value="Filled in at godown handover" muted />
            </dl>

            <label className="mt-5 flex items-start gap-2 border-t border-border pt-4 text-body-sm text-neutral-700">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border-border-strong text-brand-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-2"
              />
              <span>
                I have read and agree to the above acknowledgement and the full{' '}
                <button
                  type="button"
                  onClick={() => setTermsOpen(true)}
                  className="text-brand-accent underline hover:no-underline"
                >
                  Terms &amp; Conditions
                </button>
                .
              </span>
            </label>
          </div>
        )}

        {/* What happens next */}
        <div className="mt-8 rounded-lg border border-border bg-surface-card p-5">
          <h2 className="font-display text-heading-sm text-neutral-900">What happens next</h2>
          <ol className="mt-3 space-y-2 text-body-sm text-neutral-600">
            <li>1. The owner and an admin review your request.</li>
            <li>2. If confirmed, you'll see our godown pickup location and instructions here.</li>
            <li>3. You collect the car at the godown, inspect it, and pay directly — no online payment.</li>
          </ol>
        </div>
      </div>

      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    </PublicLayout>
  );
}

function AckField({
  label,
  value,
  mono,
  muted,
}: {
  label: string;
  value: string | undefined;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <div>
      <dt className="text-caption uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd
        className={
          muted
            ? 'text-body-sm italic text-neutral-400'
            : mono
              ? 'font-mono text-mono-sm text-neutral-800'
              : 'text-body-sm text-neutral-800'
        }
      >
        {value ?? '—'}
      </dd>
    </div>
  );
}

function SuccessPanel({ booking, carLabel }: { booking: RequestedBooking; carLabel: string }) {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadOwnBookingAgreement(booking._id);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="rounded-lg border border-border bg-surface-card p-8 text-center">
        <div className="flex justify-center">
          <Badge status="pending">Requested</Badge>
        </div>
        <h1 className="mt-4 font-display text-heading-md text-neutral-900">Request sent</h1>
        <p className="mt-2 text-body-md text-neutral-600">
          Your request for {carLabel} ({booking.startDate} → {booking.endDate}) has been sent. This is a request,
          not a confirmed booking — an admin still needs to review it. You'll be contacted to confirm in person;
          nothing is charged or finalized online.
        </p>
        <p className="mt-4 text-body-sm text-neutral-500">
          Estimated total: ₹{booking.totalAmount.toLocaleString('en-IN')} for {booking.days} day
          {booking.days === 1 ? '' : 's'}
        </p>

        {/* Available immediately — all the fields it needs (profile, car,
            dates, deposit, the acknowledgement just agreed to) already exist
            at REQUESTED; only the signature/rep/date lines stay blank until
            godown handover. */}
        <Button variant="secondary" className="mt-6" isLoading={downloading} onClick={handleDownload}>
          Download Rental Agreement (PDF)
        </Button>

        <div>
          <Link to="/cars" className="mt-4 inline-block">
            <Button variant="ghost">Browse more cars</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
