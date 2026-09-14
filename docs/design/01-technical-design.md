# 01 — Technical Design

Status: DRAFT — for review before any code.
Reads: `specs/01-domain-and-state-machines.md` (WHAT). This document is HOW.
Feeds: `tasks/01-implementation-plan.md` (STEPS).

> This document **supersedes** parts of `specs/01-domain-and-state-machines.md` where §1 (Decision log) says so. The spec is to be amended by the `S`-block tasks in the implementation plan before any implementation task begins. Until those amendments land, this document is the authority on the decisions listed in §1.

**Scope.** Rental only. The platform never sells a vehicle. There is no buyer, no sale price, no offer or negotiation flow, and no transfer of vehicle ownership. An earlier revision of this document carried two decisions (a `SYSTEM` actor class, and re-listing a car after its sale) that existed solely to support a resale flow; both have been removed. §15 records what was dropped and why, so the reasoning is not silently lost.

---

## 1. Decision log

These resolve the contradictions found in the spec audit. Each decision names the spec sections it changes; the `S`-block tasks apply them back into the spec.

### D1 — The "admin gates everything" rule is scoped, not absolute

**Problem.** The spec's hard constraints said users never write a status field. §2 of the spec then defines ten user-triggered status writes (booking requests, self-cancels, KYC submission, listing submission, delisting). Both cannot be true.

**Decision.** The rule is restated as two narrower invariants:

- **INV-1 (visibility).** No status write by a non-admin may make anything visible to a third party. Only an admin can move a `Car` to a publicly listed state.
- **INV-2 (counterparty assets).** No status write by a non-admin may bind, release, or transfer another party's asset or money. Only an admin may confirm a booking, activate a rental, or confirm receipt of payment.

A user may freely write status on their *own* intent objects — create a booking request, withdraw it, submit KYC, submit or withdraw a listing. These are requests, not grants.

**Consequence.** Every transition in the spec gets an explicit `actorClass` of `OWNER`, `COUNTERPARTY`, or `ADMIN`, and the `transition()` helper (§6) enforces it. Spec §2 tables are rewritten with this column. There is no `SYSTEM` class — see §15.

**Open decision inherited from the spec:** `CONFIRMED → CANCELLED` by the renter. Under INV-2, a renter cancelling a *confirmed* booking releases the owner's car back to market, which is a counterparty effect. **Resolved as:** the renter may *request* cancellation (`CONFIRMED → CANCELLATION_REQUESTED`), and an admin confirms it. This adds one state to `Booking`. See D4.

### D2 — `Car.status` is split into orthogonal fields

**Problem.** One scalar holds moderation state, listing state, and availability. That makes post-approval edits bypass moderation, makes `DELISTED` a permanent dead end, and forces "is this car free next Tuesday?" to be answered by a field that can only describe *now*.

**Decision.** Replace `Car.status` with:

| Field | Values | Meaning |
|---|---|---|
| `moderationStatus` | `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED` | Has an admin vetted the current content? |
| `listingState` | `UNLISTED`, `LISTED`, `DELISTED` | Is it on the market? |
| *(availability)* | derived | Computed from `BookingDayLock` — never stored |

A car is publicly visible iff `moderationStatus = APPROVED AND listingState = LISTED`. Availability for a date range is a query against `BookingDayLock`, not a field.

`DELISTED → LISTED` is a legal transition: an owner who withdraws a listing can put it back without creating a new record. Nothing about a rental-only platform makes delisting permanent.

**Consequence.** `RENTED` and `AVAILABLE` disappear as stored states — a car being out on rent is a fact about today's day-locks, not a property of the listing. Spec §1.3 and §2.3 are rewritten. Public-listing queries change shape (see §9).

### D3 — `registrationNumber` uniqueness is scoped to non-abandoned listings

**Problem.** A `DRAFT` that was never submitted permanently reserves a registration number, so a user can block a plate they do not own.

**Decision.** The unique index becomes a partial index covering only documents where `moderationStatus != DRAFT`. In plain terms: drafts do not reserve the plate; anything an admin has seen does. A second guard — plate ownership checked against the registration document at approval time — is the real defence, and is an admin responsibility, not a code one.

**Consequence.** `CarSchema.index({ registrationNumber: 1 }, { unique: true, partialFilterExpression: ... })`. Collision at submission time returns a domain error, not a 500.

### D4 — Booking gains `CANCELLATION_REQUESTED`; `ACTIVE` gains an exit

**Problem.** `ACTIVE` had no exit but `COMPLETED`, stranding write-offs and disputes, which in turn stranded the car. And D1 requires renter cancellation of a confirmed booking to be admin-confirmed.

**Decision.** `Booking.status` becomes:

`REQUESTED → CONFIRMED → ACTIVE → COMPLETED`, plus `REJECTED`, `CANCELLATION_REQUESTED`, `CANCELLED`, and `TERMINATED`.

- `CONFIRMED → CANCELLATION_REQUESTED` — renter or owner requests, admin resolves.
- `CANCELLATION_REQUESTED → CANCELLED | CONFIRMED` — admin decides.
- `ACTIVE → TERMINATED` — admin only, for early return / accident / dispute. Requires `reason` and releases the car's day-locks from the termination date forward.

**Consequence.** Two new states. `TERMINATED` is distinct from `COMPLETED` so reporting can tell a clean return from an aborted one.

### D5 — Double-booking is prevented by a unique index, not by a read-check

**Problem.** The overlap guard was a read-then-write with no atomicity. Two admins confirming overlapping requests both pass. MongoDB has no range-exclusion constraint.

**Decision.** Materialise the occupied range. A `BookingDayLock` collection holds one document per `(car, day)` with a **unique compound index on `{ car: 1, day: 1 }`**. Confirming a booking inserts every day-lock for its range inside a transaction; a conflicting confirmation fails on duplicate key and the transaction aborts. The database, not application logic, is the arbiter.

Day convention: locks cover `[startDate, endDate)` — the end date is a handback day and is **not** locked, so same-day turnover works. All days are normalised to UTC midnight.

Locks exist only while a booking is `CONFIRMED` or `ACTIVE`, and are deleted when it reaches `COMPLETED`, `CANCELLED`, or `TERMINATED` (for `TERMINATED`, only locks from the termination date forward).

**Consequence.** New collection. Requires MongoDB transactions, therefore a replica set — see §7. Availability queries read this collection. This is the single most load-bearing decision in the document: on a rental-only platform, double-booking is the failure that costs a real customer a real car on a real morning.

### D6 — A rental cannot be handed over unpaid

**Problem.** `CONFIRMED → ACTIVE` had no payment guard at all. For a cash-only business, handing over a car with no money recorded is the most expensive possible bug.

**Decision.** `Booking` carries a denormalised `amountReceived` (number, default 0), maintained only by the `Payment` service inside the same transaction as the payment write. `CONFIRMED → ACTIVE` requires `amountReceived >= totalAmount`, **or** an explicit admin override (`overrideReason` required, logged as a distinct `BOOKING_ACTIVATED_UNPAID` audit action). The override exists because real counter staff will need it; making it loud and separately auditable is the point.

**Consequence.** New field `Booking.amountReceived`.

### D7 — Refunds are new records, not mutations

**Problem.** `Payment.RECEIVED → REFUNDED` mutates the money-in record in place, destroying the fact that money was ever received and making partial refunds unrepresentable.

**Decision.** `Payment.direction` is added: `IN | OUT`. A refund is a **new** `Payment` with `direction: OUT` and `refundOf` pointing at the original. `Payment.status` becomes `PENDING | SETTLED | VOID`. The `REFUNDED` status is removed. A `PENDING` payment that never arrives is closed as `VOID` with a reason — no more immortal pending rows.

**Consequence.** `Booking.amountReceived` is the signed sum of `SETTLED` payments. Partial refunds work — which matters directly for early returns under D4's `TERMINATED`. The ledger is append-only, matching the audit posture.

### D8 — KYC verification can be revoked, and a new submission does not drop existing verification

**Problem.** `VERIFIED` was terminal (no fraud revocation), and submitting a second document silently demoted a verified user to `PENDING`, locking them out of booking.

**Decision.** `User.kycStatus` is derived on write as: `VERIFIED` if any non-revoked `KYC` document is `VERIFIED`, else the newest document's status. Admin may move a `KYC` from `VERIFIED → REVOKED` (reason required), which recomputes the user's status. A new submission while already verified does not change `User.kycStatus` until the new document is itself resolved.

**Consequence.** New `KYC` state `REVOKED`. `User.kycStatus` gains `REVOKED`. The recompute runs inside the same transaction as the KYC transition. Revocation matters more here than on a marketplace: a renter whose licence turns out to be invalid must stop being able to take cars out, immediately.

### D9 — Zod v4 is pinned; `/shared` has no Mongoose dependency

**Problem.** The spec's Zod block cannot compile under any single Zod major (`.omit()` after `.refine()` needs v4; `z.record(z.unknown())` needs v3). And `/shared` imported `mongoose` for `ObjectId.isValid`, pulling the ODM into the browser bundle.

**Decision.** Pin `zod@^4`. `/shared` depends on Zod and nothing else. ObjectId validation uses a regex (`/^[0-9a-fA-F]{24}$/`), not `mongoose.Types`.

**Consequence.** All schemas written in v4 idiom (`z.email()`, `z.record(keyType, valueType)`). `/shared` has no runtime dependency on the server stack.

### D10 — Client input never carries ownership or status

**Problem.** `createCarSchema` omitted status fields but not `owner`, letting a user attribute a listing to another account.

**Decision.** Input schemas are written explicitly (`z.object({...})`), never derived by `.omit()` from an entity schema — omission is a denylist and a denylist silently fails open when a field is added. `owner`, `renter`, `recordedBy`, and every status field are always taken from the authenticated session or from a looked-up parent document, never from the request body.

**Consequence.** Two schema families in `/shared`: `entities/*` (what is stored, used for typing and for tests) and `dto/*` (what a request may contain). They are separate files and never derived from one another.

---

## 2. Stack and pinned versions

| Concern | Choice | Note |
|---|---|---|
| Runtime | Node 22 LTS | |
| Language | TypeScript 5.x, `strict: true` | `noUncheckedIndexedAccess` on |
| Server | Express 5 | native async error propagation |
| DB | MongoDB 7+, Mongoose 8 | **replica set required** (D5 transactions) |
| Validation | Zod 4 | D9 |
| Client | React 19 + Vite 6 | |
| Client data | TanStack Query v5 | |
| Styling | Tailwind 4 | |
| Tests | Vitest + Supertest + mongodb-memory-server (replset mode) | |
| Auth | JWT (access + refresh), `httpOnly` cookies | §8 |

---

## 3. Repository layout

```
/shared                     # no server or browser dependencies; Zod + TS only
  src/
    entities/               # one file per entity: stored shape
    dto/                    # one file per use case: request shapes (D10)
    enums/                  # every status/enum union, single source of truth
    transitions/            # the transition tables as data (§6)
    index.ts

/server
  src/
    config/                 # env parsing (Zod), db connection
    models/                 # Mongoose schemas, one per entity
    services/               # ALL business logic + every transition
    transitions/            # transition registry + transition() helper
    routes/                 # thin: parse -> call service -> serialise
    middleware/             # auth, rbac, error handler, request context
    lib/                    # errors, dates, ids
    app.ts                  # express app (no listen)
    server.ts               # listen
  tests/
    unit/                   # services with a real in-memory replset
    integration/            # supertest against app.ts

/client
  src/
    api/                    # TanStack Query hooks, one file per resource
    routes/                 # page components
    components/
    lib/
```

**Dependency rule.** `/client` and `/server` both import `/shared`. Neither imports the other. `/shared` imports nothing from either. Enforced by a lint rule, not by convention.

---

## 4. Layering

```
route  ──>  service  ──>  transition()  ──>  model
  │            │               │
  │            │               └── writes AuditLog in the same session
  │            └── owns ALL guards and cross-entity effects
  └── parses DTO, attaches actor, serialises result. No logic.
```

**Hard rules.**

1. A route handler never touches a Mongoose model.
2. A service never reads `req`. It takes a typed `ActorContext` (§8) as its first argument.
3. **No status field is ever written outside `transition()`.** Enforced by a static test (§11, task `TR-04`).

---

## 5. Revised entity shapes

Deltas from the spec only; everything not listed is unchanged. Six entities plus one new lock collection — there is no `SaleTransaction`.

**User** — `kycStatus` gains `REVOKED` (D8).

**KYC** — `status` gains `REVOKED`; new fields `revokedBy`, `revokedAt`, `revocationReason` (D8).

**Car** — `status` removed. Adds `moderationStatus`, `listingState` (D2); `rejectedBy`, `rejectedAt`, `publishedAt`, `delistedBy`, `delistedAt` (audit symmetry). `registrationNumber` index becomes partial (D3). `owner` is immutable after creation.

**Booking** — `status` gains `CANCELLATION_REQUESTED`, `TERMINATED` (D4). Adds `amountReceived` (D6), `ratePerDaySnapshot` (so the total stays reproducible after an owner edits the price), `handedOverAt`, `returnedAt`, `odometerOut`, `odometerIn`, `terminatedAt`, `terminationReason`, `rejectedBy`, `overrideReason`.

**BookingDayLock** *(new)* — `{ car, day, booking }`, unique on `{ car, day }` (D5).

**Payment** — adds `direction: IN | OUT`, `refundOf`, `voidReason` (D7). `status` becomes `PENDING | SETTLED | VOID`. `booking` is the only parent ref.

**AuditLog** — `action` is typed as an enum from `/shared/enums`, not `string`. `actor` stays required and `actorRole` stays `USER | ADMIN`: every status write in this system has a human actor.

---

## 6. The `transition()` chokepoint

Single function through which every status change in the system passes.

```ts
type TransitionInput<E, S> = {
  entity: E;                  // the loaded document
  to: S;
  actor: ActorContext;
  reason?: string;
  metadata?: Record<string, unknown>;
  session: ClientSession;     // caller owns the transaction
};
```

Behaviour, in order:

1. Look up `(entityType, from, to)` in the transition registry. Unknown edge → `InvalidTransitionError`.
2. Check `actor` satisfies the edge's `actorClass` (D1). Fail → `ForbiddenTransitionError`.
3. Run the edge's declared guards. Each guard is a named, individually testable function receiving `(entity, actor, session)`.
4. Apply the status write and the edge's declared side-effect fields (`confirmedBy`, `confirmedAt`, …).
5. Write exactly one `AuditLog` document in the same session.

The registry lives in `/shared/transitions` as **data**, so the client can render "what can I do next" from the same table the server enforces. Guards are server-side only; the client sees edge names and actor classes, never guard implementations.

---

## 7. Concurrency and transactions

**Every state transition runs inside a MongoDB transaction.** No exceptions — the audit write must be atomic with the status write, and D5's locks must be atomic with the confirmation.

- Local dev and CI run a **single-node replica set**. A standalone `mongod` will fail at startup with a clear message from `config/db.ts`; this is intentional, not a supported mode.
- Services accept an optional `session`; the outermost caller creates it. Nested transitions reuse it.
- Write concern `majority`, read concern `snapshot` inside transactions.
- Transient transaction errors (including the duplicate-key abort from D5) are retried at most twice, then surfaced as `ConflictError` → HTTP 409.

**Denormalised fields** (`User.kycStatus`, `Booking.amountReceived`) are written only inside the same transaction as their source of truth, by exactly one service each. A consistency check script (`OPS-02`) recomputes and reports drift rather than silently repairing it.

---

## 8. Actor and authorization model

```ts
type ActorContext =
  | { kind: 'USER';  userId: ObjectId; role: 'USER';  kycStatus: KycStatus; isActive: true }
  | { kind: 'ADMIN'; userId: ObjectId; role: 'ADMIN'; isActive: true };
```

- JWT access token (15 min) + refresh token (30 d), both `httpOnly`, `sameSite=lax`, `secure` in production.
- `requireAuth` populates `req.actor`. `requireAdmin` narrows it. `requireActive` rejects deactivated users at the edge.
- Route-level RBAC is a coarse gate only. The real authorization is the `actorClass` check inside `transition()` (§6 step 2), because that is the layer that cannot be bypassed by a new route.
- **Ownership checks** (is this actor the car's owner / the booking's renter?) are guards, not middleware — they need the loaded document.

---

## 9. API surface

Thin REST. All responses `{ data }` or `{ error }`. All list endpoints paginated (`?page`, `?limit`, max 100).

**Public** (no auth): `GET /api/cars` (only `moderationStatus=APPROVED AND listingState=LISTED`), `GET /api/cars/:id`, `GET /api/cars/:id/availability?from&to` (reads `BookingDayLock`).

**Auth**: `POST /api/auth/register|login|refresh|logout`, `GET /api/auth/me`.

**User-owned**: `POST /api/kyc`, `GET /api/kyc/me`; `POST /api/cars` (draft), `PATCH /api/cars/:id`, `POST /api/cars/:id/submit`, `POST /api/cars/:id/withdraw`, `POST /api/cars/:id/delist`, `POST /api/cars/:id/relist`; `POST /api/bookings`, `POST /api/bookings/:id/cancel`, `POST /api/bookings/:id/cancel-request`; `GET` list endpoints scoped to the caller.

**Admin** — one endpoint per transition edge, named for the edge, never a generic `PATCH /status`:
`POST /api/admin/kyc/:id/verify|reject|revoke`,
`POST /api/admin/cars/:id/approve|reject|publish|delist`,
`POST /api/admin/bookings/:id/confirm|reject|activate|complete|terminate|cancel|resolve-cancellation`,
`POST /api/admin/payments` + `/:id/settle|void`, `POST /api/admin/payments/:id/refund`,
`POST /api/admin/users/:id/deactivate|reactivate`,
`GET /api/admin/audit?entityType&entityId&actor&from&to`.

Naming edges as endpoints is deliberate: it makes the "no generic status write" rule visible in the routing table, and it makes each admin action separately permissionable later.

---

## 10. Error model

```ts
class DomainError extends Error { code: string; httpStatus: number; details?: unknown }
```

| Class | code | HTTP |
|---|---|---|
| `ValidationError` | `VALIDATION_FAILED` | 400 |
| `AuthError` | `UNAUTHENTICATED` | 401 |
| `ForbiddenTransitionError` | `FORBIDDEN_TRANSITION` | 403 |
| `NotFoundError` | `NOT_FOUND` | 404 |
| `InvalidTransitionError` | `INVALID_TRANSITION` | 409 |
| `GuardFailedError` | `GUARD_FAILED` (+ guard name in `details`) | 409 |
| `ConflictError` | `CONFLICT` | 409 |

One error middleware. Unknown errors log with a request id and return an opaque 500 — internal messages never reach the client.

`GuardFailedError` carrying the guard's name matters: the admin UI can then say "cannot activate: payment not settled" instead of "409".

---

## 11. Testing strategy

| Layer | Tool | What it covers |
|---|---|---|
| Transition registry | Vitest, no DB | Every edge's actor class and guard list; reachability of every state; no orphan states |
| Services | Vitest + in-memory replset | Guards, audit writes, transaction rollback |
| Concurrency | Vitest + in-memory replset | Parallel confirms on overlapping ranges — exactly one wins (D5) |
| API | Supertest against `app.ts` | Auth, RBAC, status codes, payload shape |
| Invariants | Vitest, static | No status assignment outside `transition()`; no `mongoose` import in `/shared`; every transition edge has a test |

**Non-negotiable tests** (they encode the decisions above and must exist before the features they guard are considered done):

- `INV-1`: no route can produce a publicly visible car without an admin action.
- `INV-2`: a parallel double-confirm on overlapping dates produces exactly one `CONFIRMED` booking.
- `INV-3`: every `AuditLog` write is rolled back when its transaction aborts.
- `INV-4`: every state in every entity's enum is reachable from the initial state, and every non-terminal state has an outgoing edge.
- `INV-5`: `Booking` cannot reach `ACTIVE` with `amountReceived < totalAmount` unless `overrideReason` is set.

---

## 12. Configuration

All env vars parsed by Zod at boot (`config/env.ts`); the process exits on a bad config rather than failing later. Required: `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `NODE_ENV`, `PORT`, `CLIENT_ORIGIN`. Image storage target (`UPLOAD_*`) is deferred — see §13.

---

## 13. Non-goals / deferred

- **Selling or reselling vehicles.** Out of scope permanently, not deferred. See §15.
- **Image upload transport.** The spec stores image URLs. Where bytes live (S3, Cloudinary, local disk) is deferred to `docs/design/02`. Until then, the API accepts URLs and the client has no uploader.
- **Notifications.** No email or SMS. Admin and users see state changes only in-app. Phone OTP stays out of scope.
- **Search/geo.** `location.geo` is stored and indexed but no geo query endpoint ships in phase 1.
- **Security deposits.** Spec OQ#8 — if a refundable deposit is required, it is a `Payment` shape change and must be decided before the PAY block.
- **Multi-currency** — single implicit currency, no `currency` field.
- **Rate limiting, CAPTCHA, audit log retention policy** — phase 2.

---

## 14. Spec amendments required

The `S`-block in `tasks/01-implementation-plan.md` applies these. No implementation task may start before the `S`-block is merged.

| # | Spec section | Change | Decision |
|---|---|---|---|
| 1 | Hard constraints | Replace absolute admin rule with INV-1/INV-2 | D1 |
| 2 | §2 all tables | Add `actorClass` column | D1 |
| 3 | §1.3, §2.3 | Split `Car.status`; availability derived; `DELISTED` becomes re-listable | D2 |
| 4 | §1.3 | Partial unique index on `registrationNumber` | D3 |
| 5 | §1.4, §2.4 | Add `CANCELLATION_REQUESTED`, `TERMINATED` | D4 |
| 6 | §1.4 | Add `BookingDayLock` entity | D5 |
| 7 | §2.4 | Payment guard on `CONFIRMED → ACTIVE` | D6 |
| 8 | §1.5, §2.5 | `direction`, `refundOf`, `VOID`; drop `REFUNDED` | D7 |
| 9 | §1.2, §2.2 | `REVOKED` state; derived `User.kycStatus` | D8 |
| 10 | §3 | Rewrite all Zod in v4; drop `mongoose` import | D9 |
| 11 | §3 | Split entity vs DTO schemas; explicit input schemas | D10 |
| 12 | §1.3, §1.4 | Add missing actor/timestamp fields | audit findings |
| 13 | §4, §5 | Regenerate ER diagram, close OQs, add read-visibility matrix | — |

---

## 15. Removed with the resale flow

Recorded so the reasoning is recoverable if the scope ever changes back. These were real decisions with real justifications; they are gone because their subject matter is gone, not because they were wrong.

| Was | Did | Why it is gone |
|---|---|---|
| `SaleTransaction` entity | Modelled inquiry → negotiation → agreed price → payment → ownership transfer | No sales. Deleted from the spec entirely. |
| `SYSTEM` actor class + `AuditLog.causedBy` | Made the "auto-cancel competing offers when a car sells" cascade loggable, since it had no human actor | That cascade was the only `SYSTEM` write in the system. With it gone, every status write has a human actor, so `AuditLog.actor` stays required and the `causedBy` self-ref is unnecessary. |
| "A sold car can be re-listed by its new owner" | Reassigned `Car.owner`, appended `previousOwners[]`, reset moderation, so a buyer could list the car they bought | Ownership never transfers. `Car.owner` is now immutable. The separate and still-valid half of this decision — that a withdrawn listing must be re-listable — survives inside D2. |
| `Car.listingType` (`RENT \| SALE \| BOTH`) | Distinguished rental listings from sale listings | Every car is a rental listing. The field and all guards branching on it are removed. |
| `Car.salePrice`, `listingState: SOLD` | Sale pricing and terminal sold state | No sales. `rentalPricePerDay` is the only price. |
| `Payment.relatedType` (`BOOKING \| SALE`) + `sale` ref | Discriminated which parent a payment belonged to | Every payment belongs to a `Booking`. The xor validator and its whole class of bugs disappear with it. |
| `SaleTransaction.amountReceived` | Payment-settled guard before completing a sale | Only `Booking.amountReceived` remains (D6). |
