import { PublicLayout } from './PublicLayout';
import { PageHero } from '../../components/public/PageHero';
import { PreFooterSection } from '../../components/public/PreFooterSection';
import { Card, CardBody } from '../../components/ui';
import {
  BadgePercentIcon,
  CarSilhouetteIcon,
  ClockIcon,
  HandshakeIcon,
  PhoneIcon,
  ShieldCheckIcon,
} from '../../components/ui/icons';

const WHY_CHOOSE_ITEMS = [
  {
    icon: CarSilhouetteIcon,
    title: 'Well-maintained & reliable vehicles',
    body: 'Every car in our fleet is inspected and serviced before it goes back on the road, so what you see is what you drive.',
  },
  {
    icon: ShieldCheckIcon,
    title: 'Safety and comfort at every mile',
    body: 'From tyres to seatbelts, comfort and safety checks are never skipped — your journey matters as much to us as it does to you.',
  },
  {
    icon: BadgePercentIcon,
    title: 'Transparent pricing with clear rental terms',
    body: 'No hidden charges, no surprise deductions — every rate and rule is spelled out before you confirm your booking.',
  },
  {
    icon: HandshakeIcon,
    title: 'Professional and responsive service',
    body: "Real people, not a call centre script. We're direct, prompt, and easy to reach when you need us.",
  },
  {
    icon: ClockIcon,
    title: 'A seamless, hassle-free rental experience',
    body: 'From enquiry to handover to return, every step is designed to be simple — no unnecessary paperwork or waiting around.',
  },
  {
    icon: PhoneIcon,
    title: 'Dedicated customer assistance when you need it',
    body: "Questions mid-trip or after hours? We're a call or message away, every time.",
  },
];

export function AboutUsPage() {
  return (
    <PublicLayout>
      <PageHero
        eyebrow="Greetings from the Rango family"
        title="Welcome to Rango Car Rental"
        subcopy="Your journey. Our journey."
        backgroundImage="https://res.cloudinary.com/im8pkdqg/image/upload/v1790067750/Gemini_Generated_Image_8i5rbn8i5rbn8i5r.png"
        overlayClassName="bg-neutral-900/45"
      />

      <section className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <p className="text-body-lg text-neutral-700">
          We are pleased to welcome you to Rango Car Rental. Thank you for choosing Rango and
          placing your trust in us. We believe every journey should be defined by comfort,
          reliability, safety, and convenience — from the moment you collect your vehicle to the
          moment you complete your journey.
        </p>
        <p className="mt-5 text-body-lg text-neutral-700">
          Whether you are travelling for business, planning a family getaway, exploring a new
          destination, or setting out on a spontaneous road adventure, our aim is to ensure you
          experience the freedom of the road with complete peace of mind.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="text-center">
          <p className="text-caption font-medium uppercase tracking-wide text-brand-accent">
            Our commitment
          </p>
          <h2 className="mt-2 font-display text-display-md text-neutral-900">Why choose Rango?</h2>
          <p className="mx-auto mt-3 max-w-2xl text-body-lg text-neutral-600">
            At Rango, we are committed to delivering a rental experience built around quality,
            transparency, and customer care.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {WHY_CHOOSE_ITEMS.map((item) => (
            <Card key={item.title} className="h-full">
              <CardBody>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-accent-subtle text-brand-accent">
                  <item.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-display text-heading-sm text-neutral-900">{item.title}</h3>
                <p className="mt-2 text-body-sm text-neutral-600">{item.body}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-surface-sunken">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <p className="text-body-lg text-neutral-700">
            We understand that a vehicle is more than just transportation — it is part of your
            journey. That is why we take every booking seriously and strive to maintain the
            standards our customers deserve.
          </p>
          <p className="mt-5 font-display text-heading-sm text-brand-primary">
            Your journey is our journey.
          </p>
          <p className="mt-5 text-body-lg text-neutral-700">
            We sincerely appreciate your choosing Rango Car Rental and look forward to being part
            of your next adventure.
          </p>
          <p className="mt-8 text-heading-sm font-display text-neutral-900">
            Your only job? Buckle up, choose your playlist, and enjoy the ride.
          </p>
          <p className="mt-6 font-display text-heading-md text-brand-accent">Welcome to Rango.</p>
        </div>
      </section>

      <PreFooterSection
        eyebrow="Ready to start"
        heading="Ready when you are"
        body="Browse available cars today and take the first step toward your next adventure with Rango."
      />
    </PublicLayout>
  );
}
