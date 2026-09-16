import { createHash, randomBytes, randomUUID } from 'node:crypto';
import mongoose, { type ClientSession, type HydratedDocument, Types } from 'mongoose';
import type { RedeemPasswordResetDto } from '@rango/shared';
import { AccountInactiveError, AuthError, ConflictError, NotFoundError } from '../lib/errors.js';
import { hashPassword, verifyPassword, getDummyPasswordHash } from '../lib/password.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt.js';
import { User, type UserDoc } from '../models/User.model.js';
import { Session } from '../models/Session.model.js';
import { PasswordReset } from '../models/PasswordReset.model.js';
import { AuditLog } from '../models/AuditLog.model.js';
import { Car } from '../models/Car.model.js';
import type { ActorContext } from '../lib/actor.js';

type UserE = HydratedDocument<UserDoc>;

export interface RequestContext {
  ipAddress: string | undefined;
  userAgent: string | undefined;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
}

export interface AuthResult {
  user: UserE;
  tokens: AuthTokens;
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// One session per login/register/refresh, keyed by a freshly minted
// Session._id so it can double as the token `sid` claim before the document
// is even inserted (design §5.2's "caller owns the session" shape, applied
// to Session creation the same way it applies to a transition).
async function issueSessionAndTokens(
  user: UserE,
  session: ClientSession,
  context: RequestContext,
  family: string = randomUUID(),
): Promise<AuthTokens> {
  const sessionId = new Types.ObjectId();
  const { token: refreshToken } = signRefreshToken({ sub: String(user._id), sid: sessionId.toString() });
  const { token: accessToken } = signAccessToken({
    sub: String(user._id),
    sid: sessionId.toString(),
    role: user.role,
    isActive: user.isActive,
  });

  await Session.create(
    [
      {
        _id: sessionId,
        user: user._id,
        refreshTokenHash: sha256Hex(refreshToken),
        family,
        status: 'ACTIVE',
        userAgent: context.userAgent?.slice(0, 200),
        ipAddress: context.ipAddress,
        lastUsedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    ],
    { session },
  );

  return { accessToken, refreshToken, csrfToken: randomBytes(32).toString('base64url') };
}

export interface RegisterInput {
  name: string;
  email: string;
  phone: string;
  password: string;
  drivingLicenceNumber: string;
  drivingLicenceExpiryDate?: Date | undefined;
}

// spec 03 §2.2 E-01 / AUTHZ-3 exception E8 — the one non-admin write that
// creates an account. Duplicate email/phone is a domain error, never a 500
// (AUTH-07 accept).
export async function register(input: RegisterInput, context: RequestContext): Promise<AuthResult> {
  const session = await mongoose.startSession();
  try {
    let result!: AuthResult;
    await session.withTransaction(async () => {
      const existingEmail = await User.findOne({ email: input.email }).session(session);
      if (existingEmail) {
        throw new ConflictError('An account with this email already exists.', { field: 'email' });
      }
      const existingPhone = await User.findOne({ phone: input.phone }).session(session);
      if (existingPhone) {
        throw new ConflictError('An account with this phone number already exists.', { field: 'phone' });
      }

      const passwordHash = await hashPassword(input.password);
      const created = await User.create(
        [
          {
            name: input.name,
            email: input.email,
            phone: input.phone,
            passwordHash,
            role: 'USER',
            isActive: true,
            failedLoginCount: 0,
            drivingLicence: {
              number: input.drivingLicenceNumber,
              expiryDate: input.drivingLicenceExpiryDate,
              enteredAt: new Date(),
            },
          },
        ],
        { session },
      );
      const user = created[0]!;

      await AuditLog.create(
        [
          {
            actor: user._id,
            actorRole: user.role,
            action: 'USER_REGISTERED',
            entityType: 'USER',
            entityId: user._id,
            newState: 'ACTIVE',
            ipAddress: context.ipAddress,
          },
        ],
        { session },
      );

      const tokens = await issueSessionAndTokens(user, session, context);
      result = { user, tokens };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export interface LoginInput {
  email: string;
  password: string;
}

// spec 03 §2.5 E-02 / §6.2 — unknown email and wrong password return the
// identical UNAUTHENTICATED error, with comparable timing (one argon2.verify
// call either way). Login-failure is intentionally unaudited; a successful
// ADMIN/SUPER_ADMIN login is the one login outcome that is (AUTH-07).
export async function login(input: LoginInput, context: RequestContext): Promise<AuthResult> {
  const session = await mongoose.startSession();
  try {
    let result!: AuthResult;
    await session.withTransaction(async () => {
      const user = await User.findOne({ email: input.email }).select('+passwordHash').session(session);
      const candidateHash = user ? user.passwordHash : await getDummyPasswordHash();
      const validPassword = await verifyPassword(candidateHash, input.password);

      if (!user || !validPassword) {
        throw new AuthError('Invalid email or password.');
      }
      if (!user.isActive) {
        throw new AccountInactiveError('This account has been deactivated.');
      }

      if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
        await AuditLog.create(
          [
            {
              actor: user._id,
              actorRole: user.role,
              action: 'ADMIN_LOGIN_SUCCEEDED',
              entityType: 'USER',
              entityId: user._id,
              ipAddress: context.ipAddress,
            },
          ],
          { session },
        );
      }

      const tokens = await issueSessionAndTokens(user, session, context);
      result = { user, tokens };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

// spec 03 §4.5 — rotation with reuse detection. Presenting a token whose
// Session is not ACTIVE revokes the whole family and forces re-auth; a
// deactivated user is re-checked against the database, never the token
// (§4.6), on every refresh (AUTH-08 accept).
export async function refresh(rawRefreshToken: string, context: RequestContext): Promise<AuthResult> {
  const payload = verifyRefreshToken(rawRefreshToken);
  const tokenHash = sha256Hex(rawRefreshToken);

  const session = await mongoose.startSession();
  try {
    let result!: AuthResult;
    // A throw inside withTransaction() aborts everything written so far in
    // this callback, including the family-revocation writes below — so the
    // reuse-detected case must let the transaction COMMIT the revocation and
    // only throw once we are back outside it, not from inside the callback.
    let reuseDetected = false;
    let inactiveAccount = false;

    await session.withTransaction(async () => {
      const existing = await Session.findOne({ refreshTokenHash: tokenHash }).session(session);
      if (!existing || String(existing.user) !== payload.sub) {
        throw new AuthError('Invalid refresh token.');
      }

      const user = await User.findById(existing.user).session(session);
      if (!user) {
        throw new AuthError('Invalid refresh token.');
      }

      if (existing.status !== 'ACTIVE') {
        // Reuse of a rotated/revoked token: the entire family is compromised.
        await Session.updateMany(
          { family: existing.family, status: 'ACTIVE' },
          { $set: { status: 'REVOKED', revokedReason: 'REUSE_DETECTED' } },
          { session },
        );
        await AuditLog.create(
          [
            {
              actor: user._id,
              actorRole: user.role,
              action: 'SESSION_REUSE_DETECTED',
              entityType: 'USER',
              entityId: user._id,
              ipAddress: context.ipAddress,
            },
          ],
          { session },
        );
        reuseDetected = true;
        return;
      }

      if (!user.isActive) {
        inactiveAccount = true;
        return;
      }

      existing.status = 'ROTATED';
      existing.lastUsedAt = new Date();
      await existing.save({ session });

      const tokens = await issueSessionAndTokens(user, session, context, existing.family);
      result = { user, tokens };
    });

    if (reuseDetected) {
      throw new AuthError('This refresh token has already been used.');
    }
    if (inactiveAccount) {
      throw new AccountInactiveError('This account has been deactivated.');
    }
    return result;
  } finally {
    await session.endSession();
  }
}

// spec 03 §9.6 — idempotent, always succeeds, never requires a valid access
// token (an expired-but-well-formed rgo_at still lets logout clear cookies,
// AUTH-08 accept) because this never runs behind requireAuth at all.
export async function logout(rawRefreshToken: string | undefined): Promise<void> {
  if (!rawRefreshToken) {
    return;
  }
  const tokenHash = sha256Hex(rawRefreshToken);
  await Session.updateOne(
    { refreshTokenHash: tokenHash, status: 'ACTIVE' },
    { $set: { status: 'REVOKED', revokedReason: 'LOGOUT' } },
  );
}

// spec 03 §7 E-75 — redeems a token issued out-of-band by an admin (E-66,
// not yet implemented). Invalid, expired, and already-used tokens all
// return the identical AuthError so redemption is not an oracle (§7's
// "all identical, no oracle"). Resets the §9.1 lockout counters, same as any
// other successful credential event.
export async function redeemPasswordReset(input: RedeemPasswordResetDto): Promise<void> {
  const tokenHash = sha256Hex(input.token);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const reset = await PasswordReset.findOne({ tokenHash }).session(session);
      if (!reset || reset.usedAt !== null || reset.expiresAt.getTime() <= Date.now()) {
        throw new AuthError('This reset link is invalid or has expired.');
      }

      const user = await User.findById(reset.user).session(session);
      if (!user) {
        throw new AuthError('This reset link is invalid or has expired.');
      }
      if (!user.isActive) {
        throw new AccountInactiveError('This account has been deactivated.');
      }

      user.passwordHash = await hashPassword(input.newPassword);
      user.failedLoginCount = 0;
      user.set('lockedUntil', undefined);
      await user.save({ session });

      reset.usedAt = new Date();
      await reset.save({ session });

      await Session.updateMany(
        { user: user._id, status: 'ACTIVE' },
        { $set: { status: 'REVOKED', revokedReason: 'PASSWORD_CHANGED' } },
        { session },
      );

      await AuditLog.create(
        [
          {
            actor: user._id,
            actorRole: user.role,
            action: 'USER_PASSWORD_RESET_REDEEMED',
            entityType: 'USER',
            entityId: user._id,
          },
        ],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
}

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  isActive: boolean;
  drivingLicence: { numberMasked: string; expiryDate: Date | undefined };
  createdAt: Date;
  flags: { isOwner: boolean; isSuperAdmin: boolean };
}

// spec 02 §7.2's documentNumberMasked pattern, applied to the one licence
// field this platform still keeps (spec 03 §5.7/X-C4): the full number is
// never echoed back over the wire — even to its own owner — because echoing
// it adds nothing the caller does not already know and turns any XSS or log
// leak into a licence-number disclosure. Only the last 4 characters survive.
function maskLicenceNumber(number: string): string {
  const visible = number.slice(-4);
  return 'X'.repeat(Math.max(0, number.length - visible.length)) + visible;
}

// spec 03 §2.2 E-05 / §1.4 — flags.isOwner is derived per request, never
// cached, never placed in a token claim.
export async function getUserSummary(actor: ActorContext): Promise<UserSummary> {
  const user = await User.findById(actor.userId);
  if (!user) {
    throw new NotFoundError('User not found.');
  }
  const isOwner = (await Car.exists({ owner: user._id, moderationStatus: 'APPROVED' })) !== null;
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    drivingLicence: {
      numberMasked: maskLicenceNumber(user.drivingLicence.number),
      expiryDate: user.drivingLicence.expiryDate,
    },
    createdAt: user.createdAt,
    flags: { isOwner, isSuperAdmin: user.role === 'SUPER_ADMIN' },
  };
}
