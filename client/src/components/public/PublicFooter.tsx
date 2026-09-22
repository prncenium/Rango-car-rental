import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TermsModal } from './TermsModal';
import { EmailIcon, MapPinIcon, PhoneIcon } from '../ui/icons';

const linkClass = 'text-body-sm text-neutral-0/70 transition-colors hover:text-neutral-0';

export function PublicFooter() {
  const [termsOpen, setTermsOpen] = useState(false);

  return (
    <footer className="border-t border-neutral-0/10 bg-brand-primary text-neutral-0">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link to="/" className="inline-flex items-center">
              <img src="/logo.png" alt="Rango Car Rental" className="h-9 w-auto" />
            </Link>
            <p className="mt-4 max-w-sm text-body-md text-neutral-0/70">
              Every listing admin-approved. Every handover, in person. No online payment, no
              middleman apps — just a real car and a real person.
            </p>
          </div>

          {/* Explore */}
          <div>
            <h3 className="text-caption font-medium uppercase tracking-wide text-neutral-0/50">
              Explore
            </h3>
            <nav className="mt-4 flex flex-col gap-3">
              <Link to="/" className={linkClass}>
                Home
              </Link>
              <Link to="/cars" className={linkClass}>
                Browse cars
              </Link>
              <Link to="/about" className={linkClass}>
                About us
              </Link>
              <Link to="/about/contact" className={linkClass}>
                Contact us
              </Link>
            </nav>
          </div>

          {/* Account */}
          <div>
            <h3 className="text-caption font-medium uppercase tracking-wide text-neutral-0/50">
              Account
            </h3>
            <nav className="mt-4 flex flex-col gap-3">
              <Link to="/login" className={linkClass}>
                Log in
              </Link>
              <Link to="/register" className={linkClass}>
                Sign up
              </Link>
              <Link to="/account/listings/new" className={linkClass}>
                List your car
              </Link>
            </nav>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-caption font-medium uppercase tracking-wide text-neutral-0/50">
              Legal
            </h3>
            <nav className="mt-4 flex flex-col gap-3">
              <Link to="/legal/terms" className={linkClass}>
                Terms &amp; Conditions
              </Link>
              <Link to="/legal/safety-rules" className={linkClass}>
                Safety rules &amp; guidelines
              </Link>
              <Link to="/legal/privacy" className={linkClass}>
                Privacy Policy
              </Link>
            </nav>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-caption font-medium uppercase tracking-wide text-neutral-0/50">
              Contact
            </h3>
            <div className="mt-4 flex flex-col gap-3 text-body-sm text-neutral-0/70">
              <a href="mailto:rangocarrental@gmail.com" className="flex items-start gap-2 hover:text-neutral-0">
                <EmailIcon className="mt-0.5 h-4 w-4 shrink-0" />
                rangocarrental@gmail.com
              </a>
              <a href="tel:+919106618685" className="flex items-start gap-2 hover:text-neutral-0">
                <PhoneIcon className="mt-0.5 h-4 w-4 shrink-0" />
                +91 91066 18685
              </a>
              <a href="tel:+919265808891" className="flex items-start gap-2 hover:text-neutral-0">
                <PhoneIcon className="mt-0.5 h-4 w-4 shrink-0" />
                +91 92658 08891
              </a>
              <a href="tel:+918160081473" className="flex items-start gap-2 hover:text-neutral-0">
                <PhoneIcon className="mt-0.5 h-4 w-4 shrink-0" />
                +91 81600 81473
              </a>
              <span className="flex items-start gap-2">
                <MapPinIcon className="mt-0.5 h-4 w-4 shrink-0" />
                Pickup &amp; drop-off: Gandhinagar, Ahmedabad, Gujarat
              </span>
            </div>
          </div>
        </div>

        {/* Every rental is governed by the same rules — one line, always
            visible, linking to the exact document a renter already sees
            before requesting (RentalTermsHighlights on Listing Detail) and
            agrees to at request time (BookingRequest's acknowledgement). */}
        <div className="mt-10 flex items-start gap-2 rounded-md bg-neutral-0/5 px-4 py-3 text-body-sm text-neutral-0/70">
          <span>
            Every rental is governed by our{' '}
            <button type="button" onClick={() => setTermsOpen(true)} className="text-brand-accent underline hover:no-underline">
              Terms &amp; Conditions and safety rules
            </button>{' '}
            — deposit, fuel, late-return, and driver-conduct terms apply to every booking.
          </span>
        </div>

        <div className="mt-8 flex flex-col gap-4 border-t border-neutral-0/10 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-caption text-neutral-0/50">
            © {new Date().getFullYear()} Rango Car Rental. All rights reserved.
          </p>
          <p className="text-caption text-neutral-0/50">Built by @prncenium</p>
        </div>
      </div>

      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    </footer>
  );
}
