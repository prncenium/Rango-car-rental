import { zodResolver } from '@hookform/resolvers/zod';
import { registerDto, type RegisterDto } from '@rango/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import * as authApi from '../../api/auth.api';
import { Button, Card, CardBody, Input } from '../../components/ui';
import { useAuthStore } from '../../store/auth.store';
import { AuthLayout } from './AuthLayout';
import { applyApiError } from './useApiFormError';

const FIELDS = ['name', 'email', 'phone', 'password', 'drivingLicenceNumber', 'drivingLicenceExpiryDate'] as const;

export function RegisterPage() {
  const navigate = useNavigate();
  const setUser = useAuthStore((state) => state.setUser);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterDto>({ resolver: zodResolver(registerDto) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await authApi.register(values);
      const me = await authApi.getCurrentUser();
      setUser(me);
      navigate('/');
    } catch (error) {
      setFormError(applyApiError(error, setError, FIELDS));
    }
  });

  return (
    <AuthLayout
      title="Create your account"
      subtitle="You'll need a driving licence on file before you can rent or list a car."
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
              label="Full name"
              autoComplete="name"
              required
              errorText={errors.name?.message}
              {...register('name')}
            />

            <Input
              label="Email"
              type="email"
              autoComplete="email"
              required
              errorText={errors.email?.message}
              {...register('email')}
            />

            <Input
              label="Phone"
              type="tel"
              autoComplete="tel"
              required
              errorText={errors.phone?.message}
              {...register('phone')}
            />

            <Input
              label="Password"
              type="password"
              autoComplete="new-password"
              required
              helperText="At least 12 characters."
              errorText={errors.password?.message}
              {...register('password')}
            />

            <Input
              label="Driving licence number"
              autoComplete="off"
              required
              helperText="We record this as given; it is not verified against any registry."
              errorText={errors.drivingLicenceNumber?.message}
              {...register('drivingLicenceNumber')}
            />

            <Input
              label="Driving licence expiry"
              type="date"
              helperText="Optional."
              errorText={errors.drivingLicenceExpiryDate?.message as string | undefined}
              {...register('drivingLicenceExpiryDate', {
                setValueAs: (value: string) => (value === '' ? undefined : value),
              })}
            />

            <Button type="submit" size="lg" isLoading={isSubmitting} className="w-full">
              Create account
            </Button>
          </form>
        </CardBody>
      </Card>

      <p className="mt-6 text-center text-body-sm text-neutral-600">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-brand-accent hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
