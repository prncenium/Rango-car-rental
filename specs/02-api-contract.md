# 02 — API Contract

Status: DRAFT — for review before any code.
Reads: `specs/01-domain-and-state-machines.md` (WHAT), `docs/design/01-technical-design.md` (HOW).
Feeds: `tasks/01-implementation-plan.md` — blocks `AUTH`, `KYC`, `CAR`, `BOOK`, `PAY`, `ADM`, `CL`.

**Scope.** Rental only. A user either rents a car or lists their own car for rent. There is no sale, no resale, no buyer, no sale price, no offer or negotiation flow, and no transfer of vehicle ownership. Nothing in this contract may be extended to support one.

**Authority.** This document is written against the **post-amendment** domain model — that is, `specs/01-domain-and-state-machines.md` as it will read once the `S`-block of `tasks/01-implementation-plan.md` has landed (amendments 1–13 in `docs/design/01-technical-design.md` §14). Concretely, this contract assumes:

- `Car.status` is split into `moderationStatus` + `listingState`; availability is derived, never stored (D2).
- `Booking.status` includes `CANCELLATION_REQUESTED` and `TERMINATED` (D4).
- `BookingDayLock` exists and is the sole arbiter of double-booking (D5).
- `Booking.amountReceived` and `ratePerDaySnapshot` exist (D6).
- `Payment` has `direction: IN | OUT`, `refundOf`, and status `PENDING | SETTLED | VOID`; `REFUNDED` does not exist (D7).
- `KYC` has `REVOKED`; `User.kycStatus` is derived and non-demoting (D8).
- All schemas are Zod v4; `/shared` has no Mongoose dependency (D9); DTOs are explicit, never `.omit()`-derived (D10).

Where this contract needs something the domain model does not yet have, it is raised as an **OPEN QUESTION** in §14 and cross-referenced at the point of use. **No implementation task in the `AUTH`/`KYC`/`CAR`/`BOOK`/`PAY`/`ADM` blocks may begin until every OPEN QUESTION marked `BLOCKING` in §14 is answered.**

---

## 1. Namespace rule and its exceptions

### 1.1 The rule

Three resource namespaces, plus one for authentication (§1.2 explains why `/api/auth` needs no collision row of its own):

| Namespace | Auth | Writes | Serves |
|---|---|---|---|
| `/api/public/*` | none | never | only `moderationStatus = APPROVED AND listingState = LISTED` cars, and day-level availability for them |
| `/api/user/*` | required, role `USER` or `ADMIN` | own records only | the caller's own listings, bookings, KYC, profile |
| `/api/admin/*` | required, role `ADMIN` | anything | everything |
| `/api/auth/*` | mixed, per endpoint | own session/account only | registration, login, token lifecycle, self |

> **HARD RULE (as given).** No endpoint under `/api/public` or `/api/user` may write a status field. Users create records in a pending state only. Every transition lives under `/api/admin`.

Two structural consequences that apply to every endpoint below and are not repeated in each entry:

1. **Ownership, role, and status are never read from a request body.** `owner`, `renter`, `recordedBy`, `role`, `moderationStatus`, `listingState`, `status`, `kycStatus`, `isActive`, `amountReceived`, `approvedBy`, `confirmedBy` and every timestamp are taken from the authenticated session, from a looked-up parent document, or from `transition()`. A request body containing any of them is **rejected with `VALIDATION_FAILED`, not silently stripped** — every DTO is `z.strictObject` (design D10).
2. **Every query object is strict too.** An unrecognised query parameter is a 400, not an ignored input. A filter that fails open is the same class of bug as a denylist that fails open.

### 1.2 Where the rule collides with the merged design — and how this contract resolves it

The hard rule above is **stricter** than `docs/design/01-technical-design.md` D1, which was merged as task `S-01` and explicitly permits a user to write status on their own intent objects. It is also stricter than spec 01 §2, which defines ten user-triggered transitions. Both cannot hold. Each collision is listed here with the resolution this contract adopts; each is also an OPEN QUESTION in §14 because reversing any of them changes the routing table.

| # | Collision | Design/spec position | This contract | OQ |
|---|---|---|---|---|
| **C-1** | A new listing's initial state | D2: `moderationStatus = DRAFT`; plan `CAR-01` is literally "create and update a draft" | Keep `DRAFT`. `POST /api/user/listings` creates a `DRAFT`. Exception **E1** below covers the user-triggered submit. | OQ-1 `BLOCKING` |
| **C-2** | `DRAFT → PENDING_APPROVAL` (owner submits) | Spec §2.3, actorClass `OWNER`, plan `CAR-02` | Allowed under `/api/user` as exception **E1**. Nothing becomes visible; INV-1 and INV-2 both hold. | OQ-1 `BLOCKING` |
| **C-3** | `DELISTED → LISTED` (owner relists) | Design §9 puts `POST /api/cars/:id/relist` under **User-owned** | **Moved to `/api/admin`.** This is not merely the hard rule — design §9 contradicts its own INV-1 here: relisting moves a car *into* a publicly listed state, which INV-1 reserves to an admin. Owner-initiated **delist** stays under `/api/user` (exception **E2**) because reducing visibility is INV-1-safe. **This is a defect in design §9, not a preference.** | OQ-2 `BLOCKING` |
| **C-4** | Route shapes | Design §9 uses flat, mixed-audience paths (`GET /api/cars`, `POST /api/cars`, `POST /api/bookings`) | Namespaced per §1.1. Design §9 must be amended; this needs a new amendment row **14** in design §14 and a new task **S-13**. | OQ-3 `BLOCKING` |
| **C-5** | Renter cancels own `REQUESTED` booking | Spec §2.4, actorClass `COUNTERPARTY`; design D1 calls it "consistent" | Allowed under `/api/user` as exception **E4**. Withdrawing one's own unconfirmed request binds nothing. | OQ-4 |
| **C-6** | Renter/owner requests cancellation of a `CONFIRMED` booking | D4: `CONFIRMED → CANCELLATION_REQUESTED`, admin resolves | Allowed under `/api/user` as exception **E5**, because the *terminal* decision is still the admin's. Strict reading would make this create a separate child request record instead. | OQ-5 |
| **C-7** | KYC resubmission after rejection | Spec §2.2: creates a **new** `KYC` doc in `PENDING` | No conflict. This is a creation in a pending state, exactly what the rule permits. | — |
| **C-8** | Booking request creates `REQUESTED`, not `PENDING_*` | Spec §2.4 | Naming only. `REQUESTED` **is** the pending state for `Booking`. No rename proposed — renaming invalidates the transition registry and every audit action. | OQ-6 |
| **C-9** | Rate limiting | Design §13 defers rate limiting to phase 2; §5 of this contract specifies it | See §5. Either design §13 is amended to pull it into phase 1, or §5 ships as a phase-2 annex — it must not stay contradictory with §13. | OQ-11 |

**There is no C-10.** An earlier draft's §1.1 referenced "(see C-10)" for the `/api/auth` namespace; no such row was ever written. Corrected below — `/api/auth` is not a hard-rule collision at all, and is covered by exceptions **E7**–**E9** instead of a numbered collision, since none of its writes are *transitions* on an existing entity, only the initial creation of a `User`.

### 1.3 Enumerated exceptions to the hard rule

**Nine** `/api/user` and `/api/auth` endpoints write a status field. There are no others, and the list is closed: any new endpoint under either namespace that writes status is a contract change, not an implementation detail.

Three of the nine are **creations** — a brand-new document's server-assigned initial status, not a transition of an existing one. Spec §1.6's transition-audit rule and design §6's `transition()` chokepoint both describe moving an *existing* document between states; a creation has no `from`, so it is listed separately from the six edge-exceptions rather than folded into them. An earlier draft under-counted this section at "exactly six" by omitting all three.

**Creations (no prior state, no audit-log `previousState`):**

| Ex | Endpoint | Writes | Why it is safe |
|---|---|---|---|
| **E7** | `POST /api/auth/register` (E-01) | `User.isActive = true`, `kycStatus = NOT_SUBMITTED`, `role = USER` | First-ever state of the caller's own new account. Nothing is public, nothing binds another party. |
| **E8** | `POST /api/user/listings` (E-09) | `Car.moderationStatus = DRAFT`, `listingState = UNLISTED` | Private to the creator until E1 (submit) is called. `listingState = UNLISTED` alone can never satisfy `guardModerationApproved`, so creation cannot become a shortcut to visibility. |
| **E9** | `POST /api/user/kyc` (E-22) | `KYC.status = PENDING` | Grants nothing — `User.kycStatus` is not touched by this write; only an admin verifying the document (E-54) changes it. |

**Edges (an existing document's status changes):**

| Ex | Endpoint | Edge | Why it is safe |
|---|---|---|---|
| **E1** | `POST /api/user/listings/:carId/submit` | `Car.moderationStatus: DRAFT\|REJECTED → PENDING_APPROVAL` | Self-owned, non-public, uncommitted. Requests review; grants nothing. |
| **E2** | `POST /api/user/listings/:carId/withdraw` | `Car.moderationStatus: PENDING_APPROVAL\|APPROVED → DRAFT` | Pulls one's own item out of a review queue, or back to `DRAFT` for editing (§10.1, E-12). Guarded so a currently `LISTED` car cannot be withdrawn out from under its own visibility. |
| **E3** | `POST /api/user/listings/:carId/delist` | `Car.listingState: LISTED → DELISTED` | *Reduces* visibility. INV-1 governs becoming visible. Guarded against delisting under a live rental. |
| **E4** | `POST /api/user/bookings` | `Booking: — → REQUESTED` | Creation in the pending state. Binds no car, no dates, no locks. *(Counted with the edges, not the creations table above, only because the booking's Zod schema and transition registry row both key it as `actorClass: COUNTERPARTY` alongside E5/E6 — the underlying act is the same shape as E7–E9.)* |
| **E5** | `POST /api/user/bookings/:bookingId/cancel` | `Booking: REQUESTED → CANCELLED` | Withdrawing one's own unconfirmed request. No locks exist yet. |
| **E6** | `POST /api/user/bookings/:bookingId/request-cancellation` | `Booking: CONFIRMED → CANCELLATION_REQUESTED` | Does **not** release the car. Locks stay held until an admin resolves. |

Everything else — every approve, reject, publish, relist, confirm, activate, complete, terminate, no-show, settle, void, refund, verify, revoke, deactivate — is `/api/admin` only.

---

## 2. Conventions

### 2.1 Transport

| Concern | Rule |
|---|---|
| Base path | `/api` on the same origin as the client in production; `CLIENT_ORIGIN` CORS allowance in dev (design §12) |
| Versioning | **None in the URL.** Single-tenant, single-client platform; a breaking change is a coordinated deploy. If a second consumer ever appears this becomes `/api/v1`. (OQ-7) |
| Request content type | `application/json; charset=utf-8` for all bodies. Any other type on a body-bearing method → `415 UNSUPPORTED_MEDIA_TYPE`. No `multipart/form-data` anywhere — image *bytes* are out of scope (design §13); the API accepts URLs only. |
| Response content type | `application/json; charset=utf-8`, always, including errors |
| Max body size | 64 KB. Exceeded → `413 PAYLOAD_TOO_LARGE`. |
| Trailing slashes | Not accepted. `/api/public/cars/` → 404. |
| Unknown method on a known path | `405 METHOD_NOT_ALLOWED` with an `Allow` header |
| Request correlation | Server generates a `requestId` per request and returns it in the `X-Request-Id` response header and in every error body. A client-supplied `X-Request-Id` is ignored, not trusted. |

### 2.2 Data types on the wire

| Type | Wire format | Note |
|---|---|---|
| ObjectId | string, `/^[0-9a-fA-F]{24}$/` | validated by the shared regex validator, never by `mongoose.Types` (D9) |
| Timestamp | ISO-8601 UTC with `Z`, e.g. `2026-10-14T09:30:00.000Z` | |
| Calendar day | `YYYY-MM-DD` | Used for `startDate`, `endDate`, availability, and day-locks. Normalised server-side to UTC midnight (D5). Clients never send a timezone-bearing value for a rental day. |
| Money | JSON number, major units, single implicit currency | **Carried over from spec 01 §1.3 unchanged.** Floating-point money is a known hazard for a cash business; integer minor units are the safer choice. See OQ-8. |
| Enum | Exact uppercase string from `/shared/enums` | |
| Absent optional | Field omitted. `null` is never sent and never accepted. | |

### 2.3 Date range semantics

Every `from`/`to` pair in this contract — booking dates, availability windows, audit filters — is **half-open: `from` inclusive, `to` exclusive**, matching D5's day-lock convention where the handback day is not locked so same-day turnover works. A booking `2026-10-01 → 2026-10-04` locks days 01, 02, 03 and costs 3 days.

This is stated once here and assumed everywhere. Any endpoint deviating from it says so explicitly; none currently do.

### 2.4 Success envelope

Single resource:

```json
{ "data": { "id": "6712ab...", "...": "..." } }
```

Collection:

```json
{
  "data": [ { "id": "6712ab..." } ],
  "meta": { "page": 1, "limit": 20, "total": 137, "totalPages": 7, "hasNext": true, "sort": "createdAt:desc" }
}
```

- `data` and `error` are mutually exclusive. A response never carries both.
- A successful mutation returns the **full updated resource**, not a bare `{ ok: true }` — the client's TanStack Query cache is updated from the response rather than from a refetch.
- `204 No Content` is used only for logout. Nothing else returns an empty body.

### 2.5 Idempotency

Admin transition endpoints are **not** idempotent and deliberately so: replaying `POST /api/admin/bookings/:id/confirm` on an already-`CONFIRMED` booking returns `409 INVALID_TRANSITION`, because the transition registry has no `CONFIRMED → CONFIRMED` edge. A silent 200 would hide a double-click that the operator needs to see.

`POST /api/admin/payments` is the one genuinely dangerous replay — a double-submitted cash entry inflates `amountReceived` and can let an unpaid car out of the gate. See OQ-9.

---

## 3. Global error contract

### 3.1 Shape

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

- `code` — stable machine-readable enum. Clients branch on this, never on `message`.
- `message` — human-readable, safe to show. For a `GUARD_FAILED` it names the business reason, not the guard function (design §10: *"the admin UI can say 'cannot activate: payment not settled' instead of '409'"*).
- `details` — optional, shape depends on `code` (§3.3).
- `requestId` — always present, matches `X-Request-Id`.

An unhandled error logs with the request id and returns an opaque `INTERNAL`. Internal messages, stack traces, Mongo driver errors, and duplicate-key index names never reach the client.

### 3.2 Codes

| `code` | HTTP | When | Source |
|---|---|---|---|
| `VALIDATION_FAILED` | 400 | Body, path, or query failed its Zod schema; includes unknown-key rejections | design §10 |
| `UNAUTHENTICATED` | 401 | No access token, expired token, malformed token, bad credentials on login | design §10 |
| `FORBIDDEN` | 403 | Route-level role gate failed, or the actor is not the owner of the addressed record | **NEW — delta to design §10**, see OQ-10 |
| `ACCOUNT_INACTIVE` | 403 | `requireActive` rejected a deactivated/suspended account | **NEW — delta to design §10**, see OQ-10 |
| `FORBIDDEN_TRANSITION` | 403 | The edge exists but the actor's `actorClass` does not permit it (`transition()` step 2) | design §10 |
| `NOT_FOUND` | 404 | Record does not exist, **or** exists but is outside the caller's read audience (§7.1) | design §10 |
| `METHOD_NOT_ALLOWED` | 405 | Known path, wrong verb | **NEW** |
| `CONFLICT` | 409 | Unique-constraint violation (email, phone, registration number) or a retried-and-still-failed transaction | design §10 |
| `INVALID_TRANSITION` | 409 | No such edge `(entityType, from, to)` in the registry (`transition()` step 1) | design §10 |
| `GUARD_FAILED` | 409 | A named guard rejected (`transition()` step 3). `details.guard` carries the guard name. | design §10 |
| `PAYLOAD_TOO_LARGE` | 413 | Body over 64 KB | **NEW** |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Non-JSON body | **NEW** |
| `RATE_LIMITED` | 429 | Bucket exhausted (§5) | **NEW** — design §13 defers rate limiting to phase 2; see C-9 / OQ-11 |
| `INTERNAL` | 500 | Anything unhandled | design §10 |
| `SERVICE_UNAVAILABLE` | 503 | Database unreachable, or the replica set lost quorum so no transaction can start | **NEW** |

The six codes marked NEW must be added to design §10's table and to `INF-03`'s error classes.

### 3.3 `details` shapes by code

**`VALIDATION_FAILED`** — Zod v4 `z.flattenError` output, plus where it came from:

```json
{
  "code": "VALIDATION_FAILED",
  "message": "Request body is invalid.",
  "details": {
    "source": "body",
    "fieldErrors": { "endDate": ["endDate must be after startDate"], "carId": ["Invalid id"] },
    "formErrors": []
  }
}
```

`source` is one of `body | query | params`.

**`GUARD_FAILED`** — `{ "guard": "<guardName>", ...guard-specific context }`. The guard-specific keys are listed per guard in §12.

**`INVALID_TRANSITION`** — `{ "entityType": "BOOKING", "from": "COMPLETED", "to": "ACTIVE" }`.

**`CONFLICT`** — `{ "field": "registrationNumber" }` for unique violations; `{ "reason": "WRITE_CONFLICT" }` for an exhausted transaction retry.

**`RATE_LIMITED`** — `{ "retryAfterSeconds": 42, "bucket": "auth.login.ip" }`.

**`NOT_FOUND`**, **`FORBIDDEN`**, **`UNAUTHENTICATED`**, **`INTERNAL`** — no `details`. Deliberately: a 404 that distinguishes "does not exist" from "not yours" is an enumeration oracle.

### 3.4 Rules that hold everywhere

1. **Error precedence**, fixed and testable, so a probe cannot use status codes as an oracle:
   `415 → 413 → 429 → 401 → 400 (path params) → 403 (role gate) → 404 (record / read audience) → 400 (body, query) → 403 (transition actorClass) → 409 (edge) → 409 (guards) → 409 (write conflict)`.
   Note that the role gate runs **before** the lookup: a `USER` hitting an `/api/admin` path gets 403 whether or not the id exists. Within a namespace the caller may legitimately address, the read-audience 404 runs before body validation, so a malformed body against someone else's record is still a 404.
2. **Ownership failures are 404, not 403.** A `USER` calling `GET /api/user/listings/:carId` for a car they do not own gets `NOT_FOUND`. `FORBIDDEN` is reserved for cases where the caller is *known* to be able to see the record but not act on it.
3. **Credential failures are uniform.** Wrong email and wrong password both return `UNAUTHENTICATED` with the identical message and comparable timing. A deactivated account is the one exception (`ACCOUNT_INACTIVE`) — see OQ-12.
4. **A failed transaction rolls back its audit log.** Design §11 `INV-3`. If the client saw an error, no `AuditLog` row exists.

---

## 4. Pagination, sorting, filtering

### 4.1 Pagination

Offset-based on every list endpoint.

| Param | Type | Default | Bounds |
|---|---|---|---|
| `page` | integer | `1` | ≥ 1 |
| `limit` | integer | `20` | 1–100 |

Out-of-bounds → `VALIDATION_FAILED` (not clamped — clamping hides a client bug). A `page` beyond the last returns `200` with `data: []`, not 404.

`meta.total` is a `countDocuments` against the same filter. On `/api/admin/audit` this count is over an append-only collection that grows without bound; see OQ-13.

### 4.2 Sorting

`?sort=<field>:<asc|desc>`. Single field only. Each endpoint declares a **whitelist**; a field outside it is `VALIDATION_FAILED`, never passed to Mongo. Every sort is made total by appending `_id:desc` as a tiebreak, so pages do not shuffle between requests.

Default is `createdAt:desc` everywhere unless the endpoint says otherwise.

### 4.3 Filtering

- Every filter parameter is explicitly whitelisted per endpoint and typed by that endpoint's query DTO.
- Unknown parameter → `VALIDATION_FAILED` with `details.source = "query"`.
- Repeated parameters express OR within a field: `?status=REQUESTED&status=CONFIRMED`. Different fields AND together.
- Free-text search (`?q=`) applies only where declared, is case-insensitive, matched against a declared field list, and is **escaped before use** — a user-supplied string never reaches a regex or a `$where`.
- Range filters use the `*From` / `*To` suffix and follow §2.3's half-open convention: `createdAtFrom` inclusive, `createdAtTo` exclusive.
- A filter naming a field the caller may not read is not silently dropped; it is `VALIDATION_FAILED`. Public callers cannot filter on `moderationStatus` at all — the parameter does not exist in `publicCarQueryDto`.

---

## 5. Rate limits

> **C-9 / OQ-11.** Design §13 lists rate limiting under "Non-goals / deferred — phase 2". This section specifies it because it was requested. Either design §13 is amended to pull rate limiting into phase 1, or this section ships as a phase-2 annex. It must not stay contradictory.

Fixed-window counters. Headers on every response in a limited namespace: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (seconds), plus `Retry-After` on a 429.

| Bucket | Key | Limit | Window |
|---|---|---|---|
| `auth.register` | IP | 5 | 1 hour |
| `auth.login.ip` | IP | 20 | 15 min |
| `auth.login.identity` | normalised email | 5 | 15 min |
| `auth.refresh` | user id | 60 | 1 hour |
| `auth.password` | user id | 5 | 1 hour |
| `public.read` | IP | 120 | 1 min |
| `user.read` | user id | 120 | 1 min |
| `user.write` | user id | 30 | 1 min |
| `user.listing.create` | user id | 10 | 1 hour |
| `user.booking.create` | user id | 20 | 1 day |
| `user.kyc.submit` | user id | 5 | 1 day |
| `admin.read` | user id | 600 | 1 min |
| `admin.write` | user id | 120 | 1 min |

Rules:

1. **`auth.login` consumes both buckets.** The IP bucket stops a spray across many accounts; the identity bucket stops a spray against one account from many IPs. A successful login resets the identity bucket, not the IP bucket.
2. **Failed requests still consume.** A 400 or a 409 counts. Otherwise the limiter is trivially bypassed by sending malformed requests.
3. **`admin.*` limits are backstops, not policy.** They exist to bound a compromised admin session and a runaway client retry loop. An admin who legitimately hits 120 writes/minute is doing a bulk operation the UI should not be offering.
4. **The limiter never rate-limits a rejection it produced.** 429 responses do not themselves consume budget.
5. Counter storage: in-process for a single node. Multi-instance deployment needs shared storage — see OQ-14.
6. `GET /api/auth/me` is on `user.read`, not an auth bucket — the client polls it.

---

## 6. Authentication and the actor at the edge

### 6.1 Tokens

Per design §8: JWT access token (15 min) + refresh token (30 d), both `httpOnly`, `sameSite=lax`, `secure` in production, `path=/api`.

| Cookie | Lifetime | Contents |
|---|---|---|
| `rgo_at` | 15 min | `{ sub, role, kycStatus, isActive, iat, exp, jti }` |
| `rgo_rt` | 30 d | `{ sub, sid, iat, exp, jti }` |

The access token carries `role` and `kycStatus` so the common path needs no user lookup. Both are **snapshots** and therefore stale for up to 15 minutes. Consequence, stated explicitly because it is load-bearing:

> **Any guard whose decision must be current — `kycStatus = VERIFIED` before booking, `isActive` before any write — re-reads the `User` document inside the transaction. The token is never the authority for a guard.** A KYC revocation (D8) that only took effect after the renter's token expired would let a revoked licence take a car out; `INV-2` in spirit and `D8` in letter both forbid that.

`requireAuth` → populates `req.actor: ActorContext` (design §8). `requireAdmin` → narrows to the `ADMIN` variant. `requireActive` → re-reads `User.isActive`.

### 6.2 CSRF

Cookie-borne credentials with `sameSite=lax` protect cross-site `POST` from a form submission but not every vector, and `lax` does not cover a same-site subdomain takeover. **This contract requires a double-submit CSRF token on every state-changing request** (`POST`, `PATCH`, `DELETE`) under `/api/user` and `/api/admin`:

- A non-`httpOnly` cookie `rgo_csrf` (random 32 bytes, base64url) is set at login and rotated at refresh.
- The client echoes it in an `X-CSRF-Token` header.
- Mismatch or absence → `403 FORBIDDEN`.
- `/api/public/*` and `GET` requests are exempt.

Design §8 does not mention CSRF. See OQ-15.

### 6.3 `ADMIN` inside `/api/user`

An `ADMIN` is also a person who may own a car and rent one. `/api/user/*` therefore accepts role `ADMIN` and scopes everything to `actor.userId` exactly as it does for a `USER` — an admin calling `GET /api/user/listings` sees *their own* listings, not all listings. Escalation is never implicit: to act as an administrator, an admin calls `/api/admin`.

This means an admin can approve their own listing. That is a real conflict-of-interest hole in a platform with one admin, and it is not closeable in code without a second admin. See OQ-16.

---

## 7. Resource representations

### 7.1 Read-visibility matrix

This is the matrix design §14 amendment 13 requires; it is reproduced here because every endpoint's 404 behaviour depends on it.

| Record state | Public | Owner | Renter on a booking for it | Admin |
|---|---|---|---|---|
| `Car` `DRAFT` | ✗ | ✓ | ✗ | ✓ |
| `Car` `PENDING_APPROVAL` | ✗ | ✓ | ✗ | ✓ |
| `Car` `REJECTED` | ✗ | ✓ (with reason) | ✗ | ✓ |
| `Car` `APPROVED` + `UNLISTED` | ✗ | ✓ | ✗ | ✓ |
| `Car` `APPROVED` + `LISTED` | ✓ | ✓ | ✓ | ✓ |
| `Car` `APPROVED` + `DELISTED` | ✗ | ✓ | ✓ *(if they hold a `CONFIRMED`/`ACTIVE`/`COMPLETED` booking on it)* | ✓ |
| `Car` out on rent today | ✓ *(listed; shown with those days unavailable)* | ✓ | ✓ | ✓ |
| `Booking` any state | ✗ | ✓ *(car owner)* | ✓ *(renter)* | ✓ |
| `KYC` any state | ✗ | ✓ *(submitter, masked)* | ✗ | ✓ |
| `Payment` any state | ✗ | ✗ *(see OQ-17)* | ✗ *(see OQ-17)* | ✓ |
| `AuditLog` | ✗ | ✗ | ✗ | ✓ |
| `User` | ✗ | ✓ *(self)* | limited *(see `PartyContact`)* | ✓ |

A read outside the caller's audience is `404 NOT_FOUND`, never 403.

### 7.2 Serialised shapes

Field names are the API's, not Mongo's: `_id` is serialised as `id` everywhere, and no response ever contains `__v`, `passwordHash`, or a raw Mongo error.

**`PublicCarSummary`** — `/api/public/cars` list item

```
id, make, model, year, transmission, fuelType, seats, mileageKm, color?,
rentalPricePerDay, location { city, state }, primaryImageUrl, imageCount, publishedAt
```

**`PublicCarDetail`** — `/api/public/cars/:carId`

```
PublicCarSummary + description?, images[], location.geo?
```

Deliberately **absent from both**: `owner` (any form), `registrationNumber`, `moderationStatus`, `listingState`, `rejectionReason`, `approvedBy`, booking history. A registration plate is the identifier of a physical vehicle on a public road; it is not needed to browse and it is abusable. See OQ-18 on whether an owner display name should appear.

**`OwnerCar`** — `/api/user/listings*`

```
PublicCarDetail + registrationNumber, moderationStatus, listingState,
rejectionReason?, delistedReason?, approvedAt?, rejectedAt?, publishedAt?, delistedAt?,
createdAt, updatedAt,
availableActions[]
```

`availableActions[]` is the set of edge names this actor can currently attempt, computed from the shared transition registry (design §6: *"the client can render 'what can I do next' from the same table the server enforces"*). It is advisory — the server re-checks. Admin identities (`approvedBy`, `rejectedBy`, `delistedBy`) are **not** exposed to owners, only the timestamps and reasons.

**`AdminCar`** — `/api/admin/listings*`

```
OwnerCar + owner: UserSummary, approvedBy?, rejectedBy?, delistedBy?,
activeBookingId?, lockedDayCount
```

**`UserSummary`** — `id, name, email, phone, role, kycStatus, isActive`

**`PartyContact`** — what either side of a booking may see about the other

```
id, name, phone?
```

**One gating rule, applied symmetrically in both directions:** `phone` is present **only** when the booking is `CONFIRMED`, `ACTIVE`, `COMPLETED`, `TERMINATED`, or `NO_SHOW`. On a `REQUESTED` or `CANCELLATION_REQUESTED`-from-`REQUESTED` booking each side sees `{ id, name }` only.

The rule is symmetric because the reasoning is symmetric: a request is not yet a relationship, an admin has not yet confirmed anything, and the platform has no gateway standing between the two parties. An earlier draft gated only the owner's view of the renter (`RenterContact`) and left the renter's view of the owner as `owner: { id, name, phone? }` with no stated condition — which handed out the owner's phone number on an unconfirmed request. `PartyContact` replaces both; there is no longer a `RenterContact` type. See OQ-19.

**`BookingSummary`**

```
id, car: PublicCarSummary, startDate, endDate, days,
ratePerDaySnapshot, totalAmount, amountReceived, status, createdAt
```

`BookingSummary` carries **no counterparty at all** — neither renter nor owner, in any state. Contact details appear only on `BookingDetail` (E-21), which is a single-record read. List endpoints therefore cannot be used to harvest contacts in bulk.

**`BookingDetail`** — renter view

```
BookingSummary + owner: PartyContact, rejectionReason?, cancellationReason?,
terminationReason?, confirmedAt?, handedOverAt?, returnedAt?, terminatedAt?,
odometerOut?, odometerIn?, availableActions[]
```

**`BookingDetail`** — owner view: the same, with `renter: PartyContact` in place of `owner`.

**`AdminBookingDetail`**

```
BookingDetail (both parties in full) + confirmedBy?, rejectedBy?, cancelledBy?,
overrideReason?, payments: PaymentRecord[], dayLocks: { from, to, count }
```

**`KycRecord`** — submitter view

```
id, documentType, documentNumberMasked, documentImageUrl, documentImageBackUrl?,
selfieUrl?, status, rejectionReason?, revocationReason?, reviewedAt?, revokedAt?, createdAt
```

`documentNumberMasked` shows the last 4 characters only (`XXXXXXXX4721`). The full number is never echoed back to the submitter — echoing it adds nothing they do not already know and turns any XSS or log leak into a document-number disclosure. Admins see `documentNumber` in full. See OQ-20 on encryption at rest (spec 01 §1.2 left it open).

**`AdminKycRecord`** — `KycRecord` with `documentNumber` unmasked, plus `user: UserSummary`, `reviewedBy?`, `revokedBy?`.

**`PaymentRecord`** — admin only

```
id, bookingId, direction, amount, paymentMethod, status, referenceNote?,
refundOfId?, voidReason?, recordedBy: UserSummary, settledAt?, voidedAt?, createdAt
```

**`AuditLogEntry`**

```
id, actor: UserSummary, actorRole, action, entityType, entityId,
previousState?, newState?, reason?, metadata?, ipAddress?, createdAt
```

**`AvailabilityResponse`**

```
carId, from, to,
blockedDays: ["2026-10-01", "2026-10-02"],
blockedRanges: [ { from: "2026-10-01", to: "2026-10-03" } ]
```

Public callers get days only — never a booking id, a renter, or the reason a day is blocked. `blockedRanges` is a convenience collapse of `blockedDays` for calendar rendering; both describe the same set. An admin calling the admin variant additionally gets `source` and `bookingId` per range.

---

## 8. Endpoints — Auth

All under `/api/auth`. Auth is the one namespace with per-endpoint auth requirements.

---

### E-01 `POST /api/auth/register`

| | |
|---|---|
| **Auth** | None (public) |
| **Params** | None |
| **Body** | `registerDto` — `{ name, email, phone, password }`. Successor to spec 01 §3 `createUserSchema`, rewritten explicit per D10. |
| **Success** | `201 Created` → `{ data: UserSummary }`. **No session is established** — the client must then call `E-02`. See OQ-21. |
| **Transition** | `User: — → isActive: true` (spec §2.1 row 1, `actorClass: OWNER`) |
| **Guards** | `guardEmailUnique` (case-normalised); `guardPhoneUnique`; password policy (min 8 chars, per `createUserSchema`) |
| **Forced server-side** | `role = USER` (never from body — a `role` key in the body is a 400), `kycStatus = NOT_SUBMITTED`, `isActive = true` |
| **Errors** | `400 VALIDATION_FAILED`; `409 CONFLICT` `{ field: "email" \| "phone" }` — **note this is an account-enumeration oracle**, see OQ-22; `413`; `415`; `429 RATE_LIMITED` (`auth.register`); `500` |
| **Audit** | `USER_REGISTERED` — `actor` = the new user, `actorRole: USER`, `entityType: USER`, `newState: "ACTIVE"`, `ipAddress` captured. **`USER_REGISTERED` is not in spec 01 §1.6's action enum and must be added** (OQ-23). |

---

### E-02 `POST /api/auth/login`

| | |
|---|---|
| **Auth** | None (public) |
| **Params** | None |
| **Body** | `loginDto` — `{ email, password }` |
| **Success** | `200 OK` → `{ data: UserSummary }`, plus `Set-Cookie: rgo_at`, `rgo_rt`, `rgo_csrf` |
| **Transition** | NONE |
| **Guards** | `guardCredentialsValid` (constant-time compare against the `select: false` hash); `guardAccountActive` |
| **Errors** | `400 VALIDATION_FAILED`; `401 UNAUTHENTICATED` — identical message and comparable timing for unknown email and wrong password; `403 ACCOUNT_INACTIVE` (OQ-12); `429 RATE_LIMITED` (`auth.login.ip` **and** `auth.login.identity`); `500` |
| **Audit** | **None on success by default.** A failed admin login is exactly the event an audit trail is for, but `AuditLog.actor` is `required` (spec §1.6) and a failed login for an unknown email has no actor. Recommended: log successful `ADMIN` logins only, as `ADMIN_LOGIN_SUCCEEDED`. See OQ-24. |

---

### E-03 `POST /api/auth/refresh`

| | |
|---|---|
| **Auth** | Refresh cookie only. A valid `rgo_at` is neither required nor sufficient. |
| **Params** | None |
| **Body** | None |
| **Success** | `200 OK` → `{ data: UserSummary }`, plus rotated `rgo_at`, `rgo_rt`, `rgo_csrf` |
| **Transition** | NONE |
| **Guards** | `guardRefreshTokenValid` (signature, expiry, not revoked); `guardAccountActive` — **re-read from the database**, so a user deactivated mid-session cannot refresh their way past the ban (§6.1) |
| **Errors** | `401 UNAUTHENTICATED` (missing, expired, malformed, or revoked refresh token — all identical); `403 ACCOUNT_INACTIVE`; `429`; `500` |
| **Audit** | None |
| **Note** | `UserSummary` is re-read here, so a `kycStatus` that changed since login reaches the client within one refresh cycle. Rotation and reuse-detection policy is OQ-25. |

---

### E-04 `POST /api/auth/logout`

| | |
|---|---|
| **Auth** | Required (`requireAuth`) |
| **Params** | None |
| **Body** | None |
| **Success** | `204 No Content`, with all three cookies cleared |
| **Transition** | NONE |
| **Guards** | None |
| **Errors** | `401 UNAUTHENTICATED`; `500` |
| **Audit** | None |
| **Note** | Logging out with an already-expired access token should still clear cookies rather than 401. Recommended: accept an expired-but-well-formed token here. See OQ-26. |

---

### E-05 `GET /api/auth/me`

| | |
|---|---|
| **Auth** | Required (`requireAuth`) |
| **Params** | None |
| **Body** | None |
| **Success** | `200 OK` → `{ data: { user: UserSummary, permissions: { canRequestBooking: boolean, canCreateListing: boolean }, counts: { pendingKyc, draftListings, activeBookings } } }` |
| **Transition** | NONE |
| **Guards** | None |
| **Errors** | `401 UNAUTHENTICATED`; `429` (`user.read`); `500` |
| **Audit** | None |
| **Note** | `permissions` is derived from the **database** `kycStatus`, not the token claim, so the client's gating matches the server's guards. `canCreateListing` depends on spec OQ#1 (is KYC required to list?), which `S-12` must close. |

---

## 9. Endpoints — Public

All under `/api/public`. Unauthenticated, read-only, and serving **only** cars where `moderationStatus = APPROVED AND listingState = LISTED`. Every query in this namespace has that predicate applied at the service layer, not the route layer, so it cannot be forgotten by a new caller — this is design §11's `INV-1` test.

---

### E-06 `GET /api/public/cars`

| | |
|---|---|
| **Auth** | None |
| **Params** | None |
| **Query** | `publicCarQueryDto` (strict). See table below. |
| **Success** | `200 OK` → `{ data: PublicCarSummary[], meta }` |
| **Transition** | NONE |
| **Guards** | None (the visibility predicate is a query constraint, not a guard) |
| **Errors** | `400 VALIDATION_FAILED` (unknown or out-of-range query param); `429 RATE_LIMITED` (`public.read`); `500` |
| **Audit** | None |

`publicCarQueryDto`:

| Param | Type | Notes |
|---|---|---|
| `page`, `limit` | int | §4.1 |
| `sort` | enum | whitelist: `rentalPricePerDay:asc`, `rentalPricePerDay:desc`, `publishedAt:desc`, `year:desc`, `seats:asc`. Default `publishedAt:desc`. |
| `city` | string | exact, case-insensitive |
| `state` | string | exact, case-insensitive |
| `q` | string, ≤ 60 | free text over `make`, `model`, `description`; **regex-escaped** |
| `make` | string, repeatable | OR within field |
| `transmission` | `MANUAL \| AUTOMATIC`, repeatable | |
| `fuelType` | enum, repeatable | |
| `seatsMin`, `seatsMax` | int 1–20 | |
| `priceMin`, `priceMax` | number ≥ 0 | against `rentalPricePerDay` |
| `yearMin`, `yearMax` | int | |
| `availableFrom`, `availableTo` | `YYYY-MM-DD` | **Both or neither** — one alone is a 400. Excludes cars with any `BookingDayLock` in `[from, to)`. Half-open per §2.3. |

There is deliberately **no** `moderationStatus`, `listingState`, `ownerId`, or `status` parameter. They do not exist in the DTO, so requesting one is a 400 rather than a filter the service must remember to reject.

`availableFrom`/`availableTo` makes this a two-stage query (design §9's *"public-listing queries change shape"*): filter cars, then exclude those with overlapping locks. Performance of that exclusion at scale is OQ-27.

---

### E-07 `GET /api/public/cars/:carId`

| | |
|---|---|
| **Auth** | None |
| **Params** | `carId` — ObjectId string |
| **Body** | None |
| **Success** | `200 OK` → `{ data: PublicCarDetail }` |
| **Transition** | NONE |
| **Guards** | None |
| **Errors** | `400 VALIDATION_FAILED` (malformed `carId`); `404 NOT_FOUND` — returned identically whether the car does not exist, is `DRAFT`, is `PENDING_APPROVAL`, is `REJECTED`, is `UNLISTED`, or is `DELISTED`. A public caller can never distinguish these; `429`; `500` |
| **Audit** | None |

---

### E-08 `GET /api/public/cars/:carId/availability`

| | |
|---|---|
| **Auth** | None |
| **Params** | `carId` — ObjectId string |
| **Query** | `availabilityQueryDto` — `from` (`YYYY-MM-DD`, required), `to` (`YYYY-MM-DD`, required) |
| **Success** | `200 OK` → `{ data: AvailabilityResponse }` |
| **Transition** | NONE |
| **Guards** | None |
| **Errors** | `400 VALIDATION_FAILED` — missing `from`/`to`, `to <= from`, window longer than 180 days, or `from` more than 365 days in the future; `404 NOT_FOUND` (not publicly visible per E-07); `429`; `500` |
| **Audit** | None |
| **Source** | `BookingDayLock` only (D5). Availability is never read from a car field, because no such field exists (D2). |
| **Leakage** | The response carries days, never `bookingId`, `renter`, or `source`. A blocked day is a blocked day; who blocked it is not public information. |

The 180-day window cap exists so an unauthenticated caller cannot ask for a decade of locks per request. See OQ-28 on whether it should be shorter.

---

## 10. Endpoints — User

All under `/api/user`. `requireAuth` + `requireActive` on every endpoint; roles `USER` and `ADMIN` (see §6.3). CSRF token required on every non-`GET` (§6.2).

**Scoping rule.** Every endpoint in this namespace is constrained to the caller's own records, and a record belonging to someone else is `404`, never `403`.

That rule is **enforced by a named guard on every endpoint, including reads** — not by a convention the service layer is trusted to remember. An earlier draft left every `/api/user` read marked `Guards: None (scoped)`, resting ownership on prose. Six handlers then shared one unwritten assumption, and design §11's invariant tests enumerate *transition edges*, so nothing in the test strategy would have caught a handler that forgot it. That is the classic IDOR shape: not a wrong check, an absent one.

Concretely:

| Guard | Applies to | Constrains |
|---|---|---|
| `guardIsOwner` | E-10, E-11, E-12, E-13, E-15, E-16 | `Car.owner = actor.userId` |
| `guardIsBookingParty` | E-21 | `Booking.renter = actor.userId OR Booking.owner = actor.userId` |
| `guardIsRenter` | E-18 | `Booking.renter = actor.userId` |
| `guardIsRenterOrCarOwner` | E-19 | as `guardIsBookingParty`, but named separately because it gates a *write* |
| `guardIsKycSubmitter` | E-24 | `KYC.user = actor.userId` |
| `scopeToActor(field)` | E-14, E-20, E-23 | injects the owning-field predicate into the list query before it is built |

`scopeToActor` is a query builder, not a guard — a list endpoint has no single loaded document to check — but it is a named, importable function for the same reason: a list handler that omits it is then a missing *call*, which a static test can find, rather than a missing *clause* inside a hand-written filter, which it cannot.

**Required test (new, `TR-05`):** every route registered under `/api/user` either declares one of the guards above or calls `scopeToActor`. Fails the build otherwise. This mirrors `TR-04`'s treatment of status writes and is the reason that invariant is stated structurally rather than per-endpoint.

### 10.1 Listings

---

### E-09 `POST /api/user/listings`

| | |
|---|---|
| **Auth** | Required — `USER`, `ADMIN` |
| **Params** | None |
| **Body** | `createCarDto` (plan `SH-07`) — `{ make, model, year, registrationNumber, color?, transmission, fuelType, seats, mileageKm, images[≥1], description?, location: { city, state, geo? }, rentalPricePerDay }` |
| **Success** | `201 Created` → `{ data: OwnerCar }` with `moderationStatus: DRAFT`, `listingState: UNLISTED` |
| **Transition** | `Car: — → DRAFT/UNLISTED` (spec §2.3 row 1, `actorClass: OWNER`) — a creation, not an edge |
| **Guards** | `guardOwnerKycIfRequired` — **conditional on spec OQ#1**, which `S-12` must close (OQ-29); `guardRegistrationAvailable` — the D3 partial index does not cover `DRAFT`, so a draft does **not** reserve the plate and collision is only detected at submit time (E-11) |
| **Forced server-side** | `owner = actor.userId`; both status fields; `approvedBy`/`approvedAt`/`rejectionReason` absent. `owner` in the body is a 400 (`SH-07` accept criterion). |
| **Errors** | `400 VALIDATION_FAILED`; `403 ACCOUNT_INACTIVE`; `403 FORBIDDEN` (CSRF); `409 GUARD_FAILED` (`guardOwnerKycIfRequired`); `413`; `415`; `429 RATE_LIMITED` (`user.listing.create`); `500` |
| **Audit** | **None.** A private draft is not a state transition anyone needs to audit. First audit entry for a `Car` is `CAR_SUBMITTED` at E-11. See OQ-30. |

---

### E-10 `PATCH /api/user/listings/:carId`

| | |
|---|---|
| **Auth** | Required — `USER`, `ADMIN` |
| **Params** | `carId` |
| **Body** | `updateCarDto` (plan `SH-07`) — every field of `createCarDto`, all optional, minimum one present. No status field, no `owner`. |
| **Success** | `200 OK` → `{ data: OwnerCar }` |
| **Transition** | **NONE.** `guardEditableModerationState` confines this endpoint to `moderationStatus ∈ { DRAFT, REJECTED }`, so no status field is ever written here. See the re-moderation note below for why, and for how an approved listing is edited. |
| **Guards** | `guardIsOwner`; `guardEditableModerationState`; `guardRegistrationAvailable` if `registrationNumber` changed; `guardNoActiveBookingOnPriceChange` — a car in `DRAFT`/`REJECTED` can still carry a `COMPLETED` booking history, and repricing must not rewrite a live one |
| **Errors** | `400`; `403 ACCOUNT_INACTIVE`, `403 FORBIDDEN` (CSRF); `404 NOT_FOUND` (absent or not owned); `409 GUARD_FAILED` (`guardEditableModerationState` with `details.moderationStatus` and a hint pointing at E-12); `409 CONFLICT` (`registrationNumber`); `413`; `415`; `429` (`user.write`); `500` |
| **Audit** | `CAR_EDITED` — **new action** (§13.2). Content edits were previously unaudited, which left `CAR_APPROVED` with no record of *what* was approved. `metadata` carries the changed field names only, never their values. |

**Re-moderation.** Plan task `CAR-05` is "Re-moderation after edit", and design D2 justifies splitting `Car.status` partly because *"post-approval edits bypass moderation"*. So an edit to an `APPROVED` car must send it back to `PENDING_APPROVAL` — which is a status write from `/api/user`. Three ways out, none free:

- **(a) Reject the edit.** `guardEditableModerationState` allows `PATCH` only while `moderationStatus ∈ { DRAFT, REJECTED }`; editing an `APPROVED` car is `409 GUARD_FAILED` and the owner must walk it back to `DRAFT` first. **This contract adopts (a)** — it is the only option that honours the hard rule without weakening moderation.
- (b) Allow the edit and auto-reset moderation. Cleanest UX, but writes status from `/api/user`.
- (c) Allow the edit, keep it approved. Rejected outright: it is exactly the bypass D2 was written to close. A listing approved as a 2019 hatchback at ₹1,200/day could become a 2012 sedan at ₹4,000/day with no admin ever seeing it.

**The full edit path under (a).** `guardEditableModerationState` keys on `moderationStatus`, which delisting does **not** change — so delisting alone never makes a car editable. The reachable sequence is:

| Car is | Step | Endpoint | After |
|---|---|---|---|
| `APPROVED` + `LISTED` | 1. delist | E-13 *(owner)* | `APPROVED` + `DELISTED` |
| `APPROVED` + `DELISTED`/`UNLISTED` | 2. withdraw | E-12 *(owner)* | `DRAFT` |
| `DRAFT` | 3. edit | E-10 *(owner)* | `DRAFT` |
| `DRAFT` | 4. resubmit | E-11 *(owner)* | `PENDING_APPROVAL` |
| `PENDING_APPROVAL` | 5. approve | E-29 *(admin)* | `APPROVED` |
| `APPROVED` + `DELISTED`/`UNLISTED` | 6. publish or relist | E-31 / E-33 *(admin)* | `APPROVED` + `LISTED` |

Step 2 is the `APPROVED → DRAFT` edge added to E-12. Without it steps 3–6 are unreachable and an approved listing can never be corrected — the first draft of this contract prescribed "delist, then edit" without it, which does not work.

Option (a) has a real cost: correcting a typo in a live listing is six steps and two admin touches. **OQ-32 (`BLOCKING`)** — confirm (a), or accept (b) as a seventh edge exception in §1.3.

---

### E-11 `POST /api/user/listings/:carId/submit` — **exception E1**

| | |
|---|---|
| **Auth** | Required — `USER`, `ADMIN` |
| **Params** | `carId` |
| **Body** | `submitCarDto` — `{}` (empty object, strict) |
| **Success** | `200 OK` → `{ data: OwnerCar }` with `moderationStatus: PENDING_APPROVAL` |
| **Transition** | `Car.moderationStatus: DRAFT → PENDING_APPROVAL`, and `REJECTED → PENDING_APPROVAL` (spec §2.3, `actorClass: OWNER`) |
| **Guards** | `guardIsOwner`; `guardListingComplete` (all required fields incl. ≥1 image and `rentalPricePerDay`); `guardRegistrationAvailable` — **the D3 partial index takes effect at exactly this moment**, so a plate claimed by another user's submitted listing fails here with a domain error, not a 500 (D3) |
| **Errors** | `400`; `403 ACCOUNT_INACTIVE`, `403 FORBIDDEN` (CSRF), `403 FORBIDDEN_TRANSITION`; `404 NOT_FOUND`; `409 INVALID_TRANSITION` (already `PENDING_APPROVAL` or `APPROVED`); `409 GUARD_FAILED` (`guardListingComplete` with `details.missing[]`); `409 CONFLICT` `{ field: "registrationNumber" }`; `429` (`user.write`); `500` |
| **Audit** | `CAR_SUBMITTED` — `actor` = owner, `actorRole: USER`, `previousState: "DRAFT" \| "REJECTED"`, `newState: "PENDING_APPROVAL"` |

---

### E-12 `POST /api/user/listings/:carId/withdraw` — **exception E2**

| | |
|---|---|
| **Auth** | Required — `USER`, `ADMIN` |
| **Params** | `carId` |
| **Body** | `withdrawCarDto` — `{}` |
| **Success** | `200 OK` → `{ data: OwnerCar }` with `moderationStatus: DRAFT` |
| **Transition** | `Car.moderationStatus: PENDING_APPROVAL → DRAFT`, **and `APPROVED → DRAFT`** (`actorClass: OWNER`) |
| **Guards** | `guardIsOwner`; **`guardNotListed`** — `listingState != LISTED`. A car currently on the market cannot be withdrawn from moderation without being delisted first (E-13); withdrawing it would leave a `DRAFT` car publicly visible, which is an INV-1 breach. |
| **Errors** | `400`; `403 ACCOUNT_INACTIVE`, `403 FORBIDDEN` (CSRF), `403 FORBIDDEN_TRANSITION`; `404`; `409 INVALID_TRANSITION` (`moderationStatus` is neither `PENDING_APPROVAL` nor `APPROVED`); `409 GUARD_FAILED` (`guardNotListed` with `details.listingState` and a hint pointing at E-13); `429`; `500` |
| **Audit** | `CAR_WITHDRAWN` — **not in spec §1.6's enum; must be added** (OQ-31) |

**The `APPROVED → DRAFT` edge closes a dead-end state.** Without it a car at `moderationStatus = APPROVED, listingState = UNLISTED` — approved but never published — has *no* outgoing edge at all: delist (E-13/E-32) requires `LISTED`, delete (E-16) requires `DRAFT` with `approvedAt` unset, and edit (E-10) requires `DRAFT` or `REJECTED`. That stranded state fails design §11's `INV-4` (*every non-terminal state has an outgoing edge*), and `INV-4` is a non-negotiable test, so the contract could not have shipped with it.

The same edge is what makes E-10's edit path reachable for an approved car. See the flow in E-10.

---

### E-13 `POST /api/user/listings/:carId/delist` — **exception E3**

| | |
|---|---|
| **Auth** | Required — `USER`, `ADMIN` |
| **Params** | `carId` |
| **Body** | `delistCarDto` (plan `SH-07`) — `{ reason: string (1..500) }`. Required per `SH-07`'s accept criterion. |
| **Success** | `200 OK` → `{ data: OwnerCar }` with `listingState: DELISTED` |
| **Transition** | `Car.listingState: LISTED → DELISTED` (`actorClass: OWNER`) |
| **Guards** | `guardIsOwner`; **`guardNoLiveRental`** — no `Booking` on this car in `ACTIVE`; **`guardNoFutureConfirmedBooking`** — no `Booking` in `CONFIRMED` with `startDate` in the future |
| **Errors** | `400`; `403 ACCOUNT_INACTIVE`, `403 FORBIDDEN` (CSRF), `403 FORBIDDEN_TRANSITION`; `404`; `409 INVALID_TRANSITION` (not `LISTED`); `409 GUARD_FAILED` (`guardNoLiveRental` / `guardNoFutureConfirmedBooking`, with `details.bookingIds[]`); `429`; `500` |
| **Audit** | `CAR_DELISTED` — `actorRole: USER`, `reason` recorded |

The two guards are the concrete form of spec §2.3's *"not currently `RENTED`"* and of D1's note that owner delisting *"requires a guard so an owner cannot delist out from under a live booking."* Under D2 there is no `RENTED` field, so "currently rented" is a query for an `ACTIVE` booking. The second guard is the sharper one: a car with a confirmed booking three weeks out is not rented *today*, and delisting it would strand a renter who has already been promised the car.

**There is no owner relist endpoint.** See C-3 — relisting is `E-33`, admin only.

---

### E-14 `GET /api/user/listings`

| | |
|---|---|
| **Auth** | Required — `USER`, `ADMIN` |
| **Query** | `myListingsQueryDto` — `page`, `limit`, `sort` (whitelist: `createdAt:desc`, `updatedAt:desc`, `rentalPricePerDay:asc\|desc`), `moderationStatus` (repeatable), `listingState` (repeatable) |
| **Success** | `200 OK` → `{ data: OwnerCar[], meta }` |
| **Transition** | NONE |
| **Guards** | `scopeToActor('owner')` — mandatory, enforced by `TR-05` |
| **Errors** | `400`; `403 ACCOUNT_INACTIVE`; `429` (`user.read`); `500` |
| **Audit** | None |

Note that `moderationStatus` **is** a legal filter here and is **not** a legal filter on `/api/public` — the same field name, a different audience, two different DTOs. That is why DTOs are per-endpoint rather than shared.

---

### E-15 `GET /api/user/listings/:carId`

| | |
|---|---|
| **Auth** | Required — `USER`, `ADMIN` |
| **Params** | `carId` |
| **Success** | `200 OK` → `{ data: OwnerCar & { bookings: BookingSummary[], upcomingLocks: { from, to }[] } }` |
| **Transition** | NONE |
| **Guards** | `guardIsOwner` |
| **Errors** | `400`; `403 ACCOUNT_INACTIVE`; `404 NOT_FOUND` (absent or not owned); `429`; `500` |
| **Audit** | None |

---

### E-16 `DELETE /api/user/listings/:carId`

| | |
|---|---|
| **Auth** | Required — `USER`, `ADMIN` |
| **Params** | `carId` |
| **Body** | None |
| **Success** | `200 OK` → `{ data: { id, deleted: true } }` |
| **Transition** | **NONE** — this is a true hard delete, permitted only in the narrow case below |
| **Guards** | `guardIsOwner`; **`guardNeverModerated`** — `moderationStatus = DRAFT` and `approvedAt` is unset; **`guardNeverPublished`** — `publishedAt` unset; **`guardNoBookingsEver`** — zero `Booking` documents reference this car, in any state |
| **Errors** | `400`; `403 ACCOUNT_INACTIVE`, `403 FORBIDDEN` (CSRF); `404`; `409 GUARD_FAILED` (`details.guard` names which condition failed, with a `hint` pointing at E-13); `429` (`user.write`); `500` |
| **Audit** | `CAR_DELETED` — written **before** the delete, in the same transaction. **Not in spec §1.6's enum; must be added** (OQ-31) |

Spec 01 §5 OQ#14 assumes *"nothing is ever hard-deleted (only deactivated/delisted), consistent with the audit trail requirement."* This endpoint is the narrow exception and it is narrow on purpose: a record no admin has ever seen, that was never public, and that no booking references has no audit history worth preserving beyond the tombstone this endpoint writes. Anything else fails with a 409 telling the owner to delist instead. **OQ-33** — confirm this exception, or remove `DELETE` entirely and let `E-13` be the only way to retire a listing.

### 10.2 Bookings

---

### E-17 `POST /api/user/bookings` — **exception E4**

| | |
|---|---|
| **Auth** | Required — `USER`, `ADMIN` |
| **Params** | None |
| **Body** | `requestBookingDto` (plan `SH-08`; successor to spec 01 §3 `requestBookingSchema`) — `{ carId, startDate: YYYY-MM-DD, endDate: YYYY-MM-DD }` |
| **Success** | `201 Created` → `{ data: BookingDetail }` with `status: REQUESTED` |
| **Transition** | `Booking: — → REQUESTED` (spec §2.4 row 1, `actorClass: COUNTERPARTY`) |
| **Guards** | `guardCarPubliclyBookable` — `moderationStatus = APPROVED AND listingState = LISTED`; `guardRenterKycVerified` — **re-read from the database, not the token** (§6.1); `guardNotOwnRental` — a user may not rent their own car; `guardDateRangeValid` — `endDate > startDate`, `startDate >= today` (UTC), duration ≤ 90 days; `guardNoExistingRequestForRange` — this renter has no other `REQUESTED`/`CONFIRMED` booking on this car overlapping this range |
| **Forced server-side** | `renter = actor.userId`; `owner` copied from `Car.owner`; `ratePerDaySnapshot` copied from `Car.rentalPricePerDay` **at request time**; `totalAmount = ratePerDaySnapshot × days` where `days = (endDate − startDate)` in whole UTC days (half-open, §2.3); `amountReceived = 0`; `status`. A `renter`, `owner`, `totalAmount`, or `amountReceived` key in the body is a 400 (`SH-08` accept criterion). |
| **Errors** | `400 VALIDATION_FAILED`; `403 ACCOUNT_INACTIVE`, `403 FORBIDDEN` (CSRF); `404 NOT_FOUND` (car not publicly visible — the same 404 a non-existent car gives); `409 GUARD_FAILED` (`guardRenterKycVerified` with `details.kycStatus`, `guardNotOwnRental`, `guardDateRangeValid`, `guardNoExistingRequestForRange`); `413`; `415`; `429 RATE_LIMITED` (`user.booking.create`); `500` |
| **Audit** | `BOOKING_REQUESTED` — `actor` = renter, `actorRole: USER`, `newState: "REQUESTED"`, `metadata: { carId, startDate, endDate, totalAmount }` |

**No day-locks are taken here.** Per D5, locks exist only while a booking is `CONFIRMED` or `ACTIVE`. A request against dates another request already covers succeeds — spec 01 §1.4 resolves this as *"allow queuing, admin decides"*, since with no payment gateway there is nothing to hold a slot with. The response therefore **must** tell the renter their dates are contested, or they will read `REQUESTED` as "booked". `BookingDetail` gains an advisory `competingRequestCount` for this. **OQ-34.**

`ratePerDaySnapshot` is why an owner's later price edit cannot change what an existing request costs (design §5).

---

### E-18 `POST /api/user/bookings/:bookingId/cancel` — **exception E5**

| | |
|---|---|
| **Auth** | Required — `USER`, `ADMIN` |
| **Params** | `bookingId` |
| **Body** | `cancelBookingRequestDto` — `{ reason?: string (1..500) }` |
| **Success** | `200 OK` → `{ data: BookingDetail }` with `status: CANCELLED` |
| **Transition** | `Booking: REQUESTED → CANCELLED` (spec §2.4, `actorClass: COUNTERPARTY`) |
| **Guards** | `guardIsRenter` — the acting user is `booking.renter`, **not** the owner; `guardStatusIsRequested` |
| **Errors** | `400`; `403 ACCOUNT_INACTIVE`, `403 FORBIDDEN` (CSRF), `403 FORBIDDEN_TRANSITION` (the car's *owner* calling this — they are neither the `COUNTERPARTY` nor an admin); `404`; `409 INVALID_TRANSITION` (status is not `REQUESTED` — a `CONFIRMED` booking must use E-19); `429` (`user.write`); `500` |
| **Audit** | `BOOKING_CANCELLED` — `actorRole: USER`, `cancelledBy = actor.userId`, `reason` recorded |

Applies **only** to `REQUESTED`. No locks exist, no money has moved, nothing of the owner's is released. A `CONFIRMED` booking cannot be cancelled here — that is E-19, and the distinction is the entire point of D4.

---

### E-19 `POST /api/user/bookings/:bookingId/request-cancellation` — **exception E6**

| | |
|---|---|
| **Auth** | Required — `USER`, `ADMIN` |
| **Params** | `bookingId` |
| **Body** | `requestBookingCancellationDto` (plan `SH-08`) — `{ reason: string (1..500) }` — **required** |
| **Success** | `200 OK` → `{ data: BookingDetail }` with `status: CANCELLATION_REQUESTED` |
| **Transition** | `Booking: CONFIRMED → CANCELLATION_REQUESTED` (D4, `actorClass: COUNTERPARTY` for the renter, `OWNER` for the car owner) |
| **Guards** | `guardIsRenterOrCarOwner` — D4: *"renter or owner requests, admin resolves"*; `guardStatusIsConfirmed` |
| **Errors** | `400 VALIDATION_FAILED` (missing `reason`); `403 ACCOUNT_INACTIVE`, `403 FORBIDDEN` (CSRF), `403 FORBIDDEN_TRANSITION`; `404`; `409 INVALID_TRANSITION` (not `CONFIRMED`; an `ACTIVE` booking is an admin `terminate`, E-35); `429`; `500` |
| **Audit** | `BOOKING_CANCELLATION_REQUESTED` — **not in spec §1.6's enum; must be added** (OQ-31) |

**Day-locks are NOT released.** This is the whole reason the state exists. The car stays held until an admin resolves the request (E-45), because releasing it on the renter's say-so is exactly the INV-2 breach D1 identified and D4 corrected. If the admin ends up rejecting the cancellation, the booking returns to `CONFIRMED` with its locks intact and nothing was lost.

---

### E-20 `GET /api/user/bookings`

| | |
|---|---|
| **Auth** | Required — `USER`, `ADMIN` |
| **Query** | `myBookingsQueryDto` — `page`, `limit`, `sort` (whitelist: `createdAt:desc`, `startDate:asc`, `startDate:desc`), `role` (`RENTER \| OWNER`, default `RENTER`), `status` (repeatable), `startDateFrom`, `startDateTo` |
| **Success** | `200 OK` → `{ data: BookingSummary[], meta }` |
| **Transition** | NONE |
| **Guards** | `scopeToActor('renter')` when `role=RENTER`, `scopeToActor('owner')` when `role=OWNER` — mandatory, enforced by `TR-05` |
| **Errors** | `400`; `403 ACCOUNT_INACTIVE`; `429` (`user.read`); `500` |
| **Audit** | None |

`role` selects which side of the record the caller is asking about. Because any `USER` may both list and rent (spec §1.1: *"No separate 'owner'/'renter' role"*), a single user can legitimately appear on both sides and needs both views.

**This endpoint returns no counterparty in either direction.** `BookingSummary` carries no renter and no owner (§7.2); `role` selects which records are returned, not which party is disclosed. An earlier draft claimed the `OWNER` view exposed renter contact details here — it did not and does not, and the two statements disagreed because `BookingSummary` has no such field. Contact details are on `BookingDetail` only (E-21), gated by `PartyContact`.

---

### E-21 `GET /api/user/bookings/:bookingId`

| | |
|---|---|
| **Auth** | Required — `USER`, `ADMIN` |
| **Params** | `bookingId` |
| **Success** | `200 OK` → `{ data: BookingDetail }`, serialised for whichever side the caller is on |
| **Transition** | NONE |
| **Guards** | `guardIsBookingParty` — `renter = actor.userId OR owner = actor.userId` |
| **Errors** | `400`; `403 ACCOUNT_INACTIVE`; `404 NOT_FOUND` (absent, or the caller is on neither side); `429`; `500` |
| **Audit** | None |

Payment records are **not** included. A renter seeing `amountReceived` on their own booking is reasonable; seeing the `PaymentRecord` ledger with `recordedBy` is not. See OQ-17.

### 10.3 KYC

---

### E-22 `POST /api/user/kyc`

| | |
|---|---|
| **Auth** | Required — `USER`, `ADMIN` |
| **Params** | None |
| **Body** | `submitKycDto` (plan `SH-06`; successor to spec 01 §3 `submitKycSchema`) — `{ documentType, documentNumber, documentImageUrl, documentImageBackUrl?, selfieUrl? }` |
| **Success** | `201 Created` → `{ data: KycRecord }` with `status: PENDING` |
| **Transition** | `KYC: — → PENDING` (spec §2.2 row 1, `actorClass: OWNER`) |
| **Guards** | `guardNoOpenKycSubmission` — the user has no other `KYC` document in `PENDING` (spec §2.2); `guardDocumentUrlsAllowed` — every URL is `https` and on the configured storage host |
| **Forced server-side** | `user = actor.userId`; `status = PENDING`; `reviewedBy`/`reviewedAt` absent |
| **Errors** | `400 VALIDATION_FAILED`; `403 ACCOUNT_INACTIVE`, `403 FORBIDDEN` (CSRF); `409 GUARD_FAILED` (`guardNoOpenKycSubmission` with `details.pendingKycId`); `413`; `415`; `429 RATE_LIMITED` (`user.kyc.submit`); `500` |
| **Audit** | `KYC_SUBMITTED` — `actor` = submitter, `actorRole: USER`, `newState: "PENDING"`. `documentNumber` is **never** written to `metadata`. |

This endpoint **does not upload bytes.** Design §13 defers image upload transport to `docs/design/02`; until that lands the API accepts URLs and the client has no uploader. So "upload KYC" is, in phase 1, "submit KYC document URLs" — and there is currently no endpoint anywhere in this contract that produces such a URL. **OQ-35 (`BLOCKING` for the `KYC` and `CL-05` blocks)** — this flow is not end-to-end until `docs/design/02` specifies upload.

Per D8, submitting while already `VERIFIED` does **not** demote `User.kycStatus`; the derivation is non-demoting and only recomputes when the new document is itself resolved. Resubmission after a rejection creates a new document rather than mutating the rejected one (spec §2.2), preserving history.

---

### E-23 `GET /api/user/kyc`

| | |
|---|---|
| **Auth** | Required — `USER`, `ADMIN` |
| **Query** | `page`, `limit`, `sort` (whitelist: `createdAt:desc`) |
| **Success** | `200 OK` → `{ data: KycRecord[], meta }` — the caller's full submission history, newest first, `documentNumber` masked |
| **Transition** | NONE |
| **Guards** | `scopeToActor('user')` — mandatory, enforced by `TR-05` |
| **Errors** | `400`; `403 ACCOUNT_INACTIVE`; `429` (`user.read`); `500` |
| **Audit** | None |

---

### E-24 `GET /api/user/kyc/:kycId`

| | |
|---|---|
| **Auth** | Required — `USER`, `ADMIN` |
| **Params** | `kycId` |
| **Success** | `200 OK` → `{ data: KycRecord }` |
| **Transition** | NONE |
| **Guards** | `guardIsKycSubmitter` |
| **Errors** | `400`; `403 ACCOUNT_INACTIVE`; `404 NOT_FOUND` (absent or not the caller's); `429`; `500` |
| **Audit** | None |

### 10.4 Profile

---

### E-25 `GET /api/user/profile`

| | |
|---|---|
| **Auth** | Required — `USER`, `ADMIN` |
| **Success** | `200 OK` → `{ data: UserSummary & { createdAt } }` |
| **Transition** | NONE |
| **Guards** | None |
| **Errors** | `401`; `403 ACCOUNT_INACTIVE`; `429`; `500` |
| **Audit** | None |

Overlaps `E-05 GET /api/auth/me`. Kept distinct because `me` is a session/bootstrap concern (permissions, counts, called on every app load) and `profile` is a record read. See OQ-36 on collapsing them.

---

### E-26 `PATCH /api/user/profile`

| | |
|---|---|
| **Auth** | Required — `USER`, `ADMIN` |
| **Body** | `updateProfileDto` — `{ name?, phone? }`, min one key. **`email`, `role`, `kycStatus`, `isActive` are absent from the DTO** and are 400s if sent. |
| **Success** | `200 OK` → `{ data: UserSummary }` |
| **Transition** | NONE — no status field is touched |
| **Guards** | `guardPhoneUnique` if `phone` changed |
| **Errors** | `400`; `403 ACCOUNT_INACTIVE`, `403 FORBIDDEN` (CSRF); `409 CONFLICT` `{ field: "phone" }`; `429` (`user.write`); `500` |
| **Audit** | `USER_PROFILE_UPDATED` — **not in spec §1.6's enum.** Arguably it should not be, since §1.6 is scoped to *state transitions* and this is not one. See OQ-37. |

Email is immutable through this endpoint — it is the login identifier, and changing it is an account-takeover primitive that needs a verification flow the platform has no email transport for (design §13: no notifications). An email change is an admin operation, and one this contract does not define. **OQ-38.**

Phone is mutable and unique-constrained. If phone is ever OTP-verified (spec OQ#13), this endpoint needs a re-verification step.

---

## 11. Endpoints — Admin

All under `/api/admin`. `requireAuth` + `requireAdmin` + `requireActive`; CSRF on every non-`GET`.

**Every mutation in this namespace runs inside a MongoDB transaction** (design §7 — no exceptions), and every one writes exactly one `AuditLog` row in that same session (spec §1.6). Where a mutation touches day-locks, the lock writes are in the same transaction; the unique index on `{ car, day }` is the arbiter and a duplicate-key abort surfaces as `409 CONFLICT` after at most two retries (design §7).

The `409 CONFLICT { reason: "WRITE_CONFLICT" }`, `403 FORBIDDEN` (CSRF), `403 ACCOUNT_INACTIVE`, `429 RATE_LIMITED` (`admin.write`), `500`, and `503 SERVICE_UNAVAILABLE` cases apply to **every** endpoint in this section and are not repeated per entry. Likewise every admin endpoint returns `403 FORBIDDEN` to a non-admin **before** looking the record up (§3.4 rule 1).

### 11.1 Listing moderation

---

### E-27 `GET /api/admin/listings`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Query** | `adminListingsQueryDto` — `page`, `limit`, `sort` (whitelist: `createdAt:desc`, `updatedAt:desc`, `publishedAt:desc`), `moderationStatus` (repeatable), `listingState` (repeatable), `ownerId`, `city`, `q` (over `make`, `model`, `registrationNumber`), `createdAtFrom`, `createdAtTo` |
| **Success** | `200 OK` → `{ data: AdminCar[], meta }` |
| **Transition** | NONE |
| **Guards** | None |
| **Errors** | `400 VALIDATION_FAILED`; `401`; `403 FORBIDDEN`; `429` (`admin.read`) |
| **Audit** | None |

Default view for the moderation queue is `?moderationStatus=PENDING_APPROVAL&sort=createdAt:asc` — oldest first, because a review queue is FIFO.

---

### E-28 `GET /api/admin/listings/:carId`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Params** | `carId` |
| **Success** | `200 OK` → `{ data: AdminCar & { bookings: BookingSummary[], auditTrail: AuditLogEntry[] } }` |
| **Transition** | NONE |
| **Guards** | None |
| **Errors** | `400`; `401`; `403 FORBIDDEN`; `404 NOT_FOUND`; `429` |
| **Audit** | None |

`auditTrail` is the most recent 50 entries for this entity, inline, so the reviewer does not have to cross-reference E-47.

---

### E-29 `POST /api/admin/listings/:carId/approve`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Params** | `carId` |
| **Body** | `approveCarDto` (plan `SH-07`) — `{ note?: string (≤500) }` |
| **Success** | `200 OK` → `{ data: AdminCar }` with `moderationStatus: APPROVED` |
| **Transition** | `Car.moderationStatus: PENDING_APPROVAL → APPROVED` (spec §2.3, `actorClass: ADMIN`) |
| **Guards** | `guardListingComplete` (re-checked — the content may have changed since submission); `guardRegistrationUniqueAmongModerated` (D3: the plate check that matters is at approval time) |
| **Side effects** | `approvedBy = actor.userId`, `approvedAt = now`. `listingState` is **unchanged** — approval alone does not publish. |
| **Errors** | `400`; `401`; `403 FORBIDDEN`, `403 FORBIDDEN_TRANSITION`; `404`; `409 INVALID_TRANSITION` (not `PENDING_APPROVAL`); `409 GUARD_FAILED`; `409 CONFLICT` `{ field: "registrationNumber" }` |
| **Audit** | `CAR_APPROVED` — `previousState: "PENDING_APPROVAL"`, `newState: "APPROVED"`, `reason` = `note` if given |

Approve and publish are deliberately separate (spec OQ#4 assumed distinct; D2 preserves the split by making them different *fields*, which settles the question — they are not two values of one enum, so there is nothing to collapse). Approval says "the content is acceptable"; publish says "it is on the market". **D3's real defence is here**: the admin is expected to check the plate against the registration document, which is an admin responsibility, not a code one.

---

### E-30 `POST /api/admin/listings/:carId/reject`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Params** | `carId` |
| **Body** | `rejectCarDto` (plan `SH-07`) — `{ reason: string (1..500) }` — **required** (`SH-07` accept criterion) |
| **Success** | `200 OK` → `{ data: AdminCar }` with `moderationStatus: REJECTED` |
| **Transition** | `Car.moderationStatus: PENDING_APPROVAL → REJECTED` (`actorClass: ADMIN`) |
| **Guards** | None beyond the edge |
| **Side effects** | `rejectionReason`, `rejectedBy`, `rejectedAt` |
| **Errors** | `400 VALIDATION_FAILED` (missing `reason`); `401`; `403`; `404`; `409 INVALID_TRANSITION` |
| **Audit** | `CAR_REJECTED` — `reason` recorded |

The owner sees `rejectionReason` (§7.2) but not `rejectedBy`. They can edit (E-10, allowed in `REJECTED`) and resubmit (E-11).

---

### E-31 `POST /api/admin/listings/:carId/publish`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Params** | `carId` |
| **Body** | `publishCarDto` — `{}` |
| **Success** | `200 OK` → `{ data: AdminCar }` with `listingState: LISTED` |
| **Transition** | `Car.listingState: UNLISTED → LISTED` (D2, `actorClass: ADMIN`) |
| **Guards** | **`guardModerationApproved`** — `moderationStatus = APPROVED`. This guard is the enforcement point for INV-1 and for design §11's non-negotiable test *"no route can produce a publicly visible car without an admin action"*; `guardOwnerActive` — a deactivated owner's car does not go live |
| **Errors** | `400`; `401`; `403`; `404`; `409 INVALID_TRANSITION` (already `LISTED`); `409 GUARD_FAILED` (`guardModerationApproved` with `details.moderationStatus`) |
| **Audit** | `CAR_PUBLISHED` — `previousState: "UNLISTED"`, `newState: "LISTED"`; `publishedAt` set |

---

### E-32 `POST /api/admin/listings/:carId/delist`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Params** | `carId` |
| **Body** | `delistCarDto` — `{ reason: string (1..500) }` — **required** |
| **Success** | `200 OK` → `{ data: AdminCar }` with `listingState: DELISTED` |
| **Transition** | `Car.listingState: LISTED → DELISTED` (`actorClass: ADMIN`) |
| **Guards** | `guardNoLiveRental` — **overridable**, unlike E-13. An admin delisting a car with an `ACTIVE` rental is a real scenario (stolen vehicle, safety recall, fraud); it requires `force: true` plus a reason, and audits as `CAR_DELISTED_FORCED`. |
| **Body (forced variant)** | `{ reason: string, force: true }` |
| **Errors** | `400`; `401`; `403`; `404`; `409 INVALID_TRANSITION`; `409 GUARD_FAILED` (`guardNoLiveRental` with `details.bookingIds[]` and a hint to use `force`) |
| **Audit** | `CAR_DELISTED`, or `CAR_DELISTED_FORCED` when forced — the second action name exists so a forced delist is separately greppable, on the same reasoning as D6's `BOOKING_ACTIVATED_UNPAID` |

A forced delist **does not** cancel the active booking, and this is deliberate: the car is off the market but the physical rental in progress still needs an explicit `complete` or `terminate` (E-34/E-35). Coupling them would let one click both hide a listing and end a live rental. **OQ-39** — confirm, and confirm `CAR_DELISTED_FORCED` as a new audit action.

---

### E-33 `POST /api/admin/listings/:carId/relist` — see **C-3**

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Params** | `carId` |
| **Body** | `relistCarDto` — `{}` |
| **Success** | `200 OK` → `{ data: AdminCar }` with `listingState: LISTED` |
| **Transition** | `Car.listingState: DELISTED → LISTED` (D2, `actorClass: ADMIN`) |
| **Guards** | `guardModerationApproved` — INV-1 again: a car whose content has since been edited back into `DRAFT` or `PENDING_APPROVAL` cannot be relisted without re-approval; `guardOwnerActive` |
| **Errors** | `400`; `401`; `403`; `404`; `409 INVALID_TRANSITION` (not `DELISTED`); `409 GUARD_FAILED` |
| **Audit** | `CAR_RELISTED` — **not in spec §1.6's enum; must be added** (OQ-31) |

This endpoint is `ADMIN`-only in this contract, against design §9 which places `relist` under User-owned. See **C-3** — design §9 contradicts INV-1 on this edge, and that is a defect to fix in design §9, not a preference to settle. **OQ-2 (`BLOCKING`).**

### 11.2 Availability blocks — see **C-5**

> **C-5 / OQ-40 (`BLOCKING`).** "Admin sets availability" has no support in the merged model: D2 removed `AVAILABLE`/`RENTED` and made availability *derived* from `BookingDayLock`, which only ever holds booking-owned days. Blocking a car for servicing, an owner's holiday, or an insurance lapse is therefore currently unrepresentable.
>
> **Recommendation:** extend `BookingDayLock` rather than add a collection — `booking` becomes optional and a `source: BOOKING | ADMIN_BLOCK` plus `reason` and `blockId` are added. The unique index on `{ car, day }` then arbitrates **both** double-booking and block-vs-booking collision with no second code path, which is exactly the property D5 called *"the single most load-bearing decision in the document"*. A separate `CarAvailabilityBlock` collection would reintroduce a read-then-write race between blocking and confirming.
>
> This requires a new spec amendment (14) and a new design decision (D11). **The two endpoints below are specified provisionally and must not be implemented until that lands.**

---

### E-34 `POST /api/admin/listings/:carId/availability-blocks` *(provisional)*

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Params** | `carId` |
| **Body** | `createAvailabilityBlockDto` — `{ from: YYYY-MM-DD, to: YYYY-MM-DD, reason: string (1..500) }` |
| **Success** | `201 Created` → `{ data: { blockId, carId, from, to, reason, dayCount, createdBy, createdAt } }` |
| **Transition** | NONE on `Car` — this creates lock rows, it does not move any entity's status |
| **Guards** | `guardDateRangeValid`; `guardNoConflictingLocks` — enforced by the unique index inside the transaction, not by a pre-read |
| **Errors** | `400`; `401`; `403`; `404`; `409 CONFLICT` `{ field: "day", conflictingDays: [...] }` when a day is already locked by a booking |
| **Audit** | `CAR_AVAILABILITY_BLOCKED` — new action (OQ-31), `metadata: { from, to, dayCount }` |

---

### E-35 `DELETE /api/admin/listings/:carId/availability-blocks/:blockId` *(provisional)*

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Params** | `carId`, `blockId` |
| **Success** | `200 OK` → `{ data: { blockId, released: true, dayCount } }` |
| **Transition** | NONE |
| **Guards** | **`guardBlockBelongsToCar`** — every lock row carrying `blockId` has `car = carId`. The path nests the block under a car, so the nesting must be verified rather than decorative; without it a `blockId` from car A is deletable through car B's path, and the audit row then records the wrong car. **`guardBlockIsAdminOwned`** — a lock whose `source` is `BOOKING` can **never** be deleted through this route. Deleting a booking's locks out from under it would silently make a confirmed car double-bookable, which is precisely the failure D5 exists to prevent. |
| **Errors** | `400`; `401`; `403`; `404 NOT_FOUND` (absent, **or the block does not belong to `carId`** — the mismatch is a 404, not a 409, so the route cannot be used to probe which blocks exist on other cars); `409 GUARD_FAILED` (`guardBlockIsAdminOwned`) |
| **Audit** | `CAR_AVAILABILITY_UNBLOCKED` — new action (OQ-31) |

---

### E-36 `GET /api/admin/listings/:carId/availability`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Params** | `carId` |
| **Query** | `from`, `to` (both required, ≤ 365-day window — wider than the public cap of 180 in E-08) |
| **Success** | `200 OK` → `{ data: AvailabilityResponse & { blockedRanges: [{ from, to, source, bookingId?, blockId?, reason? }] } }` |
| **Transition** | NONE |
| **Guards** | None |
| **Errors** | `400`; `401`; `403`; `404`; `429` (`admin.read`) |
| **Audit** | None |

Same underlying query as E-08, different audience and therefore a different serialisation: an admin sees *why* each day is blocked.

### 11.3 Booking lifecycle

---

### E-37 `GET /api/admin/bookings`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Query** | `adminBookingsQueryDto` — `page`, `limit`, `sort` (whitelist: `createdAt:desc`, `startDate:asc`, `startDate:desc`), `status` (repeatable), `carId`, `renterId`, `ownerId`, `startDateFrom`, `startDateTo`, `unpaidOnly` (boolean — `amountReceived < totalAmount`) |
| **Success** | `200 OK` → `{ data: AdminBookingDetail[], meta }` |
| **Transition** | NONE |
| **Guards** | None |
| **Errors** | `400`; `401`; `403 FORBIDDEN`; `429` (`admin.read`) |
| **Audit** | None |

`unpaidOnly` exists because D6 makes "is this booking paid?" the single question standing between a confirmed booking and a car leaving the lot.

---

### E-38 `GET /api/admin/bookings/:bookingId`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Params** | `bookingId` |
| **Success** | `200 OK` → `{ data: AdminBookingDetail & { auditTrail: AuditLogEntry[], competingRequests: BookingSummary[] } }` |
| **Transition** | NONE |
| **Guards** | None |
| **Errors** | `400`; `401`; `403`; `404`; `429` |
| **Audit** | None |

`competingRequests` — other `REQUESTED` bookings on the same car with overlapping dates. Spec §1.4 makes the admin the arbiter when requests queue (*"admin picks one to confirm and must reject/cancel the rest"*), so the admin needs to see the queue at the moment of deciding. Without this field that instruction is unactionable.

---

### E-39 `POST /api/admin/bookings/:bookingId/confirm`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Params** | `bookingId` |
| **Body** | `confirmBookingDto` (plan `SH-08`) — `{ note?: string (≤500) }` |
| **Success** | `200 OK` → `{ data: AdminBookingDetail }` with `status: CONFIRMED` |
| **Transition** | `Booking: REQUESTED → CONFIRMED` (spec §2.4, `actorClass: ADMIN`) |
| **Guards** | `guardStatusIsRequested`; `guardCarStillBookable` — `moderationStatus = APPROVED AND listingState = LISTED`; `guardRenterKycVerified` — **re-checked at confirm time**, because D8 allows revocation between request and confirmation; `guardRenterActive`; `guardDatesNotPast` — `startDate >= today` |
| **Side effects (same transaction)** | Insert one `BookingDayLock` per day in `[startDate, endDate)`; set `confirmedBy`, `confirmedAt` |
| **Errors** | `400`; `401`; `403`, `403 FORBIDDEN_TRANSITION`; `404`; `409 INVALID_TRANSITION`; `409 GUARD_FAILED`; **`409 CONFLICT` `{ reason: "DATES_UNAVAILABLE", conflictingDays: ["2026-10-02"] }`** — the duplicate-key abort from D5, surfaced after at most two retries |
| **Audit** | `BOOKING_CONFIRMED` — `metadata: { lockedDays, from, to }` |

**This is the endpoint D5 was written for.** The overlap check is not a read-then-write: the lock inserts and the status write are one transaction, and MongoDB's unique index on `{ car, day }` decides the winner. Two admins confirming overlapping requests simultaneously produce exactly one `CONFIRMED` booking; the loser gets `409 CONFLICT`. Design §11's non-negotiable test `INV-2` asserts exactly this and must pass before this endpoint is considered done.

Note `Car` is **not** touched. Under D2 there is no `RENTED` field to set; spec §2.3's `AVAILABLE → RENTED` row disappears with the amendment. A confirmed booking is expressed entirely by the booking's status and its locks.

Competing `REQUESTED` bookings are **not** auto-rejected — spec §1.4 makes that the admin's explicit job (E-40), and design §15 notes the removal of the one auto-cascade the system used to have along with the `SYSTEM` actor class. Every status write has a human actor. **OQ-41** — confirm the admin rejects competitors by hand, or add a deliberate cascade (which reintroduces the need for an actor on cascaded writes).

---

### E-40 `POST /api/admin/bookings/:bookingId/reject`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Params** | `bookingId` |
| **Body** | `rejectBookingDto` (plan `SH-08`) — `{ reason: string (1..500) }` — **required** |
| **Success** | `200 OK` → `{ data: AdminBookingDetail }` with `status: REJECTED` |
| **Transition** | `Booking: REQUESTED → REJECTED` (`actorClass: ADMIN`) |
| **Guards** | `guardStatusIsRequested` |
| **Side effects** | `rejectionReason`, `rejectedBy`. No locks to release — a `REQUESTED` booking never held any. |
| **Errors** | `400 VALIDATION_FAILED` (missing `reason`); `401`; `403`; `404`; `409 INVALID_TRANSITION` |
| **Audit** | `BOOKING_REJECTED` — `reason` recorded |

---

### E-41 `POST /api/admin/bookings/:bookingId/activate`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Params** | `bookingId` |
| **Body** | `activateBookingDto` (plan `SH-08`) — `{ odometerOut: number ≥ 0, overrideReason?: string (1..500) }` |
| **Success** | `200 OK` → `{ data: AdminBookingDetail }` with `status: ACTIVE` |
| **Transition** | `Booking: CONFIRMED → ACTIVE` (spec §2.4, `actorClass: ADMIN`) — "mark rental active" / handover |
| **Guards** | `guardStatusIsConfirmed`; **`guardPaymentCovered`** — `amountReceived >= totalAmount` **unless** `overrideReason` is present (D6); `guardStartDateReached` — `today >= startDate`; `guardRenterKycVerified` (re-checked — a revocation between confirm and handover must stop the car leaving); `guardLocksIntact` |
| **Side effects** | `handedOverAt = now`, `odometerOut`, `overrideReason` if given |
| **Errors** | `400 VALIDATION_FAILED` (missing `odometerOut`); `401`; `403`; `404`; `409 INVALID_TRANSITION`; `409 GUARD_FAILED` (`guardPaymentCovered` with `details: { required, received, shortfall }`; `guardStartDateReached` with `details.startDate`) |
| **Audit** | `BOOKING_STARTED`, **or `BOOKING_ACTIVATED_UNPAID` when `overrideReason` is used** (D6) — a distinct action so unpaid handovers are separately greppable, with `metadata: { required, received, shortfall }` |

This is the endpoint D6 exists for: *"For a cash-only business, handing over a car with no money recorded is the most expensive possible bug."* The override is deliberately present — real counter staff will need it — and deliberately loud. Design §11's `INV-5` asserts `ACTIVE` is unreachable with a shortfall unless `overrideReason` is set.

`odometerOut` is required, not optional: it is the only evidence of distance travelled, and a rental platform that cannot say how far a car went cannot resolve a dispute about it. **OQ-42** — confirm `odometerOut` is mandatory at handover.

---

### E-42 `POST /api/admin/bookings/:bookingId/complete`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Params** | `bookingId` |
| **Body** | `completeBookingDto` (plan `SH-08`) — `{ odometerIn: number ≥ 0, note?: string (≤500) }` |
| **Success** | `200 OK` → `{ data: AdminBookingDetail }` with `status: COMPLETED` |
| **Transition** | `Booking: ACTIVE → COMPLETED` (spec §2.4, `actorClass: ADMIN`) — "mark returned/completed" |
| **Guards** | `guardStatusIsActive`; `guardOdometerNotDecreasing` — `odometerIn >= odometerOut` |
| **Side effects (same transaction)** | **Delete all `BookingDayLock` rows for this booking** (D5: locks exist only while `CONFIRMED` or `ACTIVE`); `returnedAt = now`, `odometerIn` |
| **Errors** | `400`; `401`; `403`; `404`; `409 INVALID_TRANSITION` (not `ACTIVE`); `409 GUARD_FAILED` (`guardOdometerNotDecreasing` with `details: { odometerOut, odometerIn }`) |
| **Audit** | `BOOKING_COMPLETED` — `metadata: { odometerOut, odometerIn, distanceKm, releasedDays }` |

Deleting all locks on completion, including future ones, is correct for an **early** return: the car genuinely is free again. Note this makes an early completion and a `TERMINATED` early return differ only in intent and reporting — which is exactly why D4 kept them as separate states.

There is deliberately **no** payment-completeness guard here. A car that has come back is back; refusing to close the record because ₹500 is outstanding would leave the booking `ACTIVE` and its locks held, stranding the car to chase money. The outstanding balance is visible via `unpaidOnly` on E-37. **OQ-43** — confirm completion does not require full payment.

---

### E-43 `POST /api/admin/bookings/:bookingId/terminate`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Params** | `bookingId` |
| **Body** | `terminateBookingDto` (plan `SH-08`) — `{ reason: string (1..500), odometerIn?: number ≥ 0, effectiveFrom?: YYYY-MM-DD }` — `reason` **required** (D4) |
| **Success** | `200 OK` → `{ data: AdminBookingDetail }` with `status: TERMINATED` |
| **Transition** | `Booking: ACTIVE → TERMINATED` (D4, `actorClass: ADMIN`) |
| **Guards** | `guardStatusIsActive`; `guardEffectiveFromValid` — within `[startDate, endDate)`, defaults to today |
| **Side effects (same transaction)** | **Release day-locks from `effectiveFrom` forward only** (D4: *"releases the car's day-locks from the termination date forward"*); `terminatedAt`, `terminationReason`, `odometerIn` if given |
| **Errors** | `400 VALIDATION_FAILED` (missing `reason`); `401`; `403`; `404`; `409 INVALID_TRANSITION`; `409 GUARD_FAILED` |
| **Audit** | `BOOKING_TERMINATED` — **not in spec §1.6's enum; must be added** (OQ-31) — `reason` and `metadata: { effectiveFrom, releasedDays }` |

For accident, dispute, or an early return that is not a clean one. `TERMINATED` is distinct from `COMPLETED` so reporting can tell a clean return from an aborted one (D4). Any money owed back is a separate `direction: OUT` payment (E-49) — the termination does not compute or trigger a refund, because there is no gateway and no policy engine to compute one from. **OQ-44** — is a refund mandatory on termination after payment, or an admin judgement call?

---

### E-44 `POST /api/admin/bookings/:bookingId/cancel`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Params** | `bookingId` |
| **Body** | `cancelBookingDto` (plan `SH-08`) — `{ reason: string (1..500) }` — **required** |
| **Success** | `200 OK` → `{ data: AdminBookingDetail }` with `status: CANCELLED` |
| **Transition** | `Booking: REQUESTED → CANCELLED` **or** `CONFIRMED → CANCELLED` (spec §2.4, `actorClass: ADMIN`) |
| **Guards** | `guardStatusCancellable` — `status ∈ { REQUESTED, CONFIRMED }`. An `ACTIVE` booking is E-43, not this. |
| **Side effects (same transaction)** | Release **all** day-locks for this booking if any were held; `cancelledBy`, `cancellationReason` |
| **Errors** | `400`; `401`; `403`; `404`; `409 INVALID_TRANSITION` (`details: { from, to }` — an `ACTIVE` booking lands here with a hint pointing at `terminate`) |
| **Audit** | `BOOKING_CANCELLED` — `actorRole: ADMIN` |

Spec §2.4 notes that if a `Payment` was already `RECEIVED`, a refund should be recorded. Under D7 that is a **new** `direction: OUT` payment (E-49), never a mutation of the money-in record. This endpoint does not create it — see OQ-44.

---

### E-45 `POST /api/admin/bookings/:bookingId/resolve-cancellation`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Params** | `bookingId` |
| **Body** | `resolveCancellationDto` (plan `SH-08`) — discriminated union on `decision`: `{ decision: "APPROVE", reason?: string }` \| `{ decision: "DENY", reason: string }` |
| **Success** | `200 OK` → `{ data: AdminBookingDetail }` with `status: CANCELLED` or `CONFIRMED` |
| **Transition** | `Booking: CANCELLATION_REQUESTED → CANCELLED` (approve) or `CANCELLATION_REQUESTED → CONFIRMED` (deny) (D4, `actorClass: ADMIN`) |
| **Guards** | `guardStatusIsCancellationRequested` |
| **Side effects** | On `APPROVE`: release all day-locks, set `cancelledBy`/`cancellationReason`. On `DENY`: locks were never released, so **nothing changes but the status and the audit row** — which is the property that makes E-19 safe. |
| **Errors** | `400 VALIDATION_FAILED` (`DENY` without `reason`); `401`; `403`; `404`; `409 INVALID_TRANSITION` |
| **Audit** | `BOOKING_CANCELLED` (approve) or `BOOKING_CANCELLATION_DENIED` (deny) — the second is a **new** action (OQ-31) |

`reason` is required on `DENY` and optional on `APPROVE`: denying someone's cancellation request is the case where the requester is owed an explanation.

---

### E-46 `POST /api/admin/bookings/:bookingId/no-show` — see **C-6**

> **C-6 / OQ-45 (`BLOCKING`).** No-show is not in the domain model. `Booking.status` has no `NO_SHOW` and spec §1.6 has no `BOOKING_NO_SHOW` action. Two options:
>
> - **(a) New terminal state `NO_SHOW`, reachable from `CONFIRMED`.** Recommended. A no-show is operationally distinct from a cancellation — the renter did not turn up, the owner's car sat idle, and a cancellation-fee or reputation policy would key off exactly this. Folding it into `CANCELLED` with a reason string makes it unqueryable without scanning free text.
> - (b) `CONFIRMED → CANCELLED` with `cancellationReason` prefixed `NO_SHOW:`. Zero model change, zero reporting value.
>
> **Specified below on (a). Do not implement until the state exists in the spec.**

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Params** | `bookingId` |
| **Body** | `noShowBookingDto` — `{ reason?: string (≤500) }` |
| **Success** | `200 OK` → `{ data: AdminBookingDetail }` with `status: NO_SHOW` |
| **Transition** | `Booking: CONFIRMED → NO_SHOW` *(provisional — new state)* |
| **Guards** | `guardStatusIsConfirmed`; **`guardStartDatePassed`** — `today > startDate`. A no-show cannot be declared before the renter was due. |
| **Side effects (same transaction)** | Release all day-locks — the car is free and should be rentable again immediately |
| **Errors** | `400`; `401`; `403`; `404`; `409 INVALID_TRANSITION`; `409 GUARD_FAILED` (`guardStartDatePassed`) |
| **Audit** | `BOOKING_NO_SHOW` — new action (OQ-31) |

Money already received against a no-show is **not** auto-refunded and not auto-forfeited. With no gateway and no cancellation policy in the spec, the platform has no basis to decide; it stays as a `SETTLED` `IN` payment on a `NO_SHOW` booking and the admin resolves it with E-49 or not at all. **OQ-46.**

### 11.4 Payments

---

### E-47 `POST /api/admin/payments`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Params** | None |
| **Body** | `recordPaymentDto` (plan `SH-08`; successor to spec 01 §3 `recordPaymentSchema`) — `{ bookingId, amount: number > 0, paymentMethod, referenceNote?, settledNow?: boolean, allowOverpayment?: boolean }` |
| **Success** | `201 Created` → `{ data: PaymentRecord }` |
| **Transition** | `Payment: — → PENDING` (spec §2.5 row 1), **or `Payment: — → SETTLED`** when `settledNow: true`. The second is a **creation edge that spec §2.5 does not define** — see the note below. |
| **Guards** | `guardBookingExists`; `guardBookingExpectsPayment` — `status ∈ { CONFIRMED, CANCELLATION_REQUESTED, ACTIVE, COMPLETED, TERMINATED, NO_SHOW }`; `guardNotOverpaying` — `amountReceived + amount <= totalAmount` unless the body sets `allowOverpayment: true` (OQ-47) |
| **Forced server-side** | `direction = IN`; `recordedBy = actor.userId`; `booking` from the body's `bookingId`; `status`. `recordedBy` in the body is a 400 (`SH-08` accept criterion). |
| **Side effects (same transaction)** | When settled: `Booking.amountReceived += amount`, written **only** by the Payment service, inside this transaction (design §7) |
| **Errors** | `400`; `401`; `403`; `404 NOT_FOUND` (booking); `409 GUARD_FAILED` |
| **Audit** | **Exactly one row.** `PAYMENT_RECEIVED_CONFIRMED` when `settledNow: true`, otherwise `PAYMENT_RECORDED`. `metadata: { amount, paymentMethod, bookingId, settledImmediately }` |

**One call, one audit row.** An earlier draft wrote `PAYMENT_RECORDED` *and* `PAYMENT_RECEIVED_CONFIRMED` for a `settledNow` call. That breaks spec §1.6's *"MUST write exactly one `AuditLog` document"* and design §6 step 5, and it would double-count in any report keyed on `PAYMENT_RECORDED`. A `settledNow` call is one act by one admin and produces one row; `settledImmediately` in `metadata` preserves the distinction that the second row was carrying.

**`settledNow` needs a transition-registry row that spec §2.5 does not have.** Spec §2.5 defines `— → PENDING` then `PENDING → RECEIVED`; D7 renames `RECEIVED` to `SETTLED` but does not authorise creating a payment already settled. Since design §6 step 1 rejects any `(entityType, from, to)` triple absent from the registry, `settledNow` is unimplementable until `— → SETTLED` is added to spec §2.5 by `S-08`. **OQ-55 (`BLOCKING` for `PAY`).**

`settledNow` exists because the two-step record-then-settle flow is an artefact of a world with pending electronic settlement. Cash across a counter is received the moment it is recorded, and forcing a second click invites the first step being done and the second forgotten — leaving `amountReceived` at zero and blocking a handover that was in fact paid for.

**This is the replay-sensitive endpoint** (§2.5): a double-submitted cash entry inflates `amountReceived` and can let an unpaid car out under D6's guard. See **OQ-9**.

---

### E-48 `POST /api/admin/payments/:paymentId/settle`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Params** | `paymentId` |
| **Body** | `settlePaymentDto` — `{ referenceNote?: string (≤500) }` |
| **Success** | `200 OK` → `{ data: PaymentRecord }` with `status: SETTLED` |
| **Transition** | `Payment: PENDING → SETTLED` (D7; spec §2.5's `PENDING → RECEIVED` renamed by amendment 8) — "confirm offline payment" |
| **Guards** | `guardStatusIsPending` |
| **Side effects (same transaction)** | `settledAt = now`; `Booking.amountReceived += amount` for `direction: IN`, `−= amount` for `direction: OUT` (D7: *"the signed sum of `SETTLED` payments"*) |
| **Errors** | `400`; `401`; `403`; `404`; `409 INVALID_TRANSITION` (already `SETTLED` or `VOID`) |
| **Audit** | `PAYMENT_RECEIVED_CONFIRMED` — `metadata: { amount, direction, bookingId }` |

---

### E-49 `POST /api/admin/payments/:paymentId/void`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Params** | `paymentId` |
| **Body** | `voidPaymentDto` — `{ reason: string (1..500) }` — **required** |
| **Success** | `200 OK` → `{ data: PaymentRecord }` with `status: VOID` |
| **Transition** | `Payment: PENDING → VOID` (D7) |
| **Guards** | **`guardStatusIsPending`** — a `SETTLED` payment can **never** be voided. Money that arrived is reversed by a `direction: OUT` refund (E-50), never by erasing the record. This is the whole of D7. |
| **Side effects** | `voidedAt`, `voidReason`. **`amountReceived` is untouched** — a `PENDING` payment never contributed to it. |
| **Errors** | `400 VALIDATION_FAILED` (missing `reason`); `401`; `403`; `404`; `409 INVALID_TRANSITION` (`details: { from: "SETTLED" }` with a hint pointing at `refund`) |
| **Audit** | `PAYMENT_VOIDED` — **not in spec §1.6's enum; must be added** (OQ-31) |

This closes D7's *"immortal pending rows"*: an expected payment that never arrives is closed with a reason instead of sitting `PENDING` forever and distorting every "unpaid bookings" query.

---

### E-50 `POST /api/admin/payments/:paymentId/refund`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Params** | `paymentId` — the **original** `direction: IN` payment being refunded against |
| **Body** | `refundPaymentDto` (plan `SH-08`) — `{ bookingId, amount: number > 0, paymentMethod, reason: string (1..500), referenceNote?, settledNow?: boolean }` |
| **Success** | `201 Created` → `{ data: PaymentRecord }` — a **new** payment with `direction: OUT`, `refundOf: paymentId` |
| **Transition** | `Payment: — → PENDING` (or `SETTLED` with `settledNow`) on the **new** record. **The original is not transitioned and not modified.** |
| **Guards** | **`guardRefundMatchesBooking`** — the body's `bookingId` equals the original payment's `booking`; `guardOriginalIsSettledIn` — the target is `direction: IN` and `status: SETTLED`; `guardRefundNotExceedingOriginal` — the sum of existing non-void `OUT` payments referencing this original, plus `amount`, is ≤ the original's `amount` |
| **Errors** | `400`; `401`; `403`; `404`; `409 GUARD_FAILED` (`guardRefundMatchesBooking` with `details: { expectedBookingId, suppliedBookingId }`; `guardRefundNotExceedingOriginal` with `details: { originalAmount, alreadyRefunded, requested }`) |
| **Audit** | `PAYMENT_REFUNDED` — `entityId` = the **new** payment's id, `metadata: { refundOf, amount, reason }` |

Partial refunds work by construction, which matters directly for early returns under `TERMINATED` (D7). `201` rather than `200` because this creates a record; the response is the refund, not the original.

`bookingId` is required in the body and cross-checked rather than derived, even though it is recoverable from the payment. Refunding is the one irreversible money-out action in the system, and a `paymentId` mistyped or mis-clicked in a list still resolves to a *valid* payment on a *different* booking — the guard is what turns that into a rejection instead of a refund to the wrong renter. The body states the intent; the path states the target; the guard requires them to agree.

---

### E-51 `GET /api/admin/payments`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Query** | `adminPaymentsQueryDto` — `page`, `limit`, `sort` (whitelist: `createdAt:desc`, `amount:desc`), `bookingId`, `status` (repeatable), `direction`, `paymentMethod`, `recordedBy`, `createdAtFrom`, `createdAtTo` |
| **Success** | `200 OK` → `{ data: PaymentRecord[], meta: { ...pagination, totals: { settledIn, settledOut, pendingIn } } }` |
| **Transition** | NONE |
| **Guards** | None |
| **Errors** | `400`; `401`; `403`; `429` (`admin.read`) |
| **Audit** | None |

`meta.totals` is computed over the **filtered set**, not the page, and is the reconciliation figure a cash business actually needs at end of day.

### 11.5 KYC review

---

### E-52 `GET /api/admin/kyc`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Query** | `adminKycQueryDto` — `page`, `limit`, `sort` (whitelist: `createdAt:asc`, `createdAt:desc`), `status` (repeatable), `documentType`, `userId` |
| **Success** | `200 OK` → `{ data: AdminKycRecord[], meta }` |
| **Transition** | NONE |
| **Guards** | None |
| **Errors** | `400`; `401`; `403`; `429` (`admin.read`) |
| **Audit** | None |

Queue default: `?status=PENDING&sort=createdAt:asc`.

---

### E-53 `GET /api/admin/kyc/:kycId`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Params** | `kycId` |
| **Success** | `200 OK` → `{ data: AdminKycRecord & { user: UserSummary, submissionHistory: KycRecord[] } }` — `documentNumber` in full |
| **Transition** | NONE |
| **Guards** | None |
| **Errors** | `400`; `401`; `403`; `404`; `429` |
| **Audit** | **Recommended: `KYC_DOCUMENT_VIEWED`.** Reading a government ID is the one *read* in this system worth auditing, and a reviewer who can view every identity document without leaving a trace is an obvious insider-risk gap. This would be the only read-audit in the contract and spec §1.6 is scoped to transitions. **OQ-48.** |

---

### E-54 `POST /api/admin/kyc/:kycId/verify`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Params** | `kycId` |
| **Body** | `verifyKycDto` (plan `SH-06`) — `{ note?: string (≤500) }`. Matches spec 01 §3 `reviewKycSchema`'s `VERIFIED` branch. |
| **Success** | `200 OK` → `{ data: AdminKycRecord }` with `status: VERIFIED` |
| **Transition** | `KYC: PENDING → VERIFIED` (spec §2.2, `actorClass: ADMIN`) |
| **Guards** | `guardStatusIsPending`; **`guardDrivingLicenceIfRequired`** — conditional on **spec OQ#2**, which `S-12` must answer and which materially decides who may book (OQ-49 `BLOCKING`) |
| **Side effects (same transaction)** | `reviewedBy`, `reviewedAt`; **recompute `User.kycStatus`** per D8's non-demoting derivation |
| **Errors** | `400`; `401`; `403`; `404`; `409 INVALID_TRANSITION`; `409 GUARD_FAILED` |
| **Audit** | `KYC_VERIFIED` |

---

### E-55 `POST /api/admin/kyc/:kycId/reject`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Params** | `kycId` |
| **Body** | `rejectKycDto` (plan `SH-06`) — `{ reason: string (1..500) }` — **required** (`SH-06` accept criterion; spec §2.2 and `reviewKycSchema`'s `REJECTED` branch) |
| **Success** | `200 OK` → `{ data: AdminKycRecord }` with `status: REJECTED` |
| **Transition** | `KYC: PENDING → REJECTED` (`actorClass: ADMIN`) |
| **Guards** | `guardStatusIsPending` |
| **Side effects (same transaction)** | `rejectionReason`, `reviewedBy`, `reviewedAt`; recompute `User.kycStatus` — **non-demoting**, so a previously verified user who submits a second document and has it rejected stays `VERIFIED` (D8) |
| **Errors** | `400 VALIDATION_FAILED` (missing `reason`); `401`; `403`; `404`; `409 INVALID_TRANSITION` |
| **Audit** | `KYC_REJECTED` — `reason` recorded |

---

### E-56 `POST /api/admin/kyc/:kycId/revoke`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Params** | `kycId` |
| **Body** | `revokeKycDto` (plan `SH-06`) — `{ reason: string (1..500) }` — **required** |
| **Success** | `200 OK` → `{ data: AdminKycRecord }` with `status: REVOKED` |
| **Transition** | `KYC: VERIFIED → REVOKED` (D8, `actorClass: ADMIN`) |
| **Guards** | `guardStatusIsVerified` |
| **Side effects (same transaction)** | `revokedBy`, `revokedAt`, `revocationReason`; recompute `User.kycStatus` — this one **can** demote, which is the point |
| **Errors** | `400 VALIDATION_FAILED` (missing `reason`); `401`; `403`; `404`; `409 INVALID_TRANSITION` |
| **Audit** | `KYC_REVOKED` — **not in spec §1.6's enum; must be added** (OQ-31) |

D8: *"a renter whose licence turns out to be invalid must stop being able to take cars out, immediately."* Revocation takes effect for guards immediately because `guardRenterKycVerified` re-reads the database rather than trusting the token (§6.1), and it is re-checked at request (E-17), at confirm (E-39), **and** at activate (E-41).

Revocation does **not** cascade to the user's existing bookings. A `CONFIRMED` booking held by a newly-revoked renter stays `CONFIRMED` and keeps its locks, but cannot be activated — `guardRenterKycVerified` on E-41 stops the car leaving. The admin then cancels it explicitly (E-44). This keeps every status write human-actored (design §15). **OQ-50** — confirm no cascade.

### 11.6 User administration

---

### E-57 `GET /api/admin/users`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Query** | `adminUsersQueryDto` — `page`, `limit`, `sort` (whitelist: `createdAt:desc`, `name:asc`), `role`, `kycStatus` (repeatable), `isActive`, `q` (over `name`, `email`, `phone`; escaped) |
| **Success** | `200 OK` → `{ data: UserSummary[], meta }` |
| **Transition** | NONE |
| **Guards** | None |
| **Errors** | `400`; `401`; `403`; `429` (`admin.read`) |
| **Audit** | None |

`passwordHash` is `select: false` at the schema level (spec §1.1) and additionally never present in `UserSummary`.

---

### E-58 `GET /api/admin/users/:userId`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Params** | `userId` |
| **Success** | `200 OK` → `{ data: UserSummary & { kycHistory: AdminKycRecord[], listings: AdminCar[], bookingsAsRenter: BookingSummary[], bookingsAsOwner: BookingSummary[], auditTrail: AuditLogEntry[] } }` |
| **Transition** | NONE |
| **Guards** | None |
| **Errors** | `400`; `401`; `403`; `404`; `429` |
| **Audit** | None |

Each embedded collection is capped at 20 most-recent with a `hasMore` flag; the full lists are the filtered list endpoints.

---

### E-59 `POST /api/admin/users/:userId/deactivate` — see **C-7**

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Params** | `userId` |
| **Body** | `deactivateUserDto` — `{ reason: string (1..500), until?: YYYY-MM-DD }` |
| **Success** | `200 OK` → `{ data: UserSummary }` with `isActive: false` |
| **Transition** | `User: isActive true → false` (spec §2.1, `actorClass: ADMIN`) |
| **Guards** | `guardNotSelf` — an admin cannot deactivate their own account; `guardNotLastAdmin` — the last active `ADMIN` cannot be deactivated, which would lock every transition in the system out permanently |
| **Errors** | `400 VALIDATION_FAILED` (missing `reason`); `401`; `403`; `404`; `409 INVALID_TRANSITION` (already inactive); `409 GUARD_FAILED` (`guardNotSelf`, `guardNotLastAdmin`) |
| **Audit** | `USER_DEACTIVATED` — `reason` recorded, `metadata: { until }` if given |

**C-7 / OQ-51.** "Ban" and "suspend" are one boolean in the model. Spec §1.1 has only `isActive`, described as a soft-ban. A suspension with an end date needs a `suspendedUntil` field and something to lift it — and design §13 rules out scheduled jobs by omission, while design §15 removed the `SYSTEM` actor class that an auto-lift would need an actor for. **Recommendation:** ship `until` as an *advisory note* recorded in the audit metadata only, with an admin lifting it manually via E-60. Storing `suspendedUntil` as an enforced field requires either a scheduler or a check-on-read, and both are design decisions that do not exist yet.

Effect of deactivation, specified because it is not obvious: `requireActive` rejects at the edge, so the user cannot log in, refresh, or call any `/api/user` endpoint. Their `LISTED` cars stay listed and their `CONFIRMED` bookings stay confirmed — no cascade. Whether a ban should pull their listings is **OQ-52**; the case for pulling is strong if the ban is for fraud.

---

### E-60 `POST /api/admin/users/:userId/reactivate`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Params** | `userId` |
| **Body** | `reactivateUserDto` — `{ reason?: string (≤500) }` |
| **Success** | `200 OK` → `{ data: UserSummary }` with `isActive: true` |
| **Transition** | `User: isActive false → true` (spec §2.1, `actorClass: ADMIN`) |
| **Guards** | None |
| **Errors** | `400`; `401`; `403`; `404`; `409 INVALID_TRANSITION` (already active) |
| **Audit** | `USER_REACTIVATED` |

### 11.7 Audit and dashboard

---

### E-61 `GET /api/admin/audit`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Query** | `auditQueryDto` (plan `ADM-01`) — `page`, `limit`, `sort` (whitelist: `createdAt:desc`, `createdAt:asc`), `entityType`, `entityId`, `actor`, `actorRole`, `action` (repeatable), `from`, `to` (timestamps, half-open per §2.3) |
| **Success** | `200 OK` → `{ data: AuditLogEntry[], meta }` |
| **Transition** | NONE |
| **Guards** | `guardEntityIdRequiresEntityType` — `entityId` without `entityType` is a 400, because `entityId` alone cannot use the `{ entityType, entityId, createdAt }` index and would collection-scan |
| **Errors** | `400 VALIDATION_FAILED`; `401`; `403`; `429` (`admin.read`) |
| **Audit** | None — reading the audit log is not itself audited |

Matches design §9's `GET /api/admin/audit?entityType&entityId&actor&from&to`, with `action` and `actorRole` added.

The collection is append-only and unbounded; offset pagination degrades at high offsets and can skip or repeat rows as new entries land. **OQ-13** — cursor pagination on this endpoint specifically. Design §13 defers retention policy to phase 2, so it will grow indefinitely.

---

### E-62 `GET /api/admin/dashboard/counts`

| | |
|---|---|
| **Auth** | `ADMIN` |
| **Query** | None |
| **Success** | `200 OK` → `{ data: { ... } }`, shape below |
| **Transition** | NONE |
| **Guards** | None |
| **Errors** | `401`; `403`; `429` (`admin.read`); `500` |
| **Audit** | None |

```json
{
  "data": {
    "queues": {
      "kycPending": 4,
      "listingsPendingApproval": 7,
      "listingsApprovedUnlisted": 2,
      "bookingsRequested": 11,
      "bookingsAwaitingCancellationDecision": 1
    },
    "operations": {
      "rentalsActive": 6,
      "handoversDueToday": 3,
      "returnsDueToday": 2,
      "returnsOverdue": 1
    },
    "money": {
      "bookingsConfirmedUnpaid": 4,
      "paymentsPendingCount": 5,
      "paymentsPendingAmount": 18400,
      "settledInLast30Days": 264500,
      "settledOutLast30Days": 12000
    },
    "platform": {
      "usersTotal": 312,
      "usersDeactivated": 4,
      "listingsLive": 58
    },
    "generatedAt": "2026-09-15T06:00:00.000Z"
  }
}
```

Every figure is a live `countDocuments` or `$sum`, not a cached counter — a denormalised dashboard counter is a second source of truth and design §7 already constrains denormalised fields to one writing service each. `returnsOverdue` (`ACTIVE` bookings whose `endDate` has passed) is the one figure here that represents a car that may be missing, which is why it is separated from `returnsDueToday`.

This endpoint is `ADM-02`'s backing query ("admin work queues"). **OQ-53** — whether the queue counts should carry the oldest-item age, which is what tells an operator a queue is stalling rather than merely long.

---

## 12. Guard index

Every guard named in §8–§11, with the `GUARD_FAILED` `details` it contributes. Guards are named, individually testable functions receiving `(entity, actor, session)` (design §6 step 3) and live server-side only (`TR-03`). The client never sees an implementation, only edge names and actor classes.

| Guard | Used by | `details` keys beyond `guard` |
|---|---|---|
| `guardEmailUnique` | E-01 | — (surfaces as `CONFLICT`) |
| `guardPhoneUnique` | E-01, E-26 | — (surfaces as `CONFLICT`) |
| `guardCredentialsValid` | E-02 | — (surfaces as `UNAUTHENTICATED`) |
| `guardAccountActive` | E-02, E-03 | — |
| `guardRefreshTokenValid` | E-03 | — |
| `guardIsOwner` | E-10, E-11, E-12, E-13, E-16 | — (surfaces as `NOT_FOUND`) |
| `guardIsRenter` | E-18 | — |
| `guardIsRenterOrCarOwner` | E-19 | — |
| `guardOwnerKycIfRequired` | E-09 | `kycStatus` |
| `guardRegistrationAvailable` | E-09, E-10, E-11 | `registrationNumber` |
| `guardRegistrationUniqueAmongModerated` | E-29 | `registrationNumber` |
| `guardEditableModerationState` | E-10 | `moderationStatus`, `allowed[]` |
| `guardListingComplete` | E-11, E-29 | `missing[]` |
| `guardNoLiveRental` | E-13, E-32 | `bookingIds[]` |
| `guardNoFutureConfirmedBooking` | E-13 | `bookingIds[]` |
| `guardNeverModerated` | E-16 | `moderationStatus` |
| `guardNeverPublished` | E-16 | `publishedAt` |
| `guardNoBookingsEver` | E-16 | `bookingCount` |
| `guardModerationApproved` | E-31, E-33 | `moderationStatus` |
| `guardOwnerActive` | E-31, E-33 | — |
| `guardCarPubliclyBookable` | E-17 | — (surfaces as `NOT_FOUND`) |
| `guardCarStillBookable` | E-39 | `moderationStatus`, `listingState` |
| `guardRenterKycVerified` | E-17, E-39, E-41 | `kycStatus` |
| `guardRenterActive` | E-39 | — |
| `guardNotOwnRental` | E-17 | — |
| `guardDateRangeValid` | E-17, E-34 | `startDate`, `endDate`, `rule` |
| `guardNoExistingRequestForRange` | E-17 | `bookingId` |
| `guardDatesNotPast` | E-39 | `startDate` |
| `guardStartDateReached` | E-41 | `startDate`, `today` |
| `guardStartDatePassed` | E-46 | `startDate`, `today` |
| `guardPaymentCovered` | E-41 | `required`, `received`, `shortfall` |
| `guardLocksIntact` | E-41 | `expectedDays`, `foundDays` |
| `guardOdometerNotDecreasing` | E-42 | `odometerOut`, `odometerIn` |
| `guardEffectiveFromValid` | E-43 | `startDate`, `endDate`, `effectiveFrom` |
| `guardStatusIsRequested` | E-18, E-39, E-40 | `status` |
| `guardStatusIsConfirmed` | E-19, E-41, E-46 | `status` |
| `guardStatusIsActive` | E-42, E-43 | `status` |
| `guardStatusCancellable` | E-44 | `status`, `allowed[]` |
| `guardStatusIsCancellationRequested` | E-45 | `status` |
| `guardStatusIsPending` | E-48, E-49, E-54, E-55 | `status` |
| `guardStatusIsVerified` | E-56 | `status` |
| `guardNoOpenKycSubmission` | E-22 | `pendingKycId` |
| `guardDocumentUrlsAllowed` | E-22 | `field` |
| `guardDrivingLicenceIfRequired` | E-54 | `documentType` |
| `guardBookingExists` | E-47 | — (surfaces as `NOT_FOUND`) |
| `guardBookingExpectsPayment` | E-47 | `status`, `allowed[]` |
| `guardNotOverpaying` | E-47 | `totalAmount`, `amountReceived`, `requested` |
| `guardOriginalIsSettledIn` | E-50 | `direction`, `status` |
| `guardRefundNotExceedingOriginal` | E-50 | `originalAmount`, `alreadyRefunded`, `requested` |
| `guardBlockIsAdminOwned` | E-35 | `source` |
| `guardNoConflictingLocks` | E-34 | `conflictingDays[]` |
| `guardNotSelf` | E-59 | — |
| `guardNotLastAdmin` | E-59 | `activeAdminCount` |
| `guardEntityIdRequiresEntityType` | E-61 | — (surfaces as `VALIDATION_FAILED`) |

---

## 13. Coverage matrices

### 13.1 Transition → endpoint

Every edge in the post-amendment state machines has exactly one endpoint. `TR-04`'s static invariant (no status write outside `transition()`) plus this table is what makes the routing table auditable against the spec.

| Entity | Edge | Endpoint | Namespace | Actor class |
|---|---|---|---|---|
| User | — → `isActive: true` | E-01 | `/auth` **(E7)** | `OWNER` |
| User | active → inactive | E-59 | `/admin` | `ADMIN` |
| User | inactive → active | E-60 | `/admin` | `ADMIN` |
| KYC | — → `PENDING` | E-22 | `/user` **(E9)** | `OWNER` |
| KYC | `PENDING` → `VERIFIED` | E-54 | `/admin` | `ADMIN` |
| KYC | `PENDING` → `REJECTED` | E-55 | `/admin` | `ADMIN` |
| KYC | `VERIFIED` → `REVOKED` | E-56 | `/admin` | `ADMIN` |
| KYC | `REJECTED` → new `PENDING` doc | E-22 | `/user` **(E9)** | `OWNER` |
| Car | — → `DRAFT`/`UNLISTED` | E-09 | `/user` **(E8)** | `OWNER` |
| Car | `DRAFT` → `PENDING_APPROVAL` | E-11 | `/user` **(E1)** | `OWNER` |
| Car | `REJECTED` → `PENDING_APPROVAL` | E-11 | `/user` **(E1)** | `OWNER` |
| Car | `PENDING_APPROVAL` → `DRAFT` | E-12 | `/user` **(E2)** | `OWNER` |
| Car | `APPROVED` → `DRAFT` | E-12 | `/user` **(E2)** | `OWNER` |
| Car | `PENDING_APPROVAL` → `APPROVED` | E-29 | `/admin` | `ADMIN` |
| Car | `PENDING_APPROVAL` → `REJECTED` | E-30 | `/admin` | `ADMIN` |
| Car | `UNLISTED` → `LISTED` | E-31 | `/admin` | `ADMIN` |
| Car | `LISTED` → `DELISTED` (owner) | E-13 | `/user` **(E3)** | `OWNER` |
| Car | `LISTED` → `DELISTED` (admin) | E-32 | `/admin` | `ADMIN` |
| Car | `DELISTED` → `LISTED` | E-33 | `/admin` **(C-3)** | `ADMIN` |
| Car | *(hard delete)* | E-16 | `/user` | `OWNER` |
| Booking | — → `REQUESTED` | E-17 | `/user` **(E4)** | `COUNTERPARTY` |
| Booking | `REQUESTED` → `CANCELLED` (renter) | E-18 | `/user` **(E5)** | `COUNTERPARTY` |
| Booking | `REQUESTED` → `CONFIRMED` | E-39 | `/admin` | `ADMIN` |
| Booking | `REQUESTED` → `REJECTED` | E-40 | `/admin` | `ADMIN` |
| Booking | `REQUESTED` → `CANCELLED` (admin) | E-44 | `/admin` | `ADMIN` |
| Booking | `CONFIRMED` → `CANCELLATION_REQUESTED` | E-19 | `/user` **(E6)** | `COUNTERPARTY`/`OWNER` |
| Booking | `CANCELLATION_REQUESTED` → `CANCELLED` | E-45 | `/admin` | `ADMIN` |
| Booking | `CANCELLATION_REQUESTED` → `CONFIRMED` | E-45 | `/admin` | `ADMIN` |
| Booking | `CONFIRMED` → `CANCELLED` | E-44 | `/admin` | `ADMIN` |
| Booking | `CONFIRMED` → `ACTIVE` | E-41 | `/admin` | `ADMIN` |
| Booking | `CONFIRMED` → `NO_SHOW` *(provisional)* | E-46 | `/admin` | `ADMIN` |
| Booking | `ACTIVE` → `COMPLETED` | E-42 | `/admin` | `ADMIN` |
| Booking | `ACTIVE` → `TERMINATED` | E-43 | `/admin` | `ADMIN` |
| Payment | — → `PENDING` | E-47 | `/admin` | `ADMIN` |
| Payment | — → `SETTLED` (`settledNow`) | E-47 | `/admin` | `ADMIN` |
| Payment | `PENDING` → `SETTLED` | E-48 | `/admin` | `ADMIN` |
| Payment | `PENDING` → `VOID` | E-49 | `/admin` | `ADMIN` |
| Payment | — → `PENDING`/`SETTLED` (`OUT` refund) | E-50 | `/admin` | `ADMIN` |
| BookingDayLock | insert (booking) | E-39 | `/admin` | `ADMIN` |
| BookingDayLock | delete (booking) | E-42, E-44, E-45, E-46 | `/admin` | `ADMIN` |
| BookingDayLock | partial delete | E-43 | `/admin` | `ADMIN` |
| BookingDayLock | insert (admin block) *(provisional)* | E-34 | `/admin` | `ADMIN` |
| BookingDayLock | delete (admin block) *(provisional)* | E-35 | `/admin` | `ADMIN` |

Count: **nine** endpoints across `/user` and `/auth` write status (E1–E9, §1.3) — six edges on an existing document (E1–E6) plus three creations of a brand-new one (E7–E9). Every other transition is `/admin`. Zero `/public` endpoints write anything.

### 13.2 Audit actions required

Actions already in spec §1.6:

`USER_DEACTIVATED`, `USER_REACTIVATED`, `KYC_SUBMITTED`, `KYC_VERIFIED`, `KYC_REJECTED`, `CAR_SUBMITTED`, `CAR_APPROVED`, `CAR_REJECTED`, `CAR_PUBLISHED`, `CAR_DELISTED`, `BOOKING_REQUESTED`, `BOOKING_CONFIRMED`, `BOOKING_REJECTED`, `BOOKING_STARTED`, `BOOKING_COMPLETED`, `BOOKING_CANCELLED`, `PAYMENT_RECORDED`, `PAYMENT_RECEIVED_CONFIRMED`, `PAYMENT_REFUNDED`

Actions in spec §1.6 that this contract **no longer needs** (the fields they described were removed by D2):

`CAR_MARKED_RENTED`, `CAR_MARKED_AVAILABLE`

Actions this contract **requires that do not exist yet** — all covered by OQ-31 and to be added by `S-11`:

| Action | Written by | Why it needs its own name |
|---|---|---|
| `USER_REGISTERED` | E-01 | First event in any account's history |
| `USER_PROFILE_UPDATED` | E-26 | Optional — §1.6 is transition-scoped (OQ-37) |
| `CAR_WITHDRAWN` | E-12 | Distinct from reject: the owner pulled it |
| `CAR_RELISTED` | E-33 | INV-1-relevant: a car became public again |
| `CAR_DELETED` | E-16 | Tombstone for the one hard delete |
| `CAR_EDIT_RESET_MODERATION` | E-10 | Only if OQ-32 resolves to option (b) |
| `CAR_DELISTED_FORCED` | E-32 | Delisting over a live rental must be greppable |
| `CAR_AVAILABILITY_BLOCKED` | E-34 | Provisional (C-5) |
| `CAR_AVAILABILITY_UNBLOCKED` | E-35 | Provisional (C-5) |
| `BOOKING_CANCELLATION_REQUESTED` | E-19 | D4's new state needs its event |
| `BOOKING_CANCELLATION_DENIED` | E-45 | The deny branch is not a cancellation |
| `BOOKING_TERMINATED` | E-43 | D4 keeps it distinct from completed |
| `BOOKING_NO_SHOW` | E-46 | Provisional (C-6) |
| `BOOKING_ACTIVATED_UNPAID` | E-41 | **D6 names this one explicitly** |
| `PAYMENT_VOIDED` | E-49 | D7's replacement for the removed `REFUNDED` mutation |
| `KYC_REVOKED` | E-56 | D8's new edge |
| `KYC_DOCUMENT_VIEWED` | E-53 | Optional read-audit (OQ-48) |
| `ADMIN_LOGIN_SUCCEEDED` | E-02 | Optional (OQ-24) |

### 13.3 DTO index

Naming follows `SH-06`/`SH-07`/`SH-08` (`*Dto`, camelCase, in `/shared/src/dto/`). Every one is `z.strictObject` (§1.1 rule 1) and written explicitly, never `.omit()`-derived (D10).

| DTO | File | Endpoint | Predecessor in spec 01 §3 |
|---|---|---|---|
| `registerDto` | `dto/auth.ts` | E-01 | `createUserSchema` |
| `loginDto` | `dto/auth.ts` | E-02 | — |
| `updateProfileDto` | `dto/auth.ts` | E-26 | — |
| `submitKycDto` | `dto/kyc.ts` | E-22 | `submitKycSchema` |
| `verifyKycDto` | `dto/kyc.ts` | E-54 | `reviewKycSchema` (VERIFIED branch) |
| `rejectKycDto` | `dto/kyc.ts` | E-55 | `reviewKycSchema` (REJECTED branch) |
| `revokeKycDto` | `dto/kyc.ts` | E-56 | — (D8) |
| `createCarDto` | `dto/car.ts` | E-09 | `createCarSchema` |
| `updateCarDto` | `dto/car.ts` | E-10 | — |
| `submitCarDto` | `dto/car.ts` | E-11 | — |
| `withdrawCarDto` | `dto/car.ts` | E-12 | — |
| `delistCarDto` | `dto/car.ts` | E-13, E-32 | — |
| `approveCarDto` | `dto/car.ts` | E-29 | — |
| `rejectCarDto` | `dto/car.ts` | E-30 | — |
| `publishCarDto` | `dto/car.ts` | E-31 | — |
| `relistCarDto` | `dto/car.ts` | E-33 | — |
| `createAvailabilityBlockDto` | `dto/car.ts` | E-34 | — *(provisional)* |
| `requestBookingDto` | `dto/booking.ts` | E-17 | `requestBookingSchema` |
| `cancelBookingRequestDto` | `dto/booking.ts` | E-18 | — |
| `requestBookingCancellationDto` | `dto/booking.ts` | E-19 | — (D4) |
| `confirmBookingDto` | `dto/booking.ts` | E-39 | — |
| `rejectBookingDto` | `dto/booking.ts` | E-40 | — |
| `activateBookingDto` | `dto/booking.ts` | E-41 | — (D6) |
| `completeBookingDto` | `dto/booking.ts` | E-42 | — |
| `terminateBookingDto` | `dto/booking.ts` | E-43 | — (D4) |
| `cancelBookingDto` | `dto/booking.ts` | E-44 | — |
| `resolveCancellationDto` | `dto/booking.ts` | E-45 | — (D4) |
| `noShowBookingDto` | `dto/booking.ts` | E-46 | — *(provisional)* |
| `recordPaymentDto` | `dto/payment.ts` | E-47 | `recordPaymentSchema` |
| `settlePaymentDto` | `dto/payment.ts` | E-48 | — (D7) |
| `voidPaymentDto` | `dto/payment.ts` | E-49 | — (D7) |
| `refundPaymentDto` | `dto/payment.ts` | E-50 | — (D7) |
| `deactivateUserDto` | `dto/user.ts` | E-59 | — |
| `reactivateUserDto` | `dto/user.ts` | E-60 | — |
| `publicCarQueryDto` | `dto/query.ts` | E-06 | — |
| `availabilityQueryDto` | `dto/query.ts` | E-08, E-36 | — |
| `myListingsQueryDto` | `dto/query.ts` | E-14 | — |
| `myBookingsQueryDto` | `dto/query.ts` | E-20 | — |
| `adminListingsQueryDto` | `dto/query.ts` | E-27 | — |
| `adminBookingsQueryDto` | `dto/query.ts` | E-37 | — |
| `adminPaymentsQueryDto` | `dto/query.ts` | E-51 | — |
| `adminKycQueryDto` | `dto/query.ts` | E-52 | — |
| `adminUsersQueryDto` | `dto/query.ts` | E-57 | — |
| `auditQueryDto` | `dto/query.ts` | E-61 | — |

`SH-08`'s coverage test (`shared/tests/dto/coverage.test.ts`) currently enumerates *design §9*'s admin endpoints. It must be repointed at **§13.1 of this document**, which is the authoritative endpoint list once C-4 is resolved.

---

## 14. OPEN QUESTIONS

`BLOCKING` means no implementation task touching the affected endpoint may start until it is answered.

| # | § | Question | Assumption in this contract | Blocking |
|---|---|---|---|---|
| **OQ-1** | C-1, C-2 | Does a listing start at `DRAFT` (D2, `CAR-01`) with a user-triggered submit, or is `DRAFT` dropped so creation lands directly in `PENDING_APPROVAL`? | `DRAFT` kept; submit is exception **E1** | **YES** |
| **OQ-2** | C-3 | Design §9 puts owner `relist` under user routes, contradicting its own INV-1. Confirm relist is admin-only. | Admin-only (E-33) | **YES** |
| **OQ-3** | C-4 | Design §9's flat route shapes vs. this contract's namespaces. Needs design amendment 14 and a new task `S-13`. | Namespaced | **YES** |
| **OQ-4** | C-5 | Renter self-cancel of a `REQUESTED` booking under `/user` (exception E5). | Allowed | No |
| **OQ-5** | C-6 | Cancellation request as a status write (E6) vs. a separate child request record. | Status write, admin resolves | No |
| **OQ-6** | C-8 | `Booking`'s pending state is named `REQUESTED`, not `PENDING_*`. Rename? | No rename | No |
| **OQ-7** | §2.1 | URL versioning (`/api/v1`) now or never? | No versioning | No |
| **OQ-8** | §2.2 | Money as a float (spec §1.3) vs. integer minor units. **A cash business reconciling to the rupee should not be adding floats.** | Float, per spec | No — but decide before `PAY` |
| **OQ-9** | §2.5, E-47 | Idempotency key on `POST /api/admin/payments`. A double-submitted cash entry inflates `amountReceived` and can defeat D6's handover guard. | None specified | **YES** for `PAY` |
| **OQ-10** | §3.2 | Six new error codes (`FORBIDDEN`, `ACCOUNT_INACTIVE`, `METHOD_NOT_ALLOWED`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE`) to add to design §10 and `INF-03`. | Added | **YES** for `INF-03` |
| **OQ-11** | §5 | Design §13 defers rate limiting to phase 2; §5 specifies it. Pull into phase 1 or ship §5 as an annex? | Phase 1 | No |
| **OQ-12** | E-02 | Distinguish `ACCOUNT_INACTIVE` from `UNAUTHENTICATED` on login? Distinguishing tells a banned user why; it also confirms the account exists. | Distinguish | No |
| **OQ-13** | §4.1, E-61 | Cursor pagination for `/admin/audit` (unbounded append-only collection). | Offset | No |
| **OQ-14** | §5 | Rate-limit counter storage if the server ever runs multi-instance. | In-process | No |
| **OQ-15** | §6.2 | CSRF double-submit token — not mentioned in design §8. | Required | **YES** for `AUTH-04` |
| **OQ-16** | §6.3 | An admin can approve their own listing. Not closeable in code with one admin. Accept, or require a second admin? | Accepted, documented | No |
| **OQ-17** | §7.1, E-21 | Should a renter see the `Payment` ledger for their own booking, or only `amountReceived`? | `amountReceived` only | No |
| **OQ-18** | §7.2 | Should a public listing show any owner identity (e.g. first name)? | No owner exposure | No |
| **OQ-19** | §7.2 | Owner sees renter's phone from `CONFIRMED` onward; on `REQUESTED`, name only. | As stated | No |
| **OQ-20** | §7.2 | Encrypt `KYC.documentNumber` at rest? Spec §1.2 left this open and deferred it to design; design never picked it up. | Masked in responses; **at-rest encryption unresolved** | **YES** for `KYC` |
| **OQ-21** | E-01 | Does register auto-login (set cookies) or require an explicit login? | Explicit login | No |
| **OQ-22** | E-01 | `409 CONFLICT {field}` on register is an account-enumeration oracle. Accept for UX, or return a generic success and rely on email verification? There is no email transport (design §13), so the generic path is not currently available. | Accept the oracle | No |
| **OQ-23** | E-01 | Add `USER_REGISTERED` to spec §1.6's action enum. | Added | No |
| **OQ-24** | E-02 | Audit successful admin logins? Failed logins cannot be audited as specified — `AuditLog.actor` is required and an unknown email has no actor. | Admin success only, recommended | No |
| **OQ-25** | E-03 | Refresh-token rotation and reuse detection policy. | Rotate on every refresh; reuse detection unspecified | No |
| **OQ-26** | E-04 | Should logout accept an expired-but-well-formed access token so cookies still clear? | Yes | No |
| **OQ-27** | E-06 | Performance of `availableFrom`/`availableTo` as a two-stage lock-exclusion query at scale. | Not addressed | No |
| **OQ-28** | E-08 | Public availability window cap of 180 days. | 180 | No |
| **OQ-29** | E-09 | **Spec OQ#1** — is KYC required to *list* a car, or only to rent one? `S-12` must answer; `guardOwnerKycIfRequired` depends on it. | Not required to list | **YES** |
| **OQ-30** | E-09 | Audit draft creation? | No | No |
| **OQ-31** | §13.2 | Eighteen audit actions this contract needs that spec §1.6 lacks. `S-11` must add them. | Listed in §13.2 | **YES** |
| **OQ-32** | E-10 | Editing an `APPROVED`/`LISTED` car: block the edit (a), or allow it and auto-reset moderation (b)? (b) adds a seventh `/user` status write. | (a) block | **YES** |
| **OQ-33** | E-16 | Keep the narrow hard-delete, or remove `DELETE` entirely? Spec §5 OQ#14 assumes nothing is ever hard-deleted. | Keep, narrowly guarded | No |
| **OQ-34** | E-17 | `competingRequestCount` on a booking request, so `REQUESTED` is not misread as "booked". | Include | No |
| **OQ-35** | E-22 | **No endpoint in this contract produces an image URL.** Design §13 defers upload transport to `docs/design/02`; until it lands, KYC submission and listing creation are not end-to-end. | URLs only, no uploader | **YES** for `KYC`, `CAR`, `CL-05` |
| **OQ-36** | E-25 | Collapse `GET /api/user/profile` into `GET /api/auth/me`? | Keep both | No |
| **OQ-37** | E-26 | Audit profile updates, given §1.6 is transition-scoped? | Recommended, not required | No |
| **OQ-38** | E-26 | Email is immutable and no admin email-change endpoint exists. A user who loses access to their email address has no recovery path — and **there is no password-reset flow anywhere in this contract either**, for the same reason: no email transport. | Immutable; **no recovery path exists** | **YES** — decide before launch |
| **OQ-39** | E-32 | Forced admin delist over a live rental does not end the rental. | Does not cascade | No |
| **OQ-40** | C-5, E-34/35 | Admin availability blocks are unrepresentable today. Recommendation: extend `BookingDayLock` with `source`/`reason`/`blockId` and make `booking` optional, rather than adding a second collection. Needs spec amendment 14 + design D11. | Extend `BookingDayLock` | **YES** for those endpoints |
| **OQ-41** | E-39 | Confirming one booking does not auto-reject competing requests; the admin does it by hand (E-40). | Manual | No |
| **OQ-42** | E-41 | `odometerOut` mandatory at handover. | Mandatory | No |
| **OQ-43** | E-42 | Completion does **not** require full payment — refusing would strand the car and its locks to chase a balance. | No payment guard on complete | No |
| **OQ-44** | E-43, E-44 | Is a refund record mandatory when a paid booking is cancelled or terminated? Spec §5 OQ#9 assumed "mandatory doc, not hard-guarded". | Not enforced | No |
| **OQ-45** | C-6, E-46 | No-show: new terminal `NO_SHOW` state (recommended) vs. `CANCELLED` with a reason prefix. | New state, provisional | **YES** for E-46 |
| **OQ-46** | E-46 | Money already received against a no-show: refund, forfeit, or admin judgement? No cancellation policy exists in the spec to decide from. | Admin judgement | No |
| **OQ-47** | E-47 | Allow overpayment with an explicit flag (deposits, damages), or hard-cap at `totalAmount`? Relates to **spec OQ#8** (security deposits), which `S-12` must answer. | Flag-gated | No |
| **OQ-48** | E-53 | Audit admin views of KYC documents? Would be the only read-audit in the system; an unlogged reviewer with access to every ID is an insider-risk gap. | Recommended | No |
| **OQ-49** | E-54 | **Spec OQ#2** — must a renter hold a verified `DRIVING_LICENSE` specifically? `S-12` names this as must-answer; it decides who may book. | Unresolved | **YES** |
| **OQ-50** | E-56 | KYC revocation does not cascade to existing bookings; `guardRenterKycVerified` on E-41 stops the handover instead. | No cascade | No |
| **OQ-51** | C-7, E-59 | Ban vs. suspend: `isActive` is one boolean. An enforced `suspendedUntil` needs a scheduler or a check-on-read, neither of which exists. | `until` is advisory audit metadata only | No |
| **OQ-52** | E-59 | Should deactivating a user pull their `LISTED` cars? Strong case if the ban is for fraud. | No cascade | No |
| **OQ-53** | E-62 | Should dashboard queue counts include oldest-item age (the figure that shows a queue stalling)? | Counts only | No |
| **OQ-54** | — | `CLAUDE.md` still titles the project "Rental + Resale Platform" while spec §6 and design §15 remove resale permanently. **The project instructions are stale.** | Rental-only | No |
| **OQ-55** | E-47 | `settledNow: true` needs a `— → SETTLED` creation row in the transition registry that spec §2.5 does not define — only `— → PENDING` then `PENDING → RECEIVED`/`SETTLED` exist today. `S-08` must add it or `settledNow` cannot pass `transition()` step 1. | Add the row | **YES** for `PAY` |

---

## 15. Out of scope for this contract

- **Sale, resale, offers, negotiation, ownership transfer.** Permanently out (spec §6, design §13/§15). No endpoint here may be extended toward them.
- **Payment gateway, webhooks, SDK callbacks.** All money is offline and admin-entered. There is no callback endpoint and there must not be one.
- **Image and document byte upload.** Design §13 defers transport to `docs/design/02`. See OQ-35 — this leaves two flows non-functional end-to-end.
- **Notifications.** No email or SMS (design §13). Consequences that follow and are *not* covered here: no password reset, no email verification, no booking-status notification. Users learn of state changes by opening the app. OQ-38.
- **Geo/map search.** `location.geo` is stored and indexed; no geo query endpoint ships in phase 1 (design §13).
- **Multi-currency.** Single implicit currency, no `currency` field.
- **Audit log retention/archival.** Phase 2 (design §13).
- **WebSocket / SSE / real-time.** Polling only.
- **Public API for third parties.** Single first-party client. This is why there is no URL versioning (OQ-7).
