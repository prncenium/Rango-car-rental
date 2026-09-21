import { useState } from 'react';
import { Card, CardBody } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import {
  AlertTriangleIcon,
  CarSilhouetteIcon,
  CheckCircleIcon,
  ClockIcon,
  FuelIcon,
  MinusCircleIcon,
  ShieldCheckIcon,
  XCircleIcon,
} from '../ui/icons';
import { TermsModal } from './TermsModal';

// The key points a renter needs to see before requesting a car, extracted
// from docs/legal/terms-and-conditions.md — not the full text (that's what
// TermsModal is for). Kept as a short, static list here rather than parsed
// out of the .md file at render time: these are the eight points called out
// by name in the brief, not "whatever currently happens to be in the doc,"
// so a future edit to the full T&C doesn't silently reword this summary.
const HIGHLIGHTS: { icon: typeof ShieldCheckIcon; text: string }[] = [
  { icon: ShieldCheckIcon, text: 'A security deposit is required before handover.' },
  { icon: CheckCircleIcon, text: 'The vehicle is inspected before and after the rental.' },
  { icon: FuelIcon, text: 'Fuel must be returned at the agreed level, or the difference is charged.' },
  { icon: ClockIcon, text: 'Each rental day includes 300km. Extra distance is charged at the car’s listed rate.' },
  { icon: ClockIcon, text: 'Late return incurs additional hourly or daily charges.' },
  { icon: XCircleIcon, text: 'No smoking or vaping inside the vehicle.' },
  { icon: CarSilhouetteIcon, text: 'Only the authorized, listed driver may operate the vehicle.' },
  { icon: AlertTriangleIcon, text: 'Driving under the influence is strictly prohibited.' },
  { icon: MinusCircleIcon, text: 'You are responsible for traffic fines, tolls, and challans during the rental.' },
];

export function RentalTermsHighlights() {
  const [termsOpen, setTermsOpen] = useState(false);

  return (
    <section className="mt-8">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-heading-sm text-neutral-900">Rental Terms Highlights</h2>
        <Badge status="neutral">Read before booking</Badge>
      </div>

      <Card className="mt-3">
        <CardBody>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {HIGHLIGHTS.map(({ icon: Icon, text }, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-accent" />
                <span className="text-body-sm text-neutral-700">{text}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 border-t border-border pt-4">
            <Button variant="secondary" size="sm" onClick={() => setTermsOpen(true)}>
              View full Terms &amp; Conditions
            </Button>
          </div>
        </CardBody>
      </Card>

      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    </section>
  );
}
