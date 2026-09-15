# 01 — Implementation Plan

Reads: `specs/01-domain-and-state-machines.md`, `docs/design/01-technical-design.md`.

**Scope: rental only.** The platform never sells a vehicle. An earlier revision of this plan contained a six-task `SALE` block plus a `SaleTransaction` model, a resale integration test, and a buyer-facing client screen. All of it is removed — see `docs/design/01-technical-design.md` §15.

**Rules of execution** (from CLAUDE.md): never implement beyond the current task; never modify specs while implementing; stop after each task for review.

**Ordering.** Blocks run in the order listed. Within a block, tasks run in ID order unless `Deps` says otherwise. Every task is scoped to a single commit.

**Task format**
- **Does** — the change, in one sentence.
- **Files** — everything touched. If a task touches files outside this list, it was scoped wrong; stop and re-scope.
- **Deps** — task IDs that must be merged first.
- **Accept** — objectively checkable completion criteria.
- **Test** — the test written *in this commit*. "None" is only valid for pure-documentation tasks.

**Legend.** `D1`–`D10` refer to decisions in `docs/design/01-technical-design.md` §1. `INV-1`–`INV-5` refer to §11 of the same. "Amendment *n*" refers to §14 of the same.

---

## Block S — Spec amendments

No task outside this block may start until S-12 is merged. These are documentation-only commits; the spec is the contract everything downstream is checked against.

### S-01 — Replace the absolute admin rule with INV-1/INV-2 ✅ MERGED
- **Does** Rewrite the hard-constraints section so the "admin gates everything" rule is scoped to visibility (INV-1) and counterparty assets (INV-2), removing the contradiction with the ten user-triggered status writes in §2.
- **Files** `specs/01-domain-and-state-machines.md`
- **Deps** —
- **Accept** No sentence in the spec claims users never write status; both invariants are stated; the ten user-triggered transitions in §2 are each classified against them.
- **Test** None (documentation).

### S-02 — Add `actorClass` to every transition table
- **Does** Apply amendment 2. Add an `actorClass` column (`OWNER | COUNTERPARTY | ADMIN`) to all five tables in §2 and reconcile every remaining diagram/table disagreement.
- **Files** `specs/01-domain-and-state-machines.md`
- **Deps** S-01
- **Accept** Every row has an `actorClass`; every Mermaid edge has a matching table row and vice versa; no row is assigned `SYSTEM` (the class does not exist).
- **Test** None (documentation).

### S-03 — Split `Car.status` into `moderationStatus` + `listingState`
- **Does** Apply amendment 3 / D2. Rewrite §1.3 fields and §2.3 as two orthogonal machines; state that availability is derived, never stored; make `DELISTED → LISTED` legal.
- **Files** `specs/01-domain-and-state-machines.md`
- **Deps** S-02
- **Accept** `Car.status` appears nowhere; public visibility is defined as `APPROVED AND LISTED`; `RENTED`/`AVAILABLE` no longer exist as stored values; a delisted car has a documented path back to `LISTED`.
- **Test** None (documentation).

### S-04 — Partial unique index on `registrationNumber`
- **Does** Apply amendment 4 / D3: drafts no longer reserve a plate; plate-ownership verification is named as an admin responsibility at approval time.
- **Files** `specs/01-domain-and-state-machines.md`
- **Deps** S-03
- **Accept** The index is documented as partial with its filter expression; a submitted listing still blocks a duplicate plate.
- **Test** None (documentation).

### S-05 — Booking: new states and missing operational fields
- **Does** Apply amendment 5 / D4 (`CANCELLATION_REQUESTED`, `TERMINATED`) plus the missing fields `ratePerDaySnapshot`, `handedOverAt`, `returnedAt`, `odometerOut/In`, `rejectedBy`, `terminatedAt`, `terminationReason`.
- **Files** `specs/01-domain-and-state-machines.md`
- **Deps** S-02
- **Accept** `ACTIVE` has an exit other than `COMPLETED`; renter cancellation of a confirmed booking routes through admin; every booking transition records who and when.
- **Test** None (documentation).

### S-06 — Add the `BookingDayLock` entity
- **Does** Apply amendment 6 / D5: new entity, unique `{car, day}` index, `[startDate, endDate)` day convention, lock lifecycle tied to `CONFIRMED`/`ACTIVE`.
- **Files** `specs/01-domain-and-state-machines.md`
- **Deps** S-05
- **Accept** The overlap guard is expressed as a database constraint, not a read-check; same-day turnover is explicitly permitted.
- **Test** None (documentation).

### S-07 — Payment guard on `CONFIRMED → ACTIVE`
- **Does** Apply amendment 7 / D6: `Booking.amountReceived`, the settled-payment guard, and the audited `overrideReason` escape hatch.
- **Files** `specs/01-domain-and-state-machines.md`
- **Deps** S-05
- **Accept** A car cannot be handed over unpaid without a logged override that is a distinct audit action.
- **Test** None (documentation).

### S-08 — Payment: direction, refunds, void
- **Does** Apply amendment 8 / D7: `direction`, `refundOf`, `voidReason`, `PENDING|SETTLED|VOID`, removal of `REFUNDED`.
- **Files** `specs/01-domain-and-state-machines.md`
- **Deps** S-07
- **Accept** Partial refunds are representable; no payment state is a dead end; `Payment` has exactly one parent ref (`booking`).
- **Test** None (documentation).

### S-09 — KYC revocation and derived `User.kycStatus`
- **Does** Apply amendment 9 / D8: `REVOKED` state, revocation fields, and the derivation rule that a new submission does not demote an existing verification.
- **Files** `specs/01-domain-and-state-machines.md`
- **Deps** S-02
- **Accept** Admin can revoke a verification; a verified user submitting a second document retains booking ability.
- **Test** None (documentation).

### S-10 — Rewrite §3 in Zod v4 and split entity vs DTO schemas
- **Does** Apply amendments 10 and 11 / D9 and D10: Zod 4 idiom throughout, regex ObjectId instead of the `mongoose` import, schemas split into `entities/*` and `dto/*`, every input schema written explicitly rather than by `.omit()`.
- **Files** `specs/01-domain-and-state-machines.md`
- **Deps** S-03, S-05, S-08, S-09
- **Accept** The Zod block compiles under Zod 4 with no v3 idioms; no input schema contains `owner`, `renter`, `recordedBy`, or any status field.
- **Test** None (documentation) — compilation is verified in SH-10.

### S-11 — Add transition-input schemas for every admin edge
- **Does** Apply amendment 12. Add a named DTO for every edge in §2 (approve/reject/publish/delist car, confirm/reject/activate/complete/terminate/resolve-cancellation booking, payment settle/void/refund, KYC verify/reject/revoke, user deactivate/reactivate), each enforcing its conditionally-required reason field.
- **Files** `specs/01-domain-and-state-machines.md`
- **Deps** S-10
- **Accept** Every edge in every §2 table has a named DTO schema; every "reason required when X" rule in prose is enforced by a schema.
- **Test** None (documentation) — enforced in SH-09.

### S-12 — Update ER diagram, close open questions, add visibility matrix
- **Does** Apply amendment 13. Regenerate §4 for the new shape (`BookingDayLock`, split car fields, payment direction), replace §5's open questions with the resolutions from the decision log, and add the read-visibility matrix covering `DRAFT`, `DELISTED`, and in-progress rentals.
- **Files** `specs/01-domain-and-state-machines.md`
- **Deps** S-04, S-06, S-11
- **Accept** No `OPEN QUESTION` marker remains unresolved or is explicitly re-scoped to `docs/design/02`; every entity/state has a documented read audience. **Spec OQ#2 (must a renter hold a verified driving licence?) and OQ#8 (security deposit) must be answered here — both change guard logic downstream.**
- **Test** None (documentation).

---

## Block P — Project scaffolding

### P-01 — Initialise the repository and workspaces
- **Does** Create the npm workspace root with `client`, `server`, `shared` packages and a `.gitignore` covering `node_modules`, `dist`, `.env*`, and editor files.
- **Files** `package.json`, `.gitignore`, `client/package.json`, `server/package.json`, `shared/package.json`
- **Deps** S-12
- **Accept** `npm install` at root succeeds; `npm ls` shows three workspaces; no `.env` is tracked.
- **Test** None (scaffolding) — verified by P-04 running successfully.

### P-02 — TypeScript configuration
- **Does** Add a base `tsconfig.base.json` with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and per-package configs extending it.
- **Files** `tsconfig.base.json`, `tsconfig.json`, `client/tsconfig.json`, `server/tsconfig.json`, `shared/tsconfig.json`
- **Deps** P-01
- **Accept** `npx tsc -b` succeeds on empty packages; strict flags are on in all three.
- **Test** None (scaffolding).

### P-03 — Lint, format, and the dependency-boundary rule
- **Does** Add ESLint + Prettier, and an `import/no-restricted-paths` rule enforcing design §3: `/shared` imports neither client nor server; client and server never import each other.
- **Files** `eslint.config.js`, `.prettierrc`, `package.json`
- **Deps** P-02
- **Accept** `npm run lint` passes; adding a `mongoose` import to a `/shared` file fails lint.
- **Test** `tests/invariants/boundaries.test.ts` — asserts the lint rule rejects a shared→server import fixture.

### P-04 — Test harness with an in-memory replica set
- **Does** Configure Vitest and a global setup that starts `mongodb-memory-server` **in replica-set mode** (required by D5/§7) and exposes a per-test database.
- **Files** `vitest.config.ts`, `server/tests/setup.ts`, `package.json`
- **Deps** P-02
- **Accept** `npm test` boots a replset and runs a trivial test; a transaction opened in a test commits successfully.
- **Test** `server/tests/setup.test.ts` — opens a session, commits a two-document transaction, asserts both writes landed.

---

## Block SH — Shared contracts

### SH-01 — Enums
- **Does** Define every status union and enum from the amended spec as `as const` arrays plus derived types.
- **Files** `shared/src/enums/index.ts`
- **Deps** P-03, S-12
- **Accept** Every enum in spec §1 exists exactly once; no string literal union is redeclared anywhere else in the codebase; no enum contains a sale-related member.
- **Test** `shared/tests/enums.test.ts` — asserts each enum's members match the spec list verbatim.

### SH-02 — Entity schemas: User, KYC
- **Does** Zod v4 entity schemas mirroring amended §1.1 and §1.2, including the `REVOKED` state and revocation fields.
- **Files** `shared/src/entities/user.ts`, `shared/src/entities/kyc.ts`
- **Deps** SH-01
- **Accept** Schemas parse a valid fixture and reject each required field's absence; no `mongoose` import.
- **Test** `shared/tests/entities/user.test.ts`, `.../kyc.test.ts` — valid fixture parses; one negative case per required field and per enum.

### SH-03 — Entity schema: Car
- **Does** Car entity schema with `moderationStatus`/`listingState`, required `rentalPricePerDay`, and ownership/timestamp fields.
- **Files** `shared/src/entities/car.ts`
- **Deps** SH-01
- **Accept** A car without `rentalPricePerDay` fails; no `status`, `listingType`, or `salePrice` field exists.
- **Test** `shared/tests/entities/car.test.ts` — required-price case plus an assertion that the removed sale fields are rejected as unknown keys.

### SH-04 — Entity schemas: Booking, BookingDayLock
- **Does** Booking schema with the new states and operational fields; day-lock schema.
- **Files** `shared/src/entities/booking.ts`, `shared/src/entities/bookingDayLock.ts`
- **Deps** SH-01
- **Accept** `endDate <= startDate` fails; all eight booking states are accepted; `amountReceived` defaults to 0.
- **Test** `shared/tests/entities/booking.test.ts` — date ordering, state coverage, default application.

### SH-05 — Entity schemas: Payment, AuditLog
- **Does** Remaining entity schemas, including payment `direction`/`refundOf`/`VOID`.
- **Files** `shared/src/entities/payment.ts`, `shared/src/entities/auditLog.ts`
- **Deps** SH-01
- **Accept** `Payment` has exactly one parent ref (`booking`, required); `REFUNDED` is not an accepted status; `AuditLog.actor` is required and `actorRole` accepts only `USER | ADMIN`.
- **Test** `shared/tests/entities/payment.test.ts`, `.../auditLog.test.ts` — refund shape, void shape, and rejection of a `SYSTEM` actorRole.

### SH-06 — DTO schemas: auth and KYC
- **Does** Explicit request schemas for register, login, refresh, KYC submit, and the three admin KYC edges.
- **Files** `shared/src/dto/auth.ts`, `shared/src/dto/kyc.ts`
- **Deps** SH-02
- **Accept** No DTO accepts `role`, `kycStatus`, or `status`; reject and revoke DTOs require a reason.
- **Test** `shared/tests/dto/auth.test.ts` — asserts privilege fields in the payload are rejected.

### SH-07 — DTO schemas: car
- **Does** Create-draft, update-draft, submit, withdraw, delist, relist, and the four admin car edges.
- **Files** `shared/src/dto/car.ts`
- **Deps** SH-03
- **Accept** `createCarDto` has no `owner` and no status fields; `rejectCarDto` and `delistCarDto` require a reason.
- **Test** `shared/tests/dto/car.test.ts` — asserts an `owner` in the body is rejected, not silently accepted.

### SH-08 — DTO schemas: booking and payment
- **Does** Remaining request schemas, including the activation DTO with its optional `overrideReason` and the refund DTO.
- **Files** `shared/src/dto/booking.ts`, `shared/src/dto/payment.ts`
- **Deps** SH-04, SH-05
- **Accept** Every admin edge named in design §9 has exactly one DTO; no DTO carries `renter` or `recordedBy`.
- **Test** `shared/tests/dto/coverage.test.ts` — enumerates design §9's admin endpoints and asserts a DTO exists for each.

### SH-09 — Transition registry as data
- **Does** Encode every edge from spec §2 as `{ entityType, from, to, actorClass, guards[], auditAction }` records, with no guard implementations (server-side only, per design §6).
- **Files** `shared/src/transitions/registry.ts`, `shared/src/transitions/types.ts`
- **Deps** SH-01, SH-08
- **Accept** Registry row count equals the number of rows across all five §2 tables; every `auditAction` exists in the audit action enum.
- **Test** `shared/tests/transitions/registry.test.ts` — **INV-4**: every state is reachable from the initial state and every non-terminal state has an outgoing edge, for all five entities.

### SH-10 — Package barrel and build
- **Does** Export surface and build config for `/shared`.
- **Files** `shared/src/index.ts`, `shared/package.json`, `shared/tsconfig.json`
- **Deps** SH-09
- **Accept** `npm run build -w shared` emits types and JS; importing `@rango/shared` from both client and server typechecks; the built bundle contains no `mongoose`.
- **Test** `shared/tests/build.test.ts` — asserts the built output has zero runtime dependencies beyond `zod`.

---

## Block INF — Server infrastructure

### INF-01 — Environment configuration
- **Does** Zod-parsed env with fail-fast at boot, per design §12.
- **Files** `server/src/config/env.ts`, `server/.env.example`
- **Deps** SH-10
- **Accept** A missing `JWT_ACCESS_SECRET` exits non-zero with a readable message; no secret is ever logged.
- **Test** `server/tests/unit/env.test.ts` — missing and malformed var cases.

### INF-02 — Database connection with replica-set assertion
- **Does** Mongoose connection helper that verifies the target supports transactions and fails loudly if it does not (design §7).
- **Files** `server/src/config/db.ts`
- **Deps** INF-01
- **Accept** Connecting to a standalone `mongod` exits with a message naming the replica-set requirement; connecting to a replset succeeds.
- **Test** `server/tests/unit/db.test.ts` — asserts the standalone case throws the specific error.

### INF-03 — Error classes and error middleware
- **Does** The `DomainError` hierarchy and single Express error handler from design §10, including opaque 500s and request-id logging.
- **Files** `server/src/lib/errors.ts`, `server/src/middleware/errorHandler.ts`
- **Deps** INF-01
- **Accept** Each error class maps to its documented HTTP status; an unexpected `Error` yields a 500 whose body contains no internal message.
- **Test** `server/tests/unit/errors.test.ts` — status mapping table + internal-message-leak case.

### INF-04 — Express app skeleton
- **Does** `app.ts` with JSON parsing, cookie parsing, CORS from `CLIENT_ORIGIN`, request id, health endpoint, and the error handler mounted last. No `listen`.
- **Files** `server/src/app.ts`, `server/src/server.ts`, `server/src/middleware/requestId.ts`
- **Deps** INF-03
- **Accept** `GET /api/health` returns 200; app is importable by Supertest without binding a port.
- **Test** `server/tests/integration/health.test.ts` — Supertest 200 + request-id header present.

---

## Block M — Models

Each model task is: schema + indexes + a test asserting the indexes actually exist on the collection.

### M-01 — User model
- **Does** Mongoose `User` per amended §1.1, with `select: false` on `passwordHash` and the unique email/phone indexes.
- **Files** `server/src/models/User.ts`
- **Deps** INF-02, SH-02
- **Accept** A default query never returns `passwordHash`; duplicate email insert throws a duplicate-key error.
- **Test** `server/tests/unit/models/user.test.ts` — projection check + both unique indexes enforced against a live collection.

### M-02 — KYC model
- **Does** Mongoose `KYC` including `REVOKED` and revocation fields.
- **Files** `server/src/models/Kyc.ts`
- **Deps** M-01
- **Accept** Indexes `{user, createdAt}` and `{status}` exist; enum rejects unknown states.
- **Test** `server/tests/unit/models/kyc.test.ts` — index presence + enum rejection.

### M-03 — Car model
- **Does** Mongoose `Car` with the split status fields, the **partial** unique index on `registrationNumber` (D3), and the geo sub-schema with `type`/`coordinates` required together.
- **Files** `server/src/models/Car.ts`
- **Deps** M-01
- **Accept** Two `DRAFT` cars may share a plate; a submitted car and a draft may not; `{geo: {type:'Point'}}` without coordinates is rejected.
- **Test** `server/tests/unit/models/car.test.ts` — the three cases above, against a live collection.

### M-04 — Booking model
- **Does** Mongoose `Booking` with the eight states, `amountReceived`, `ratePerDaySnapshot`, and operational timestamps.
- **Files** `server/src/models/Booking.ts`
- **Deps** M-03
- **Accept** All documented indexes exist; `amountReceived` defaults to 0.
- **Test** `server/tests/unit/models/booking.test.ts` — index presence + defaults.

### M-05 — BookingDayLock model
- **Does** The day-lock collection with its **unique** `{car, day}` index (D5).
- **Files** `server/src/models/BookingDayLock.ts`
- **Deps** M-04
- **Accept** Inserting two locks for the same `(car, day)` throws `E11000`.
- **Test** `server/tests/unit/models/bookingDayLock.test.ts` — asserts the duplicate insert fails at the database, not in application code.

### M-06 — Payment model
- **Does** Mongoose `Payment` with `direction`, `refundOf`, `PENDING|SETTLED|VOID`, and a required `booking` ref.
- **Files** `server/src/models/Payment.ts`
- **Deps** M-04
- **Accept** A payment without a `booking` fails validation; `REFUNDED` is not an accepted status.
- **Test** `server/tests/unit/models/payment.test.ts` — missing-parent rejection + refund document shape.

### M-07 — AuditLog model
- **Does** Mongoose `AuditLog`, insert-only (`updatedAt` disabled), with a required `actor` and the typed action enum.
- **Files** `server/src/models/AuditLog.ts`
- **Deps** M-01
- **Accept** An entry without an `actor` is rejected; an unknown `action` is rejected.
- **Test** `server/tests/unit/models/auditLog.test.ts` — both cases.

---

## Block TR — The transition chokepoint

### TR-01 — Guard framework
- **Does** Named-guard type and the guard runner that reports which guard failed via `GuardFailedError.details` (design §10).
- **Files** `server/src/transitions/guards/types.ts`, `server/src/transitions/runGuards.ts`
- **Deps** INF-03, SH-09
- **Accept** A failing guard produces an error naming that guard; guards run in declared order and short-circuit.
- **Test** `server/tests/unit/transitions/runGuards.test.ts` — ordering, short-circuit, and error naming.

### TR-02 — `transition()` helper
- **Does** The five-step chokepoint from design §6: registry lookup, actor-class check, guards, status write, audit write — all within the caller's session.
- **Files** `server/src/transitions/transition.ts`
- **Deps** TR-01, M-07
- **Accept** An unregistered edge throws `InvalidTransitionError`; a wrong actor class throws `ForbiddenTransitionError`; exactly one `AuditLog` row is written per successful call.
- **Test** `server/tests/unit/transitions/transition.test.ts` — **INV-3**: aborting the session rolls back both the status write and the audit row, verified by re-reading after abort.

### TR-03 — Guard implementations
- **Does** All guards named in the registry: ownership, KYC verified, car publicly listed, no overlapping lock, payment settled, active-user, no-live-booking (for delist).
- **Files** `server/src/transitions/guards/*.ts`
- **Deps** TR-02, M-05
- **Accept** Every guard named in the SH-09 registry has an implementation; no guard is unreferenced.
- **Test** `server/tests/unit/transitions/guards.test.ts` — one positive and one negative case per guard, plus a coverage assertion that registry guard names and implementations are a bijection.

### TR-04 — Invariant: no status write outside `transition()`
- **Does** A static check over `server/src` that fails if any file outside `server/src/transitions/` assigns to a status field or calls `updateOne` with a status in the payload.
- **Files** `server/tests/invariants/noDirectStatusWrite.test.ts`
- **Deps** TR-02
- **Accept** The check fails when a deliberate violation fixture is added and passes on the clean tree.
- **Test** The task *is* the test (design §4, rule 3).

---

## Block AUTH — Authentication

### AUTH-01 — Password hashing
- **Does** Argon2id hash/verify wrapper with parameters fixed in one place.
- **Files** `server/src/lib/password.ts`
- **Deps** INF-01
- **Accept** Hash round-trips; two hashes of the same input differ; verify rejects a wrong password.
- **Test** `server/tests/unit/password.test.ts` — round-trip, salt uniqueness, rejection.

### AUTH-02 — JWT issue and verify
- **Does** Access (15 min) and refresh (30 d) token helpers per design §8.
- **Files** `server/src/lib/jwt.ts`
- **Deps** INF-01
- **Accept** An expired token fails verification; a token signed with the refresh secret fails access verification.
- **Test** `server/tests/unit/jwt.test.ts` — expiry and cross-secret rejection.

### AUTH-03 — Registration and login services
- **Does** Register (creates `User`, `isActive: true`, `kycStatus: NOT_SUBMITTED`) and login services; both write an `AuditLog` entry.
- **Files** `server/src/services/auth.service.ts`
- **Deps** AUTH-01, AUTH-02, M-01, TR-02
- **Accept** Duplicate email returns a domain error not a 500; login rejects deactivated users.
- **Test** `server/tests/unit/services/auth.test.ts` — duplicate email, wrong password, deactivated user.

### AUTH-04 — `ActorContext` and auth middleware
- **Does** `requireAuth`, `requireAdmin`, `requireActive`, building the discriminated `ActorContext` from design §8.
- **Files** `server/src/middleware/auth.ts`, `server/src/lib/actor.ts`
- **Deps** AUTH-03
- **Accept** A `USER` token cannot reach an admin-guarded route; a deactivated user is rejected at the edge.
- **Test** `server/tests/integration/auth.middleware.test.ts` — anonymous, user, admin, and deactivated cases against a fixture route.

### AUTH-05 — Auth routes
- **Does** `register`, `login`, `refresh`, `logout`, `me` with `httpOnly` cookies.
- **Files** `server/src/routes/auth.routes.ts`, `server/src/app.ts`
- **Deps** AUTH-04, SH-06
- **Accept** Cookies are `httpOnly`, `sameSite=lax`, and `secure` when `NODE_ENV=production`; `logout` invalidates the refresh token.
- **Test** `server/tests/integration/auth.routes.test.ts` — full register→login→refresh→logout cycle, asserting cookie flags.

---

## Block AUTH-FIX — Backend audit remediation (2026-09-16), gap 1

> **Priority: BLOCKER.** Nothing under `/api/auth` exists in the current tree (`server/src/routes/` has no `auth.routes.ts`, `server/src/services/` has no `auth.service.ts`, `server/src/lib/` has no `password.ts`). `middleware/auth.ts` (`requireAuth`/`requireAdmin`/`requireSuperAdmin`) and `lib/jwt.ts` already exist and are the dependency this block builds on, but there is currently no way for any client to obtain the `rgo_at`/`rgo_rt` cookies those depend on. This supersedes the stale `AUTH-05` entry above, which was never implemented.

### AUTH-06 — Password hashing
- **Does** Argon2id hash/verify wrapper with parameters fixed in one place.
- **Files** `server/src/lib/password.ts`
- **Deps** INF-01
- **Accept** Hash round-trips; two hashes of the same input differ; verify rejects a wrong password.
- **Test** `server/tests/unit/password.test.ts` — round-trip, salt uniqueness, rejection.

### AUTH-07 — Register and login services
- **Does** `auth.service.ts`: `register()` (creates `User` with `isActive: true`, hashed password, `User.failedLoginCount: 0`) and `login()` (constant-time credential check via `guardCredentialsValid`, `guardAccountActive`, issues `Session` + token pair). Both write an `AuditLog` entry; spec 02 E-02's login-failure case has no actor and is intentionally unaudited except a successful `ADMIN`/`SUPER_ADMIN` login.
- **Files** `server/src/services/auth.service.ts`
- **Deps** AUTH-06, M-01 (`User.model.ts`), `models/Session.model.ts` (already present), `lib/jwt.ts` (already present)
- **Accept** Duplicate email/phone returns `409 CONFLICT`, not a 500; login rejects a deactivated user with `ACCOUNT_INACTIVE`; wrong password and unknown email return identical `UNAUTHENTICATED` errors with comparable timing.
- **Test** `server/tests/unit/services/auth.test.ts` — duplicate email, duplicate phone, wrong password (timing-insensitive assertion), deactivated user.

### AUTH-08 — Refresh, logout, and session rotation
- **Does** `refresh()` (rotates `rgo_at`/`rgo_rt`/`rgo_csrf`, re-reads `User.isActive` from the database per spec 02 §6.1, detects refresh-token reuse via the `Session` collection and revokes the session family on reuse) and `logout()` (revokes the current session, clears cookies).
- **Files** `server/src/services/auth.service.ts`, `server/src/models/Session.model.ts` (already present — extend only if a field is missing)
- **Deps** AUTH-07
- **Accept** An expired-but-well-formed access token still lets `logout` clear cookies; a deactivated user cannot refresh past the ban; a reused refresh token revokes every session in its family and returns `401`.
- **Test** `server/tests/unit/services/auth.refresh.test.ts` — reuse-detection case, deactivated-mid-session case, logout-with-expired-token case.

### AUTH-09 — Auth routes
- **Does** `POST /api/auth/register`, `/login`, `/refresh`, `/logout`, `GET /api/auth/me`, wired into `app.ts` ahead of the `/api/user` and `/api/admin` mounts. Cookies `httpOnly`, `sameSite=lax`, `secure` in production, `path=/api`.
- **Files** `server/src/routes/auth.routes.ts`, `server/src/app.ts`
- **Deps** AUTH-08, SH-06 (or the DTOs actually shipped in `@rango/shared` if `SH-06` was never merged as written — check before assuming the schema exists)
- **Accept** Full register→login→refresh→logout cycle works over HTTP; `GET /api/auth/me` returns the caller's own `UserSummary` only; a request without `rgo_at` gets `401 UNAUTHENTICATED` on every route currently gated by `requireAuth`.
- **Test** `server/tests/integration/auth.routes.test.ts` — full cycle + cookie flag assertions + the existing `requireAuth`-gated routes (listings, bookings, profile) now reachable end-to-end for the first time.

---

## Block KYC

### KYC-01 — Submit KYC
- **Does** User-initiated submission creating a `PENDING` document, guarded against a second open submission.
- **Files** `server/src/services/kyc.service.ts`
- **Deps** AUTH-04, M-02, TR-03
- **Accept** A second `PENDING` submission is rejected; `User.kycStatus` is recomputed per D8 and a verified user is **not** demoted.
- **Test** `server/tests/unit/services/kyc.submit.test.ts` — the double-submit case and the verified-user-resubmits case.

### KYC-02 — Admin verify, reject, revoke
- **Does** The three admin edges, each recomputing `User.kycStatus` inside the same transaction.
- **Files** `server/src/services/kyc.service.ts`
- **Deps** KYC-01
- **Accept** Revocation moves a `VERIFIED` user out of verified status and therefore out of booking eligibility; reject requires a reason; all three write audit rows.
- **Test** `server/tests/unit/services/kyc.admin.test.ts` — one case per edge + a rollback case asserting `User.kycStatus` is unchanged when the transaction aborts.

### KYC-03 — KYC routes
- **Does** `POST /api/kyc`, `GET /api/kyc/me`, and the three admin endpoints.
- **Files** `server/src/routes/kyc.routes.ts`, `server/src/routes/admin.kyc.routes.ts`, `server/src/app.ts`
- **Deps** KYC-02, SH-06
- **Accept** Non-admins receive 403 on admin endpoints; a user sees only their own KYC documents.
- **Test** `server/tests/integration/kyc.test.ts` — RBAC + cross-user read isolation.

---

## Block CAR

### CAR-01 — Create and update a draft
- **Does** Draft creation and editing, with `owner` taken from the session (never the body, per D10).
- **Files** `server/src/services/car.service.ts`
- **Deps** AUTH-04, M-03, TR-03
- **Accept** An `owner` in the request body is ignored or rejected; only the owner may edit their draft; `owner` cannot be changed after creation.
- **Test** `server/tests/unit/services/car.create.test.ts` — ownership-spoofing attempt, cross-user edit attempt, and an owner-reassignment attempt.

### CAR-02 — Submit and withdraw
- **Does** `DRAFT → PENDING_APPROVAL` and `PENDING_APPROVAL → DRAFT`, including the plate-collision check from D3.
- **Files** `server/src/services/car.service.ts`
- **Deps** CAR-01
- **Accept** Submitting with a plate already held by a non-draft listing returns a domain error; withdraw returns the car to editable state.
- **Test** `server/tests/unit/services/car.submit.test.ts` — collision case + withdraw round-trip.

### CAR-03 — Admin approve and reject
- **Does** The two moderation edges; approve sets `moderationStatus: APPROVED` but does **not** publish (D2).
- **Files** `server/src/services/car.service.ts`
- **Deps** CAR-02
- **Accept** An approved-but-unpublished car is absent from public listings; reject requires a reason and records `rejectedBy`/`rejectedAt`.
- **Test** `server/tests/unit/services/car.moderate.test.ts` — **INV-1**: asserts approval alone never makes a car publicly visible.

### CAR-04 — Publish, delist, relist
- **Does** `listingState` edges: `UNLISTED → LISTED` (admin), `LISTED → DELISTED` (owner or admin), `DELISTED → LISTED` (owner or admin), with delist blocked while a booking holds locks.
- **Files** `server/src/services/car.service.ts`
- **Deps** CAR-03, M-05
- **Accept** Delisting a car with active day-locks fails with a named guard error; a delisted car can be re-listed without creating a new record.
- **Test** `server/tests/unit/services/car.publish.test.ts` — locked-delist rejection + delist/relist round-trip.

### CAR-05 — Re-moderation after edit
- **Does** Editing an `APPROVED` car returns it to `PENDING_APPROVAL` and unlists it until re-approved (INV-1).
- **Files** `server/src/services/car.service.ts`
- **Deps** CAR-04
- **Accept** A price or image change on a live listing removes it from public results until an admin re-approves.
- **Test** `server/tests/unit/services/car.reedit.test.ts` — asserts the edited car leaves public visibility immediately.

### CAR-06 — Public listing and availability queries
- **Does** Public search (filtered to `APPROVED AND LISTED`) and `GET /cars/:id/availability?from&to` reading `BookingDayLock`.
- **Files** `server/src/services/carQuery.service.ts`
- **Deps** CAR-05
- **Accept** No non-public car appears in results under any filter combination; availability reflects locks, not a status field.
- **Test** `server/tests/unit/services/carQuery.test.ts` — seeds one car in each moderation×listing combination and asserts exactly one is returned.

### CAR-07 — Car routes
- **Does** Public, owner, and admin car endpoints per design §9.
- **Files** `server/src/routes/car.routes.ts`, `server/src/routes/admin.car.routes.ts`, `server/src/app.ts`
- **Deps** CAR-06, SH-07
- **Accept** Every endpoint in design §9's car group exists with the documented method and path.
- **Test** `server/tests/integration/car.test.ts` — the full owner lifecycle plus an anonymous visibility check.

---

## Block CAR-FIX — Backend audit remediation (2026-09-16), gap 2

> **Priority: BLOCKER.** `carRegistry` in `server/src/transitions/registry.ts` has entries only for `PENDING_APPROVAL → APPROVED` and `PENDING_APPROVAL → REJECTED`. There is no `DRAFT|REJECTED → PENDING_APPROVAL` edge and no `submit`/`withdraw`/`delist` route in `user.listing.routes.ts` (confirmed by reading both files — only `POST /`, `GET /`, `PATCH /:carId`, `POST /:carId/images`, `DELETE /:carId` exist). A car created via `POST /api/user/listings` can never leave `DRAFT`, so `CAR-03`'s approve/reject edges and every downstream `CAR`/`BOOK` task are unreachable through the API even though the service-layer code for them exists.

### CAR-08 — Submission transition edges
- **Does** Add `DRAFT → PENDING_APPROVAL` and `REJECTED → PENDING_APPROVAL` to `carRegistry` (keyed on `moderationStatus`, `actorClasses: ['USER', 'ADMIN', 'SUPER_ADMIN']` scoped to the owner in the service layer per spec 01 actor class `OWNER`), plus the reverse `PENDING_APPROVAL|APPROVED → DRAFT` edge for withdraw (spec 02 E-12) and `LISTED → DELISTED` for owner-initiated delist (spec 02 E-13, exception E3) if not already reachable through the existing `listingState` registry entries.
- **Files** `server/src/transitions/registry.ts`, `server/src/transitions/guards/car.guards.ts` (reuse `guardRegistrationAvailable` at submit time per D3)
- **Deps** M-03, TR-02
- **Accept** A `DRAFT` car can reach `PENDING_APPROVAL` through the registry; a plate collision at submit time is a named `GUARD_FAILED`, not an unguarded write; withdraw returns an `APPROVED` (and therefore possibly `LISTED`) car to `DRAFT`, and `guardNoActiveDayLocks`-equivalent protection stops a car with a live booking from being withdrawn out from under it.
- **Test** `server/tests/unit/services/car.submit.test.ts` — submit success, plate-collision rejection, withdraw round-trip.

### CAR-09 — Submit, withdraw, delist routes
- **Does** `POST /api/user/listings/:carId/submit`, `POST /api/user/listings/:carId/withdraw`, `POST /api/user/listings/:carId/delist` in `user.listing.routes.ts`, each scoped to the owner (`guardIsOwner`, 404 on a non-owned car).
- **Files** `server/src/routes/user.listing.routes.ts`, `server/src/services/car.service.ts`
- **Deps** CAR-08
- **Accept** A non-owner calling any of the three gets `404`, not `403`; submitting a car missing required fields (e.g. no `rentalPricePerDay`) is `VALIDATION_FAILED` at creation time, not discovered here; the full `DRAFT → PENDING_APPROVAL → APPROVED` path is reachable end-to-end over HTTP for the first time.
- **Test** `server/tests/integration/car.submission.test.ts` — full submit→admin-approve→publish cycle over HTTP; cross-owner 404 case.

---

## Block BOOK

> **Ordering note.** `BOOK-06` depends on `PAY-02`. Run `PAY-01` and `PAY-02` out of block order, immediately after `BOOK-05`.

### BOOK-01 — Day-lock library
- **Does** Date normalisation to UTC midnight, range expansion over `[startDate, endDate)`, and lock insert/release helpers (D5).
- **Files** `server/src/lib/dayLocks.ts`
- **Deps** M-05
- **Accept** Same-day turnover produces no overlap; a one-day booking produces exactly one lock; DST-adjacent ranges produce the correct count.
- **Test** `server/tests/unit/dayLocks.test.ts` — turnover, single-day, month-boundary, and DST cases.

### BOOK-02 — Create a booking request
- **Does** `REQUESTED` creation with guards (car publicly listed, renter KYC verified, dates sane) and `ratePerDaySnapshot` captured.
- **Files** `server/src/services/booking.service.ts`
- **Deps** BOOK-01, TR-03, CAR-06
- **Accept** Requests are permitted for future dates even while the car is currently out on another rental; an unverified renter is rejected; a renter cannot book their own car.
- **Test** `server/tests/unit/services/booking.create.test.ts` — the future-dates-while-rented case, self-booking rejection, and each guard's rejection.

### BOOK-03 — Admin confirm with lock acquisition
- **Does** `REQUESTED → CONFIRMED`, inserting all day-locks inside the transaction; a duplicate-key abort surfaces as `ConflictError`.
- **Files** `server/src/services/booking.service.ts`
- **Deps** BOOK-02
- **Accept** Confirming an overlapping range fails with 409 and leaves no partial locks; stale requests whose `startDate` has passed are rejected.
- **Test** `server/tests/unit/services/booking.confirm.test.ts` — overlap rejection, partial-lock rollback, past-date rejection.

### BOOK-04 — Concurrency proof
- **Does** A dedicated test that fires two confirmations for overlapping ranges in parallel.
- **Files** `server/tests/concurrency/doubleBooking.test.ts`
- **Deps** BOOK-03
- **Accept** Exactly one booking reaches `CONFIRMED`; the other fails with `ConflictError`; lock count equals the winner's day count.
- **Test** The task *is* the test — **INV-2**.

### BOOK-05 — Reject, cancellation request, and cancel
- **Does** `REQUESTED → REJECTED`, `REQUESTED → CANCELLED` (renter), `CONFIRMED → CANCELLATION_REQUESTED` (renter or owner), and admin resolution to `CANCELLED` or back to `CONFIRMED` (D4).
- **Files** `server/src/services/booking.service.ts`
- **Deps** BOOK-03
- **Accept** A renter cannot unilaterally cancel a confirmed booking (INV-2); cancelling releases every day-lock.
- **Test** `server/tests/unit/services/booking.cancel.test.ts` — unilateral-cancel rejection + lock release verification.

### BOOK-06 — Activate, with the payment guard
- **Does** `CONFIRMED → ACTIVE` requiring `amountReceived >= totalAmount` or an audited override (D6), recording `handedOverAt` and `odometerOut`.
- **Files** `server/src/services/booking.service.ts`
- **Deps** BOOK-05, PAY-02
- **Accept** Activation without settled payment fails; with `overrideReason` it succeeds and writes a `BOOKING_ACTIVATED_UNPAID` audit row.
- **Test** `server/tests/unit/services/booking.activate.test.ts` — **INV-5**: unpaid rejection, override path, and the distinct audit action.

### BOOK-07 — Complete and terminate
- **Does** `ACTIVE → COMPLETED` (records `returnedAt`, `odometerIn`, releases locks) and `ACTIVE → TERMINATED` (admin, reason required, releases locks from the termination date forward).
- **Files** `server/src/services/booking.service.ts`
- **Deps** BOOK-06
- **Accept** A terminated booking frees future days but retains past ones; the car becomes bookable again for the freed range.
- **Test** `server/tests/unit/services/booking.complete.test.ts` — lock-release boundaries for both edges.

### BOOK-08 — Booking routes
- **Does** User and admin booking endpoints per design §9.
- **Files** `server/src/routes/booking.routes.ts`, `server/src/routes/admin.booking.routes.ts`, `server/src/app.ts`
- **Deps** BOOK-07, SH-08
- **Accept** Each admin edge is its own endpoint; no generic status-patch route exists.
- **Test** `server/tests/integration/booking.test.ts` — full lifecycle via HTTP + a 404 assertion for `PATCH /bookings/:id/status`.

---

## Block BOOK-FIX — Backend audit remediation (2026-09-16), gaps 4, 5, 6, 9

> Confirmed against `server/src/transitions/registry.ts` and `server/src/routes/{user,admin}.booking.routes.ts`: `bookingRegistry` has `REQUESTED→CANCELLED`, `CONFIRMED→CANCELLED`, and `CANCELLATION_REQUESTED→CANCELLED` edges, but **no edge writes `CANCELLATION_REQUESTED`** — it is a dead state reachable from nowhere. There is no `ACTIVE→TERMINATED` edge at all. `CONFIRMED→NO_SHOW` exists (`guardStartDatePassed`, sets `noShowCleared: false`) but no edge ever sets `noShowCleared: true`. `guardPaymentCovered` on `CONFIRMED→ACTIVE` checks payment only, not renter account state.

### BOOK-09 — Cancellation-request transition and guard
- **Does** Add `CONFIRMED → CANCELLATION_REQUESTED` to `bookingRegistry` (`actorClasses: ['USER', 'ADMIN', 'SUPER_ADMIN']`, scoped in the service layer to the renter or the car's owner per spec 03 `guardIsRenterOrCarOwner` / spec 02 exception E6 — locks are **not** released by this edge).
- **Files** `server/src/transitions/registry.ts`, `server/src/services/booking.service.ts`
- **Deps** BOOK-05
- **Accept** Either the renter or the car owner (not a third party) can move a `CONFIRMED` booking to `CANCELLATION_REQUESTED`; day-locks are untouched by this transition; the booking's `CANCELLATION_REQUESTED → CANCELLED` edge (already in the registry) becomes reachable for the first time.
- **Test** `server/tests/unit/services/booking.cancellationRequest.test.ts` — renter-triggers, owner-triggers, third-party-rejected, lock-retention assertion.

### BOOK-10 — Cancellation-request routes
- **Does** `POST /api/user/bookings/:id/request-cancellation` (renter or car owner) and `POST /api/admin/bookings/:id/resolve-cancellation` (admin resolves to `CANCELLED` or back to `CONFIRMED`, per spec 02 D4).
- **Files** `server/src/routes/user.booking.routes.ts`, `server/src/routes/admin.booking.routes.ts`, `server/src/services/booking.service.ts`
- **Deps** BOOK-09
- **Accept** Resolving back to `CONFIRMED` requires the registry to carry a `CANCELLATION_REQUESTED → CONFIRMED` edge (add if absent); resolving to `CANCELLED` releases all locks exactly as the existing cancel paths do.
- **Test** `server/tests/integration/booking.cancellationRequest.test.ts` — both resolutions over HTTP.

### BOOK-11 — Terminate a live rental
- **Does** `ACTIVE → TERMINATED` edge (admin-only, `reason` required) plus `POST /api/admin/bookings/:id/terminate`. Releases day-locks for `[effectiveFrom, endDate)` only — days already consumed stay locked/historical, matching `Booking.terminatedAt`/`terminationReason` fields already present on the model.
- **Files** `server/src/transitions/registry.ts`, `server/src/services/booking.service.ts`, `server/src/routes/admin.booking.routes.ts`
- **Deps** BOOK-07
- **Accept** Terminating frees only the future portion of the range; the car becomes bookable again for the freed days; a missing `reason` is `VALIDATION_FAILED`.
- **Test** `server/tests/unit/services/booking.terminate.test.ts` — lock-release boundary (past retained, future freed).

### BOOK-12 — Clear a no-show
- **Does** `CONFIRMED|NO_SHOW → NO_SHOW` is not the gap — the gap is that `noShowCleared` (set to `false` by the existing `markNoShow`) has no transition that ever sets it `true`. Add an admin action that sets `noShowCleared: true` without changing `Booking.status`, so `guardNoUnresolvedNoShow` in `requestBooking` (referenced by the earlier audit; verify the guard's actual name in `booking.guards.ts` before wiring) stops treating the renter as permanently banned.
- **Files** `server/src/services/booking.service.ts`, `server/src/routes/admin.booking.routes.ts`, `server/src/transitions/guards/booking.guards.ts` if the guard needs adjusting
- **Deps** BOOK-07
- **Accept** A renter with a cleared no-show can successfully request a new booking; an uncleared no-show still blocks new requests from the same renter; the action writes its own `AuditLog` action distinct from `BOOKING_NO_SHOW`.
- **Test** `server/tests/unit/services/booking.clearNoShow.test.ts` — blocked-then-cleared-then-allowed sequence.

### BOOK-13 — Renter-active re-check on activation
- **Does** Add `guardRenterActive` to the `CONFIRMED → ACTIVE` edge (alongside the existing `guardPaymentCovered`), re-reading `Booking.renter`'s `User.isActive` inside the transaction — a renter deactivated between confirm and handover must not receive the car (spec 03 §4.6: the token is never the authority; spec 03 DEFECT-2).
- **Files** `server/src/transitions/guards/booking.guards.ts`, `server/src/transitions/registry.ts`
- **Deps** BOOK-06
- **Accept** Activating a booking whose renter was deactivated after confirmation fails with a named `GUARD_FAILED`; activating a booking for a still-active renter is unaffected.
- **Test** `server/tests/unit/services/booking.activate.test.ts` — add the deactivated-renter case to the existing test file.

---

## Block PAY

### PAY-01 — Record an expected payment
- **Does** Admin creates a `PENDING`, `direction: IN` payment against a booking.
- **Files** `server/src/services/payment.service.ts`
- **Deps** M-06, TR-03
- **Accept** A payment against a non-existent or terminal booking is rejected; the parent must be in a state that expects payment.
- **Test** `server/tests/unit/services/payment.record.test.ts` — parent-state guard cases.

### PAY-02 — Settle a payment
- **Does** `PENDING → SETTLED`, updating `Booking.amountReceived` in the same transaction (D6).
- **Files** `server/src/services/payment.service.ts`
- **Deps** PAY-01
- **Accept** `amountReceived` equals the signed sum of settled payments; an aborted transaction leaves it unchanged.
- **Test** `server/tests/unit/services/payment.settle.test.ts` — sum correctness across two partial payments + rollback case.

### PAY-03 — Void a payment
- **Does** `PENDING → VOID` with a reason, closing the immortal-pending dead end.
- **Files** `server/src/services/payment.service.ts`
- **Deps** PAY-02
- **Accept** A voided payment never contributes to `amountReceived`; voiding a settled payment is rejected.
- **Test** `server/tests/unit/services/payment.void.test.ts` — both cases.

### PAY-04 — Refund
- **Does** Creates a new `direction: OUT` payment with `refundOf`, supporting partial refunds (D7).
- **Files** `server/src/services/payment.service.ts`
- **Deps** PAY-03
- **Accept** The original `IN` record is unmodified; a refund exceeding the original is rejected; `amountReceived` decreases by the refund.
- **Test** `server/tests/unit/services/payment.refund.test.ts` — partial refund (the early-return case from `TERMINATED`), over-refund rejection, immutability of the original.

### PAY-05 — Payment routes
- **Does** Admin payment endpoints per design §9.
- **Files** `server/src/routes/admin.payment.routes.ts`, `server/src/app.ts`
- **Deps** PAY-04, SH-08
- **Accept** All payment endpoints are admin-only; a `USER` token receives 403 on each.
- **Test** `server/tests/integration/payment.test.ts` — RBAC across every endpoint.

---

## Block PAY-FIX — Backend audit remediation (2026-09-16), gap 7

> Confirmed against `server/src/services/payment.service.ts` and `server/src/routes/admin.booking.routes.ts`: the only payment operation implemented is `confirmOfflinePayment`, which creates a `Payment` already `SETTLED` in one step (mounted at `POST /api/admin/bookings/:bookingId/confirm-offline-payment`, not under a `payment.routes.ts` at all). There is no standalone `record` (create `PENDING`), `settle`, `void`, or `refund` (`direction: OUT`) operation, so a deposit-retention or partial-refund flow (spec 04 §6, §2.3's late-fee/refund cases) has no way to be represented.

### PAY-06 — Record an expected payment
- **Does** `recordPayment()`: admin creates a `Payment` with `status: PENDING`, `direction: IN`, against a booking in a state that expects payment. Kept separate from `confirmOfflinePayment` (which stays as the one-click PENDING+SETTLED shortcut) so a payment can be logged as expected before cash actually arrives.
- **Files** `server/src/services/payment.service.ts`
- **Deps** M-06 (`Payment.model.ts`, already present), TR-03
- **Accept** A payment against a non-existent or terminal (`CANCELLED`/`REJECTED`/`COMPLETED`) booking is rejected; `Booking.amountReceived`/`depositReceived` is untouched until settlement.
- **Test** `server/tests/unit/services/payment.record.test.ts` — parent-state guard cases.

### PAY-07 — Settle a payment
- **Does** `settlePayment()`: `PENDING → SETTLED`, updating the correct `Booking` amount field (`amountReceived` or `depositReceived`, per `purpose`) in the same transaction as `confirmOfflinePayment` already does.
- **Files** `server/src/services/payment.service.ts`
- **Deps** PAY-06
- **Accept** The booking's amount field equals the signed sum of settled payments of that purpose; an aborted transaction leaves it unchanged.
- **Test** `server/tests/unit/services/payment.settle.test.ts` — sum correctness across two partial payments + rollback case.

### PAY-08 — Void a payment
- **Does** `voidPayment()`: `PENDING → VOID` with a required reason.
- **Files** `server/src/services/payment.service.ts`
- **Deps** PAY-07
- **Accept** A voided payment never contributes to a booking's amount fields; voiding an already-`SETTLED` payment is rejected.
- **Test** `server/tests/unit/services/payment.void.test.ts` — both cases.

### PAY-09 — Refund and payment routes
- **Does** `refundPayment()`: creates a new `direction: OUT` payment with `refundOf` set to the original, decrementing the relevant `Booking` amount field; supports partial refunds. Also adds the missing `server/src/routes/admin.payment.routes.ts` exposing record/settle/void/refund plus `GET /api/admin/payments` (list) and wires it into `app.ts`.
- **Files** `server/src/services/payment.service.ts`, `server/src/routes/admin.payment.routes.ts`, `server/src/app.ts`
- **Deps** PAY-08
- **Accept** The original `IN` record is unmodified by a refund; a refund exceeding the original (net of prior refunds) is rejected; every one of the five payment endpoints is admin-only.
- **Test** `server/tests/unit/services/payment.refund.test.ts` — partial refund, over-refund rejection, original-immutability; `server/tests/integration/payment.routes.test.ts` — RBAC across all five endpoints.

---

## Block ADM — Admin surface

### ADM-01 — Audit query endpoint
- **Does** `GET /api/admin/audit` with filters on entity, actor, action, and date range, paginated.
- **Files** `server/src/services/audit.service.ts`, `server/src/routes/admin.audit.routes.ts`
- **Deps** BOOK-08, PAY-05
- **Accept** Filters compose correctly; results are admin-only; every state transition performed in the test suite appears in the log.
- **Test** `server/tests/integration/audit.test.ts` — filter matrix + a full-booking-lifecycle trace assertion.

### ADM-02 — Admin work queues
- **Does** Count and list endpoints for pending KYC, pending car approvals, pending booking requests, unpaid-but-confirmed bookings, and open cancellation requests.
- **Files** `server/src/services/adminQueue.service.ts`, `server/src/routes/admin.queue.routes.ts`
- **Deps** ADM-01
- **Accept** "Confirmed but unpaid" is answerable in one query; counts match the underlying collections.
- **Test** `server/tests/integration/adminQueue.test.ts` — seeded fixtures with known counts per queue.

---

## Block ADM-FIX — Backend audit remediation (2026-09-16), gaps 3, 10

> Confirmed against `server/src/routes/admin.car.routes.ts` (only approve/reject/publish/delist/relist/availability-blocks — no `GET`), `admin.booking.routes.ts` (only mutation actions — no `GET`), and `server/src/services/user.service.ts` (`deactivateUser` calls `guardNotLastAdmin`/`guardNotLastSuperAdmin` but no privilege-ordering guard; `reactivateUser` calls **no guards at all**). As written, any `ADMIN` can deactivate or reactivate a `SUPER_ADMIN` account.

### ADM-03 — Admin listing read endpoints
- **Does** `GET /api/admin/listings` (filterable list, per spec 02 §11) and `GET /api/admin/listings/:carId` (full `AdminCar` shape including `owner`, `activeBookingId?`, `lockedDayCount`).
- **Files** `server/src/services/car.service.ts`, `server/src/routes/admin.car.routes.ts`
- **Deps** CAR-06 (or the query helper actually shipped, if named differently)
- **Accept** Admins can see cars in every moderation/listing-state combination, including `DRAFT`; pagination and sort match §4 of spec 02.
- **Test** `server/tests/integration/admin.listings.test.ts` — one fixture per moderation×listing combination, list and detail.

### ADM-04 — Admin booking read endpoints
- **Does** `GET /api/admin/bookings` (with `conflictedOnly`, `staleOnly`, `overdueOnly` filters per spec 04 §1.4/§2.3) and `GET /api/admin/bookings/:bookingId` (`AdminBookingDetail` — both parties in full, `payments[]`, `dayLocks` summary).
- **Files** `server/src/services/booking.service.ts`, `server/src/routes/admin.booking.routes.ts`
- **Deps** BOOK-08
- **Accept** An admin can retrieve any booking regardless of party; the three boolean filters each isolate the correct fixture set.
- **Test** `server/tests/integration/admin.bookings.test.ts` — filter matrix + detail-shape assertion.

### ADM-05 — Admin payment list endpoint
- **Does** `GET /api/admin/payments` with filters on `booking`, `direction`, `status`. (Folded into `PAY-09` if that task lands first — do not duplicate.)
- **Files** `server/src/services/payment.service.ts`, `server/src/routes/admin.payment.routes.ts`
- **Deps** PAY-09
- **Accept** Filters compose; results are admin-only.
- **Test** `server/tests/integration/admin.payments.test.ts` — filter cases.

### ADM-06 — Privilege-ordering guard on user state changes
- **Does** `guardNotHigherPrivilege`: an `ADMIN` may not deactivate, reactivate, or (once `SA-01`/`SA-02` exist) promote/demote a `SUPER_ADMIN`. Apply it to `deactivateUser` (alongside the existing `guardNotLastAdmin`/`guardNotLastSuperAdmin`) and — critically — to `reactivateUser`, which currently runs no guards at all.
- **Files** `server/src/transitions/guards/user.guards.ts`, `server/src/services/user.service.ts`
- **Deps** M-01
- **Accept** An `ADMIN` calling `deactivate` or `reactivate` on a `SUPER_ADMIN` account gets a named `GUARD_FAILED`; a `SUPER_ADMIN` may still deactivate/reactivate any `ADMIN`; an `ADMIN` acting on another `ADMIN` or on a `USER` is unaffected.
- **Test** `server/tests/unit/services/user.privilegeGuard.test.ts` — the four role-pair combinations, deactivate and reactivate both.

---

## Block SA — Super-admin surface

> **Priority: HIGH.** `requireSuperAdmin` middleware already exists (`server/src/middleware/auth.ts`) and `role` already includes `SUPER_ADMIN` throughout the transition registry's `actorClasses`, but there is no route anywhere under `/api/superadmin`, no service to promote/demote, and no read/write endpoint for `SystemConfig` even though `server/src/models/SystemConfig.model.ts` and `server/src/lib/systemConfig.ts` already exist.

### SA-01 — Admin promotion and demotion service
- **Does** `promoteToAdmin()` (`USER → ADMIN`), `demoteAdmin()` (`ADMIN → USER`), `promoteToSuperAdmin()` (`ADMIN → SUPER_ADMIN`), each writing `AuditLog` and revoking the target's sessions on any role change (spec 03 §4.5 revocation-triggers table).
- **Files** `server/src/services/superAdmin.service.ts`, `server/src/transitions/guards/user.guards.ts` (reuse `guardNotLastSuperAdmin` on demote-from-super)
- **Deps** ADM-06
- **Accept** Demoting the last `SUPER_ADMIN` is rejected; promoting a `USER` directly to `SUPER_ADMIN` in one call is not offered (must go through `ADMIN` first, matching the two-step model spec 03 §1.5 assumes).
- **Test** `server/tests/unit/services/superAdmin.test.ts` — last-super-admin rejection, session-revocation-on-role-change assertion.

### SA-02 — SystemConfig read/write
- **Does** `GET /api/superadmin/config`, `PATCH /api/superadmin/config` (e.g. `booking.turnaroundBufferDays` per spec 04 §1.5), surfacing a count of in-flight bookings still holding the old value per spec 04 §1.5's "E-72 must surface the consequence" rule.
- **Files** `server/src/services/superAdmin.service.ts`, `server/src/lib/systemConfig.ts` (already present — extend), `server/src/routes/superadmin.routes.ts`
- **Deps** SA-01
- **Accept** A config change is prospective only (no retroactive rewrite of existing `BookingDayLock` rows, per spec 04 §1.5); the response names how many active bookings are unaffected by the new value.
- **Test** `server/tests/integration/superAdmin.config.test.ts` — read, write, and the affected-count assertion.

### SA-03 — Super-admin routes
- **Does** `GET /api/superadmin/admins`, `POST /api/superadmin/admins` (promote), `POST /api/superadmin/admins/:userId/demote`, `POST /api/superadmin/admins/:userId/promote-super`, mounted behind `requireAuth, requireSuperAdmin` in `app.ts`.
- **Files** `server/src/routes/superadmin.routes.ts`, `server/src/app.ts`
- **Deps** SA-02
- **Accept** An `ADMIN` (not `SUPER_ADMIN`) token gets `403` on every route in this block; a `SUPER_ADMIN` token succeeds.
- **Test** `server/tests/integration/superAdmin.routes.test.ts` — RBAC across all four endpoints.

---

## Block SEC — Security hardening

> **Priority: MEDIUM.** Neither is present anywhere in `server/src/middleware/` or `server/src/app.ts` today.

### SEC-01 — CSRF double-submit token
- **Does** Non-`httpOnly` `rgo_csrf` cookie issued at login/refresh (already planned in `AUTH-07`/`AUTH-08`'s token issuance); middleware that rejects any non-`GET` request under `/api/user` or `/api/admin` whose `X-CSRF-Token` header does not match the cookie.
- **Files** `server/src/middleware/csrf.ts`, `server/src/app.ts`
- **Deps** AUTH-09
- **Accept** A `POST` with a missing or mismatched CSRF header/cookie pair gets `403 FORBIDDEN`; `GET` requests and everything under `/api/public` are exempt; a matching pair succeeds.
- **Test** `server/tests/integration/csrf.test.ts` — missing header, mismatched header, matching pair, exempt-route cases.

### SEC-02 — Rate limiting
- **Does** Fixed-window counters per spec 02 §5's bucket table (`auth.login.ip`, `auth.login.identity`, `user.write`, `admin.write`, etc.), with `RateLimit-*` response headers and `429 RATE_LIMITED` on exhaustion. In-process counter storage is acceptable for a single-node deployment (spec 02 §5 rule 5); note the multi-instance caveat rather than solving it now.
- **Files** `server/src/middleware/rateLimit.ts`, `server/src/app.ts`, every route file that needs a specific bucket applied
- **Deps** AUTH-09
- **Accept** A failed request still consumes its bucket (spec 02 §5 rule 2); a `429` response does not itself consume budget; `auth.login` consumes both the IP and identity buckets and a successful login resets only the identity bucket.
- **Test** `server/tests/unit/rateLimit.test.ts` — window expiry, failed-request-consumes, 429-does-not-consume, dual-bucket login case.

---

## Block CL — Client

### CL-01 — Vite, Tailwind, router scaffold
- **Does** React 19 + Vite 6 + Tailwind 4 + router with a public shell.
- **Files** `client/vite.config.ts`, `client/index.html`, `client/src/main.tsx`, `client/src/App.tsx`, `client/tailwind.config.ts`
- **Deps** SH-10
- **Accept** `npm run dev -w client` serves a routed page; Tailwind classes apply.
- **Test** `client/tests/smoke.test.tsx` — renders the shell without error.

### CL-02 — API client and TanStack Query setup
- **Does** Typed fetch wrapper using `/shared` DTO types, error normalisation to the design §10 shape, and the query client with auth-aware retry.
- **Files** `client/src/lib/api.ts`, `client/src/lib/queryClient.ts`
- **Deps** CL-01
- **Accept** A 401 triggers exactly one refresh attempt then redirects; domain error codes survive to the caller.
- **Test** `client/tests/api.test.ts` — 401-refresh-once behaviour and error-shape preservation.

### CL-03 — Auth screens
- **Does** Register, login, logout, and session bootstrap.
- **Files** `client/src/routes/auth/*`, `client/src/api/auth.ts`
- **Deps** CL-02, AUTH-05
- **Accept** Form validation uses the shared DTO schemas; a logged-in user is redirected away from login.
- **Test** `client/tests/auth.test.tsx` — validation errors render from the shared schema, not a duplicated client rule.

### CL-04 — Public car browse and detail
- **Does** Listing grid with filters and a detail page including the availability calendar.
- **Files** `client/src/routes/cars/*`, `client/src/api/cars.ts`
- **Deps** CL-03, CAR-07
- **Accept** Only public cars render; unavailable dates are visibly blocked from the calendar and cannot be selected.
- **Test** `client/tests/cars.test.tsx` — availability rendering against a mocked lock response.

### CL-05 — KYC submission
- **Does** Submit form and status display, including the rejected-resubmit path.
- **Files** `client/src/routes/kyc/*`, `client/src/api/kyc.ts`
- **Deps** CL-03, KYC-03
- **Accept** Status and rejection reason are shown; an unverified user is told KYC is required before booking.
- **Test** `client/tests/kyc.test.tsx` — each status rendering.

### CL-06 — Owner: my listings, create and edit
- **Does** Listing management including draft→submit→withdraw, delist/relist, and the re-moderation warning on editing a live listing (CAR-05).
- **Files** `client/src/routes/my/cars/*`, `client/src/api/myCars.ts`
- **Deps** CL-04, CAR-07
- **Accept** Editing an approved listing warns that it will leave public view pending re-approval; relist is offered on delisted cars.
- **Test** `client/tests/myCars.test.tsx` — the re-moderation warning appears only for approved listings.

### CL-07 — Renter: request a booking and track it
- **Does** Booking request form and "my bookings" with per-state actions derived from the shared transition registry.
- **Files** `client/src/routes/my/bookings/*`, `client/src/api/bookings.ts`
- **Deps** CL-06, BOOK-08
- **Accept** Available actions come from the registry, not hardcoded conditionals; a confirmed booking offers "request cancellation", not "cancel".
- **Test** `client/tests/bookings.test.tsx` — action sets per state match the registry.

### CL-08 — Admin shell and work queues
- **Does** Admin layout with the five queues from ADM-02 and their counts.
- **Files** `client/src/routes/admin/layout.tsx`, `client/src/routes/admin/index.tsx`, `client/src/api/admin.ts`
- **Deps** CL-07, ADM-02
- **Accept** Non-admins cannot reach any admin route; counts refresh after an action.
- **Test** `client/tests/adminShell.test.tsx` — route guard + count invalidation.

### CL-09 — Admin: KYC and car moderation
- **Does** KYC verify/reject/revoke and car approve/reject/publish/delist, each with the required reason field.
- **Files** `client/src/routes/admin/kyc/*`, `client/src/routes/admin/cars/*`
- **Deps** CL-08, KYC-03, CAR-07
- **Accept** Reason is required in the UI wherever the DTO requires it; approve and publish are visibly separate actions (D2).
- **Test** `client/tests/adminModeration.test.tsx` — reason enforcement + the two-step approve/publish flow.

### CL-10 — Admin: bookings and payments
- **Does** Confirm, activate (with the unpaid override dialog), complete, terminate, resolve cancellation requests, plus payment record/settle/void/refund.
- **Files** `client/src/routes/admin/bookings/*`, `client/src/routes/admin/payments/*`
- **Deps** CL-09, BOOK-08, PAY-05
- **Accept** The activate button is disabled until payment settles, and the override path demands a typed reason before enabling.
- **Test** `client/tests/adminBookings.test.tsx` — **INV-5** at the UI layer: no override reason, no activation.

### CL-11 — Admin: audit viewer
- **Does** Filterable audit log view over the ADM-01 endpoint, with drill-through from any entity to its full history.
- **Files** `client/src/routes/admin/audit/*`
- **Deps** CL-10, ADM-01
- **Accept** Opening a booking shows every transition it went through, with actor and timestamp.
- **Test** `client/tests/adminAudit.test.tsx` — entity history rendering and filter composition.

---

## Block OPS

### OPS-01 — Seed script
- **Does** Idempotent seed producing an admin, verified and unverified users, and cars across every moderation×listing combination plus a car with a live booking.
- **Files** `server/src/scripts/seed.ts`, `package.json`
- **Deps** ADM-02
- **Accept** Running twice produces no duplicates; every state in the domain has at least one example row.
- **Test** `server/tests/integration/seed.test.ts` — idempotency + state coverage assertion.

### OPS-02 — Denormalisation consistency check
- **Does** A script recomputing `User.kycStatus`, `Booking.amountReceived`, and day-lock coverage, reporting drift without repairing it (design §7).
- **Files** `server/src/scripts/checkConsistency.ts`
- **Deps** OPS-01
- **Accept** Deliberately corrupted fixtures are reported with entity ids; a clean database reports zero drift.
- **Test** `server/tests/integration/consistency.test.ts` — corrupted and clean cases.

---

## Summary

| Block | Tasks | Gate |
|---|---|---|
| S — Spec amendments | 12 | Must fully merge before P-01 (S-01 done) |
| P — Scaffolding | 4 | |
| SH — Shared contracts | 10 | INV-4 lands here (SH-09) |
| INF — Infrastructure | 4 | |
| M — Models | 7 | |
| TR — Transition chokepoint | 4 | INV-3 (TR-02), no-direct-write (TR-04) |
| AUTH | 5 | |
| AUTH-FIX *(new, 2026-09-16)* | 4 | **BLOCKER** — nothing under `/api/auth` currently exists |
| KYC | 3 | |
| CAR | 7 | INV-1 lands here (CAR-03) |
| CAR-FIX *(new, 2026-09-16)* | 2 | **BLOCKER** — no path off `DRAFT` currently exists |
| BOOK | 8 | INV-2 (BOOK-04), INV-5 (BOOK-06) |
| BOOK-FIX *(new, 2026-09-16)* | 5 | **HIGH** |
| PAY | 5 | Run PAY-01/02 early — see BOOK block note |
| PAY-FIX *(new, 2026-09-16)* | 4 | **HIGH** |
| ADM | 2 | |
| ADM-FIX *(new, 2026-09-16)* | 4 | **HIGH** |
| SA — Super-admin surface *(new, 2026-09-16)* | 3 | **HIGH** |
| SEC — Security hardening *(new, 2026-09-16)* | 2 | **MEDIUM** |
| CL — Client | 11 | |
| OPS | 2 | |
| **Total** | **97** | |

**Critical path.** S-12 → P-04 → SH-10 → INF-02 → M-05 → TR-02 → TR-03 → BOOK-03 → BOOK-04. Everything else branches off it.

**Removed with the resale flow** (was 93 tasks, now 84 before the 2026-09-16 audit): the six-task `SALE` block, `M-06 SaleTransaction model`, the `ADM-01` resale integration test, and `CL-08` buyer sale inquiries. The old `CL-12` (admin sales + audit) is now `CL-11`, audit only.

**2026-09-16 backend audit remediation (13 new tasks, 84 → 97).** A review of the implemented backend against specs 01–04 found: `/api/auth` entirely unimplemented despite `AUTH-05` being marked in this plan (superseded by `AUTH-FIX`); no transition edge or route ever moves a `Car` off `DRAFT` (`CAR-FIX`); the `CANCELLATION_REQUESTED` booking state, `ACTIVE → TERMINATED`, and no-show clearing are all dead ends in the registry (`BOOK-FIX`); the payment model supports only a combined create+settle action with no standalone record/void/refund (`PAY-FIX`); admin has no read endpoints for listings/bookings/payments (`ADM-FIX`); `reactivateUser` runs zero guards and any `ADMIN` can act on a `SUPER_ADMIN` account (`ADM-06`); the `SUPER_ADMIN` role and `requireSuperAdmin` middleware exist but no route or service uses them (`SA`); and neither CSRF protection nor rate limiting exist anywhere despite both being required by spec 02 §5/§6.2 (`SEC`). Priorities: BLOCKER for `AUTH-FIX`/`CAR-FIX` (nothing downstream is reachable without them), HIGH for `BOOK-FIX`/`PAY-FIX`/`ADM-FIX`/`SA`, MEDIUM for `SEC`. No code was changed as part of this update — task-plan only, per `CLAUDE.md`'s "stop after each task for review."
