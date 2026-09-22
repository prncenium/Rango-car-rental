import { PublicLayout } from './PublicLayout';
import { Card, CardBody } from '../../components/ui';

const SECTIONS: { heading: string; body: React.ReactNode }[] = [
  {
    heading: 'What this policy covers',
    body: (
      <p>
        This policy explains what information Rango Car Rental collects through this website,
        why we collect it, and how it's used. It applies to visitors, renters, and car owners
        using rango-car-rental-client.vercel.app and its account/booking features.
      </p>
    ),
  },
  {
    heading: 'Information we collect',
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <span className="font-semibold text-neutral-800">Account details</span> — name, email,
          phone number, and driving licence number, provided when you register or list a car.
        </li>
        <li>
          <span className="font-semibold text-neutral-800">Listing & booking details</span> —
          information about a car you list (make, model, photos, location, pricing) or a booking
          you request (dates, pickup city, message to the admin).
        </li>
        <li>
          <span className="font-semibold text-neutral-800">Contact form submissions</span> — name,
          email, phone (optional), and your message, when you write to us.
        </li>
        <li>
          <span className="font-semibold text-neutral-800">Session cookies</span> — small
          identifiers (<code className="text-mono-sm">rgo_at</code>,{' '}
          <code className="text-mono-sm">rgo_rt</code>, <code className="text-mono-sm">rgo_csrf</code>)
          that keep you signed in and protect your account from cross-site request forgery. These
          are functional only — never used for advertising or cross-site tracking.
        </li>
      </ul>
    ),
  },
  {
    heading: 'What we don’t collect',
    body: (
      <p>
        Rango has no online payment gateway — every rental is paid for offline, in person. We
        never collect or store card numbers, UPI details, or other payment credentials through
        this site.
      </p>
    ),
  },
  {
    heading: 'How we use your information',
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>To create and manage your account, listings, and booking requests.</li>
        <li>
          So an admin can review and approve a listing or booking before it goes live — nothing is
          publicly visible until it's approved.
        </li>
        <li>To verify driving licence details before confirming a rental.</li>
        <li>To respond to enquiries sent through the contact form.</li>
        <li>To keep the platform secure and prevent misuse of accounts.</li>
      </ul>
    ),
  },
  {
    heading: 'Who we share it with',
    body: (
      <p>
        We don't sell your information. It's visible to Rango admins (to approve listings/bookings
        and coordinate handovers) and to the service providers that run the platform on our
        behalf: our hosting and database providers, Cloudinary (for storing car photos), and our
        email provider (for sending contact-form replies and account notifications). These
        providers only process data to deliver the service — they don't use it for their own
        marketing.
      </p>
    ),
  },
  {
    heading: 'How long we keep it',
    body: (
      <p>
        We retain account, listing, and booking records for as long as your account is active and
        for a reasonable period afterward, mainly to resolve disputes about a past rental (deposit,
        damage, or charge questions). You can ask us to delete your account and personal data at
        any time — see "Contact us" below.
      </p>
    ),
  },
  {
    heading: 'Your choices',
    body: (
      <p>
        You can review and update your profile details from your account settings at any time,
        and you can request a copy or deletion of your data by emailing us. Declining to provide
        certain details (like a driving licence number) may mean we can't confirm a booking, since
        admin approval depends on that information.
      </p>
    ),
  },
  {
    heading: 'Changes to this policy',
    body: (
      <p>
        If this policy changes in a meaningful way, we'll update the date below and, where
        appropriate, let registered users know.
      </p>
    ),
  },
  {
    heading: 'Contact us',
    body: (
      <p>
        Questions about this policy or your data? Email{' '}
        <a href="mailto:rangocarrental@gmail.com" className="text-brand-accent hover:underline">
          rangocarrental@gmail.com
        </a>{' '}
        or use the{' '}
        <a href="/about/contact" className="text-brand-accent hover:underline">
          contact form
        </a>
        .
      </p>
    ),
  },
];

export function PrivacyPolicyPage() {
  return (
    <PublicLayout>
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <p className="text-caption font-medium uppercase tracking-wide text-brand-accent">Legal</p>
        <h1 className="mt-2 font-display text-display-md text-neutral-900">Privacy policy</h1>
        <p className="mt-3 text-body-md text-neutral-600">Last updated: 22 September 2026.</p>

        <Card className="mt-8">
          <CardBody>
            <div className="flex flex-col gap-6">
              {SECTIONS.map((section) => (
                <div key={section.heading}>
                  <h2 className="font-display text-heading-sm text-neutral-900">{section.heading}</h2>
                  <div className="mt-2 text-body-sm text-neutral-700">{section.body}</div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </section>
    </PublicLayout>
  );
}
