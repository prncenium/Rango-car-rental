import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { UseFormRegister } from 'react-hook-form';
import type { z } from 'zod';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CAR_FUEL_TYPES,
  CAR_TRANSMISSIONS,
  createCarDto,
  updateCarDto,
  type CreateCarDto,
  type UpdateCarDto,
} from '@rango/shared';
import { createListing, getOwnListing, submitListing, updateListing } from '../../api/listings';
import { ApiError } from '../../lib/apiClient';
import { AccountShell } from '../../components/account/AccountShell';
import { PhotoUploader } from '../../components/account/PhotoUploader';
import { Button, Card, CardBody, Input, Select, Textarea } from '../../components/ui';
import { carModerationMeta } from '../../lib/statusMeta';
import { applyApiError } from '../auth/useApiFormError';

const FUEL_LABELS: Record<(typeof CAR_FUEL_TYPES)[number], string> = {
  PETROL: 'Petrol',
  DIESEL: 'Diesel',
  ELECTRIC: 'Electric',
  HYBRID: 'Hybrid',
  CNG: 'CNG',
};

const CREATE_FIELDS = [
  'make',
  'model',
  'year',
  'registrationNumber',
  'color',
  'transmission',
  'fuelType',
  'seats',
  'mileageKm',
  'description',
  'location',
  'rentalPricePerDay',
  'rentalPricePerWeek',
  'depositAmount',
  'extraKmRatePerKm',
] as const;

export function CreateListingPage() {
  return (
    <AccountShell>
      <CreateListingForm />
    </AccountShell>
  );
}

export function EditListingPage() {
  return (
    <AccountShell>
      <EditListingForm />
    </AccountShell>
  );
}

// spec 05 §3.7's Create flow, Step 1 — a minimal form (no photos: the only
// upload transport requires a carId that doesn't exist yet). On success the
// caller is routed straight into edit mode (Step 2), where the photo section
// becomes reachable — shared/src/dto/car.ts's createCarDto note explains why.
function CreateListingForm() {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);

  // Triple-generic useForm — createCarDto's `images` uses `.default([])`,
  // whose input type (string[] | undefined) differs from its output type
  // (string[], always present), same exactOptionalPropertyTypes mismatch as
  // Register.tsx's coerced date field.
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof createCarDto>, unknown, CreateCarDto>({ resolver: zodResolver(createCarDto) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const car = await createListing(values);
      navigate(`/account/listings/${car.id}/edit`, { replace: true });
    } catch (error) {
      setFormError(applyApiError(error, setError, CREATE_FIELDS));
    }
  });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-display-md text-neutral-900">List a car</h1>
      <p className="mt-1 text-body-sm text-neutral-600">
        Save the basics first — you'll add photos on the next screen, then submit it for an admin's review.
      </p>

      <Card className="mt-6">
        <CardBody>
          <form className="flex flex-col gap-6" onSubmit={onSubmit} noValidate>
            {formError && (
              <p role="alert" className="text-body-sm text-status-danger-fg">
                {formError}
              </p>
            )}

            <VehicleFields register={register} errors={errors} />
            <LocationFields register={register} errors={errors} />
            <PricingFields register={register} errors={errors} />

            <Textarea label="Description" helperText="Optional." errorText={errors.description?.message} {...register('description')} />

            <div className="flex justify-end">
              <Button type="submit" isLoading={isSubmitting}>
                Save draft &amp; continue
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

const EDIT_FIELDS = CREATE_FIELDS;

// spec 05 §3.7's Create flow, Step 2, and the ordinary Edit entry point.
// Gated to DRAFT/REJECTED per docs/design/02-image-storage.md's
// guardEditableModerationState — everything else shows a clear "not
// editable in this status" message instead of a form that would 409.
function EditListingForm() {
  const { carId } = useParams<{ carId: string }>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['own-listing', carId],
    queryFn: () => getOwnListing(carId!),
    enabled: Boolean(carId),
  });

  const car = query.data;
  const isEditable = car ? car.moderationStatus === 'DRAFT' || car.moderationStatus === 'REJECTED' : false;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty, dirtyFields },
  } = useForm<UpdateCarDto>({ resolver: zodResolver(updateCarDto) });

  useEffect(() => {
    if (!car) return;
    reset({
      make: car.make,
      model: car.model,
      year: car.year,
      registrationNumber: car.registrationNumber,
      color: car.color,
      transmission: car.transmission,
      fuelType: car.fuelType,
      seats: car.seats,
      mileageKm: car.mileageKm,
      description: car.description,
      location: car.location,
      rentalPricePerDay: car.rentalPricePerDay,
      rentalPricePerWeek: car.rentalPricePerWeek,
      depositAmount: car.depositAmount,
      extraKmRatePerKm: car.extraKmRatePerKm,
    });
  }, [car, reset]);

  const saveMutation = useMutation({
    mutationFn: (patch: UpdateCarDto) => updateListing(carId!, patch),
    onSuccess: (updated) => {
      queryClient.setQueryData(['own-listing', carId], updated);
      reset({
        make: updated.make,
        model: updated.model,
        year: updated.year,
        registrationNumber: updated.registrationNumber,
        color: updated.color,
        transmission: updated.transmission,
        fuelType: updated.fuelType,
        seats: updated.seats,
        mileageKm: updated.mileageKm,
        description: updated.description,
        location: updated.location,
        rentalPricePerDay: updated.rentalPricePerDay,
        rentalPricePerWeek: updated.rentalPricePerWeek,
        depositAmount: updated.depositAmount,
        extraKmRatePerKm: updated.extraKmRatePerKm,
      });
    },
  });

  const submitMutation = useMutation({
    mutationFn: () => submitListing(carId!),
    onSuccess: (updated) => {
      queryClient.setQueryData(['own-listing', carId], updated);
      navigate('/account/listings');
    },
  });

  function buildPatch(values: UpdateCarDto): UpdateCarDto {
    const patch: Record<string, unknown> = {};
    for (const key of Object.keys(dirtyFields) as (keyof UpdateCarDto)[]) {
      patch[key] = values[key];
    }
    return patch as UpdateCarDto;
  }

  const onSaveDraft = handleSubmit(async (values) => {
    setFormError(null);
    setSaved(false);
    setSubmitError(null);
    if (!isDirty) return;
    try {
      await saveMutation.mutateAsync(buildPatch(values));
      setSaved(true);
    } catch (error) {
      setFormError(applyApiError(error, setError, EDIT_FIELDS));
    }
  });

  const onSubmitForReview = handleSubmit(async (values) => {
    setFormError(null);
    setSaved(false);
    setSubmitError(null);
    try {
      if (isDirty) {
        await saveMutation.mutateAsync(buildPatch(values));
      }
      await submitMutation.mutateAsync();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'GUARD_FAILED') {
        const details = error.details as { missing?: string[] } | undefined;
        setSubmitError(
          details?.missing?.length
            ? `Add the following before submitting: ${details.missing.join(', ')}.`
            : error.message,
        );
        return;
      }
      setFormError(applyApiError(error, setError, EDIT_FIELDS));
    }
  });

  const images = car?.images ?? [];
  const canSubmitForReview = images.length >= 1;

  const statusMeta = car ? carModerationMeta(car.moderationStatus) : null;

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-sm bg-surface-sunken" />
        <div className="h-96 animate-pulse rounded-lg bg-surface-sunken" />
      </div>
    );
  }

  if (query.isError || !car) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-body-md text-status-danger-fg">
          {query.error instanceof ApiError && query.error.status === 404
            ? "This listing doesn't exist, or isn't yours."
            : "Couldn't load this listing. Please try again shortly."}
        </p>
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" onClick={() => query.refetch()}>
            Retry
          </Button>
          <Link to="/account/listings">
            <Button variant="ghost">Back to My listings</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Copy/state rule — the form is only reachable while DRAFT/REJECTED
  // (docs/design/02-image-storage.md's guardEditableModerationState). A
  // stale tab pointed at an APPROVED/PENDING_APPROVAL car gets a plain
  // explanation instead of a form that would 409 on save.
  if (!isEditable) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display text-display-md text-neutral-900">
          {car.make} {car.model} {car.year}
        </h1>
        <Card className="mt-6">
          <CardBody>
            <p className="text-body-md font-medium text-neutral-900">This listing isn't editable right now.</p>
            <p className="mt-2 text-body-sm text-neutral-600">
              {car.moderationStatus === 'PENDING_APPROVAL'
                ? "It's under review — wait for an admin's decision, or withdraw it first to make changes."
                : "It's approved and live — withdraw it first if you need to make changes."}
            </p>
            {statusMeta && <p className="mt-2 text-body-sm text-neutral-500">{statusMeta.explain}</p>}
            <Link to="/account/listings" className="mt-4 inline-block">
              <Button variant="secondary">Back to My listings</Button>
            </Link>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-display-md text-neutral-900">
        Edit listing — {car.make} {car.model} {car.year}
      </h1>
      {car.moderationStatus === 'REJECTED' && car.rejectionReason && (
        <p className="mt-2 text-body-sm text-status-danger-fg">An admin asked for changes: "{car.rejectionReason}"</p>
      )}

      <Card className="mt-6">
        <CardBody>
          <form className="flex flex-col gap-6" noValidate>
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

            <VehicleFields register={register} errors={errors} />
            <LocationFields register={register} errors={errors} />
            <PricingFields register={register} errors={errors} />

            <Textarea label="Description" helperText="Optional." errorText={errors.description?.message} {...register('description')} />

            <section>
              <h2 className="font-display text-heading-sm text-neutral-900">Photos</h2>
              <p className="mt-1 text-body-sm text-neutral-500">
                At least one photo is required before this listing can be submitted for review.
              </p>
              <div className="mt-3">
                <PhotoUploader
                  carId={car.id}
                  images={images}
                  onImagesChange={(next) => queryClient.setQueryData(['own-listing', carId], { ...car, images: next })}
                />
              </div>
            </section>

            {submitError && (
              <p role="alert" className="text-body-sm text-status-danger-fg">
                {submitError}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-3">
              <Button type="button" variant="secondary" onClick={onSaveDraft} isLoading={saveMutation.isPending} disabled={!isDirty}>
                Save draft
              </Button>
              <span title={canSubmitForReview ? undefined : 'Add at least one photo before submitting.'}>
                <Button
                  type="button"
                  onClick={onSubmitForReview}
                  isLoading={isSubmitting || submitMutation.isPending}
                  disabled={!canSubmitForReview}
                >
                  Submit for review
                </Button>
              </span>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

// --- shared field groups, used by both create and edit forms -------------

// Loosely typed on purpose: CreateCarDto (fields required) and UpdateCarDto
// (fields optional) both flow through here, and RHF's Path<T>/FieldErrors<T>
// don't unify cleanly across two structurally-different-but-compatible
// schemas. The two page-level forms above keep full typing via
// useForm<CreateCarDto>/useForm<UpdateCarDto>; only these shared
// presentational field groups relax it.
interface FieldGroupProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: any;
}

function VehicleFields({ register, errors }: FieldGroupProps) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-heading-sm text-neutral-900">Vehicle</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Make" required errorText={errors.make?.message} {...register('make')} />
        <Input label="Model" required errorText={errors.model?.message} {...register('model')} />
        <Input
          label="Year"
          type="number"
          required
          errorText={errors.year?.message}
          {...register('year', { valueAsNumber: true })}
        />
        <Input
          label="Registration number"
          required
          helperText="Normalized to upper-case automatically."
          errorText={errors.registrationNumber?.message}
          {...register('registrationNumber')}
        />
        <Input label="Color" helperText="Optional." errorText={errors.color?.message} {...register('color')} />
        <Select label="Transmission" required errorText={errors.transmission?.message} {...register('transmission')}>
          <option value="">Select…</option>
          {CAR_TRANSMISSIONS.map((t) => (
            <option key={t} value={t}>
              {t === 'MANUAL' ? 'Manual' : 'Automatic'}
            </option>
          ))}
        </Select>
        <Select label="Fuel type" required errorText={errors.fuelType?.message} {...register('fuelType')}>
          <option value="">Select…</option>
          {CAR_FUEL_TYPES.map((f) => (
            <option key={f} value={f}>
              {FUEL_LABELS[f]}
            </option>
          ))}
        </Select>
        <Input
          label="Seats"
          type="number"
          required
          errorText={errors.seats?.message}
          {...register('seats', { valueAsNumber: true })}
        />
        <Input
          label="Mileage (km)"
          type="number"
          required
          errorText={errors.mileageKm?.message}
          {...register('mileageKm', { valueAsNumber: true })}
        />
      </div>
    </section>
  );
}

function LocationFields({ register, errors }: FieldGroupProps) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-heading-sm text-neutral-900">Location</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="City" required errorText={errors.location?.city?.message} {...register('location.city')} />
        <Input label="State" required errorText={errors.location?.state?.message} {...register('location.state')} />
      </div>
    </section>
  );
}

function PricingFields({ register, errors }: FieldGroupProps) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-heading-sm text-neutral-900">Pricing</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Rental price per day (₹)"
          type="number"
          required
          errorText={errors.rentalPricePerDay?.message}
          {...register('rentalPricePerDay', { valueAsNumber: true })}
        />
        <Input
          label="Rental price per week (₹)"
          type="number"
          helperText="Optional — must be less than 7× the daily rate."
          errorText={errors.rentalPricePerWeek?.message}
          {...register('rentalPricePerWeek', { valueAsNumber: true, setValueAs: (v) => (v === '' || Number.isNaN(v) ? undefined : v) })}
        />
        <Input
          label="Deposit amount (₹)"
          type="number"
          helperText="Optional."
          errorText={errors.depositAmount?.message}
          {...register('depositAmount', { valueAsNumber: true, setValueAs: (v) => (v === '' || Number.isNaN(v) ? undefined : v) })}
        />
        <Input
          label="Extra km rate (₹/km)"
          type="number"
          helperText="Charged for distance driven beyond 300km/day of the rental. Optional."
          errorText={errors.extraKmRatePerKm?.message}
          {...register('extraKmRatePerKm', { valueAsNumber: true, setValueAs: (v) => (v === '' || Number.isNaN(v) ? undefined : v) })}
        />
      </div>
    </section>
  );
}
