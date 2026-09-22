import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { contactDto, type ContactDto } from '@rango/shared';
import { PublicLayout } from './PublicLayout';
import { PageHero } from '../../components/public/PageHero';
import { PreFooterSection } from '../../components/public/PreFooterSection';
import { Button, Card, CardBody, Input, Textarea, Toast, ToastViewport } from '../../components/ui';
import { ClockIcon, EmailIcon, GlobeIcon, PhoneIcon, SendIcon } from '../../components/ui/icons';
import { sendContactMessage } from '../../api/contact';
import { ApiError } from '../../lib/apiClient';

type ContactFormValues = ContactDto;

const FAQ_ITEMS = [
  {
    question: 'How fast will I hear back?',
    answer: 'We typically reply within 4–6 hours on business days, often sooner during peak season.',
  },
  {
    question: 'Do I need to visit in person?',
    answer: 'Only at handover and return. Enquiries, quotes, and booking requests are all handled remotely first.',
  },
  {
    question: 'What details do you need from me?',
    answer: 'Your name, a way to reach you, and the dates or car you have in mind — an admin takes it from there.',
  },
  {
    question: 'How do I book a car?',
    answer: 'Browse available cars, send a booking request, and an admin will confirm it once everything checks out.',
  },
];

interface ToastMessage {
  id: number;
  variant: 'success' | 'danger';
  text: string;
}

export function ContactPage() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  // Toasts sit bottom-right and auto-dismiss in 6s — easy to miss on mobile
  // (e.g. behind the on-screen keyboard). This inline banner stays in the
  // form itself so the confirmation is unmissable regardless of viewport.
  const [formNotice, setFormNotice] = useState<{ variant: 'success' | 'danger'; text: string } | null>(null);

  function pushToast(variant: ToastMessage['variant'], text: string) {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, variant, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
  }

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormValues>({ resolver: zodResolver(contactDto) });

  const onSubmit = handleSubmit(async (values) => {
    setFormNotice(null);
    try {
      await sendContactMessage(values);
      const text = "Message sent. We'll get back to you within 2-4 hours.";
      pushToast('success', text);
      setFormNotice({ variant: 'success', text });
      reset();
    } catch (error) {
      const message =
        error instanceof ApiError && error.status === 503
          ? 'Email sending is temporarily unavailable. Please call or email us directly.'
          : "Couldn't send your message. Please try again.";
      pushToast('danger', message);
      setFormNotice({ variant: 'danger', text: message });
    }
  });

  return (
    <PublicLayout>
      <PageHero
        eyebrow="Get in touch"
        title="Contact us"
        subcopy="Questions about a car, a booking, or how Rango works — send us a message and an admin will follow up directly."
        backgroundImage="https://res.cloudinary.com/gitn9iob/image/upload/v1789918769/ChatGPT_Image_Sep_20_2026_09_08_53_PM.png"
        content={
          <div className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-lg bg-surface-card px-5 py-4 shadow-lg">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-accent-subtle text-brand-accent">
                <EmailIcon className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="text-caption font-medium uppercase tracking-wide text-neutral-500">Email us</p>
                <p className="text-body-md font-medium text-neutral-900">rangocarrental@gmail.com</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-surface-card px-5 py-4 shadow-lg">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-accent-subtle text-brand-accent">
                <ClockIcon className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="text-caption font-medium uppercase tracking-wide text-neutral-500">Response time</p>
                <p className="text-body-md font-medium text-neutral-900">Within 2-4 hours</p>
              </div>
            </div>
          </div>
        }
      />

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardBody>
              <h2 className="font-display text-heading-md text-neutral-900">Send us a message</h2>
              <p className="mt-1 text-body-sm text-neutral-600">
                Fill out the form below and we'll get back to you as soon as possible.
              </p>
              <p className="mt-1 text-body-sm text-status-danger-fg">* Indicates a required field</p>

              <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit} noValidate>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="Your name"
                    required
                    placeholder="Prince"
                    errorText={errors.name?.message}
                    {...register('name')}
                  />
                  <Input
                    label="Email address"
                    type="email"
                    required
                    placeholder="rangocarrental@gmail.com"
                    errorText={errors.email?.message}
                    {...register('email')}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="Phone number"
                    type="tel"
                    placeholder="+91 98765 43210"
                    helperText="Optional"
                    {...register('phone')}
                  />
                  <Input
                    label="Subject"
                    required
                    placeholder="How can we help?"
                    errorText={errors.subject?.message}
                    {...register('subject')}
                  />
                </div>
                <Textarea
                  label="Message"
                  required
                  rows={5}
                  placeholder="Tell us more about your enquiry…"
                  errorText={errors.message?.message}
                  {...register('message')}
                />

                {formNotice && (
                  <Toast variant={formNotice.variant} onDismiss={() => setFormNotice(null)}>
                    {formNotice.text}
                  </Toast>
                )}

                <Button type="submit" size="lg" isLoading={isSubmitting} className="mt-2 w-full">
                  <SendIcon className="h-4 w-4" />
                  Send message
                </Button>

                <p className="text-center text-body-sm text-neutral-500">
                  By submitting this form, you agree to our{' '}
                  <a href="#" className="text-brand-accent hover:underline">
                    Privacy Policy
                  </a>{' '}
                  and{' '}
                  <a href="#" className="text-brand-accent hover:underline">
                    Terms of Service
                  </a>
                  .
                </p>
              </form>
            </CardBody>
          </Card>

          <Card className="border-none bg-surface-sunken lg:col-span-2">
            <CardBody>
              <h2 className="flex items-center gap-2 font-display text-heading-md text-neutral-900">
                <GlobeIcon className="h-5 w-5 text-brand-accent" />
                Locations
              </h2>
              <p className="mt-2 text-body-sm text-neutral-600">
                Every handover and support call is coordinated from our base here.
              </p>

              <ul className="mt-5 flex flex-col gap-4">
                <li>
                  <p className="text-body-md font-semibold text-neutral-900">India</p>
                  <p className="text-body-sm text-neutral-600">Vadodara, Gujarat</p>
                </li>
              </ul>

              <div className="mt-6 flex flex-col gap-4 border-t border-border pt-5">
                <p className="text-body-sm font-medium text-neutral-700">Other ways to connect</p>
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-card text-brand-accent">
                    <PhoneIcon className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <p className="text-caption font-medium uppercase tracking-wide text-neutral-500">Call us</p>
                    <p className="text-body-md text-neutral-900">+91 91066 18685</p>
                    <p className="text-body-md text-neutral-900">+91 92658 08891</p>
                    <p className="text-body-md text-neutral-900">+91 81600 81473</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-card text-brand-accent">
                    <EmailIcon className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <p className="text-caption font-medium uppercase tracking-wide text-neutral-500">Email support</p>
                    <p className="text-body-md text-neutral-900">rangocarrental@gmail.com</p>
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        <Card className="mt-10">
          <CardBody>
            <h2 className="text-center font-display text-heading-lg text-neutral-900">
              Frequently asked questions
            </h2>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {FAQ_ITEMS.map((item) => (
                <div key={item.question} className="rounded-md bg-surface-sunken p-5">
                  <p className="font-display text-heading-sm text-neutral-900">{item.question}</p>
                  <p className="mt-2 text-body-sm text-neutral-600">{item.answer}</p>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </section>

      <PreFooterSection
        eyebrow="Ready to start"
        heading="Ready when you are"
        body="Browse available cars today and take the first step toward your next rental."
      />

      <ToastViewport>
        {toasts.map((t) => (
          <Toast key={t.id} variant={t.variant} onDismiss={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}>
            {t.text}
          </Toast>
        ))}
      </ToastViewport>
    </PublicLayout>
  );
}
