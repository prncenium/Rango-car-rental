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
