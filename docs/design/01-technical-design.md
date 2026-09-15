# 01 — Technical Design

Status: DRAFT — for review before any code.
Reads: `specs/01-domain-and-state-machines.md`, `specs/02-api-contract.md`, `specs/03-auth-and-roles.md`, `specs/04-business-logic.md`. This document is HOW.
Feeds: `tasks/01-implementation-plan.md` (STEPS). The current implementation plan predates specs 03/04 and is stale in the ways §14 lists — it must be revised before any task in the `AUTH`, `KYC`, `CAR`, `BOOK`, `PAY`, `ADM` blocks starts.

**Scope.** Rental only. The platform never sells a vehicle, never runs a payment gateway, and never verifies anyone's identity online. There is no buyer, no sale price, no offer or negotiation flow, no transfer of vehicle ownership, no document upload, and no verification workflow of any kind.

> **This revision supersedes the previous draft of this document in full.** The previous draft's decision log (D1–D10) modelled a `KYC` entity with an admin review queue, and `User.kycStatus` derived from it (D8). Spec 03 removed that entire apparatus and replaced it with one self-asserted, unverified `drivingLicence.number` field that gates nothing (spec 03 §5, §3). Spec 04 confirmed the removal and additionally dropped the licence *image* fields spec 03 had proposed (spec 04 X-C1), leaving a typed number only. Spec 03 also added `SUPER_ADMIN`, `Session`, and `PasswordReset`; spec 04 added pricing, deposits, no-show handling, admin availability blocks, and a turnaround buffer, all of which extend `BookingDayLock` beyond the original D5 shape. This document is written against **all four specs as merged**, and §15 records what the previous draft got right that still survives, so nothing is silently lost twice.

---

## 1. Decision log

These resolve the contradictions the four specs leave open once each one's own internal resolution is taken as final. Each decision names the spec sections it changes; a revised `S`-block in `tasks/01-implementation-plan.md` must apply them back into the specs before implementation begins (`CLAUDE.md`: specs are read, not edited, during implementation).

### D1 — The "admin gates everything" rule is scoped, not absolute

**Decision**, carried forward unchanged from the previous draft and now stated in the vocabulary spec 03 settled on:

- **AUTHZ-1 (visibility).** No status write by a non-admin may make anything visible to a third party. Only `ADMIN`/`SUPER_ADMIN` may move a `Car` to `listingState = LISTED`.
- **AUTHZ-2 (counterparty assets).** No status write by a non-admin may bind, release, or transfer another party's asset, calendar, or money. Only `ADMIN`/`SUPER_ADMIN` may confirm, activate, complete, terminate, or cancel a committed booking, release a day-lock, or settle/void/refund a payment.
- **AUTHZ-3 (closed exception list).** Exactly eight non-admin status writes exist (spec 03 §2.4): three creations (account registration, a draft listing, a booking request) and five edges (submit, withdraw, delist, renter-cancel-own-request, request-cancellation). A ninth is a contract change, not an implementation detail, and the build fails without one (`TR-04`, `TR-06`).
- **AUTHZ-4 (no self-elevation).** `role`, `isActive`, and every `*By`/`*At` moderation or admin field are never writable by their own subject, in any namespace, ever.

`transition()` (§6) enforces AUTHZ-1/2/3 structurally; route-level DTOs (§9's `z.strictObject`) enforce AUTHZ-4 by never accepting those keys from a request body at all.

### D2 — `Car.status` is split into orthogonal fields

Unchanged from the previous draft:

| Field | Values | Meaning |
|---|---|---|
| `moderationStatus` | `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED` | Has an admin vetted the current content? |
| `listingState` | `UNLISTED`, `LISTED`, `DELISTED` | Is it on the market? |
| *(availability)* | derived | Computed from `BookingDayLock` — never stored |

A car is publicly visible iff `moderationStatus = APPROVED AND listingState = LISTED`. `DELISTED → LISTED` is legal (via admin `relist`, spec 02 E-33 — this is **admin-only**, not owner-triggered; spec 02 C-3 identifies an earlier design draft that put relisting under `/api/user` as a defect against AUTHZ-1, corrected here). `RENTED` and `AVAILABLE` do not exist as stored states; `Car` carries no booking-derived field at all (spec 04 §3.3: *"There is no `RENTED`, no `currentBookingId`, no `availableFrom`"*).

### D3 — `registrationNumber` uniqueness is scoped to non-abandoned listings

Unchanged. Partial unique index, `moderationStatus != DRAFT`. The real defence — matching the plate to the registration document — is an admin action at approval time (E-29), not a code guard.

### D4 — `Booking.status` gains four states beyond the original spec

`REQUESTED → CONFIRMED → ACTIVE → COMPLETED`, plus `REJECTED`, `CANCELLATION_REQUESTED`, `CANCELLED`, `TERMINATED`, and — new in this revision, per spec 02 E-46/OQ-45 resolved as option (a) and spec 04 §5.4 — **`NO_SHOW`**.

- `CONFIRMED → CANCELLATION_REQUESTED` — renter or car owner requests (`guardIsRenterOrCarOwner`), admin resolves (`resolve-cancellation`, spec 02 E-45). Locks are **not** released while `CANCELLATION_REQUESTED` (spec 04 §1.3, §5.2) — this is the entire reason the state exists rather than going straight to `CANCELLED`.
- `ACTIVE → TERMINATED` — admin only, `reason` required, releases locks from an admin-chosen `effectiveFrom` forward. **`effectiveFrom`'s valid range is `[startDate, today]`, not `[startDate, endDate)`** (spec 04 RULE PR-4, `Δ-B20`) — the original range strands every overdue booking permanently in `ACTIVE`, since `today ≥ endDate` is precisely the overdue case and no value in `[startDate, endDate)` is still in the future-or-today range once `endDate` has passed.
- `CONFIRMED → NO_SHOW` — admin only, requires `today > startDate` (`guardStartDatePassed`), releases all locks immediately. Sets `noShowCleared = false`, which blocks the renter's future booking requests (§4, guard P9) until an admin clears it (`POST .../clear-no-show`, spec 04 §5.4, new endpoint E-76). Without a clearing path a single no-show would be a permanent, unappealable ban issued by one admin's unilateral judgement — E-76 exists so that door has a handle on both sides.

### D5 — Double-booking is prevented by a unique index, not a read-check, and the index now arbitrates more than bookings

Materialise the occupied range. `BookingDayLock` holds one document per `(car, day)` with a **unique compound index on `{ car: 1, day: 1 }`**. Confirming a booking inserts every lock for its range inside a transaction; a conflicting write fails on duplicate key and the transaction aborts. The database is the arbiter, never application logic.

**Extended per spec 04 §1.1** beyond the original design: the same collection also carries admin maintenance blocks and per-booking turnaround buffer, because a second collection would reintroduce exactly the read-then-write race D5 exists to close (see §6 below for the full mechanism and §8 for why this is a decision rather than an obvious consequence).

```ts
const BookingDayLockSchema = new Schema({
  car:     { type: Schema.Types.ObjectId, ref: 'Car', required: true },
  day:     { type: Date, required: true },              // UTC midnight
  source:  { type: String, enum: ['BOOKING', 'BUFFER', 'ADMIN_BLOCK'], required: true },
  booking: { type: Schema.Types.ObjectId, ref: 'Booking' },   // required iff source ∈ {BOOKING, BUFFER}
  blockId: { type: String },                                  // required iff source = ADMIN_BLOCK
  reason:  { type: String },                                  // required iff source = ADMIN_BLOCK
  convertedFromBufferOf: { type: Schema.Types.ObjectId, ref: 'Booking' }, // set only when a forced
                                                               // admin block converted a BUFFER row in place
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

BookingDayLockSchema.index({ car: 1, day: 1 }, { unique: true });
BookingDayLockSchema.index({ booking: 1 });
BookingDayLockSchema.index({ blockId: 1 });
BookingDayLockSchema.index({ car: 1, source: 1, day: 1 });
```

Day convention unchanged: `[startDate, endDate)` half-open, all days UTC midnight. Locks exist only while a booking is `CONFIRMED`, `ACTIVE`, or `CANCELLATION_REQUESTED` (spec 04 §1.3 — a request under cancellation review still holds the car); they are deleted at `COMPLETED`, `CANCELLED`, `NO_SHOW`, and (from `effectiveFrom` forward only) `TERMINATED`.

### D6 — A rental cannot be handed over unpaid

Unchanged in mechanism, restated with the field that now carries it. `Booking.amountReceived` (number, default 0) is maintained only by the Payment service, inside the same transaction as the settling payment. `CONFIRMED → ACTIVE` requires `amountReceived >= totalAmount`, or an explicit admin override (`overrideReason` required, audited as the distinct action `BOOKING_ACTIVATED_UNPAID`). **The deposit is not part of this guard** (spec 04 §6.2) — `depositReceived` is tracked separately and a shortfall there is advisory only (`depositShortfall`, surfaced but non-blocking), because stacking two overridable money guards on the single busiest click in the product (handover) is friction spec 04 OQ-B22 leaves open rather than resolves; this document adopts advisory-only until that question is revisited.

### D7 — Money movements are new records, never mutations, and now carry a `purpose`

`Payment.direction: IN | OUT`. A refund is a **new** `Payment` with `direction: OUT` and `refundOf` pointing at the original — never a mutation of the money-in record. `Payment.status` is `PENDING | SETTLED | VOID`; there is no `REFUNDED` status. `Booking.amountReceived` is the signed sum of `SETTLED` `RENTAL`-purpose payments.

**Extended per spec 04 §6.1**: `Payment.purpose: RENTAL | DEPOSIT` (required). The two axes combine into four meanings, and all four are needed — rental charge in, rental refund out, deposit in, deposit returned out — each maintaining its own `Booking` field (`amountReceived`, `depositReceived`, `depositReturned`). A fifth field, `depositRetained`, is written only by the deposit-retention endpoint (E-77) when an admin keeps the deposit outright rather than returning it via a `Payment`. **All five denormalised money fields on `Booking` are written by the Payment service and by nothing else** (spec 04 §3.3, `TR-B3`).

### D8 — There is no KYC entity, no verification workflow, and no derived verification status

**This is the one true reversal from the previous draft, which is why it gets its own numbered decision rather than a silent deletion.**

The previous draft's D8 made `User.kycStatus` a derived, non-demoting field computed from `KYC` documents, with an admin-triggered `VERIFIED → REVOKED` edge. Spec 03 §0–§5 and spec 04's `X-A` conflict table both withdraw this in full: there is no `KYC` entity, no `documentType` discriminator, no review queue, no verification status, no verification-based guard anywhere in the platform (spec 03 `TR-22`: no guard whose name matches `/kyc|verif/i` may ever be registered — this is a build-failing static test, not a style preference).

What replaces it is a single field on `User`:

```ts
drivingLicence: {
  number:     { type: String, required: true, uppercase: true, trim: true }, // 8–20 chars, [A-Z0-9- ]
  expiryDate: { type: Date },        // optional, never enforced against "today"
  enteredAt:  { type: Date, required: true },
  updatedAt:  { type: Date },
}
```

No `imageUrl`, no `imageBackUrl`, no `status`, no `verifiedBy`, no `rejectionReason` — spec 04 X-C1 drops the image fields spec 03 originally proposed, because collecting a document image is itself a form of document upload the "no online KYC" constraint forbids, not merely a verification step. Validation is **format-only** (length and character class) and gates nothing: registration requires the field to be present and well-formed (`400` otherwise, because the schema field is `required: true`), and no other endpoint ever branches on its value. It is self-asserted data whose only use is to give a human admin something to compare against the physical licence at handover (spec 04 §3.2, §7) — a step this system records as a checkbox and free-text note on `Booking`, never as a state field.

**Consequence for `Booking` request preconditions (spec 04 §3.1):** the old guard `renter's kycStatus = VERIFIED` is deleted outright, not weakened. What replaces it is a set of preconditions that do not require any verification: `guardCarPubliclyBookable`, `guardNotOwnRental`, `guardDateRangeValid`, `guardNoExistingRequestForRange`, `guardOpenRequestCap` (default 5 open `REQUESTED` bookings per renter), `guardNoUnresolvedNoShow`, `guardNoOverdueRental`, and `guardNoOverlappingRentalAnyCar` (one renter cannot hold two cars' worth of `CONFIRMED`/`ACTIVE` days at once — see §8 trade-offs). `guardLicenceOnFile` is retained as an **integrity assertion** (`500`, not `409`) rather than a precondition: every account has the field by construction, so its absence signals a corrupted row, not a user who needs to submit something (spec 04 §3.1, `Δ-B21`).

### D9 — Zod v4 is pinned; `/shared` has no Mongoose dependency

Unchanged. `zod@^4`. `/shared` depends on Zod and nothing else. ObjectId validation uses `/^[0-9a-fA-F]{24}$/`, never `mongoose.Types`.

### D10 — Client input never carries ownership, role, or status

Unchanged in principle, sharpened by spec 02 §1.1's structural consequence: input DTOs are `z.strictObject`, always — an unrecognised key (including any status field, `owner`, `renter`, `recordedBy`, `role`, `approvedBy`, every `*By`/`*At`) is a `400 VALIDATION_FAILED`, never a silently stripped field. `/shared` splits into `entities/*` (stored shape) and `dto/*` (request shape), never derived from one another by `.omit()` — an omission list is a denylist, and a denylist fails open the moment a field is added and the omit-list is not (spec 01 §3's known defect with this exact pattern is the concrete failure mode).

### D11 — `SUPER_ADMIN` is a third stored role value, and admin identity gets its own session-tracking layer

New in this revision, from spec 03 §1, §4.5.

`User.role: USER | ADMIN | SUPER_ADMIN`. `SUPER_ADMIN` is a strict superset of `ADMIN` on every `/api/admin` route; role checks are always `role ∈ { ADMIN, SUPER_ADMIN }`, never `role === 'ADMIN'` (spec 03 §1.5's consequence: `guardNotLastAdmin`/`guardNotLastSuperAdmin` must count each independently, or deactivating the last admin of one kind while the other still exists silently locks out that tier's entire capability set). `OWNER` is explicitly **not** a fourth role value — it is a derived predicate (`∃ Car { owner: userId, moderationStatus: APPROVED }`), computed per request, never stored, never placed in a token claim (spec 03 §1.2–§1.4; see §8 trade-offs for why storing it was rejected).

A `Session` collection (spec 03 §4.5) makes JWTs revocable, since a signed token is not revocable on its own:

```ts
const SessionSchema = new Schema({
  user:             { type: Schema.Types.ObjectId, ref: 'User', required: true },
  refreshTokenHash: { type: String, required: true, unique: true },  // SHA-256 of the raw token
  family:           { type: String, required: true },                // rotation lineage id
  status:           { type: String, enum: ['ACTIVE', 'ROTATED', 'REVOKED'], default: 'ACTIVE', required: true },
  revokedReason:    { type: String, enum: ['LOGOUT', 'LOGOUT_ALL', 'PASSWORD_CHANGED', 'ADMIN_REVOKED',
                                            'REUSE_DETECTED', 'ACCOUNT_DEACTIVATED', 'SUPERSEDED'] },
  userAgent:        { type: String },
  ipAddress:        { type: String },
  lastUsedAt:       { type: Date },
  expiresAt:        { type: Date, required: true },
}, { timestamps: true });

SessionSchema.index({ user: 1, status: 1 });
SessionSchema.index({ refreshTokenHash: 1 }, { unique: true });
SessionSchema.index({ family: 1 });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
```

Refresh-token rotation carries reuse detection: presenting a `ROTATED` or `REVOKED` token revokes the entire `family` and forces re-authentication (spec 03 §4.5 step 3). A `PasswordReset` collection (single-use, SHA-256-hashed token, 30-minute expiry) backs the admin-mediated reset flow (spec 03 §7) — there is no self-service "forgot password" email flow, because the platform has no email or SMS transport at all (spec 02 §15, spec 03 §6.5), and this is the one point where that absence is load-bearing rather than merely a deferred nicety.

### D12 — Pricing, deposit, and buffer configuration live in a new `SystemConfig` singleton

New in this revision, from spec 03 §11.8 and spec 04 §§1.5, 2.4, 3.1.

A single document, `_id: 'singleton'`, holds operator-tunable values that would otherwise be scattered magic numbers: `booking.maxDurationDays` (90), `booking.maxAdvanceDays` (365), `booking.maxOpenRequestsPerUser` (5), `booking.turnaroundBufferDays` (0), `booking.defaultDepositAmount` (0), `availability.publicWindowDays` (180), `security.adminMaxConcurrentSessions` (0 = unlimited), `listing.maxImagesPerCar` (12), `platform.registrationOpen` (true). Read at the moment each guard runs, never cached across a request boundary that spans a config change, and — critically for the buffer — **never retroactively applied**: a booking confirmed under one buffer value keeps the locks it was confirmed with even after the config changes (spec 04 §1.5, "Changing `turnaroundBufferDays`"). Editable only via `PATCH /api/superadmin/config` (spec 03 E-72), audited as `SYSTEM_CONFIG_CHANGED`.

---

## 2. Stack and pinned versions

| Concern | Choice | Note |
|---|---|---|
| Runtime | Node 22 LTS | |
| Language | TypeScript 5.x, `strict: true` | `noUncheckedIndexedAccess` on |
| Server | Express 5 | native async error propagation |
| DB | MongoDB 7+, Mongoose 8 | **replica set required** (D5 transactions) |
| Validation | Zod 4 | D9 |
| Password hashing | `argon2` (argon2id) | spec 03 §6.1 — not bcrypt; see §8 |
| Client | React 19 + Vite 6 | |
| Client data | TanStack Query v5 | |
| Styling | Tailwind 4 | |
| Tests | Vitest + Supertest + mongodb-memory-server (replset mode) | |
| Auth | JWT (access + refresh), `httpOnly` cookies + CSRF double-submit | §8 |

---

## 3. Folder structure

Full MERN monorepo tree. Every top-level workspace is npm/pnpm-workspace-managed; `/shared` is a publishable-shape package the other two depend on.

```
/                                    # repo root
  CLAUDE.md
  package.json                       # workspaces: client, server, shared
  tsconfig.base.json                 # shared compiler options, path aliases
  .eslintrc.cjs                      # includes the /shared dependency-boundary rule (§5.4)

  /specs                             # WHAT — untouched by implementation tasks
  /docs
    /design                          # HOW — this document and future numbered decisions
  /tasks                             # STEPS — the ordered implementation plan

  /shared
    package.json
    tsconfig.json
    src/
      entities/                      # one file per entity: the STORED shape (matches Mongoose 1:1)
        user.entity.ts
        car.entity.ts
        booking.entity.ts
        bookingDayLock.entity.ts
        payment.entity.ts
        auditLog.entity.ts
        session.entity.ts
        passwordReset.entity.ts
        systemConfig.entity.ts
      dto/                           # one file per USE CASE: the REQUEST shape (D10) — never derived
        auth.dto.ts                  # register, login, changePassword, resetPassword, ...
        car.dto.ts                   # createCar, updateCar, submitCar, delistCar, approveCar, ...
        booking.dto.ts               # requestBooking, cancelBooking, confirmBooking, activateBooking, ...
        payment.dto.ts                # recordPayment, settlePayment, refundPayment, retainDeposit, ...
        admin.dto.ts                  # deactivateUser, promoteAdmin, updateSystemConfig, ...
        query/                        # per-endpoint query DTOs (§9 of spec 02 — every filter is whitelisted)
          publicCarQuery.dto.ts
          myListingsQuery.dto.ts
          adminBookingsQuery.dto.ts
          ...
      enums/                          # every status/role/enum union — single source of truth
        role.enum.ts
        carModerationStatus.enum.ts
        carListingState.enum.ts
        bookingStatus.enum.ts
        paymentStatus.enum.ts
        paymentDirection.enum.ts
        paymentPurpose.enum.ts
        auditAction.enum.ts
      transitions/                    # transition tables as DATA — client and server both read this
        car.transitions.ts
        booking.transitions.ts
        payment.transitions.ts
      serialisation/                  # response-shape types (PublicCarSummary, BookingDetail, PartyContact, ...)
        car.view.ts
        booking.view.ts
        user.view.ts
      lib/
        objectId.ts                   # regex validator, no mongoose import (D9)
        dateRange.ts                  # half-open range helpers, UTC-midnight normalisation
      index.ts                        # barrel export

  /server
    package.json
    tsconfig.json
    src/
      config/
        env.ts                        # Zod-parsed env, boot-time validation (§12 of the old draft, retained)
        db.ts                         # connection + replica-set assertion
      models/                         # Mongoose schemas, one file per entity, mirrors /shared/entities
        User.model.ts
        Car.model.ts
        Booking.model.ts
        BookingDayLock.model.ts
        Payment.model.ts
        AuditLog.model.ts
        Session.model.ts
        PasswordReset.model.ts
        SystemConfig.model.ts
      services/                       # ALL business logic + every transition call
        auth.service.ts
        car.service.ts
        booking.service.ts
        payment.service.ts
        admin.service.ts
        superAdmin.service.ts
        session.service.ts
      transitions/
        transition.ts                 # the transition() chokepoint (§6)
        registry.ts                   # imports /shared/transitions, attaches server-only guard fns
        guards/                       # one file per guard family, each guard independently unit-testable
          car.guards.ts
          booking.guards.ts
          payment.guards.ts
          user.guards.ts
      routes/                         # thin: parse → call service → serialise. No logic.
        public/
          cars.routes.ts
        user/
          listings.routes.ts
          bookings.routes.ts
          profile.routes.ts
          auth.routes.ts
        admin/
          listings.routes.ts
          bookings.routes.ts
          payments.routes.ts
          users.routes.ts
          audit.routes.ts
        superadmin/
          admins.routes.ts
          config.routes.ts
      middleware/
        authenticate.ts                # populates req.actor from rgo_at (§8.5)
        requireActive.ts
        requireRole.ts
        csrf.ts
        rateLimit.ts
        errorHandler.ts
        requestContext.ts              # X-Request-Id
      lib/
        errors.ts                      # DomainError hierarchy (§7)
        dates.ts
        ids.ts
        password.ts                    # argon2 wrapper
        jwt.ts
      app.ts                           # express app (no listen)
      server.ts                        # listen
    tests/
      unit/                            # guards + services against a real in-memory replset
      integration/                     # supertest against app.ts
      fixtures/

  /client
    package.json
    tsconfig.json
    src/
      api/                             # TanStack Query hooks, one file per resource
        useCars.ts
        useBookings.ts
        useAuth.ts
        useAdminQueue.ts
      routes/                          # page components, grouped by audience
        public/
        user/
        admin/
        superadmin/
      components/
      lib/
        queryClient.ts
        csrf.ts                        # reads rgo_csrf, attaches X-CSRF-Token
      main.tsx
```

**Dependency rule (enforced by lint, not convention).** `/client` and `/server` both import `/shared`. Neither imports the other. `/shared` imports nothing from either, and nothing from `mongoose` or `express` — a package-boundary ESLint rule (`no-restricted-imports` scoped by path) fails the build on a violation, and it is the mechanical form of D9/D10's promise that `/shared` is safe to ship to a browser.

---

## 4. Mongoose model layout

### 4.1 File-per-model convention

One file per entity under `/server/src/models/`, named `<Entity>.model.ts`, exporting the compiled model as the default and the raw schema as a named export (`{ CarSchema }`) so tests can construct isolated schemas without pulling in Mongoose's global model registry. Every schema's shape is checked against its `/shared/entities/*.entity.ts` counterpart by a generated type-equality test (`TR-M1`) — the two are hand-written in different packages for the dependency-boundary reason in §3, so nothing else keeps them honest.

Nine models: `User`, `Car`, `Booking`, `BookingDayLock`, `Payment`, `AuditLog`, `Session`, `PasswordReset`, `SystemConfig`. There is no `KYC` model (D8) and no `SaleTransaction` model (out of scope permanently, §15).

### 4.2 Index strategy per model

| Model | Index | Why |
|---|---|---|
| `User` | `{ email: 1 }` unique | login identifier |
| | `{ phone: 1 }` unique | spec 01 §1.1 |
| | `{ role: 1 }` | admin user list filters (E-57), and the `guardNotLastAdmin`/`guardNotLastSuperAdmin` count query |
| | `{ isActive: 1 }` | admin filter + `requireActive` fast-path lookups |
| `Car` | `{ registrationNumber: 1 }` unique, **partial** (`moderationStatus: { $ne: 'DRAFT' }`) | D3 — a draft does not reserve the plate |
| | `{ owner: 1 }` | owner's own listings (`scopeToActor`), and `isOwner` derivation (spec 03 §1.4) |
| | `{ owner: 1, moderationStatus: 1 }` | the `isOwner` predicate specifically — a covering index avoids a collection scan on every `GET /api/auth/me` |
| | `{ moderationStatus: 1, listingState: 1 }` | the public-visibility predicate, evaluated on every public list query |
| | `{ 'location.city': 1, moderationStatus: 1, listingState: 1 }` | public browse filtered by city |
| | `{ 'location.geo': '2dsphere' }`, sparse | reserved for a future geo endpoint (out of scope, spec 01 §5 OQ#12); indexed now so it costs nothing to activate later and nothing while unused |
| `Booking` | `{ car: 1, startDate: 1, endDate: 1 }` | date-range queries against one car (admin detail, availability cross-check) |
| | `{ renter: 1, status: 1 }` | `scopeToActor('renter')` |
| | `{ owner: 1, status: 1 }` | `scopeToActor('owner')` |
| | `{ status: 1 }` | admin queue defaults, `unpaidOnly`/`overdueOnly`/`conflictedOnly` filters |
| | `{ status: 1, startDate: 1 }` | the "stale REQUESTED" query (§8.4 in spec 04) and the overdue-`ACTIVE` query — both filter on status then range on date |
| `BookingDayLock` | `{ car: 1, day: 1 }` unique | **D5 — the single load-bearing index in the schema.** Arbitrates booking-vs-booking, booking-vs-block, block-vs-block, and booking-vs-buffer collisions uniformly, because every occupied day is exactly one row regardless of `source`. |
| | `{ booking: 1 }` | releasing/counting a specific booking's locks |
| | `{ blockId: 1 }` | admin block create/delete (E-34/E-35) |
| | `{ car: 1, source: 1, day: 1 }` | `guardLocksIntact`'s `source: BOOKING`-only count at handover (spec 04 §1.5) |
| `Payment` | `{ booking: 1 }` | the only parent; every read is booking-scoped |
| | `{ status: 1 }` | admin payments queue |
| | `{ booking: 1, purpose: 1, direction: 1 }` | the four-way ledger sum (D7) computed per booking |
| `AuditLog` | `{ entityType: 1, entityId: 1, createdAt: -1 }` | per-record audit trail (E-28, E-38 inline `auditTrail`) |
| | `{ actor: 1, createdAt: -1 }` | "what has this admin done" |
| | `{ action: 1 }` | filtered audit queries (E-61) |
| `Session` | `{ user: 1, status: 1 }` | E-65 session list, revoke-all |
| | `{ refreshTokenHash: 1 }` unique | rotation lookup on every refresh |
| | `{ family: 1 }` | reuse-detection revocation sweep |
| | `{ expiresAt: 1 }` TTL | automatic cleanup — the **only** clock-driven mechanism in the platform (spec 04 §3.4), and it changes no business state |
| `PasswordReset` | `{ tokenHash: 1 }` unique | redemption lookup |
| | `{ user: 1 }` | invalidate-on-reissue |
| `SystemConfig` | none beyond `_id` | singleton document, always read by `_id: 'singleton'` |

**Compound-index ordering rule, applied throughout the table above:** the equality-filtered field (status, role, owner) always precedes the range-filtered field (date), because MongoDB can only use a single contiguous prefix of a compound index for a range scan — putting the range field first would make the equality filter unable to narrow the index seek.

### 4.3 Denormalization decisions

Every denormalised field below is justified individually, because an unjustified copy is exactly the "second source of truth" spec 03 §1.2 warns against when arguing `OWNER` should *not* be a stored role.

| Field | Where | Copied from | Justification | Who writes it |
|---|---|---|---|---|
| `Booking.owner` | `Booking` | `Car.owner` at request time | The single most-queried access pattern on `Booking` is *"bookings on my cars"* (`scopeToActor('owner')`, E-20). Without this copy, every such query is a `Car` lookup followed by an `$in` on car ids — two round trips and an index that cannot be a simple `{owner:1,status:1}`. `Car.owner` is immutable (spec 01 §1.3: *"never changes"*), so this copy can never drift. | `booking.service` at creation only, never rewritten |
| `Booking.ratePerDaySnapshot`, `weeklyRateSnapshot`, `depositSnapshot`, `quotedTotalAmount` | `Booking` | `Car.rentalPricePerDay` / `rentalPricePerWeek` / `depositAmount` at request time | RULE PR-3 (spec 04 §2.5): a quote a renter saw is a quote they are owed, even if the owner edits the price a minute later. Without the snapshot, `totalAmount` would either be mutable (letting a price edit retroactively change what an existing booking costs) or unrepresentable once the `Car` document changes. Owner price edits are additionally restricted to `DRAFT`/`REJECTED` listings (spec 02 E-10), so a *live* listing's price cannot move under a pending request either way — the snapshot is the second, permanent line of defence. | `booking.service`, written once at request, never updated |
| `Booking.amountReceived`, `depositReceived`, `depositReturned`, `depositRetained` | `Booking` | sum of `Payment` documents | D6's handover guard (`amountReceived >= totalAmount`) is checked on every `activate` call and cannot afford an aggregation query over `Payment` on that path with a transaction held open. A running total, maintained by exactly one writer (the Payment service, `TR-B3`), turns the guard into a field comparison. | `payment.service` only, inside the same transaction as the settling/refunding `Payment` write |
| `AuditLog.actorRole` | `AuditLog` | `actor.role` at the moment of the action | History must read correctly even after a role changes — an admin who is later demoted must still show as `ADMIN` on the actions they took while they held that role. Without the snapshot, a demotion would silently rewrite the meaning of every past audit row that joins to `User.role` live. | `transition()`, at write time, never updated |
| `Car.approvedBy/At`, `rejectedBy/At`, `publishedAt`, `delistedBy/At` | `Car` | the acting admin + `now()` | These are **not** derivable from `AuditLog` without a join on every read (E-28, `OwnerCar.availableActions`, the E-10 re-moderation guard). They are the one-hop answer to "is this car currently editable" and "when did it go live" that the UI needs on every listing detail render. | `transition()`, per edge, one writer each |
| `User.failedLoginCount`, `lockedUntil`, `lastFailedLoginAt` | `User` | login attempt outcomes | Progressive lockout (spec 03 §9.1) must be checked on the hot login path with no join; these are the state machine's own working variables, not a copy of anything else, so "denormalisation" does not strictly apply — listed here for completeness since they are new fields the previous draft did not have. | `auth.service`, on every login attempt |

**Explicitly rejected denormalisation:** caching the car owner's *name* or *phone* on `Booking` (the kind of thing the user's question anticipates). Rejected because `PartyContact` (spec 02 §7.2) is read exactly once per booking-detail view, is never listed in bulk (`BookingSummary` carries no counterparty at all — spec 04 §4.2, by design, so list endpoints cannot be used to harvest contacts), and is subject to a state-gated reveal rule (phone visible only from `CONFIRMED` onward, spec 04 RULE CR-1) that a stored copy would have to re-derive anyway on every read to respect revocation (RULE CR-3). A stored name additionally goes stale the moment a user changes their name via `PATCH /api/user/profile`, with five write sites needed to keep it current (one per state that reveals it) for a value that costs one indexed `populate()` to fetch fresh. The single-hop-lookup cost this would save does not clear the bar D2's `Car.owner` copy above clears.

---

## 5. State transition enforcement

### 5.1 Why the guard lives in the service layer, not the controller

A route handler in this design never touches a Mongoose model (§6.4, hard rule 1) and a service never reads `req` (hard rule 2) — it receives a typed `ActorContext` as an explicit argument. This means the *only* place that can plausibly hold "is this transition allowed" logic is the service layer, and specifically the single chokepoint every service calls through rather than each service re-implementing the check. Putting it in the controller would mean re-deriving `actorClass`, guard order, and audit-write atomicity in every route file; putting it in the model (a Mongoose pre-save hook) is rejected for the specific reason §6 below expands on: a hook has no `ActorContext`, no transaction boundary it can extend, and no way to abort the containing HTTP request with a typed domain error before Mongoose has already applied the write to its in-memory document.

### 5.2 The pattern

```ts
// server/src/transitions/transition.ts
type TransitionInput<E, S> = {
  entity: E;                     // the loaded Mongoose document, already fetched by the caller
  to: S;
  actor: ActorContext;
  reason?: string;
  metadata?: Record<string, unknown>;
  session: ClientSession;        // caller owns the transaction; transition() never starts one
};

async function transition<E extends { _id: ObjectId; status: string }, S extends string>(
  input: TransitionInput<E, S>
): Promise<E> {
  const { entity, to, actor, reason, metadata, session } = input;
  const entityType = registry.entityTypeOf(entity);
  const from = entity.status;

  // 1. Does this edge exist at all?
  const edge = registry.lookup(entityType, from, to);
  if (!edge) throw new InvalidTransitionError({ entityType, from, to });

  // 2. Is this actor's class permitted on this edge?
  if (!edge.actorClass.some((cls) => actorSatisfies(actor, entity, cls))) {
    throw new ForbiddenTransitionError({ entityType, from, to, actorClass: edge.actorClass });
  }

  // 3. Run every declared guard, in the order the registry lists them.
  for (const guard of edge.guards) {
    const result = await guard.check(entity, actor, session);
    if (!result.ok) throw new GuardFailedError({ guard: guard.name, ...result.details });
  }

  // 4. Apply the status write and the edge's declared side-effect fields.
  entity.status = to;
  Object.assign(entity, edge.sideEffects(entity, actor));
  await entity.save({ session });

  // 5. Write exactly one AuditLog document, in the same session.
  await AuditLog.create([{
    actor: actor.userId, actorRole: actor.role, action: edge.auditAction,
    entityType, entityId: entity._id, previousState: from, newState: to,
    reason, metadata,
  }], { session });

  return entity;
}
```

### 5.3 How an attempt is validated against spec 01's allowed transitions

The registry (`/shared/transitions/*.ts`) is **data**, not code with branches — one row per `(entityType, from, to)` triple, each row carrying its `actorClass` list (from spec 03 §2's permission matrix, not spec 01's original two-class version — spec 03 widened `OWNER`/`COUNTERPARTY`/`ADMIN` to also admit `SUPER_ADMIN` everywhere `ADMIN` appears) and its ordered guard list. Because it is data:

- The client imports the same table to compute `availableActions[]` for the "what can I do next" UI affordance (spec 02 §7.2) — advisory only, since the server re-checks unconditionally, but it means the registry can never silently drift between what the UI offers and what the server permits, because there is only one table.
- **Step 1 above is exactly spec 01 §2's transition tables, translated to data.** An edge not in spec 01 (as amended by specs 02–04) simply has no row, and `transition()`'s step 1 rejects it with `409 INVALID_TRANSITION` before any guard or actor check runs — an unknown edge is a contract violation, not a permission failure, which is why it is checked first.
- `INV-4` (§11) is a static test over this same table: every state in every enum must be reachable from the initial state, and every non-terminal state must have at least one outgoing edge. This is what caught the `APPROVED`-but-`UNLISTED` dead end in spec 02's original E-12 (fixed by adding the `APPROVED → DRAFT` edge) and what will catch the equivalent class of bug in any future amendment.

### 5.4 Where spec 04's guard conditions get checked

Every guard named in spec 04 §3.1–§3.3 (`guardCarPubliclyBookable`, `guardNotOwnRental`, `guardDateRangeValid`, `guardOpenRequestCap`, `guardNoUnresolvedNoShow`, `guardNoOverdueRental`, `guardNoOverlappingRentalAnyCar`, `guardPaymentCovered`, `guardStartDateReached`, `guardLocksIntact`, `guardEffectiveFromValid`, `guardDeductionsReconcile`, and the rest) is a named, independently unit-testable function under `/server/src/transitions/guards/`, taking exactly `(entity, actor, session)` and returning `{ ok: true } | { ok: false, details }`. None of them lives inline in a service function or a route handler — step 3 of `transition()` is the **only** place any of them is invoked, which is what makes design §11's non-negotiable tests (`INV-2`, `INV-5`, and spec 04's `TR-B1` through `TR-B11`) able to test a guard once, in isolation, rather than re-deriving its behaviour from an integration test of the whole request pipeline.

Two guard families are named but do **not** run inside `transition()`, and this is deliberate rather than an oversight: `scopeToActor(field)` (spec 02 §10) is a *query builder*, not a guard — a list endpoint has no single loaded document for `transition()` to guard — and route-level middleware (`requireAuth`, `requireActive`, `requireRole`, CSRF) runs before a document is even loaded (§8's pipeline). Both are still named, importable, and covered by their own build-failing static tests (`TR-05`, `TR-08`) for the identical reason `transition()`'s guards are: a check that lives only in prose is a check a future route can silently omit.

---

## 6. Concurrency — booking date conflicts

### 6.1 The mechanism: a unique index inside a transaction, not a read-then-write check, not optimistic locking

**Chosen: a MongoDB unique compound index (`{ car: 1, day: 1 }` on `BookingDayLock`) as the sole arbiter, enforced by materialising one row per occupied day inside the same transaction as the status write.**

Confirming a booking (spec 02 E-39) runs, atomically:

1. Load the `Booking`, verify `guardStatusIsRequested`, `guardCarStillBookable`, `guardRenterActive`, `guardDatesNotPast`.
2. Insert one `BookingDayLock` document per day in `[startDate, endDate)` with `source: BOOKING`, plus one per day in `[endDate, endDate + turnaroundBufferDays)` with `source: BUFFER` (spec 04 RULE AV-3) — all in the transaction.
3. If every insert succeeds, write `status: CONFIRMED`, `confirmedBy`, `confirmedAt`, and the single `AuditLog` row, and commit.
4. If **any** insert fails on the unique-index duplicate-key error, the whole transaction aborts — no partial lock set is ever left behind, and the status write never happens, because it is in the same transaction as the failed inserts.

Two admins confirming overlapping requests concurrently therefore cannot both succeed: MongoDB's index enforces the exclusion at the storage layer, and whichever transaction's insert loses the race gets the duplicate-key error, not the application. This is design's own `INV-2` non-negotiable test (§11): *a parallel double-confirm on overlapping dates produces exactly one `CONFIRMED` booking.*

### 6.2 What happens on conflict at admin-approve time

The duplicate-key abort is caught, retried at most twice (transient-transaction-error retry, per MongoDB's transaction API contract — a duplicate key inside a transaction is not itself transient, but a concurrent transaction commit racing the retry can be), and on the second failure surfaced as:

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "These dates are no longer available.",
    "details": { "reason": "DATES_UNAVAILABLE", "conflictingDays": ["2026-10-02", "2026-10-03"] },
    "requestId": "01JB4W8XQ2R7N0E3ZK9M5T6V1P"
  }
}
```

HTTP `409`. The losing admin's booking **stays `REQUESTED`** — there is no auto-reject, because every status write in this system has a human actor (spec 04 §1.4, D2 of the previous draft's §15) and auto-rejecting a competitor on behalf of an admin who clicked "confirm" on a *different* record would write a status change with no honest actor to attribute it to. The admin must explicitly reject (E-40) or cancel (E-44) the loser as a second, separate action. The client is told which specific days collided (`conflictingDays`) so the admin can decide without a second round-trip whether the request is salvageable on adjusted dates (it is not, per D4 — dates are immutable, spec 04 §3.5 — so in practice this means "reject or leave it, and tell the renter to re-request").

The same index and the same mechanism additionally arbitrate: an admin's maintenance block landing on booking-held days (`409` unless `force: true`, in which case only the free days in the range are blocked — spec 04 §1.6/§1.7), and two overlapping admin blocks (always `409`, `force` does not apply block-vs-block). One index, one failure mode, everywhere a day can be claimed twice — this uniformity is what spec 04 §1.1 calls out explicitly as the reason the day-lock collection was extended rather than given a sibling collection for blocks.

### 6.3 Why not the alternatives

- **Read-then-write overlap check.** Rejected outright — this was the original spec 01 design and is the exact bug D5 exists to fix: two concurrent reads can both observe "no conflict" before either write lands.
- **Optimistic locking (a version field on `Car` or on a per-car availability document).** Rejected because it serialises *all* confirmations for a given car through a single hot document, including confirmations for entirely non-overlapping date ranges, and because a version-conflict retry storm on a popular car's confirm endpoint has no natural backoff shape the way a duplicate-key check on a specific day does. It would also require a second code path for admin blocks and buffer days, reintroducing the exact class of divergence the unified index avoids.

---

## 7. AuditLog strategy

### 7.1 Chosen: explicit service call, not a Mongoose hook

**`transition()` writes the `AuditLog` row explicitly, as step 5 of the same function, in the same `ClientSession` as the status write (§5.2). There is no `pre('save')` or `post('save')` hook on any model that writes audit rows.**

### 7.2 The concrete failure mode of the rejected option

A Mongoose `post('save')` hook on `Car`/`Booking`/`Payment` cannot correctly implement spec 01 §1.6's rule (*"every service-layer function that changes a status field MUST write exactly one AuditLog document in the same transaction/session as the state change"*), for three independent reasons, any one of which is disqualifying on its own:

1. **A hook has no `ActorContext`.** `AuditLog.actor` and `actorRole` are required fields (spec 01 §1.6) and the actor who performed a save is not part of a Mongoose document's own state — it would have to be smuggled onto the document instance as an ad-hoc property (`doc.$locals.actor = ...`) before every `save()` call, which is strictly *more* boilerplate per call site than calling a logging function directly, while also being invisible to TypeScript and silently wrong if a call site forgets to set it.
2. **A hook cannot see the session reliably across all write paths.** `findOneAndUpdate`, `updateOne`, and `save()` fire different hook sets in Mongoose, and a session passed as a query option is not automatically visible to a `post` hook's closure the way it is to a service function that already has `session` in scope as a parameter. A service that ever used `Car.findOneAndUpdate(..., { session })` instead of `car.save({ session })` — a change a future contributor could make without realising the audit-write hook depends on `save()` specifically — would silently stop producing audit rows, with no error, no test failure until an `INV-3` rollback test happened to catch it, and possibly not even then if the write path itself isn't covered.
3. **A hook fires *after* Mongoose has already mutated the in-memory document, which is one step too late to reject the whole operation cleanly.** `transition()`'s guard checks (§5.2 step 3) must run and potentially throw *before* the status field is ever assigned, so that a `GuardFailedError` never touches the document at all. A hook-based design would need the guards to run in a `pre('save')` hook instead, which faces problem 1 and 2 all over again for guard inputs (`actor`, `session`) and additionally makes guards untestable in isolation — you can no longer unit-test "does `guardPaymentCovered` reject this booking" without constructing a full Mongoose document and triggering `.save()`, which is exactly the coupling `transition()` exists to avoid (§5.1, §11).

The explicit-call design has none of these problems because `transition()` already has `actor` and `session` as required parameters — the same two things a hook would have to reconstruct through side channels — and because the guard-then-write-then-audit ordering is just the function's own sequential code, not something spread across two different Mongoose lifecycle hooks that must be kept in sync by convention.

### 7.3 Exact write shape and where it fires

```ts
await AuditLog.create([{
  actor:         actor.userId,
  actorRole:     actor.role,               // snapshot — spec 01 §1.6, so history reads correctly after a promotion/demotion
  action:        edge.auditAction,          // typed enum from /shared/enums, e.g. 'BOOKING_CONFIRMED'
  entityType:    entityType,                // 'CAR' | 'BOOKING' | 'PAYMENT' | 'USER'  (no 'KYC' — D8)
  entityId:      entity._id,
  previousState: from,
  newState:      to,
  reason,                                   // optional free text — rejection reason, cancellation reason, admin note
  metadata,                                  // arbitrary structured context, e.g. { lockedDays, bufferDays } on confirm
  ipAddress:     actor.ip,
}], { session });
```

Fires **only** inside `transition()`, step 5, after the status write and before the enclosing service function returns. Never from a route handler, never from a model hook, never from a background job (there are none — spec 04 §3.4: *"nothing at all happens on a clock"* except the `Session` TTL sweep, which is not a business-state change and is not audited). `password`, `currentPassword`, `newPassword`, `token`, `resetToken`, and `drivingLicenceNumber` are redacted by key name before anything is logged, at the request-logging middleware layer (spec 03 §6.4) — this is a separate, narrower control from `AuditLog.metadata`, which never receives these keys in the first place because no service ever puts them there.

**Rollback guarantee (design's `INV-3`).** Because the audit write is inside the same `ClientSession` as the status write, an abort of the transaction — whether from a duplicate-key error (§6), a guard throwing after the audit write was already queued but before commit, or any other mid-transaction failure — rolls back the audit row along with everything else. A client that received an error therefore never sees a corresponding `AuditLog` entry; the log is exactly as trustworthy as the data it describes, never ahead of it.

---

## 8. Zod schema sharing

### 8.1 How `/shared` houses schemas both sides consume

`/shared/src/entities/*.entity.ts` defines the **stored** shape of every entity as a Zod schema (used for typing via `z.infer` and for fixture validation in tests — never sent over the wire as-is). `/shared/src/dto/*.dto.ts` defines the **request** shape for every use case, hand-written as `z.strictObject({...})`, never derived from an entity schema by `.omit()` or `.pick()` (D10) — this is the fix for spec 01 §3's known defect, where `createCarSchema = carSchema.omit({...})` let `owner` through because it wasn't in the omit list. `/shared/src/enums/*.enum.ts` is the single source of truth for every status/role union — both the entity schemas and the DTO schemas import from here, so a new enum value added in one place (say, `Booking.status` gaining `NO_SHOW`) cannot be forgotten in the other, because there is only one declaration to update. `/shared/src/transitions/*.ts` exports the transition registry as data (§5.3) so the client can compute `availableActions[]` from literally the same table the server enforces against.

### 8.2 Build/import setup so both sides consume the same file

- `/shared` is a workspace package (`"name": "@rango/shared"` in its `package.json`), listed as a `workspace:*` dependency in both `/client/package.json` and `/server/package.json`. There is no publish step and no version to keep in sync manually — a workspace-linked package always resolves to the checked-out source.
- `/shared/package.json` declares `"exports"` explicitly (not a bare `main`), mapping `.` to the compiled barrel and exposing `./entities`, `./dto`, `./enums`, `./transitions` as sub-path exports, so both consumers can `import { bookingStatusSchema } from '@rango/shared/enums'` without pulling in the entire package graph for a tree-shaking win on the client bundle.
- **Build order.** `/shared` compiles first (`tsc --build` with project references — `tsconfig.base.json` sets up the reference graph so `/server` and `/client` each reference `/shared`'s `tsconfig.json`). The server runs its compiled output directly (or `tsx`/`ts-node` in dev, resolving `/shared` straight from source via a `paths` alias, so a shared-file edit is visible without a rebuild step in the dev loop). Vite resolves the same alias for the client dev server and bundles `/shared`'s source directly rather than its compiled output, so Vite's own transform pipeline (and its tree-shaking) sees the original TypeScript.
- **No Node built-ins, no `mongoose`, no `express` in `/shared` — enforced by the lint rule in §3**, which is what makes the Vite bundle step in the previous point safe: nothing in `/shared` can accidentally pull in a server-only dependency that would either fail to bundle for the browser or silently balloon the client bundle.
- Zod v4 is pinned as a single version across all three workspaces via the root `package.json`'s `overrides` (or pnpm's `overrides` equivalent), so `/client` and `/server` cannot independently drift to incompatible Zod minors that would make a schema instance constructed in one package fail an `instanceof`-style check in the other (Zod v4 schemas are largely duck-typed, but pinning removes the question entirely rather than relying on that).

---

## 9. Concurrency and transactions (cross-cutting)

**Every state transition runs inside a MongoDB transaction.** No exceptions — the audit write must be atomic with the status write (§7), and D5's lock inserts must be atomic with the booking's own status write (§6).

- Local dev and CI run a **single-node replica set**; a standalone `mongod` fails at startup with an explicit message from `config/db.ts`, by design, not as an accepted degraded mode.
- Services accept an optional `session` parameter; the outermost caller (always a route handler's service invocation) creates it via `startSession()` + `withTransaction()`. Nested service calls (e.g. `booking.service.confirm` calling into lock-acquisition helpers) reuse the same session — no service ever starts a second, nested transaction.
- Write concern `majority`, read concern `snapshot`, inside every transaction.
- Transient transaction errors — including the duplicate-key abort from D5 — are retried at most twice, then surfaced as `ConflictError` → HTTP `409` (§10).
- Denormalised fields (`Booking.amountReceived` and its siblings, `Car.approvedBy/At`, etc.) are written only inside the same transaction as their source of truth, by exactly one service each (§4.3). A scheduled consistency-check script (retained from the previous draft's `OPS-02`) recomputes and *reports* drift rather than silently repairing it — silent repair would hide the exact class of bug the check exists to surface.

---

## 10. Error handling contract

### 10.1 Error class hierarchy

```ts
class DomainError extends Error {
  code: string;
  httpStatus: number;
  details?: unknown;
}

class ValidationError          extends DomainError { code = 'VALIDATION_FAILED';      httpStatus = 400; }
class AuthError                extends DomainError { code = 'UNAUTHENTICATED';        httpStatus = 401; }
class AccountInactiveError     extends DomainError { code = 'ACCOUNT_INACTIVE';       httpStatus = 403; }
class ForbiddenError           extends DomainError { code = 'FORBIDDEN';              httpStatus = 403; }
class ForbiddenTransitionError extends DomainError { code = 'FORBIDDEN_TRANSITION';   httpStatus = 403; }
class NotFoundError            extends DomainError { code = 'NOT_FOUND';              httpStatus = 404; }
class MethodNotAllowedError    extends DomainError { code = 'METHOD_NOT_ALLOWED';     httpStatus = 405; }
class ConflictError            extends DomainError { code = 'CONFLICT';               httpStatus = 409; }
class InvalidTransitionError   extends DomainError { code = 'INVALID_TRANSITION';     httpStatus = 409; }
class GuardFailedError         extends DomainError { code = 'GUARD_FAILED';           httpStatus = 409; }
class PayloadTooLargeError     extends DomainError { code = 'PAYLOAD_TOO_LARGE';      httpStatus = 413; }
class UnsupportedMediaTypeError extends DomainError { code = 'UNSUPPORTED_MEDIA_TYPE'; httpStatus = 415; }
class RateLimitedError         extends DomainError { code = 'RATE_LIMITED';           httpStatus = 429; }
class InternalError            extends DomainError { code = 'INTERNAL';               httpStatus = 500; }
class ServiceUnavailableError  extends DomainError { code = 'SERVICE_UNAVAILABLE';    httpStatus = 503; }
```

Every guard throws `GuardFailedError` with `details: { guard: guardName, ...guardSpecificContext }` (spec 02 §3.3); `transition()` step 1/2 throw `InvalidTransitionError`/`ForbiddenTransitionError` directly; route-level Zod parse failures are caught by the error middleware and wrapped as `ValidationError` with `details: { source: 'body' | 'query' | 'params', fieldErrors, formErrors }` (Zod v4's `z.flattenError` shape).

### 10.2 HTTP status mapping

| Class | `code` | HTTP | Raised by |
|---|---|---|---|
| `ValidationError` | `VALIDATION_FAILED` | 400 | route-level DTO parse, any layer |
| `AuthError` | `UNAUTHENTICATED` | 401 | `authenticate` middleware, credential/token failures |
| `AccountInactiveError` | `ACCOUNT_INACTIVE` | 403 | `requireActive` |
| `ForbiddenError` | `FORBIDDEN` | 403 | `requireRole`, CSRF mismatch |
| `ForbiddenTransitionError` | `FORBIDDEN_TRANSITION` | 403 | `transition()` step 2 |
| `NotFoundError` | `NOT_FOUND` | 404 | missing record, or a record outside the caller's read audience (never distinguished — see below) |
| `MethodNotAllowedError` | `METHOD_NOT_ALLOWED` | 405 | known path, wrong verb |
| `ConflictError` | `CONFLICT` | 409 | unique-constraint violation, or an exhausted transaction retry (`WRITE_CONFLICT`) |
| `InvalidTransitionError` | `INVALID_TRANSITION` | 409 | `transition()` step 1 |
| `GuardFailedError` | `GUARD_FAILED` | 409 | `transition()` step 3, any guard |
| `PayloadTooLargeError` | `PAYLOAD_TOO_LARGE` | 413 | body-size middleware |
| `UnsupportedMediaTypeError` | `UNSUPPORTED_MEDIA_TYPE` | 415 | content-type middleware |
| `RateLimitedError` | `RATE_LIMITED` | 429 | rate-limit middleware, any bucket |
| `InternalError` | `INTERNAL` | 500 | anything unhandled — the error middleware's catch-all |
| `ServiceUnavailableError` | `SERVICE_UNAVAILABLE` | 503 | database unreachable, or a replica set that lost quorum mid-transaction |

**Ownership failures are `NotFoundError`, never `ForbiddenError`** (spec 02 §3.4 rule 2): a `USER` requesting someone else's listing via `GET /api/user/listings/:carId` gets `404`, identical in shape to a non-existent `carId`, so the endpoint cannot be used as an existence oracle for records the caller cannot see. `ForbiddenError` is reserved for cases where the caller is *known* to be able to see the record's existence but not act on it (there are few of these; the role gate on `/api/admin` for a `USER` is the main one, and it fires before any record lookup at all per §10.4).

### 10.3 Response shape (matches spec 02)

Success, single resource:

```json
{ "data": { "id": "6712ab...", "...": "..." } }
```

Success, collection:

```json
{
  "data": [ { "id": "6712ab..." } ],
  "meta": { "page": 1, "limit": 20, "total": 137, "totalPages": 7, "hasNext": true, "sort": "createdAt:desc" }
}
```

Error, always:

```json
{
  "error": {
    "code": "GUARD_FAILED",
    "message": "Cannot activate booking: payment not settled.",
    "details": { "guard": "guardPaymentCovered", "required": 4500, "received": 0 },
    "requestId": "01JB4W8XQ2R7N0E3ZK9M5T6V1P"
  }
}
```

`data` and `error` are mutually exclusive on every response. A successful mutation returns the **full updated resource**, never a bare `{ ok: true }`, so the client's TanStack Query cache updates from the response instead of triggering a refetch. `204 No Content` is used only for logout and a handful of session/CSRF-exempt actions spec 03 names explicitly (E-04, E-63's cookie rotation aside, E-64, E-75); nothing else returns an empty body. `requestId` always matches the `X-Request-Id` response header and is generated server-side per request — a client-supplied `X-Request-Id` is ignored, never trusted, so it cannot be used to correlate a forged value into server logs.

**One error middleware.** Every route's async errors propagate to it (Express 5's native async error propagation removes the need for a `try/catch`-and-`next(err)` wrapper on every handler). A `DomainError` is serialised directly using its own `code`/`httpStatus`/`details`. Anything that is not a `DomainError` — an unexpected `TypeError`, a driver error, a Mongoose validation error that slipped past a Zod check — is logged with the request id and converted to an opaque `InternalError`; its message, stack trace, and any raw Mongo driver text (including duplicate-key index names) never reach the client.

### 10.4 Precedence, fixed and testable

```
415 → 413 → 429 → 401 → 400 (path params) → 403 (role gate)
    → 404 (record / read audience) → 400 (body, query)
    → 403 (transition actorClass) → 409 (edge) → 409 (guards) → 409 (write conflict)
```

Two consequences worth stating because they are easy to get backwards: the role gate runs **before** any record lookup, so a `USER` hitting an `/api/admin/*` path gets `403` whether or not the target id exists (otherwise every admin path becomes an existence oracle for any authenticated caller); and within a namespace the caller may legitimately address, the ownership `404` runs **before** body validation, so a malformed request body against someone else's record still returns `404`, not `400` — a `400` there would confirm the record exists by virtue of Zod having reached the point of validating fields against it. Full pipeline ordering, including where CSRF and `ACCOUNT_INACTIVE` sit (spec 03 additions the original spec 02 chain didn't place), is §8's route-protection pipeline table below.

### 10.5 Route protection pipeline (where each error fires)

```
 0  requestId          assign X-Request-Id
 1  helmet / CORS      security headers, CLIENT_ORIGIN allowance
 2  contentType        non-JSON body            → 415
 3  bodyLimit          > 64 KB                  → 413
 4  rateLimit          bucket exhausted         → 429
 5  authenticate       verify rgo_at, load User → 401
 6  csrf               double-submit mismatch   → 403           (non-GET only)
 7  requireActive      User.isActive == false   → 403 ACCOUNT_INACTIVE
 8  requireRole        role not permitted       → 403 FORBIDDEN
 9  validateParams     malformed :id            → 400
10  loadResource       not found                → 404
11  requireOwnership   not the caller's record  → 404 (never 403)
12  validateBody/Query strict Zod DTO           → 400
13  handler → service → transition()
                       actorClass wrong  → 403 FORBIDDEN_TRANSITION
                       no such edge      → 409 INVALID_TRANSITION
                       guard rejected    → 409 GUARD_FAILED
                       write conflict    → 409 CONFLICT
```

`requireRole` and `requireActive` read `User.role`/`User.isActive` from the **database**, never from the JWT claim, on `/api/admin` and `/api/superadmin` (spec 03 §4.6) — the claim is a 15-minute-stale rendering hint and is never a guard input anywhere in the codebase, enforced by a static test (`TR-13`) that fails the build if any file under `guards/` or `services/` references the raw token claims object.

---

## 11. Testing strategy

| Layer | Tool | What it covers |
|---|---|---|
| Transition registry | Vitest, no DB | Every edge's `actorClass` and guard list; `INV-4` reachability of every state; no orphan states |
| Guards | Vitest, unit | Each guard in isolation, given a plain object and a mock actor — no `transition()`, no HTTP |
| Services | Vitest + in-memory replset | Guards wired through `transition()`, audit writes, transaction rollback (`INV-3`) |
| Concurrency | Vitest + in-memory replset | Parallel confirms on overlapping ranges — exactly one wins (`INV-2`); parallel admin-block-vs-confirm races |
| API | Supertest against `app.ts` | Auth, RBAC, the full route-protection pipeline (§10.5), status codes, payload shape |
| Route declarations | Vitest, static | `TR-05` (every `/api/user` route declares an ownership guard or `scopeToActor`), `TR-08` (no `/api/user` handler branches on `actor.role`), `TR-22` (no guard name matches `/kyc|verif/i`) |
| Invariants | Vitest, static + DB | see below |

**Non-negotiable tests**, carried forward and extended from the previous draft:

- `INV-1`: no route can produce a publicly visible car without an admin action.
- `INV-2`: a parallel double-confirm on overlapping dates produces exactly one `CONFIRMED` booking.
- `INV-3`: every `AuditLog` write is rolled back when its transaction aborts.
- `INV-4`: every state in every entity's enum is reachable from the initial state, and every non-terminal state has an outgoing edge.
- `INV-5`: `Booking` cannot reach `ACTIVE` with `amountReceived < totalAmount` unless `overrideReason` is set.
- `TR-B3` (new, spec 04): `amountReceived`, `depositReceived`, `depositReturned`, `depositRetained` are each written by exactly one service.
- `TR-B4` (new, spec 04): for every `Booking`, `status ∈ { CONFIRMED, ACTIVE, CANCELLATION_REQUESTED }` if and only if it holds at least one `BookingDayLock` — a database-wide invariant, not a per-endpoint assertion.
- `TR-B10` (new, spec 04): for every `ACTIVE` booking and every possible value of "today", at least one of `complete` or `terminate` passes its guards — this is the regression test for RULE PR-4's fix to `guardEffectiveFromValid`.
- `TR-B11` (new, spec 04): no `{ car, day }` ever carries two `BookingDayLock` rows, through any sequence of confirm / force-block / unblock / complete — the invariant the buffer-to-block conversion (RULE AV-5) is easiest to break.
- `TR-22` (spec 03): no guard registered anywhere in the system has a name matching `/kyc|verif/i` — the structural guarantee that D8's removal cannot silently regrow a verification gate.

---

## 12. Configuration

All env vars parsed by Zod at boot (`config/env.ts`); the process exits non-zero on invalid config rather than failing at first request. Required: `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (must differ from each other and from any value in the committed `.env.example`, both ≥ 32 bytes — spec 03 §4.7), `NODE_ENV`, `PORT`, `CLIENT_ORIGIN`. `JWT_ACCESS_SECRET_PREVIOUS` is optional, accepted for verification only, supporting secret rotation without a mass logout (spec 03 OQ-A7). Image storage target (`UPLOAD_*`) remains deferred — see §13; operator-tunable business values (buffer days, deposit default, rate limits' bucket sizes) live in `SystemConfig` (D12), not in env vars, because they change at runtime without a redeploy.

---

## 13. Non-goals / deferred

- **Selling or reselling vehicles.** Out of scope permanently. See §15.
- **Online identity or document verification of any kind.** Out of scope permanently, by explicit constraint (spec 04). Not deferred, not phase 2 — removing it is D8.
- **Image upload transport.** `Car.images` still requires at least one URL (spec 01 §1.3, unaffected by D8) and remains the **only** upload requirement left in the platform once the licence image fields are dropped (spec 04 X-C1). Where bytes live (S3, Cloudinary, local disk) is deferred to a future `docs/design/02`; until then the API accepts URLs and the client has no uploader, which leaves listing-photo capture not fully end-to-end (spec 02 OQ-35, re-scoped by spec 04 to `CAR`/`CL` only).
- **Notifications.** No email or SMS anywhere. This is why password reset is admin-mediated (D11) rather than self-service, and it is marked `BLOCKING` in spec 03 §6.5 for a reason: adding a transactional email provider unblocks several deferred items at once (self-service reset, email verification, booking notifications) and should be revisited before launch, not treated as permanently out of scope.
- **Search/geo.** `location.geo` is stored and indexed (§4.2) but no geo query endpoint ships in phase 1.
- **Multi-currency.** Single implicit currency, no `currency` field.
- **Integer minor units for money.** Spec 04 OQ-B10 flags storing money as a JSON float as a real reconciliation hazard for a cash business and recommends paise-integer storage; this document does not resolve it — see the open questions below.
- **MFA/TOTP for admin accounts.** Recommended in spec 03 §9.9 for `ADMIN`/`SUPER_ADMIN` before launch; not designed here.
- **Rate limiting implementation details beyond the bucket table**, CAPTCHA, audit-log retention policy, geo query performance at scale — phase 2.

---

## 14. Spec amendments required

A revised `S`-block in `tasks/01-implementation-plan.md` must apply these before any `AUTH`/`CAR`/`BOOK`/`PAY`/`ADM` task starts. This supersedes the previous draft's §14 table in full — several of its rows (8, 9) described amendments this revision reverses (D8).

| # | Spec section | Change | Decision |
|---|---|---|---|
| 1 | Spec 01 hard constraints | Replace absolute admin rule with AUTHZ-1…4 | D1 |
| 2 | Spec 01 §2 all tables | Add `actorClass` column | D1 |
| 3 | Spec 01 §1.3, §2.3 | Split `Car.status`; availability derived; `DELISTED` re-listable (admin-only) | D2 |
| 4 | Spec 01 §1.3 | Partial unique index on `registrationNumber` | D3 |
| 5 | Spec 01 §1.4, §2.4 | Add `CANCELLATION_REQUESTED`, `TERMINATED`, `NO_SHOW` | D4 |
| 6 | Spec 01 §1.4 | Add `BookingDayLock` entity, extended with `source`/`blockId`/`reason`/`convertedFromBufferOf` | D5 |
| 7 | Spec 01 §2.4 | Payment guard on `CONFIRMED → ACTIVE` (deposit advisory-only) | D6 |
| 8 | Spec 01 §1.5, §2.5 | `direction`, `purpose`, `refundOf`, `VOID`; drop `REFUNDED` | D7 |
| 9 | Spec 01 §1.2, §1.1, §2.2 | **Delete** the `KYC` entity, `User.kycStatus`, and the KYC state machine in full; add `User.drivingLicence.number` | D8 |
| 10 | Spec 01 §3 | Rewrite all Zod in v4; drop `mongoose` import | D9 |
| 11 | Spec 01 §3 | Split entity vs DTO schemas; explicit input schemas | D10 |
| 12 | Spec 01 §1.1 | `User.role` gains `SUPER_ADMIN`; add `Session`, `PasswordReset` entities; add lockout fields | D11 |
| 13 | Spec 01 §1 | Add `SystemConfig` singleton entity | D12 |
| 14 | Spec 01 §4, §5 | Regenerate ER diagram, close OQs, add read-visibility matrix, remove `KYC` node | D8, D2 |
| 15 | `tasks/01-implementation-plan.md` | Delete the `KYC` block entirely; add `SA` (super-admin) and `CFG` (system config) blocks; add deposit/buffer/no-show tasks to `BOOK`/`PAY` | D8, D11, D12 |
| 16 | `CLAUDE.md` | Title still reads *"Rental + Resale Platform"* — stale; update to rental-only | spec 02 OQ-54 |

---

## 15. What survives from the previous draft, and what does not

Recorded so the reasoning is recoverable, on the same principle the previous draft applied to the resale flow it removed.

| Was | Status in this revision |
|---|---|
| INV-1/INV-2 → AUTHZ-1…4 | **Survives**, restated in spec 03's vocabulary (D1) |
| `Car.status` split (D2), partial registration index (D3), `BookingDayLock` (D5), payment-covered handover guard (D6), append-only refund-as-new-record (D7) | **Survive**, all extended rather than replaced (§1) |
| `KYC` entity, `User.kycStatus` derivation, `VERIFIED → REVOKED` edge | **Removed in full.** This is D8, the one true reversal (§1). |
| Zod v4 pinning, no-mongoose-in-shared, explicit DTOs never derived by `.omit()` | **Survive unchanged** (D9, D10) |
| `SYSTEM` actor class, resale flow, `Car.listingType`, `Car.salePrice`, `Payment.relatedType` | **Stay removed.** Out of scope permanently, not revisited by this document. |
| Single `transition()` chokepoint, registry-as-data, explicit-audit-write pattern | **Survive unchanged** (§5, §7) — nothing about removing KYC touches how a transition is enforced or logged, only which transitions and guards exist |

---

## 16. Open questions

Carried forward from specs 02–04 where this document does not resolve them, plus one new question this document's own choices raise. None of these block writing code for tasks that do not touch the area in question, but every one marked **BLOCKING** must be answered before the named block starts.

1. **BLOCKING for `AUTH`.** Encrypt `User.drivingLicence.number` at rest? (spec 03 OQ-A11, restating spec 02 OQ-20 against the new field.) This document takes no position; it changes the `User` schema and cannot be retrofitted without a migration over every row.
2. **BLOCKING for `AUTH`.** Is admin-mediated password reset (D11) the permanent recovery path, or should a transactional email provider be added before launch to unblock self-service reset? (spec 03 OQ-A15.)
3. Integer minor units for money (paise) versus the current JSON-float storage — spec 04 OQ-B10, unresolved here, and the cost of leaving it unresolved compounds with every payment-summing feature built on top of `Payment`/`Booking` money fields.
4. Should `guardDepositCovered` gate handover the same overridable way `guardPaymentCovered` does, or stay advisory-only as D6 currently specifies? (spec 04 OQ-B22.)
5. Should the buffer-and-block extension of `BookingDayLock` (D5/D12) eventually split into a genuinely separate collection once admin-block volume is high enough that the mixed-purpose index becomes a hot-spot concern? Not a problem at expected phase-1 scale; flagged so it is a deliberate future decision rather than an accidental one.
