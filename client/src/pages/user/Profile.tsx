import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getProfile, updateProfile } from '../../api/profile';
import { ApiError } from '../../lib/apiClient';
import { AccountShell } from '../../components/account/AccountShell';
import { Button, Card, CardBody, Input } from '../../components/ui';

export function ProfilePage() {
  return (
    <AccountShell>
      <Profile />
    </AccountShell>
  );
}

function Profile() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['own-profile'], queryFn: getProfile });

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ name?: string | undefined; phone?: string | undefined }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (query.data) {
      setName(query.data.name);
      setPhone(query.data.phone);
    }
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: () => updateProfile({ name, phone }),
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
    mutation.mutate();
  }

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <div className="h-8 w-40 animate-pulse rounded-sm bg-surface-sunken" />
        <div className="h-64 animate-pulse rounded-lg bg-surface-sunken" />
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
  const dirty = name !== profile.name || phone !== profile.phone;

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-display text-display-md text-neutral-900">Profile</h1>

      <Card className="mt-6">
        <CardBody>
          <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
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

            <Input
              label="Name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              errorText={fieldErrors.name}
            />

            <Input
              label="Email"
              value={profile.email}
              disabled
              helperText="Email can't be changed here — contact support if you need it updated."
            />

            <Input
              label="Phone"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              errorText={fieldErrors.phone}
            />

            <Input
              label="Driving licence number"
              value={profile.drivingLicence.number}
              disabled
              helperText="We don't verify this — an admin may check it against your physical licence when you pick up a car. It isn't editable here yet."
            />

            <div className="flex justify-end">
              <Button type="submit" isLoading={mutation.isPending} disabled={!dirty}>
                Save changes
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
