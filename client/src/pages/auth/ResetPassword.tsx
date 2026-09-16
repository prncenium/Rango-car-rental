import { zodResolver } from '@hookform/resolvers/zod';
import { redeemPasswordResetDto, type RedeemPasswordResetDto } from '@rango/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as authApi from '../../api/auth.api';
import { Button, Card, CardBody, Input } from '../../components/ui';
import { AuthLayout } from './AuthLayout';
import { applyApiError } from './useApiFormError';

const FIELDS = ['token', 'newPassword'] as const;

// spec 03 §6.5 — there is no self-service "forgot password" request step in
// this platform (no email/SMS transport exists). An admin verifies the user
// out of band and hands them a one-time token (E-66); this page only
// redeems it (E-75). A ?token= query param lets that token be handed over as
// a link rather than retyped.
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RedeemPasswordResetDto>({
    resolver: zodResolver(redeemPasswordResetDto),
    defaultValues: { token: searchParams.get('token') ?? '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await authApi.redeemPasswordReset(values);
      setSucceeded(true);
    } catch (error) {
      setFormError(applyApiError(error, setError, FIELDS));
    }
  });

  if (succeeded) {
    return (
      <AuthLayout title="Password reset" subtitle="Your password has been changed.">
        <Card>
          <CardBody className="flex flex-col gap-4">
            <p className="text-body-md text-neutral-700">
              Every other session on your account has been signed out. Sign in with your new
              password to continue.
            </p>
            <Button size="lg" className="w-full" onClick={() => navigate('/login')}>
              Go to sign in
            </Button>
          </CardBody>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="There's no self-service email reset on Rango — an admin verifies you out of band and gives you a one-time token to paste in below."
    >
      <Card>
        <CardBody>
          <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
            {formError && (
              <p role="alert" className="text-body-sm text-status-danger-fg">
                {formError}
              </p>
            )}

            <Input
              label="Reset token"
              autoComplete="off"
              required
              helperText="Given to you by an admin."
              errorText={errors.token?.message}
              {...register('token')}
            />

            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              required
              helperText="At least 12 characters."
              errorText={errors.newPassword?.message}
              {...register('newPassword')}
            />

            <Button type="submit" size="lg" isLoading={isSubmitting} className="w-full">
              Reset password
            </Button>
          </form>
        </CardBody>
      </Card>

      <p className="mt-6 text-center text-body-sm text-neutral-600">
        Remembered it after all?{' '}
        <Link to="/login" className="font-medium text-brand-accent hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
