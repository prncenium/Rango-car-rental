import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getProfile, updateProfile } from '../../api/profile';
import { ApiError } from '../../lib/apiClient';
import { AccountShell } from '../../components/account/AccountShell';
import { Avatar, Badge, Button, Card, CardBody, Input } from '../../components/ui';

export function ProfilePage() {
  return (
    <AccountShell>
      <Profile />
    </AccountShell>
  );
}

function formatMemberSince(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function Profile() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['own-profile'], queryFn: getProfile });

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [licenceNumber, setLicenceNumber] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string | undefined;
    phone?: string | undefined;
    drivingLicenceNumber?: string | undefined;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (query.data) {
      setName(query.data.name);
      setPhone(query.data.phone);
      setLicenceNumber(query.data.drivingLicence.number);
    }
  }, [query.data]);

  // spec 05 §3.8 — 8-20 chars, [A-Z0-9- ], uppercased on blur to match server
  // normalization (spec 03 §5.4). Client-side pre-check only; the server is
  // authoritative.
  const LICENCE_PATTERN = /^[A-Z0-9- ]{8,20}$/;

  const mutation = useMutation({
    mutationFn: () =>
      updateProfile({
        name,
        phone,
        drivingLicenceNumber: licenceNumber.trim().toUpperCase(),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['own-profile'], updated);
      setFieldErrors({});
      setFormError(null);
      setSaved(true);
    },
    onError: (error) => {
      setSaved(false);
      if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') {
        const details = error.details as { fieldErrors?: Record<string, string[]> } | undefined;
        setFieldErrors({
          name: details?.fieldErrors?.name?.[0],
          phone: details?.fieldErrors?.phone?.[0],
          drivingLicenceNumber: details?.fieldErrors?.drivingLicenceNumber?.[0],
        });
        setFormError('Please fix the highlighted fields.');
        return;
      }
      if (error instanceof ApiError && error.code === 'CONFLICT') {
        setFieldErrors({ phone: error.message });
        setFormError('Please fix the highlighted fields.');
        return;
      }
      setFormError(error instanceof ApiError ? error.message : 'Something went wrong. Please try again.');
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    setFormError(null);
    setFieldErrors({});
    if (!LICENCE_PATTERN.test(licenceNumber.trim().toUpperCase())) {
      setFieldErrors({ drivingLicenceNumber: 'Must be 8-20 characters: letters, digits, hyphens, and spaces only.' });
      setFormError('Please fix the highlighted fields.');
      return;
    }
    mutation.mutate();
  }

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="h-8 w-40 animate-pulse rounded-sm bg-surface-sunken" />
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
          <div className="h-48 animate-pulse rounded-lg bg-surface-sunken" />
          <div className="h-96 animate-pulse rounded-lg bg-surface-sunken" />
        </div>
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="mx-auto max-w-xl">
        <p className="text-body-md text-status-danger-fg">Couldn't load your profile. Please try again shortly.</p>
        <Button variant="secondary" className="mt-3" onClick={() => query.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const profile = query.data;
  const dirty =
    name !== profile.name ||
    phone !== profile.phone ||
    licenceNumber.trim().toUpperCase() !== profile.drivingLicence.number;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-display-md text-neutral-900">Profile</h1>
      <p className="mt-1 text-body-md text-neutral-600">Your account details and driving licence on file.</p>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        {/* Summary card */}
        <Card className="h-fit">
          <CardBody className="flex flex-col items-center text-center">
            <Avatar name={profile.name} size="lg" />
            <p className="mt-4 text-body-md font-semibold text-neutral-900">{profile.name}</p>
            <p className="mt-1 break-all text-body-sm text-neutral-500">{profile.email}</p>
            <Badge status={profile.isActive ? 'success' : 'inactive'} className="mt-3">
              {profile.isActive ? 'Active account' : 'Deactivated'}
            </Badge>
            <div className="mt-5 w-full border-t border-border pt-4 text-left">
              <p className="text-caption uppercase tracking-wide text-neutral-500">Member since</p>
              <p className="mt-1 text-body-sm text-neutral-800">{formatMemberSince(profile.createdAt)}</p>
            </div>
          </CardBody>
        </Card>

        {/* Edit form */}
        <Card className="h-fit">
          <CardBody>
            <h2 className="font-display text-heading-sm text-neutral-900">Account details</h2>
            <form className="mt-4 flex flex-col gap-4" onSubmit={onSubmit} noValidate>
              {formError && (
                <p role="alert" className="text-body-sm text-status-danger-fg">
                  {formError}
                </p>
              )}
              {saved && !formError && (
                <p role="status" className="text-body-sm text-status-success-fg">
                  Saved.
                </p>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  errorText={fieldErrors.name}
                />
                <Input
                  label="Phone"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  errorText={fieldErrors.phone}
                />
              </div>

              <Input
                label="Email"
                value={profile.email}
                disabled
                helperText="Email can't be changed here — contact support if you need it updated."
              />

              <Input
                label="Driving licence number"
                required
                value={licenceNumber}
                onChange={(e) => setLicenceNumber(e.target.value)}
                onBlur={(e) => setLicenceNumber(e.target.value.trim().toUpperCase())}
                errorText={fieldErrors.drivingLicenceNumber}
                helperText="We don't verify this — an admin may check it against your physical licence when you pick up a car."
              />

              <div className="flex justify-end border-t border-border pt-4">
                <Button type="submit" isLoading={mutation.isPending} disabled={!dirty}>
                  Save changes
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
