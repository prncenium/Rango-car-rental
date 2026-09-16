import { z } from 'zod';

// spec 02 D10 — DTOs are explicit z.strictObject schemas, never `.omit()`-derived,
// and never accept a privilege field (role/isActive/status) from the body
// (AUTHZ-4). This is the single source of truth for both server validation
// and client-side form validation (docs/design/01-technical-design.md §8 —
// schema sharing).

export const registerDto = z.strictObject({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(1).max(20),
  // spec 03 §6.3 — 12 char minimum (Δ-5 over spec 01's 8), 128 max to bound
  // argon2 work an unauthenticated caller can request.
  password: z.string().min(12).max(128),
  // spec 03 §5.3 — format-only validation: length and character class, never
  // a real-world driving-licence check.
  drivingLicenceNumber: z
    .string()
    .trim()
    .toUpperCase()
    .min(8)
    .max(20)
    .regex(/^[A-Z0-9- ]+$/, 'Driving licence number must contain only letters, digits, hyphens, and spaces.'),
  drivingLicenceExpiryDate: z.coerce.date().optional(),
});
export type RegisterDto = z.infer<typeof registerDto>;

export const loginDto = z.strictObject({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});
export type LoginDto = z.infer<typeof loginDto>;

// spec 03 §7 E-75 — public redemption of an admin-issued reset token. There
// is no self-service "forgot password" request step (§6.5): the token is
// handed to the user out of band by an admin (E-66), and this is the only
// endpoint that consumes it.
export const redeemPasswordResetDto = z.strictObject({
  token: z.string().min(1),
  newPassword: z.string().min(12).max(128),
});
export type RedeemPasswordResetDto = z.infer<typeof redeemPasswordResetDto>;
