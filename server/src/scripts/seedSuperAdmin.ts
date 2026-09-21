// spec 03 §11.1-11.2 — first-run CLI bootstrap for the platform's first
// SUPER_ADMIN. Registration (E-01) always assigns role: USER and rejects a
// `role` key in the body (AUTHZ-4), so no admin can ever exist through the
// API; something outside the API must create the first one. Spec 03 §11.2
// evaluated and REJECTED reading SUPER_ADMIN_EMAIL/_PASSWORD from env vars
// (plaintext credential in process env / deploy config / shell history /
// crash dumps, re-asserted on every restart) in favour of this interactive
// CLI, gated on an empty SUPER_ADMIN set.
//
// Usage:
//   npm run seed:superadmin -- --email <email> --name <name> --phone <phone> --licence <number>
//
// The password is never accepted as an argument or env var (argv is visible
// in `ps` and lands in shell history) — it is prompted twice, interactively,
// with echo off (§11.2 item 2). The actual write path lives in
// services/superAdmin.service.ts's seedFirstSuperAdmin() so it is testable
// without a TTY; this file owns only argv parsing and the password prompt.

import { parseArgs } from 'node:util';
import readline from 'node:readline';
import mongoose from 'mongoose';
import { z } from 'zod';
import { registerDto } from '@rango/shared';
import { connectDb } from '../config/db.js';
import { hashPassword } from '../lib/password.js';
import { seedFirstSuperAdmin, SuperAdminAlreadyExistsError } from '../services/superAdmin.service.js';
import { ConflictError } from '../lib/errors.js';

// Reuses the exact field validators E-01 registration uses (email/name/phone
// format, driving-licence format) rather than re-deriving them — the seed
// account is a real User row and must satisfy the same schema.
const cliFieldsSchema = registerDto.pick({ name: true, email: true, phone: true, drivingLicenceNumber: true });

function fail(message: string): never {
  console.error(`seed:superadmin: ${message}`);
  process.exit(1);
}

function parseCliArgs(): z.infer<typeof cliFieldsSchema> {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      phone: { type: 'string' },
      licence: { type: 'string' },
    },
  });

  if (!values.email || !values.name || !values.phone || !values.licence) {
    fail(
      'usage: npm run seed:superadmin -- --email <email> --name <name> --phone <phone> --licence <number>',
    );
  }

  const parsed = cliFieldsSchema.safeParse({
    name: values.name,
    email: values.email,
    phone: values.phone,
    drivingLicenceNumber: values.licence,
  });
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    fail(`invalid arguments: ${JSON.stringify(fieldErrors)}`);
  }
  return parsed.data;
}

// §11.2 item 2 — masked password prompt. readline has no built-in "no echo"
// mode, so output is suppressed at the Interface level while the user types;
// this is the standard Node pattern for a TTY-only masked prompt.
function promptPasswordMasked(query: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let muted = false;
    const rlInternal = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WritableStream };
    rlInternal._writeToOutput = (chunk: string) => {
      if (!muted) rlInternal.output.write(chunk);
    };
    process.stdout.write(query);
    muted = true;
    rl.question('', (value) => {
      muted = false;
      rl.close();
      process.stdout.write('\n');
      resolve(value);
    });
  });
}

async function promptNewPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    fail(
      'a password must be entered interactively on a TTY (spec 03 §11.2 item 2, OQ-A25) — this script does not support non-interactive/CI use.',
    );
  }
  const first = await promptPasswordMasked('New SUPER_ADMIN password: ');
  const second = await promptPasswordMasked('Confirm password: ');
  if (first !== second) {
    fail('passwords did not match.');
  }
  // spec 03 §6.3 — 12..128 chars, enforced identically to registerDto.
  const result = registerDto.shape.password.safeParse(first);
  if (!result.success) {
    fail('password must be between 12 and 128 characters (spec 03 §6.3).');
  }
  return first;
}

async function main(): Promise<void> {
  const { name, email, phone, drivingLicenceNumber } = parseCliArgs();

  await connectDb();
  const password = await promptNewPassword();
  const passwordHash = await hashPassword(password);

  try {
    const created = await seedFirstSuperAdmin({ name, email, phone, passwordHash, drivingLicenceNumber });
    console.log(`Created SUPER_ADMIN ${created.email} (${created._id}).`);
  } catch (err) {
    if (err instanceof SuperAdminAlreadyExistsError) {
      fail(
        `${err.message} Provision further admins via POST /api/superadmin/admins (E-68) and ` +
          '.../promote-super (E-70) instead.',
      );
    }
    if (err instanceof ConflictError) {
      fail(err.message);
    }
    throw err;
  }

  await mongoose.disconnect();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
