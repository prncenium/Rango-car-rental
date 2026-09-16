/**
 * Renders a rental price preview — days × rentalPricePerDay.
 *
 * Spec 04 §2.2 defines a fuller blended weekly-rate formula (min of
 * blended/straight/rounded-up totals when a car has a weekly rate), but
 * neither the server's requestBooking() nor the public car endpoints
 * implement or expose rentalPricePerWeek yet (see client/src/api/cars.ts).
 * This preview intentionally mirrors the server's actual, simpler
 * calculation — showing the fuller formula here would produce a preview
 * that could disagree with the authoritative server total, which spec 05
 * §3.4 explicitly warns against.
 *
 * Every figure here is a quote, never a charge (spec 05 §7 rule 3).
 */
export interface PriceQuoteProps {
  ratePerDay: number;
  days: number;
}

export function computeQuoteTotal(ratePerDay: number, days: number): number {
  return ratePerDay * days;
}

export function PriceQuote({ ratePerDay, days }: PriceQuoteProps) {
  const total = computeQuoteTotal(ratePerDay, days);

  return (
    <div className="flex flex-col gap-1.5 text-body-sm">
      <div className="flex items-center justify-between text-neutral-600">
        <span>
          ₹{ratePerDay.toLocaleString('en-IN')} × {days} day{days === 1 ? '' : 's'}
        </span>
        <span>₹{total.toLocaleString('en-IN')}</span>
      </div>
      <div className="flex items-center justify-between border-t border-border pt-1.5 font-medium text-neutral-900">
        <span>Estimated total</span>
        <span>₹{total.toLocaleString('en-IN')}</span>
      </div>
      <p className="text-caption text-neutral-500">
        This is an estimate, not a charge. The confirmed total is set when an admin reviews your request.
      </p>
    </div>
  );
}
