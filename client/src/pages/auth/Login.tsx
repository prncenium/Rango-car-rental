import { zodResolver } from '@hookform/resolvers/zod';
import { loginDto, type LoginDto } from '@rango/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import * as authApi from '../../api/auth.api';
import { Button, Card, CardBody, Input } from '../../components/ui';
import { useAuthStore } from '../../store/auth.store';
import { AuthLayout } from './AuthLayout';
import { applyApiError } from './useApiFormError';

const FIELDS = ['email', 'password'] as const;

export function LoginPage() {
  const navigate = useNavigate();
  const setUser = useAuthStore((state) => state.setUser);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginDto>({ resolver: zodResolver(loginDto) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await authApi.login(values);
      const me = await authApi.getCurrentUser();
      setUser(me);
      navigate('/');
    } catch (error) {
      setFormError(applyApiError(error, setError, FIELDS));
    }
  });

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to manage your bookings and listings.">
      <Card>
        <CardBody>
          <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
            {formError && (
              <p role="alert" className="text-body-sm text-status-danger-fg">
                {formError}
              </p>
            )}

            <Input
              label="Email"
              type="email"
              autoComplete="email"
              required
              errorText={errors.email?.message}
              {...register('email')}
            />

            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              errorText={errors.password?.message}
              {...register('password')}
            />

            <div className="flex justify-end">
              <Link to="/reset-password" className="text-body-sm text-brand-accent hover:underline">
                Forgot password?
              </Link>
            </div>

            <Button type="submit" size="lg" isLoading={isSubmitting} className="w-full">
              Sign in
            </Button>
          </form>
        </CardBody>
      </Card>

      <p className="mt-6 text-center text-body-sm text-neutral-600">
        Don&apos;t have an account?{' '}
        <Link to="/register" className="font-medium text-brand-accent hover:underline">
          Register
        </Link>
      </p>
    </AuthLayout>
  );
}
