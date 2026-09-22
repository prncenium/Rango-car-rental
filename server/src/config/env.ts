import 'dotenv/config';
import { z } from 'zod';

// These must match server/.env.example exactly — they exist so a committed
// example secret can never be accepted as a real one (design §12).
const EXAMPLE_JWT_ACCESS_SECRET = 'replace-this-with-a-random-value-of-at-least-32-bytes';
const EXAMPLE_JWT_REFRESH_SECRET = 'replace-this-with-a-different-random-value-32-bytes-min';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    PORT: z.coerce.number().int().positive(),
    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
    CLIENT_ORIGIN: z.string().url(),
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 bytes'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 bytes'),
    JWT_ACCESS_SECRET_PREVIOUS: z.string().min(32).optional(),
    // design docs/design/02-image-storage.md — car photo upload backend.
    CLOUDINARY_CLOUD_NAME: z.string().min(1, 'CLOUDINARY_CLOUD_NAME is required'),
    CLOUDINARY_API_KEY: z.string().min(1, 'CLOUDINARY_API_KEY is required'),
    CLOUDINARY_API_SECRET: z.string().min(1, 'CLOUDINARY_API_SECRET is required'),
    // Contact-us mail (client/src/pages/public/About.tsx's form ->
    // POST /api/public/contact), sent via Resend's HTTPS API rather than raw
    // SMTP — Render's outbound network blocks/hangs on SMTP ports 465 and
    // 587, but never HTTPS. Optional so a server without this set still
    // boots — the route itself 503s until it's configured, rather than the
    // whole server failing to start over one non-critical feature.
    // Blank-string-tolerant: server/.env ships this as an empty placeholder
    // (not absent) until an operator fills it in, and a bare `z.string().optional()`
    // would reject `''` rather than treat it the same as unset.
    RESEND_API_KEY: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(1).optional()),
    CONTACT_RECEIVER_EMAIL: z.string().email().default('rangocarrental@gmail.com'),
  })
  .superRefine((val, ctx) => {
    if (val.JWT_ACCESS_SECRET === val.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_SECRET'],
        message: 'JWT_REFRESH_SECRET must differ from JWT_ACCESS_SECRET',
      });
    }
    if (val.JWT_ACCESS_SECRET === EXAMPLE_JWT_ACCESS_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message: 'JWT_ACCESS_SECRET must not be the .env.example placeholder value',
      });
    }
    if (val.JWT_REFRESH_SECRET === EXAMPLE_JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_SECRET'],
        message: 'JWT_REFRESH_SECRET must not be the .env.example placeholder value',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): ReturnType<typeof envSchema.safeParse> {
  return envSchema.safeParse(source);
}

function formatIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
}

// Fails fast at boot rather than at first request (design §12). Never logs
// the values themselves, only which keys are missing or malformed.
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = parseEnv(source);
  if (!result.success) {
    console.error(`Invalid environment configuration:\n${formatIssues(result.error)}`);
    return process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
