# 03 — Authentication, Roles & Authorization

Status: DRAFT — for review before any code.
Reads: `specs/01-domain-and-state-machines.md` (WHAT), `specs/02-api-contract.md` (endpoints, guards, error contract), `docs/design/01-technical-design.md` (HOW).
Feeds: `tasks/01-implementation-plan.md` — blocks `AUTH`, `ADM`, `INF`, and a new `SA` (super-admin) block this document requires.

**Scope.** Rental only. Who may call what, under what identity, in what account state, and how that is enforced. This document does **not** define new business endpoints beyond the auth/administration surface it is forced to add (§9, §11); everything else it governs already exists in spec 02 §8–§11.

> **Scope change from the previous draft — read §5 first.** There is **no KYC verification flow in this platform.** No document review, no verification states, no admin verifier, no verification-based gating. What remains is a single requirement: **a user must enter their driving licence when they register, and the server validates its *format* only.** §5 is the whole of it, and §13 lists everything this removes from specs 01 and 02.

---

## 0. Preamble — the hard rule, and what this document can actually enforce

### 0.1 The rule as given to this document

> **HARD RULE.** No role except `ADMIN`/`SUPER_ADMIN` may write any status field.

### 0.2 The collision

That is the **absolute** form of the admin-authority rule. Spec 01 withdrew it explicitly, in its own words:

> *"A registration that cannot set `isActive`, or a booking request that cannot reach `REQUESTED`, is not implementable. The absolute rule is therefore withdrawn and replaced."*
> — `specs/01-domain-and-state-machines.md`, §Admin authority

and spec 02 §1.3 then enumerated the `/api/user` and `/api/auth` endpoints that write a status field, closing the list against further additions.

The absolute rule and the two existing specs cannot both hold. Concretely, under a literal reading of the hard rule:

| Broken flow | Why |
|---|---|
| `POST /api/auth/register` | Cannot set `User.isActive = true`. No account can exist. |
| `POST /api/user/listings` | Cannot set `moderationStatus = DRAFT`. No listing can ever exist to moderate. |
| `POST /api/user/listings/:id/submit` | Cannot reach `PENDING_APPROVAL`. Nothing ever enters the moderation queue. |
| `POST /api/user/bookings` | Cannot reach `REQUESTED`. No booking can ever be requested. |

Every one of those is a bootstrap path. Under the literal rule the platform has no users, no listings, and no bookings, and therefore nothing for an admin to moderate.

### 0.3 The form this document adopts

This document enforces the rule in the form spec 01 and spec 02 already agreed, restated here as the authorization invariant this entire document exists to protect:

> **AUTHZ-1 (Visibility).** No status write by a non-admin may make anything visible to a third party. Only `ADMIN`/`SUPER_ADMIN` may move a `Car` into `listingState = LISTED`.
>
> **AUTHZ-2 (Counterparty assets).** No status write by a non-admin may bind, release, or transfer another party's asset, calendar, or money. Only `ADMIN`/`SUPER_ADMIN` may confirm, activate, complete, terminate, or cancel a committed booking, release a day-lock, or record or settle a payment.
>
> **AUTHZ-3 (Closed exception list).** The only non-admin status writes that exist are the **eight** enumerated in §2.4 (E1–E6, E7–E8). A ninth is a contract change requiring an amendment to spec 02 §1.3 and to this document's §2.4. The build fails otherwise (`TR-04`, `TR-06`).
>
> **AUTHZ-4 (No self-elevation).** `role`, `isActive`, and every `*By`/`*At` moderation field are **never** writable by their subject, through any endpoint, in any namespace. This part of the hard rule is absolute and has no exceptions.

AUTHZ-4 is where the hard rule survives intact and unqualified: a user can request things about their own records, and can never grant themselves anything. The eight exceptions are all requests; none of them is a grant.

> **OQ-A1 — `BLOCKING`.** Confirm AUTHZ-1…AUTHZ-4 as the operative form of the hard rule, or reject them. If the absolute literal form is genuinely intended, this document, spec 01 §Admin-authority, spec 02 §1.3, and every task in the `AUTH`/`CAR`/`BOOK` blocks must all be rewritten, and the platform needs an admin-mediated registration and booking-intake flow that does not currently exist anywhere. **No `AUTH` task may start until this is answered.**

### 0.4 What this document adds, and what it removes

**Adds:** `SUPER_ADMIN`, which **no existing spec models**. Spec 01 §1.1 defines `role` as `enum USER | ADMIN`; §1.6 defines `AuditLog.actorRole` the same way. Both must be widened.

**Removes:** the entire KYC verification apparatus — the `KYC` entity, `User.kycStatus`, the verification state machine, five admin review endpoints, three user submission endpoints, and every verification-based guard. §5 explains what replaces it and §13 itemises the removals.

Every delta is collected in §13 and marked with the spec it amends.

---

## 1. Role model

### 1.1 Decision: OWNER is a derived state of USER, not a stored role

**`role` remains a stored enum with three values — `USER | ADMIN | SUPER_ADMIN`.** `GUEST` and `OWNER` are not values of it.

| Name | Kind | Representation |
|---|---|---|
| `GUEST` | **Derived — absence of identity** | No `rgo_at` cookie, or one that fails signature/expiry checks. `req.actor === null`. |
| `USER` | **Stored** | `User.role = 'USER'` |
| `OWNER` | **Derived — a predicate over data** | `USER` (or `ADMIN`) for whom `∃ Car { owner: userId, moderationStatus: 'APPROVED' }` |
| `ADMIN` | **Stored** | `User.role = 'ADMIN'` |
| `SUPER_ADMIN` | **Stored** | `User.role = 'SUPER_ADMIN'` |

### 1.2 Justification for OWNER being derived

Six reasons, in descending order of weight:

1. **A stored `OWNER` role is a denormalised copy of a query, and it can go stale in the unsafe direction.** The brief defines OWNER as *"a USER who has at least one approved listing"*. That is `count(cars where owner = u and moderationStatus = APPROVED) > 0` — a derivable fact. Storing it creates a second source of truth that must be written on listing approval (E-29), on rejection, on hard delete (E-16), on withdraw-to-draft (E-12), and on admin forced delist (E-32). Miss one — E-12's `APPROVED → DRAFT` edge is the easy one to miss — and a user keeps `OWNER` after their only approved listing stops being approved. Design §7 already constrains each denormalised field to exactly one writing service; `role` would need five.

2. **It collides with the existing role enum's meaning.** `role` currently answers *"what authority does this account carry?"*. `OWNER` answers *"what data does this account have?"*. Putting both in one field forces the question: is an admin who owns a car `ADMIN` or `OWNER`? A single-valued enum cannot say both, and spec 02 §6.3 requires exactly that combination — an admin who owns a car and rents one. A separate role value makes the enum non-orthogonal on day one.

3. **Spec 01 already decided this.** §1.1, verbatim: *"No separate 'owner'/'renter' role — any `USER` can list a car and/or rent one."* Adding a stored `OWNER` role reverses a merged decision and invalidates `User.role`'s enum, its index, the `UserSummary` shape (spec 02 §7.2), `AuditLog.actorRole`, and every fixture. This document has no mandate to reverse it and no reason to.

4. **Ownership is never actually checked at role granularity — it is checked per record.** No endpoint in spec 02 asks *"is this caller an owner of something?"*. Every one of them asks *"is this caller the owner of **this** car?"* — `guardIsOwner` (E-10, E-11, E-12, E-13, E-15, E-16), `scopeToActor('owner')` (E-14, E-20). A coarse `OWNER` role would authorize nothing those guards do not already authorize per-record, and a role check that is not sufficient is a role check that will eventually be mistaken for one. That is the IDOR shape spec 02 §10 already warns about.

5. **The threshold is a product question, not an identity one.** *"At least one approved listing"* is one plausible line; *"at least one listing that was ever approved"*, *"at least one currently `LISTED` car"*, and *"at least one completed rental"* are others, and the right answer differs for the dashboard, for a future trust badge, and for support tooling. Derivations can differ per consumer. A stored role cannot.

6. **Revocation is free.** An admin rejecting or force-delisting an owner's only listing should not have to remember to demote a role. The predicate simply stops being true.

### 1.3 Where OWNER *does* appear

`OWNER` is a first-class concept in three places, none of them `User.role`:

| Use | Form | Source of truth |
|---|---|---|
| `actorClass` on a transition | `OWNER` / `COUNTERPARTY` / `ADMIN` (spec 01 §Actor classes) | Computed per transition from the loaded entity: `entity.owner == actor.userId`. Already exists. |
| UI affordance ("My listings" nav, owner dashboard) | `GET /api/auth/me` → `flags.isOwner: boolean` | Derived server-side per request; see §1.4. |
| Read audience ("owner" column of spec 02 §7.1) | Per-record, via `guardIsOwner` | Already exists. |

**`actorClass: OWNER` and "the OWNER role" are different things and this document never conflates them.** `actorClass` is per-entity ("you own *this* car"); the derived role is per-account ("you own *a* car"). The former authorizes; the latter only renders.

### 1.4 `isOwner` derivation contract

Added to `GET /api/auth/me` (E-05) as `flags.isOwner`:

```
isOwner = await Car.exists({ owner: actor.userId, moderationStatus: 'APPROVED' }) != null
```

- Backed by the existing `CarSchema.index({ owner: 1 })` (spec 01 §1.3). Under D2 this becomes `{ owner: 1, moderationStatus: 1 }` — see §13 delta `Δ-6`.
- Computed per request, never cached, **never** placed in a JWT claim. A token claim would reintroduce exactly the staleness problem §1.2 reason 1 rejects, with a 15-minute window.
- Advisory only. No guard, no service function, and no route ever branches on it. `TR-07` (§12) fails the build if `isOwner` is referenced outside serialisation.

> **OQ-A2.** Confirm the threshold is `moderationStatus = APPROVED` (approved *now*), rather than "was ever approved" or "currently `LISTED`". A car withdrawn to `DRAFT` for editing (E-12) drops its owner out of `isOwner` under the chosen definition, which will make the owner nav flicker mid-edit. Assumption: `APPROVED` now, accepted flicker.

### 1.5 `SUPER_ADMIN` — why it is stored, and why it is a distinct value rather than a flag

`SUPER_ADMIN` is stored for the inverse of every reason `OWNER` is derived: it is pure authority with no backing data to derive it from, it changes only by deliberate act, and every change must be auditable.

It is a **third enum value, not a boolean `isSuperAdmin` alongside `role: ADMIN`**, because a boolean creates four representable states (`USER+flag`, `ADMIN+flag`, `USER-flag`, `ADMIN-flag`) of which one — a `USER` with the super flag — is nonsense that the type system would nonetheless permit. An enum has exactly three states and all three are meaningful.

**`SUPER_ADMIN` is a strict superset of `ADMIN`.** Every `/api/admin` route accepts both. This is stated once here and assumed in every matrix cell in §2: a `SUPER_ADMIN` may do everything an `ADMIN` may do, plus §11's provisioning surface. The role check is `role ∈ { ADMIN, SUPER_ADMIN }`, never `role === 'ADMIN'`.

> **Consequence, stated because it is load-bearing:** `guardNotLastAdmin` (spec 02 E-59) must count `role ∈ { ADMIN, SUPER_ADMIN }`, not `role = 'ADMIN'`. As written against spec 01's two-value enum it would happily deactivate the last `ADMIN` while a `SUPER_ADMIN` remains — which is fine — but also the last `SUPER_ADMIN` while an `ADMIN` remains, which locks admin provisioning (§11) out permanently. See §13 `Δ-4` and `guardNotLastSuperAdmin` (§11.5).

### 1.6 Role capability summary

| Capability | GUEST | USER | OWNER *(derived)* | ADMIN | SUPER_ADMIN |
|---|---|---|---|---|---|
| Browse `APPROVED` + `LISTED` cars | ✓ | ✓ | ✓ | ✓ | ✓ |
| Hold an account / session | ✗ | ✓ | ✓ | ✓ | ✓ |
| Enter / update own driving licence (§5) | ✗ | ✓ | ✓ | ✓ | ✓ |
| Create & submit a listing | ✗ | ✓ | ✓ | ✓ | ✓ |
| Manage **own** listings | ✗ | ✓ *(none exist yet)* | ✓ | ✓ *(own)* | ✓ *(own)* |
| Request a booking | ✗ | ✓ | ✓ | ✓ | ✓ |
| View bookings **on own cars**, read-only | ✗ | ✓ *(none exist yet)* | ✓ | ✓ *(own)* | ✓ *(own)* |
| Moderate listings, run the booking lifecycle, record payments | ✗ | ✗ | ✗ | ✓ | ✓ |
| Suspend / reactivate users | ✗ | ✗ | ✗ | ✓ | ✓ |
| Read audit log | ✗ | ✗ | ✗ | ✓ *(scoped, §11.7)* | ✓ *(full)* |
| Create / demote admins | ✗ | ✗ | ✗ | ✗ | ✓ |
| System config | ✗ | ✗ | ✗ | ✗ | ✓ |

The OWNER column differs from USER in exactly two rows, and in both the difference is *"has records to manage"*, not *"is permitted to manage them"*. That is the whole argument of §1.2 in one table.

### 1.7 The "views own bookings read-only" requirement

The brief says OWNER *"views own bookings read-only"*. Against spec 02 this is **almost** true and the exception matters:

| Endpoint | Owner's access | Read-only? |
|---|---|---|
| `GET /api/user/bookings?role=OWNER` (E-20) | ✓ | Yes |
| `GET /api/user/bookings/:id` (E-21) | ✓ via `guardIsBookingParty` | Yes |
| `POST .../cancel` (E-18) | **✗ — `guardIsRenter` only** | n/a |
| `POST .../request-cancellation` (E-19) | **✓ — `guardIsRenterOrCarOwner`** | **No — this is a write** |

E-19 is the one booking write a car owner may perform, and it is deliberate (spec 02 D4: *"renter or owner requests, admin resolves"*). It is AUTHZ-2-safe because it releases nothing: day-locks stay held until an admin resolves it (E-45).

**So the accurate statement is: an owner's access to bookings on their cars is read-only except for requesting cancellation, which does not release the car.** §2 encodes exactly that. See OQ-A3.

> **OQ-A3.** Is the brief's "read-only" intended to *exclude* E-19 for car owners, leaving cancellation requests to renters only? That would mean an owner whose car is damaged or unavailable has no in-product way to raise it. Assumption: E-19 stays open to both parties, as spec 02 D4 defines it.

---

## 2. Permission matrix

### 2.1 Legend

| Value | Meaning |
|---|---|
| **ALLOW** | Permitted for any caller in this role, subject to the endpoint's own guards. |
| **DENY** | Rejected at the route layer, before any record lookup (spec 02 §3.4 rule 1). |
| **OWN_ONLY** | Permitted, but the service layer constrains the query or the loaded record to `actor.userId`. A record belonging to someone else is **`404 NOT_FOUND`**, never `403` (spec 02 §3.4 rule 2). |
| **n/a** | Role cannot reach the precondition — e.g. `GUEST` has no session to log out of. Resolves to DENY with the status code in the notes column. |

There is **no verification-gated cell in this matrix.** The `†` marker used by the previous draft to mean "additionally gated on KYC level" is gone, along with the concept.

**Status code for DENY, by role:**

| Caller | Namespace | Code |
|---|---|---|
| `GUEST` (no/invalid token) | `/api/user`, `/api/admin`, `/api/superadmin` | `401 UNAUTHENTICATED` |
| `USER` | `/api/admin`, `/api/superadmin` | `403 FORBIDDEN` |
| `ADMIN` | `/api/superadmin` | `403 FORBIDDEN` |
| any authenticated | `/api/auth/register`, `/api/auth/login` | see §2.5 |
| deactivated account | anything requiring `requireActive` | `403 ACCOUNT_INACTIVE` |

**The OWNER column.** Because OWNER is derived (§1.2), its cell is identical to USER for every endpoint. It is printed anyway, because the brief asked for it and because the exercise is the proof: *there is no endpoint where OWNER and USER differ.* Where a cell reads `OWN_ONLY`, a plain USER with no cars simply matches zero records; an OWNER matches their own. Same rule, different data.

### 2.2 Auth endpoints (spec 02 §8)

| # | Endpoint | GUEST | USER | OWNER | ADMIN | SUPER_ADMIN | Notes |
|---|---|---|---|---|---|---|---|
| E-01 | `POST /api/auth/register` | **ALLOW** | DENY | DENY | DENY | DENY | Authenticated caller → `409 CONFLICT { reason: "ALREADY_AUTHENTICATED" }`. See §2.5. Forces `role = USER` — a `role` key in the body is a `400` (AUTHZ-4). **Body now requires driving licence fields (§5.3).** |
| E-02 | `POST /api/auth/login` | **ALLOW** | ALLOW | ALLOW | ALLOW | ALLOW | Re-login while authenticated is permitted and **replaces** the session (§9.4). |
| E-03 | `POST /api/auth/refresh` | **ALLOW** *(with `rgo_rt`)* | ALLOW | ALLOW | ALLOW | ALLOW | Refresh cookie is the only credential. `guardAccountActive` re-reads the DB (§4.6). |
| E-04 | `POST /api/auth/logout` | n/a → `204` | ALLOW | ALLOW | ALLOW | ALLOW | Idempotent; always clears cookies. See §9.6. |
| E-05 | `GET /api/auth/me` | DENY `401` | ALLOW | ALLOW | ALLOW | ALLOW | Self only, by construction. Adds `flags.isOwner` (§1.4) and `flags.isSuperAdmin`. |
| **E-63** | `POST /api/auth/password` *(new, §7)* | DENY `401` | **OWN_ONLY** | OWN_ONLY | OWN_ONLY | OWN_ONLY | Change own password; requires current password. Revokes all other sessions (§9.7). |
| **E-64** | `POST /api/auth/sessions/revoke-all` *(new, §9.7)* | DENY `401` | **OWN_ONLY** | OWN_ONLY | OWN_ONLY | OWN_ONLY | Logout-everywhere for the caller's own account only. |
| **E-65** | `GET /api/auth/sessions` *(new, §9.5)* | DENY `401` | **OWN_ONLY** | OWN_ONLY | OWN_ONLY | OWN_ONLY | Lists the caller's own active refresh sessions. |

### 2.3 Public endpoints (spec 02 §9)

| # | Endpoint | GUEST | USER | OWNER | ADMIN | SUPER_ADMIN | Notes |
|---|---|---|---|---|---|---|---|
| E-06 | `GET /api/public/cars` | **ALLOW** | ALLOW | ALLOW | ALLOW | ALLOW | Identical results for all five. The `APPROVED + LISTED` predicate is a service-layer constraint, not a role branch (spec 02 §9). |
| E-07 | `GET /api/public/cars/:carId` | **ALLOW** | ALLOW | ALLOW | ALLOW | ALLOW | An owner viewing their own unlisted car here gets `404`, same as anyone. Owner view is E-15; admin view is E-28. |
| E-08 | `GET /api/public/cars/:carId/availability` | **ALLOW** | ALLOW | ALLOW | ALLOW | ALLOW | Days only, no `bookingId`. |

**No role ever widens `/api/public`.** An admin calling E-06 sees only listed cars. This is not a courtesy — it is what makes the namespace testable as a single invariant (`INV-1`) rather than a per-role matrix.

### 2.4 User endpoints (spec 02 §10)

`requireAuth` + `requireActive` on every row. CSRF on every non-`GET` (§8.4).

| # | Endpoint | GUEST | USER | OWNER | ADMIN | SUPER_ADMIN | Writes status? |
|---|---|---|---|---|---|---|---|
| E-09 | `POST /api/user/listings` | DENY `401` | **ALLOW** | ALLOW | ALLOW *(as self)* | ALLOW *(as self)* | **E7** — creation, `DRAFT`/`UNLISTED` |
| E-10 | `PATCH /api/user/listings/:carId` | DENY `401` | **OWN_ONLY** | OWN_ONLY | OWN_ONLY | OWN_ONLY | No |
| E-11 | `POST /api/user/listings/:carId/submit` | DENY `401` | **OWN_ONLY** | OWN_ONLY | OWN_ONLY | OWN_ONLY | **E1** — `DRAFT\|REJECTED → PENDING_APPROVAL` |
| E-12 | `POST /api/user/listings/:carId/withdraw` | DENY `401` | **OWN_ONLY** | OWN_ONLY | OWN_ONLY | OWN_ONLY | **E2** — `PENDING_APPROVAL\|APPROVED → DRAFT` |
| E-13 | `POST /api/user/listings/:carId/delist` | DENY `401` | **OWN_ONLY** | OWN_ONLY | OWN_ONLY | OWN_ONLY | **E3** — `LISTED → DELISTED` |
| E-14 | `GET /api/user/listings` | DENY `401` | **OWN_ONLY** | OWN_ONLY | OWN_ONLY | OWN_ONLY | No |
| E-15 | `GET /api/user/listings/:carId` | DENY `401` | **OWN_ONLY** | OWN_ONLY | OWN_ONLY | OWN_ONLY | No |
| E-16 | `DELETE /api/user/listings/:carId` | DENY `401` | **OWN_ONLY** | OWN_ONLY | OWN_ONLY | OWN_ONLY | No *(hard delete)* |
| E-17 | `POST /api/user/bookings` | DENY `401` | **ALLOW** | ALLOW | ALLOW | ALLOW | **E4** — creation, `REQUESTED` |
| E-18 | `POST /api/user/bookings/:id/cancel` | DENY `401` | **OWN_ONLY** *(renter only)* | OWN_ONLY | OWN_ONLY | OWN_ONLY | **E5** — `REQUESTED → CANCELLED` |
| E-19 | `POST /api/user/bookings/:id/request-cancellation` | DENY `401` | **OWN_ONLY** *(renter **or** car owner)* | OWN_ONLY | OWN_ONLY | OWN_ONLY | **E6** — `CONFIRMED → CANCELLATION_REQUESTED` |
| E-20 | `GET /api/user/bookings` | DENY `401` | **OWN_ONLY** | OWN_ONLY | OWN_ONLY | OWN_ONLY | No |
| E-21 | `GET /api/user/bookings/:id` | DENY `401` | **OWN_ONLY** *(either party)* | OWN_ONLY | OWN_ONLY | OWN_ONLY | No |
| ~~E-22~~ | ~~`POST /api/user/kyc`~~ | — | — | — | — | — | **REMOVED — §5, `Δ-1`** |
| ~~E-23~~ | ~~`GET /api/user/kyc`~~ | — | — | — | — | — | **REMOVED — §5, `Δ-1`** |
| ~~E-24~~ | ~~`GET /api/user/kyc/:kycId`~~ | — | — | — | — | — | **REMOVED — §5, `Δ-1`** |
| E-25 | `GET /api/user/profile` | DENY `401` | **OWN_ONLY** | OWN_ONLY | OWN_ONLY | OWN_ONLY | No |
| E-26 | `PATCH /api/user/profile` | DENY `401` | **OWN_ONLY** | OWN_ONLY | OWN_ONLY | OWN_ONLY | No — `role`/`isActive`/`email` absent from DTO (AUTHZ-4). **Gains the driving licence fields (§5.5).** |

**The ADMIN and SUPER_ADMIN columns here are `OWN_ONLY`, not `ALLOW`.** Spec 02 §6.3: `/api/user` scopes to `actor.userId` for *every* role. An admin calling E-15 for a car they do not own gets `404`, exactly as a user does. Escalation is never implicit — to act as an administrator, an admin calls `/api/admin`. **`TR-08` (§12) fails the build if any `/api/user` handler branches on `actor.role`.**

**Exactly eight cells in this document's matrix write a status field** — E1–E6 above plus E7 (E-09) and E8 (E-01's account creation, §2.2). Spec 02 §1.3 listed nine; its E9 was `POST /api/user/kyc`, which no longer exists. Every one carries AUTHZ-3's closure. There is no ninth anywhere in §2.

### 2.5 Register/login while already authenticated

Neither spec 01 nor spec 02 says what happens. Decided here:

| Endpoint | Authenticated caller | Rationale |
|---|---|---|
| E-01 register | `409 CONFLICT { reason: "ALREADY_AUTHENTICATED" }` | Creating a second account from inside a session is either a mistake or an attempt to have the browser hold two identities. Neither is worth supporting; the client logs out first. |
| E-02 login | **ALLOW**, replaces the session | Re-authenticating is legitimate (a shared machine, a stale session). The old refresh session is revoked as part of issuing the new one (§9.4) — not left orphaned. |

> **OQ-A4.** Confirm. The alternative for register (silently log out, then register) hides a client bug; the alternative for login (`409`) breaks the "just log in again" recovery path users reach for. Assumption: as tabled.

### 2.6 Admin endpoints (spec 02 §11)

`requireAuth` + `requireActive` + `requireRole([ADMIN, SUPER_ADMIN])`. CSRF on every non-`GET`.

| # | Endpoint | GUEST | USER | OWNER | ADMIN | SUPER_ADMIN |
|---|---|---|---|---|---|---|
| E-27 | `GET /api/admin/listings` | DENY `401` | DENY `403` | DENY `403` | **ALLOW** | ALLOW |
| E-28 | `GET /api/admin/listings/:carId` | DENY `401` | DENY `403` | DENY `403` | **ALLOW** | ALLOW |
| E-29 | `POST /api/admin/listings/:carId/approve` | DENY `401` | DENY `403` | DENY `403` | **ALLOW** | ALLOW |
| E-30 | `POST /api/admin/listings/:carId/reject` | DENY `401` | DENY `403` | DENY `403` | **ALLOW** | ALLOW |
| E-31 | `POST /api/admin/listings/:carId/publish` | DENY `401` | DENY `403` | DENY `403` | **ALLOW** | ALLOW |
| E-32 | `POST /api/admin/listings/:carId/delist` | DENY `401` | DENY `403` | DENY `403` | **ALLOW** | ALLOW |
| E-33 | `POST /api/admin/listings/:carId/relist` | DENY `401` | DENY `403` | DENY `403` | **ALLOW** | ALLOW |
| E-34 | `POST /api/admin/listings/:carId/availability-blocks` *(provisional)* | DENY `401` | DENY `403` | DENY `403` | **ALLOW** | ALLOW |
| E-35 | `DELETE /api/admin/listings/:carId/availability-blocks/:blockId` *(provisional)* | DENY `401` | DENY `403` | DENY `403` | **ALLOW** | ALLOW |
| E-36 | `GET /api/admin/listings/:carId/availability` | DENY `401` | DENY `403` | DENY `403` | **ALLOW** | ALLOW |
| E-37 | `GET /api/admin/bookings` | DENY `401` | DENY `403` | DENY `403` | **ALLOW** | ALLOW |
| E-38 | `GET /api/admin/bookings/:bookingId` | DENY `401` | DENY `403` | DENY `403` | **ALLOW** | ALLOW |
| E-39 | `POST /api/admin/bookings/:id/confirm` | DENY `401` | DENY `403` | DENY `403` | **ALLOW** | ALLOW |
| E-40 | `POST /api/admin/bookings/:id/reject` | DENY `401` | DENY `403` | DENY `403` | **ALLOW** | ALLOW |
| E-41 | `POST /api/admin/bookings/:id/activate` | DENY `401` | DENY `403` | DENY `403` | **ALLOW** | ALLOW |
| E-42 | `POST /api/admin/bookings/:id/complete` | DENY `401` | DENY `403` | DENY `403` | **ALLOW** | ALLOW |
| E-43 | `POST /api/admin/bookings/:id/terminate` | DENY `401` | DENY `403` | DENY `403` | **ALLOW** | ALLOW |
| E-44 | `POST /api/admin/bookings/:id/cancel` | DENY `401` | DENY `403` | DENY `403` | **ALLOW** | ALLOW |
| E-45 | `POST /api/admin/bookings/:id/resolve-cancellation` | DENY `401` | DENY `403` | DENY `403` | **ALLOW** | ALLOW |
| E-46 | `POST /api/admin/bookings/:id/no-show` *(provisional)* | DENY `401` | DENY `403` | DENY `403` | **ALLOW** | ALLOW |
| E-47 | `POST /api/admin/payments` | DENY `401` | DENY `403` | DENY `403` | **ALLOW** | ALLOW |
| E-48 | `POST /api/admin/payments/:id/settle` | DENY `401` | DENY `403` | DENY `403` | **ALLOW** | ALLOW |
| E-49 | `POST /api/admin/payments/:id/void` | DENY `401` | DENY `403` | DENY `403` | **ALLOW** | ALLOW |
| E-50 | `POST /api/admin/payments/:id/refund` | DENY `401` | DENY `403` | DENY `403` | **ALLOW** | ALLOW |
| E-51 | `GET /api/admin/payments` | DENY `401` | DENY `403` | DENY `403` | **ALLOW** | ALLOW |
| ~~E-52~~ | ~~`GET /api/admin/kyc`~~ | — | — | — | — | **REMOVED — `Δ-1`** |
| ~~E-53~~ | ~~`GET /api/admin/kyc/:kycId`~~ | — | — | — | — | **REMOVED — `Δ-1`** |
| ~~E-54~~ | ~~`POST /api/admin/kyc/:kycId/verify`~~ | — | — | — | — | **REMOVED — `Δ-1`** |
| ~~E-55~~ | ~~`POST /api/admin/kyc/:kycId/reject`~~ | — | — | — | — | **REMOVED — `Δ-1`** |
| ~~E-56~~ | ~~`POST /api/admin/kyc/:kycId/revoke`~~ | — | — | — | — | **REMOVED — `Δ-1`** |
| E-57 | `GET /api/admin/users` | DENY `401` | DENY `403` | DENY `403` | **ALLOW** | ALLOW |
| E-58 | `GET /api/admin/users/:userId` | DENY `401` | DENY `403` | DENY `403` | **ALLOW** | ALLOW |
| E-59 | `POST /api/admin/users/:userId/deactivate` | DENY `401` | DENY `403` | DENY `403` | **ALLOW** *(+`guardNotHigherPrivilege`, §11.6)* | ALLOW |
| E-60 | `POST /api/admin/users/:userId/reactivate` | DENY `401` | DENY `403` | DENY `403` | **ALLOW** *(+`guardNotHigherPrivilege`)* | ALLOW |
| E-61 | `GET /api/admin/audit` | DENY `401` | DENY `403` | DENY `403` | **ALLOW** *(scoped, §11.7)* | ALLOW *(full)* |
| E-62 | `GET /api/admin/dashboard/counts` | DENY `401` | DENY `403` | DENY `403` | **ALLOW** | ALLOW |
| **E-66** | `POST /api/admin/users/:userId/password-reset` *(new, §7)* | DENY `401` | DENY `403` | DENY `403` | **ALLOW** *(+`guardNotHigherPrivilege`)* | ALLOW |

**E-59/E-60/E-66 carry a privilege-ordering guard that no existing spec has.** Without it, any `ADMIN` can deactivate the `SUPER_ADMIN` or force-reset their password and take the platform. See §11.6.

**The five removed KYC endpoints take `kycPending` out of E-62's dashboard payload** and the KYC filters out of E-57's query DTO. See `Δ-8`.

### 2.7 Super-admin endpoints (new — §11)

`requireAuth` + `requireActive` + `requireRole([SUPER_ADMIN])`. CSRF on every non-`GET`.

| # | Endpoint | GUEST | USER | OWNER | ADMIN | SUPER_ADMIN |
|---|---|---|---|---|---|---|
| **E-67** | `GET /api/superadmin/admins` | DENY `401` | DENY `403` | DENY `403` | DENY `403` | **ALLOW** |
| **E-68** | `POST /api/superadmin/admins` *(promote a user to `ADMIN`)* | DENY `401` | DENY `403` | DENY `403` | DENY `403` | **ALLOW** |
| **E-69** | `POST /api/superadmin/admins/:userId/demote` | DENY `401` | DENY `403` | DENY `403` | DENY `403` | **ALLOW** |
| **E-70** | `POST /api/superadmin/admins/:userId/promote-super` | DENY `401` | DENY `403` | DENY `403` | DENY `403` | **ALLOW** |
| **E-71** | `GET /api/superadmin/config` | DENY `401` | DENY `403` | DENY `403` | DENY `403` | **ALLOW** |
| **E-72** | `PATCH /api/superadmin/config` | DENY `401` | DENY `403` | DENY `403` | DENY `403` | **ALLOW** |
| **E-73** | `GET /api/superadmin/audit` *(unscoped audit log)* | DENY `401` | DENY `403` | DENY `403` | DENY `403` | **ALLOW** |
| **E-74** | `POST /api/superadmin/users/:userId/sessions/revoke-all` | DENY `401` | DENY `403` | DENY `403` | DENY `403` | **ALLOW** |

### 2.8 Matrix invariants (testable)

Stated so they can be asserted once rather than re-read off every row:

1. `GUEST` is `ALLOW` on exactly five endpoints: E-01, E-02, E-06, E-07, E-08 — plus E-03, which is credentialed by a refresh cookie rather than a session, and E-75 (public reset redemption, §7). Nothing else. **`TR-09`**: every route not in that set carries `requireAuth`.
2. `USER` and `OWNER` columns are **identical on every row**. **`TR-10`**: the matrix fixture asserts column equality. If it ever diverges, OWNER is no longer derivable and §1.1 must be revisited.
3. `SUPER_ADMIN` ⊇ `ADMIN` on every row. **`TR-11`**.
4. Every `/api/admin` and `/api/superadmin` row is DENY for GUEST/USER/OWNER. **`TR-12`**.
5. Every `/api/user` row is `OWN_ONLY` or `ALLOW`+forced-`actor.userId`, for **every** role including admins. **`TR-08`**.
6. Exactly eight cells in §2.2/§2.4 write a status field. **`TR-06`** (extends spec 02's `TR-04`).
7. **No cell in this matrix is gated on any verification, document, or licence state.** **`TR-22`** — no route declaration carries a `kycLevel` or equivalent key, and no guard name matches `/kyc|verif/i`.

---

## 3. The authorization axes

Role is not sufficient to authorize. Three orthogonal axes gate every request, and conflating them is the mistake §1.2 reason 4 warns about:

| Axis | Field | Failure code | Checked by |
|---|---|---|---|
| **Authority** | `User.role` | `403 FORBIDDEN` | `requireRole` |
| **Account state** | `User.isActive` | `403 ACCOUNT_INACTIVE` | `requireActive` |
| **Ownership** | per-record | `404 NOT_FOUND` | `guardIs*` / `scopeToActor` |

They compose; none substitutes for another.

**There is no fourth, verification axis.** The previous draft had one, keyed on `User.kycStatus`. It is removed in its entirety — see §5. The driving licence is a *field on the user*, not a permission level, and nothing in this document reads it to make an authorization decision.

---

## 4. JWT strategy

### 4.1 Storage decision: httpOnly cookies, not `Authorization` headers

**Both tokens are `httpOnly` cookies.** This confirms spec 02 §6.1 and design §8 rather than reopening them, and the justification is recorded here because §4 is where a reader will look for it.

| Criterion | httpOnly cookie *(chosen)* | `Authorization: Bearer` + JS-held token |
|---|---|---|
| XSS token theft | **Unreadable from JS.** An XSS can still *act* as the user while the page is open, but cannot exfiltrate a token for offline reuse. | Token is in `localStorage` or a JS variable; an XSS exfiltrates it and replays it for the token's full lifetime, from anywhere. |
| CSRF | **Vulnerable by default** — mitigated by `sameSite=lax` + mandatory double-submit token (§8.4). | Immune by default. |
| Mobile / third-party clients | Awkward. | Natural. |
| Client code | Zero — the browser attaches them. | Must thread the token through every fetch and every refresh race. |
| Revocation | Same either way (§4.5). | Same. |

**Why the cookie wins here specifically:** there is a single first-party browser client and no mobile app in scope (spec 02 §15), and the platform stores a driving licence number and image per user (§5). The CSRF cost is a known, fully-mitigable, *implementable-once* problem; the XSS-exfiltration cost of a JS-held token is unbounded and cannot be mitigated after the fact. Trading a solved problem for an unsolved one is the right trade.

Cookie attributes, all five mandatory:

```
Path=/api; HttpOnly; Secure (production); SameSite=Lax; <lifetime below>
```

- `Secure` is omitted only when `NODE_ENV !== 'production'` **and** the host is `localhost`. Never by config flag — a flag can be set in production.
- `Domain` is **not** set, so cookies stay host-only and are not shared with sibling subdomains. `sameSite=lax` does not protect against a compromised sibling subdomain; a host-only cookie does.
- `SameSite=Strict` was considered and rejected: it breaks the "click a shared listing link from WhatsApp, land logged-out-looking" flow for top-level GETs. `Lax` + CSRF token is the right pair.

> **OQ-A5.** Confirm no mobile/native client will need bearer tokens in phase 1 or 2. Adding one later means either a second auth path (two code paths to keep correct) or migrating the web client off cookies. Assumption: browser-only, per spec 02 §15.

### 4.2 The three cookies

| Cookie | Lifetime | `httpOnly` | Purpose |
|---|---|---|---|
| `rgo_at` | **15 minutes** | ✓ | Access token. Carries the actor. |
| `rgo_rt` | **30 days** | ✓ | Refresh token. Carries a session id. |
| `rgo_csrf` | session-length (no `Max-Age`) | **✗ — readable by JS by design** | Double-submit CSRF value (§8.4). |

### 4.3 Lifetimes, justified

| Token | Value | Why not shorter | Why not longer |
|---|---|---|---|
| Access `rgo_at` | **15 min** | Under ~5 min the refresh endpoint becomes the hottest route in the system and every tab races on it; `auth.refresh` (60/hour, spec 02 §5) would throttle a normal multi-tab session. | 15 min is the maximum staleness window for the `role` and `isActive` claims. A deactivated user stays "live" in the token for that long — which is precisely why §4.6 forbids any guard from trusting the token. Longer widens a window that already requires a DB re-read to close. |
| Refresh `rgo_rt` | **30 days** | Shorter forces re-login on a platform with **no self-service password reset** (spec 02 OQ-38, §6.5) — a user who forgets their password and gets logged out is locked out until an admin resets them (§7, E-66). That makes session expiry an operational load, not just a UX cost. | Longer means a stolen refresh cookie is usable for months. 30 days with rotation + reuse detection (§4.5) bounds it. |

Both are configurable via `ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_TTL`, **validated at boot** against hard bounds (access ≤ 60 min, refresh ≤ 90 d). An out-of-bounds value fails startup rather than silently weakening auth.

### 4.4 Payload claims

**Access token `rgo_at`:**

```jsonc
{
  "sub":  "6712ab34cd56ef7890123456", // User._id
  "sid":  "01JB4W8XQ2R7N0E3ZK9M5T6V1P", // Session._id — see §4.5
  "role": "USER",                      // snapshot, advisory
  "act":  true,                        // isActive snapshot, advisory
  "typ":  "access",
  "iat":  1789012345,
  "exp":  1789013245,
  "jti":  "01JB4W8XQ2R7N0E3ZK9M5T6V2Q",
  "iss":  "rango",
  "aud":  "rango-web"
}
```

**Refresh token `rgo_rt`:**

```jsonc
{
  "sub": "6712ab34cd56ef7890123456",
  "sid": "01JB4W8XQ2R7N0E3ZK9M5T6V1P",
  "typ": "refresh",
  "iat": 1789012345,
  "exp": 1791604345,
  "jti": "01JB4W8XQ2R7N0E3ZK9M5T6V3R",
  "iss": "rango",
  "aud": "rango-web"
}
```

There is **no `kyc` claim** — the previous draft carried one, and with verification removed there is nothing for it to say. There is likewise **no licence claim**: the licence is data on the user record, never an authorization input (§3, §5.6).

Claim rules, all enforced:

| Rule | Detail |
|---|---|
| `typ` is checked, always | An access token presented to `/api/auth/refresh` is rejected, and vice versa. Without this check the two tokens are interchangeable and the 15-minute access lifetime becomes decorative. Spec 02 §6.1 says *"a valid `rgo_at` is neither required nor sufficient"* for refresh — `typ` is how that is enforced. |
| `iss` + `aud` are checked | Cheap, and it stops a token minted for another environment (staging key reuse) from validating. |
| Algorithm is pinned to `HS256` | The `alg` header is **not** read from the token. `alg: none` and HS/RS confusion are both closed by construction. |
| `sid` is in **both** tokens | It is what makes revocation and logout-everywhere possible (§4.5, §9.7) and what links an access token to a revocable session. An access token without `sid` cannot be revoked at all before expiry. |
| **No claim is ever an authorization source of truth** | §4.6. |
| **No PII in claims** | No `email`, `name`, `phone`, or licence number. A JWT is base64, not encrypted; it sits in browser storage, proxy logs, and error reports. `sub` is enough. |
| `role`/`act` exist **only** to let the client render without a round-trip | They are not read by any guard. **`TR-13`**: no file under `server/src/guards/` or `server/src/services/` may reference `req.tokenClaims`. |

### 4.5 Sessions, rotation, and revocation

JWTs are not revocable on their own. A `Session` collection makes them revocable. **This entity does not exist in spec 01 and must be added — §13 `Δ-9`.**

```ts
const SessionSchema = new Schema({
  user:            { type: Schema.Types.ObjectId, ref: 'User', required: true },
  refreshTokenHash:{ type: String, required: true },   // SHA-256 of the raw token; never the token
  family:          { type: String, required: true },   // rotation lineage id, constant across rotations
  status:          { type: String, enum: ['ACTIVE','ROTATED','REVOKED'], default: 'ACTIVE', required: true },
  revokedReason:   { type: String, enum: ['LOGOUT','LOGOUT_ALL','PASSWORD_CHANGED','ADMIN_REVOKED',
                                          'REUSE_DETECTED','ACCOUNT_DEACTIVATED','SUPERSEDED'] },
  userAgent:       { type: String },   // truncated to 200 chars, for the session list (§9.5)
  ipAddress:       { type: String },
  lastUsedAt:      { type: Date },
  expiresAt:       { type: Date, required: true },
}, { timestamps: true });

SessionSchema.index({ user: 1, status: 1 });
SessionSchema.index({ refreshTokenHash: 1 }, { unique: true });
SessionSchema.index({ family: 1 });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL sweep of expired rows
```

**Rotation (E-03), every refresh, no exceptions:**

1. Read `rgo_rt`; verify signature, `exp`, `typ: refresh`, `iss`, `aud`. Failure → `401`.
2. `SHA-256` the raw token, look up the `Session` by `refreshTokenHash`. Not found → `401`.
3. **If `status != 'ACTIVE'` → reuse detected.** Revoke **every** session in the same `family` with `revokedReason: 'REUSE_DETECTED'`, write `SESSION_REUSE_DETECTED` to the audit log, clear all three cookies, return `401`. This is the whole point of storing `family`.
4. Re-read `User` from the database. `isActive = false` → `403 ACCOUNT_INACTIVE` (§4.6).
5. Mark the current session `ROTATED`, insert a new `ACTIVE` session with the **same `family`**, a new `sid`, and a fresh `refreshTokenHash`.
6. Issue a new `rgo_at`, `rgo_rt`, and a **rotated `rgo_csrf`**.

Step 3 closes the "attacker stole the refresh cookie" case: whoever presents the *old* token second loses the whole family, so a theft becomes a detected logout rather than a silent parallel session. Spec 02 OQ-25 left reuse detection unspecified; **this document specifies it.**

**Revocation triggers** — every one of these revokes sessions server-side, not merely clears a cookie:

| Trigger | Scope | `revokedReason` |
|---|---|---|
| Logout (E-04) | the one session | `LOGOUT` |
| Logout everywhere (E-64) | all sessions of the user | `LOGOUT_ALL` |
| Password change (E-63) | all **except** the calling session | `PASSWORD_CHANGED` |
| Admin password reset (E-66) | all sessions of the target | `PASSWORD_CHANGED` |
| Admin deactivate (E-59) | all sessions of the target | `ACCOUNT_DEACTIVATED` |
| Super-admin force-revoke (E-74) | all sessions of the target | `ADMIN_REVOKED` |
| Role change (E-68/69/70) | all sessions of the target | `ADMIN_REVOKED` |
| Refresh-token reuse | the whole `family` | `REUSE_DETECTED` |
| Re-login (§2.5) | the superseded session | `SUPERSEDED` |

**The access-token gap.** Revoking a session does not invalidate an already-issued `rgo_at`, which stays signature-valid for up to 15 minutes. Two options:

- **(a) Accept the gap.** Every guard that matters re-reads `User` inside the transaction (§4.6), so a deactivated user is stopped by `requireActive` on the very next request regardless of their token. The gap is real only for endpoints with *no* DB read — and there are none that mutate.
- (b) Check `sid` against the `Session` collection on every request. One extra indexed read per request, closes the gap to zero.

**This document adopts (b) for `/api/admin` and `/api/superadmin`, and (a) for `/api/user` and `/api/auth`.** Admin sessions are the ones worth a per-request read: a compromised or just-revoked admin token retaining 15 minutes of moderation authority is a materially different risk from a user token retaining 15 minutes of ability to edit their own draft. The split is one line in `requireRole`.

> **OQ-A6.** Confirm the split, or apply (b) everywhere. (b) everywhere costs one indexed lookup per request and removes a class of reasoning entirely; the argument against is only throughput, which is not a constraint this platform has. Assumption: split as stated.

### 4.6 The token is never the authority

Restating spec 02 §6.1 because it is the single most load-bearing rule in this document:

> **Any authorization decision whose correctness depends on current state — `role`, `isActive` — re-reads the `User` document, inside the transaction where one exists. The token claim is a rendering hint, never a guard input.**

| Check | Source | Why not the token |
|---|---|---|
| `requireRole` | **DB** *(`/api/admin`, `/api/superadmin`)*; token claim tolerated on `/api/user` where role does not gate anything | A demoted admin must lose authority immediately, not in ≤15 min. |
| `requireActive` | **DB, always** | A user banned for fraud must be stopped on their next request. Spec 02 E-03 already requires this on refresh; it applies to every namespace. |
| `guardIsOwner` / `guardIsBookingParty` | **DB** (the loaded record) | Never in a token at all. |
| `flags.isOwner` on E-05 | **DB** | §1.4. |

Cost: one `User` read per authenticated request. Acceptable, and mandatory. **`TR-13`** enforces it statically.

### 4.7 Secrets

| Secret | Rule |
|---|---|
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | **Two different secrets**, ≥ 32 bytes of CSPRNG output each. Different secrets mean a leak of one does not mint the other, and it is a second, independent enforcement of the `typ` separation in §4.4. |
| Boot validation | Missing, shorter than 32 bytes, equal to each other, or equal to any value in the committed `.env.example` → **process exits non-zero at startup.** Never a warning. A platform that boots with a default JWT secret is not misconfigured, it is unauthenticated. |
| Rotation | Support a `JWT_ACCESS_SECRET_PREVIOUS` accepted for verification only (never for signing) for one access-token lifetime, so secrets can be rotated without logging everyone out. See OQ-A7. |

> **OQ-A7.** Is secret rotation needed in phase 1? It costs a small amount of verification complexity. Without it, rotating a leaked secret logs out every user and every admin simultaneously — acceptable in an incident, painful as routine hygiene. Assumption: implement the `_PREVIOUS` fallback; it is ~10 lines.

---

## 5. Driving licence capture

### 5.1 What this section is, and what it replaces

**There is no KYC in this platform.** No verification workflow, no document review, no verification states, no admin verifier role, and no authorization decision anywhere that depends on a document having been checked.

What exists instead is one requirement:

> **Every registered user must enter their driving licence number and an image of it. The server validates the *format* of the number and the *shape* of the image reference. It does not verify that the licence is real, valid, current, or theirs, and no such verification is performed anywhere in the backend.**

This removes, in full: the `KYC` entity (spec 01 §1.2), `User.kycStatus` (spec 01 §1.1), the KYC state machine (spec 01 §2.2), three user endpoints (E-22, E-23, E-24), five admin endpoints (E-52…E-56), eight guards, and five audit actions. `Δ-1` through `Δ-3` and `Δ-8` in §13 list them precisely.

### 5.2 Decision: the document type is `DRIVING_LICENSE`, and it is the only one

Spec 01 §1.2 accepted four document types (`AADHAAR | PAN | DRIVING_LICENSE | PASSPORT`). **That enum is removed.** There is one field, it holds a driving licence, and there is no `documentType` discriminator because there is nothing to discriminate.

Justification, in one line each:

1. **A driving licence is the only document that is actually relevant to this platform.** Spec 01 §1.2 says so itself: *"A driving licence is the one document type that materially matters for a rental platform — it is what makes a renter legally able to drive."* A PAN card identifies someone who cannot lawfully drive the car they just rented.
2. **A multi-type enum with no verification is strictly worse than one type.** Four accepted types and no review means a user picks whichever they have to hand, and the platform ends up holding a mix of documents that answers no question consistently.
3. **One field is one validator.** Four types need four number formats, four image expectations, and four sets of edge cases — all to store something nobody checks.
4. **It collapses spec 02 OQ-49 / the previous draft's OQ-A10.** That blocking question was *"must a renter hold a verified `DRIVING_LICENSE` specifically?"*. With one document type and no verification, the question has no remaining content: every user has entered a driving licence, and none of them is verified.

### 5.3 The fields

Added to `User` (spec 01 §1.1) as an embedded sub-document — `Δ-2`:

```ts
drivingLicence: {
  number:      { type: String, required: true, uppercase: true, trim: true },
  imageUrl:    { type: String, required: true },
  imageBackUrl:{ type: String },                 // optional
  expiryDate:  { type: Date },                   // optional — see OQ-A9
  enteredAt:   { type: Date, required: true },
  updatedAt:   { type: Date },
}
```

| Field | Required | Validation |
|---|---|---|
| `number` | **yes** | 8–20 characters, `[A-Z0-9- ]` only, normalised to uppercase with internal whitespace collapsed. Format-only. See §5.4. |
| `imageUrl` | **yes** | `https` URL on the configured storage host (`guardDocumentUrlsAllowed`, the one guard retained from the removed set). Byte upload is still out of scope — see §5.8. |
| `imageBackUrl` | no | Same validation when present. |
| `expiryDate` | no | If present, must be a valid date. **Not enforced against "today" anywhere** — see OQ-A9. |
| `enteredAt` | server | Set at registration. |
| `updatedAt` | server | Set on any change via E-26. |

There is deliberately **no `status` field, no `verifiedBy`, no `verifiedAt`, no `rejectionReason`.** Adding any of them re-introduces the workflow this section removes, and — under AUTHZ-4 — a status field on `User` that the user themselves populates would be the first violation of the hard rule in the entire document.

### 5.4 Validation is format-only, and this is a deliberate limitation

The `number` validator checks **length and character class, nothing more.** It does not:

- check the number against any government or RTO database (none is integrated, and none is in scope);
- check a state-code or issuing-authority prefix (formats vary by state and change over time; a wrong regex rejects valid licences, which is worse than accepting invalid ones here);
- check that the image is a photograph of the licence whose number was typed, or a photograph of anything at all;
- check that the licence belongs to the registering user;
- check expiry, even when `expiryDate` is supplied.

> **Stated plainly so nobody later mistakes this field for an identity control:** `drivingLicence.number` is **self-asserted, unverified data**. A user can type twenty valid-looking characters and register. The field's purpose is to record what the user claims, so it exists on the record when a human needs it — at handover, in a dispute, or if the operator chooses to eyeball it. It is **not** an identity check, **not** a fraud control, and **not** an authorization input.

> **OQ-A8.** Confirm the validator stays format-only and permissive (8–20 chars, `[A-Z0-9- ]`). The alternative — a per-state regex for Indian driving licence numbers (`^[A-Z]{2}[0-9]{2}[- ]?(19|20)[0-9]{2}[0-9]{7}$` and its variants) — catches typos, and also rejects valid older-format and out-of-state licences with no way for the user to proceed. Assumption: permissive.

> **OQ-A9.** Should `expiryDate` be required, and should an expired licence be rejected at registration? Requiring it costs one field; *enforcing* it is a check-on-read that would have to run somewhere, and "somewhere" is the gating machinery this section just removed. Assumption: **optional field, never enforced.** If it should block anything, that is a new decision and it needs a place to be checked.

### 5.5 Where the licence is entered and changed

| Endpoint | Behaviour |
|---|---|
| `POST /api/auth/register` (E-01) | `registerDto` gains `drivingLicenceNumber` (required), `drivingLicenceImageUrl` (required), `drivingLicenceImageBackUrl` (optional), `drivingLicenceExpiryDate` (optional). **Registration fails with `400 VALIDATION_FAILED` if the number or the front image is missing or malformed.** This is the "ensure the user is inputting the driving licence" requirement, and registration is where it is enforced. |
| `PATCH /api/user/profile` (E-26) | `updateProfileDto` gains the same four fields, all optional, all self-service. A user may correct or replace their licence at any time with no review step, because there is no reviewer. Sets `drivingLicence.updatedAt`. |
| Anywhere else | **Never.** No admin endpoint writes another user's licence; no listing or booking endpoint touches it. |

**Why registration and not first-booking.** Collecting it at registration means every account in the system has the field populated, which makes it a `required: true` schema field rather than an optional one with a guard somewhere deciding when it becomes mandatory. A "collect it later" design needs a gate to decide *when* later is — and a gate is exactly what this section removes.

> **OQ-A10.** Confirm registration is the collection point. The alternative (collect at first booking request) reduces signup friction for someone who only wants to browse or list a car, but it re-introduces a conditional requirement and a guard to enforce it. Assumption: **required at registration, for everyone.**

### 5.6 The licence gates nothing

Restating §3 in the place a reader will look for an exception:

| Action | Gated on the licence? |
|---|---|
| Browse public listings | No |
| Create a listing draft (E-09) | No |
| Submit a listing for moderation (E-11) | **No** |
| Request a booking (E-17) | **No** |
| Admin confirms a booking (E-39) | **No** |
| Admin activates / hands over (E-41) | **No** |
| Anything else | No |

Every user has a licence on file by construction (§5.5), so there is nothing to branch on: a check would pass for every account in the database. `guardRenterKycVerified`, `guardOwnerKycIfRequired`, and `guardDrivingLicenceIfRequired` are **deleted**, not weakened — `TR-22` fails the build if a guard matching `/kyc|verif/i` is ever registered.

**What an admin does instead, at handover (E-41):** they look at the physical licence in the renter's hand and compare it to `drivingLicence` on the record, which `AdminBookingDetail` shows them. That is a human step in the world, not a state field, and this specification does not model it. It is the honest description of what a no-verification platform actually does.

### 5.7 Visibility of the licence

| Reader | Sees |
|---|---|
| Public / `GUEST` | Nothing. Never serialised into any `/api/public` response. |
| The user themselves (E-05, E-25) | `number` **masked to the last 4 characters** (`XXXXXXXX4721`), plus `imageUrl`, `imageBackUrl`, `expiryDate`, `enteredAt`. Masking the value back to its own owner adds nothing they do not know and turns any XSS or log leak into a disclosure. |
| The counterparty on a booking | **Nothing.** `PartyContact` (spec 02 §7.2) is `{ id, name, phone? }` and gains no licence field. An owner does not get the renter's licence number through the API; they see the physical document at handover. |
| `ADMIN` / `SUPER_ADMIN` (E-57, E-58, `AdminBookingDetail`) | `number` in full, plus images. |

Two constraints carried over from the removed KYC section because they still apply to a licence number:

- `drivingLicence.number` is **never** written to any `AuditLog.metadata`, `reason`, or log line, and is in the §6.4 redaction key list.
- **At-rest encryption remains unresolved.** Spec 01 §1.2 raised it for `documentNumber` and deferred to design; design never picked it up; spec 02 OQ-20 marked it `BLOCKING`. Removing the KYC workflow does not remove the data — the platform still stores a licence number and an image of a government document for every user. **OQ-A11** restates it against the new field.

> **OQ-A11 — `BLOCKING` before launch, restating spec 02 OQ-20 against `drivingLicence`.** Encrypt `drivingLicence.number` at rest? The KYC *workflow* is gone; the *PII* is not. A dump of the `users` collection is now a dump of every user's licence number and a URL to its photograph, in one place. Assumption: unresolved — **must be decided before `AUTH` ships**, because it changes the `User` schema and cannot be retrofitted without a migration over every row.

> **Deliberately not carried over:** `KYC_DOCUMENT_VIEWED` read-auditing. The previous draft made it mandatory because admins reviewed a queue of documents. With no review queue, admin access to a licence happens incidentally on E-58 and `AdminBookingDetail`, and auditing every admin user-detail read is a different and much broader proposal. See OQ-A12.

> **OQ-A12.** Should admin reads of `drivingLicence` be audited at all? It would be the only read-audit in the system, and it is now a read of a user-detail page rather than a document-review action. Assumption: **no read-auditing.** The residual risk — an admin can enumerate every licence number via E-57/E-58 with no trace — is real and is accepted here rather than hidden.

### 5.8 Image upload is still not end-to-end

Unchanged from spec 02 OQ-35: **no endpoint anywhere in this contract produces an image URL.** Design §13 defers upload transport to `docs/design/02`. Until that lands, `drivingLicenceImageUrl` is a URL the client cannot obtain, so **registration is not implementable end-to-end.**

This is more severe than it was under the KYC design. Previously the missing uploader blocked a *later, optional* step (submitting KYC); now it blocks **registration itself**, which is the first thing any user does.

> **OQ-A13 — `BLOCKING` for `AUTH`, escalating spec 02 OQ-35.** Image upload transport must be specified in `docs/design/02` before registration can be built, **or** the image requirement must be relaxed at registration (number required, image collected later) — which re-introduces a "collect it later" step and contradicts OQ-A10. These two questions must be answered together. Assumption: none — this genuinely blocks.

---

## 6. Password policy

### 6.1 Hashing: argon2id

**`argon2id`**, via the `argon2` package. Not bcrypt.

| Parameter | Value | Note |
|---|---|---|
| `type` | `argon2id` | Hybrid — resists both side-channel (argon2i's strength) and GPU/ASIC time-memory tradeoffs (argon2d's). |
| `memoryCost` | `19456` KiB (19 MiB) | OWASP PHC minimum for argon2id at `t=2`. |
| `timeCost` | `2` | |
| `parallelism` | `1` | |
| `hashLength` | `32` bytes | |
| Salt | 16 bytes, generated per hash by the library | Never reused, never stored separately — it is in the PHC string. |

The stored `passwordHash` is the full PHC-format string (`$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>`), which carries its own parameters. That is what makes §6.2's rehash-on-login possible.

**Why argon2id over bcrypt:**

1. **Memory-hardness.** bcrypt uses ~4 KiB; argon2id at 19 MiB makes parallel GPU cracking ~4,000× more expensive per guess. Against a leaked `users` collection — which now also carries every user's driving licence number (§5.7) — this is the entire defence.
2. **No 72-byte truncation.** bcrypt silently ignores input past 72 bytes — so a passphrase manager generating 100 random characters gets 72 characters of entropy and the user is told nothing. Any bcrypt implementation needs a documented pre-hash or a length cap to avoid this footgun; argon2 needs neither.
3. **Tunable along two axes.** As hardware improves, bcrypt offers only `cost`; argon2id offers memory *and* time.
4. **It is the current PHC/OWASP recommendation**, and bcrypt is legacy-compatible rather than preferred.

**The cost, stated honestly:** `argon2` is a native module and needs a build toolchain on the deploy host, whereas `bcryptjs` is pure JS. On this project's Windows development environment that is a real friction point. It is worth it, and the mitigation is pinning a version with prebuilt binaries for the target Node ABI.

Spec 01 §1.1 says "bcrypt/argon2 hash" — this document picks argon2id and closes it (`Δ-4`).

### 6.2 Verification

- `argon2.verify()` — constant-time by construction.
- `passwordHash` is `select: false` (spec 01 §1.1) and must be explicitly `.select('+passwordHash')` at exactly one call site: the credential check. **`TR-14`**: `+passwordHash` appears in at most one file.
- **Uniform failure.** Unknown email and wrong password return the identical `401 UNAUTHENTICATED` body (spec 02 §3.4 rule 3). To make the *timing* comparable, an unknown email still runs one `argon2.verify()` against a fixed dummy hash generated at boot. Skipping it returns ~100× faster and turns login into an account-enumeration oracle regardless of what the body says.
- **Rehash on login.** After a successful verify, if the stored PHC parameters are below current policy, re-hash with current parameters and store, inside the same request. This is how parameters are ever actually raised; without it, policy changes apply only to new accounts.

### 6.3 Composition rules

| Rule | Value |
|---|---|
| Minimum length | **12 characters** |
| Maximum length | **128 characters** |
| Character-class requirements | **None** |
| Blocklist | Rejected if present in a bundled top-10k common-password list (normalised, case-insensitive) |
| Contextual rejection | Rejected if it contains, or is contained by, the user's `email` local-part or `name` (case-insensitive, ≥ 4 chars) |
| Normalisation | Unicode NFKC before hashing. Leading/trailing whitespace is **preserved**, never trimmed — trimming silently changes a password and breaks a password manager's stored value. |
| Encoding | UTF-8, any codepoint, emoji included |

**Why no character-class rules:** they measurably push users toward `Password1!` — a predictable pattern that satisfies every class rule and appears in every cracking dictionary — while blocking genuinely strong passphrases. Length plus a blocklist is the current NIST 800-63B position and it is better evidence-backed than the alternative.

**Why 12 and not spec 01's 8:** spec 01 §3 `createUserSchema` says `z.string().min(8)`. Eight characters is inside brute-force range for an offline attack against any hash, and this database holds a government-issued licence number and image for every user. Raising it costs nothing on a platform with no existing users. **This changes spec 01 §3 — `Δ-5`.**

**Max 128** bounds the argon2 work an unauthenticated caller can request. Combined with the 64 KB body cap (spec 02 §2.1), a login flood cannot be turned into a memory-exhaustion DoS.

> **OQ-A14.** Confirm 12. If there is an existing user base with 8-character passwords (there is not, but confirm), the migration is "enforce on change, not on login".

### 6.4 Where passwords appear — and where they must not

| Surface | Rule |
|---|---|
| `POST /api/auth/register` (E-01) | `password` in body. Present in `registerDto` only. |
| `POST /api/auth/login` (E-02) | `password` in body. |
| `POST /api/auth/password` (E-63) | `currentPassword` + `newPassword`. |
| `PATCH /api/user/profile` (E-26) | **Absent from the DTO.** A `password` key is a `400`. |
| Any `/api/admin` endpoint | **No admin endpoint accepts a password for another user.** E-66 issues a single-use reset token; it never sets a password directly. §7. |
| Logs, `AuditLog.metadata`, error bodies, `requestId` traces | **Never.** The request-logging middleware redacts `password`, `currentPassword`, `newPassword`, `token`, `resetToken`, and `drivingLicenceNumber` by key name before anything is written. **`TR-15`**. |

### 6.5 Password reset — and the fact that there is no self-service one

**There is no email or SMS transport anywhere in this platform** (spec 02 §15, design §13). A self-service "forgot password" flow requires a channel to deliver a reset link to an address you have not yet authenticated. The platform has none.

This is spec 02 OQ-38, marked `BLOCKING — decide before launch`. This document confirms the finding and specifies the only flow that is actually implementable today:

**Admin-mediated reset (E-66), specified in §7.** A user who forgets their password contacts the operator out of band. An admin verifies them by a means outside this system, issues a single-use reset token, and reads or sends it to the user by that same out-of-band channel.

Its limitations, stated plainly rather than buried:

1. **The identity check is a human, out of band.** Its strength is whatever the operator's process is, and this spec cannot constrain it. A social-engineering call to the operator is the cheapest attack on any account in the system, including admin accounts. *(Note that the licence on file is of no help here — it is unverified self-asserted data, §5.4, so "tell me your licence number" is a challenge any attacker who has seen the record can answer and any legitimate user may have mistyped.)*
2. **It does not scale.** Every forgotten password is an operator interaction.
3. **It is an admin-held account-takeover primitive.** `guardNotHigherPrivilege` (§11.6) stops an `ADMIN` using it against a `SUPER_ADMIN`; nothing stops an `ADMIN` using it against any regular user, which is why E-66 is audited with the target, the actor, and the reason.

> **OQ-A15 — `BLOCKING` before launch, restating spec 02 OQ-38.** Adding a transactional email provider is a small piece of work that removes items 1–3, unblocks self-service reset, unblocks email verification (which would in turn close spec 02 OQ-22's enumeration oracle), and unblocks booking notifications. **Recommendation: add one before launch.** If the answer is no, E-66 is the permanent recovery path and the operator needs a written identity-verification procedure that lives outside this repo.

---

## 7. Authentication endpoints added by this document

Full entries in spec 02's format. These are **new** and require spec 02 §8 and §13.1/§13.3 to be extended (`Δ-10`).

### E-63 `POST /api/auth/password`

| | |
|---|---|
| **Auth** | Required (`requireAuth` + `requireActive`) |
| **Body** | `changePasswordDto` — `{ currentPassword: string, newPassword: string }`, `z.strictObject` |
| **Success** | `204 No Content`. Cookies for the **calling** session are rotated; every other session is revoked. |
| **Transition** | NONE |
| **Guards** | `guardCurrentPasswordValid` — `argon2.verify` against the stored hash; `guardPasswordPolicy` (§6.3); `guardNewPasswordDiffers` |
| **Errors** | `400 VALIDATION_FAILED` (policy failure → `details.rules[]`); `401 UNAUTHENTICATED` (wrong `currentPassword` — **not** `403`, it is a credential failure); `403 ACCOUNT_INACTIVE`, `403 FORBIDDEN` (CSRF); `429 RATE_LIMITED` (`auth.password`); `500` |
| **Audit** | `USER_PASSWORD_CHANGED` — **new action**. `metadata: { sessionsRevoked: n }`. Never the password. |

Requiring `currentPassword` is what stops a hijacked session from permanently taking the account. Revoking all *other* sessions is what evicts an attacker who already has one; keeping the caller's own session avoids logging the user out of the act they just performed.

### E-64 `POST /api/auth/sessions/revoke-all`

| | |
|---|---|
| **Auth** | Required |
| **Body** | `revokeAllSessionsDto` — `{}` |
| **Success** | `204 No Content`, all three cookies cleared — **including the caller's own** |
| **Guards** | None |
| **Errors** | `401`; `403 ACCOUNT_INACTIVE`, `403 FORBIDDEN` (CSRF); `429` (`user.write`); `500` |
| **Audit** | `USER_SESSIONS_REVOKED` — **new action**. `metadata: { count }` |

"Logout everywhere" includes here. A version that spares the caller is a version that cannot be used from a device you suspect is compromised.

### E-65 `GET /api/auth/sessions`

| | |
|---|---|
| **Auth** | Required |
| **Success** | `200 OK` → `{ data: SessionSummary[] }` where `SessionSummary = { id, current: boolean, userAgent?, ipAddress?, createdAt, lastUsedAt, expiresAt }` |
| **Guards** | `scopeToActor('user')` — mandatory (`TR-05`) |
| **Errors** | `401`; `403 ACCOUNT_INACTIVE`; `429` (`user.read`); `500` |
| **Audit** | None |

Only `status: ACTIVE` sessions. `refreshTokenHash` and `family` are **never** serialised.

> **OQ-A16.** Should a user be able to revoke one *specific* session (a `DELETE /api/auth/sessions/:id`) rather than only all of them? It is ~15 lines given the `Session` collection. Assumption: E-64 only in phase 1; E-65 exists so a user can at least *see* an unexpected session.

### E-66 `POST /api/admin/users/:userId/password-reset`

| | |
|---|---|
| **Auth** | `ADMIN`, `SUPER_ADMIN` |
| **Params** | `userId` |
| **Body** | `adminPasswordResetDto` — `{ reason: string (1..500) }` — **required** |
| **Success** | `200 OK` → `{ data: { resetToken: string, expiresAt } }`. The raw token is returned **once, in this response only**, and is never stored in recoverable form. |
| **Transition** | NONE |
| **Guards** | `guardNotSelf` — an admin uses E-63 for their own password; `guardNotHigherPrivilege` (§11.6) |
| **Errors** | `400 VALIDATION_FAILED` (missing `reason`); `401`; `403 FORBIDDEN`; `403 GUARD_FAILED` (`guardNotHigherPrivilege`); `404`; `429` (`admin.write`); `500` |
| **Audit** | `USER_PASSWORD_RESET_ISSUED` — **new action**. Records actor, target, and `reason`. The token is **not** logged. |

Mechanics:

- Token: 32 bytes CSPRNG, base64url. **Only its SHA-256 is stored**, on a `PasswordReset` document (`Δ-9`) with `expiresAt = now + 30 min`, `usedAt: null`, single-use.
- Issuing a reset **immediately revokes every session of the target**. Otherwise a live attacker session survives the reset that was performed to evict it.
- Issuing a second reset invalidates the first.
- Redemption is `POST /api/auth/password/reset` (**E-75**, below), which is public.

### E-75 `POST /api/auth/password/reset`

| | |
|---|---|
| **Auth** | **None** — the token is the credential |
| **Body** | `redeemPasswordResetDto` — `{ token: string, newPassword: string }` |
| **Success** | `204 No Content`. No session is established — the user then logs in (consistent with E-01, spec 02 OQ-21). |
| **Guards** | `guardResetTokenValid` — SHA-256 lookup, not expired, `usedAt` null; `guardPasswordPolicy`; `guardAccountActive` — a deactivated user cannot reset their way back in |
| **Errors** | `400 VALIDATION_FAILED`; `401 UNAUTHENTICATED` (invalid, expired, or already-used token — **all identical**, no oracle); `403 ACCOUNT_INACTIVE`; `429 RATE_LIMITED` (`auth.password.reset`, **IP-keyed**, 10/hour); `500` |
| **Audit** | `USER_PASSWORD_RESET_REDEEMED` — **new action** |

CSRF-exempt: no cookie is used, the token in the body *is* the credential, so the double-submit property holds trivially.

> Numbering note: E-75 lands after §2.7's super-admin block (E-67…E-74). The authoritative list is §13 `Δ-10`; spec 02 §13.1 must be extended to match rather than renumbered. E-22 through E-24 and E-52 through E-56 are **retired and never reused** — a retired number reused for something else makes every historical reference ambiguous.

---

## 8. Route protection middleware

### 8.1 The pipeline

The requested order — **authenticate → verify role → verify ownership** — is the core of the chain and is preserved exactly. Layers around it exist because some checks must run before an identity exists (transport limits, rate limits) and some can only run after a record is loaded (ownership).

The previous draft had a fourth core step, `requireKycLevel`. **It is removed** — there is no verification level to check (§3, §5.6).

```
  0  requestId          assign X-Request-Id
  1  helmet / CORS      security headers, CLIENT_ORIGIN allowance
  2  contentType        non-JSON body            → 415
  3  bodyLimit          > 64 KB                  → 413
  4  rateLimit          bucket exhausted         → 429
  5  authenticate       verify rgo_at, load User → 401        ← "authenticate"
  6  csrf               double-submit mismatch   → 403           (non-GET only)
  7  requireActive      User.isActive == false   → 403 ACCOUNT_INACTIVE
  8  requireRole        role not permitted       → 403 FORBIDDEN ← "verify role"
  9  validateParams     malformed :id            → 400
 10  loadResource       not found                → 404
 11  requireOwnership   not the caller's record  → 404 (never 403) ← "verify ownership"
 12  validateBody/Query strict Zod DTO           → 400
 13  handler → service → transition()
                        actorClass wrong  → 403 FORBIDDEN_TRANSITION
                        no such edge      → 409 INVALID_TRANSITION
                        guard rejected    → 409 GUARD_FAILED
                        write conflict    → 409 CONFLICT
```

### 8.2 Why this order

| Step | Placed here because |
|---|---|
| 2–4 before 5 | These are transport-level and must not cost a database read. A 64 MB body should be refused before any JWT is parsed; a rate-limited caller before any `User` is loaded. |
| **5 authenticate first** | Everything downstream needs an actor. This is the requested first step and it is correct: without an identity there is no role and no ownership to check. |
| 6 CSRF **after** authenticate | So an unauthenticated request gets a uniform `401`, not a `403` that reveals the CSRF scheme. CSRF is a session-integrity check, and there is no session to protect before step 5. |
| 7 `requireActive` before role | A deactivated admin is not an admin. Checking role first would let a banned admin's request reach a role gate that passes, and the correct answer — `ACCOUNT_INACTIVE` — is more specific and more useful than `FORBIDDEN`. |
| **8 requireRole before any lookup** | Spec 02 §3.4 rule 1, verbatim: *"the role gate runs before the lookup: a `USER` hitting an `/api/admin` path gets 403 whether or not the id exists."* Reversing this turns every admin path into an existence oracle for any authenticated user. |
| 9 before 10 | A malformed ObjectId is a client bug (`400`), not a missing record (`404`), and it must never reach the driver. |
| **11 requireOwnership before body validation** | Spec 02 §3.4 rule 1: *"the read-audience 404 runs before body validation, so a malformed body against someone else's record is still a 404."* A body error on a record you cannot see would confirm the record exists. Ownership is also a free comparison on an already-loaded document. |
| 13 transition() last | It is the only place a status field is ever written (design §6, `TR-04`), and it needs the loaded entity and the actor that steps 5–11 produced. |

### 8.3 Alignment with spec 02 §3.4

Spec 02's precedence chain:

```
415 → 413 → 429 → 401 → 400 (params) → 403 (role) → 404 (record) → 400 (body, query)
    → 403 (transition actorClass) → 409 (edge) → 409 (guards) → 409 (write conflict)
```

§8.1 matches it with **two additions spec 02's chain does not place**:

| Addition | Position | Status |
|---|---|---|
| CSRF `403` | between `401` and the role gate | **Delta.** Spec 02 §6.2 requires CSRF but §3.4 never places it. `Δ-11`. |
| `ACCOUNT_INACTIVE` `403` | between CSRF and the role gate | **Delta.** Spec 02 lists the code but not its precedence. `Δ-11`. |

The previous draft added a third (a KYC `409` between the ownership `404` and body validation). That addition is withdrawn along with the concept.

> **OQ-A17.** Confirm the two placements above, and amend spec 02 §3.4's chain to match. As it stands, spec 02 mandates CSRF without saying when it runs, which means two implementers will place it differently and only one will produce uniform `401`s.

### 8.4 CSRF

Confirms spec 02 §6.2 (which notes design §8 omits CSRF entirely — spec 02 OQ-15, `BLOCKING` for `AUTH-04`):

| Aspect | Rule |
|---|---|
| Scheme | Double-submit. `rgo_csrf` cookie (32 random bytes, base64url, **not** `httpOnly`) + `X-CSRF-Token` header echoing it. |
| Comparison | Constant-time. A non-constant-time compare on a 32-byte value is a small leak, but it is free to avoid. |
| Applies to | Every `POST`/`PATCH`/`PUT`/`DELETE` under `/api/user`, `/api/admin`, `/api/superadmin`. |
| Exempt | All of `/api/public`; every `GET`; `POST /api/auth/login`, `/register`, `/refresh`, `/password/reset` — none of these is authenticated by a session cookie at the moment it runs, so there is no ambient authority to forge. `POST /api/auth/logout` **is** exempt (see §9.6). |
| Rotation | Set at login (E-02), rotated at every refresh (E-03), cleared at logout. |
| Failure | `403 FORBIDDEN`, no `details` — naming the CSRF scheme in an error body helps only an attacker. |

`rgo_csrf` is deliberately JS-readable; that is the mechanism, not a flaw. It carries no authority on its own — possession of it without `rgo_at` authenticates nothing.

### 8.5 Middleware contract

```ts
interface ActorContext {
  userId:   string;
  role:     'USER' | 'ADMIN' | 'SUPER_ADMIN';   // re-read from DB, §4.6
  isActive: boolean;                             // re-read from DB
  sessionId:string;                              // sid claim
  ip:       string;
  requestId:string;
}
// req.actor: ActorContext | null   (null === GUEST)
```

`ActorContext` carries **no verification or licence field**. The previous draft had `kycStatus` here; nothing reads it now, and leaving it would invite a guard to grow back.

Rules:

- `req.actor` is set **only** by `authenticate`. **`TR-16`**: no other file assigns to it.
- Its fields come from the **database row**, not the token claims. The raw claims are available at `req.tokenClaims` for debugging and are unreachable from `guards/` and `services/` (`TR-13`).
- Every handler receives `actor` explicitly as a service-function argument. No service reads `req`. This is what makes guards unit-testable per design §6.

### 8.6 Registration table

Route protection is declared per route, in one table, not scattered through handlers:

```ts
route('POST', '/api/user/listings/:carId/submit', {
  auth: 'required',
  roles: ['USER', 'ADMIN', 'SUPER_ADMIN'],
  csrf: true,
  rateLimit: 'user.write',
  params: carIdParamsDto,
  load: { car: 'carId' },
  ownership: guardIsOwner('car'),
  body: submitCarDto,
  handler: listingService.submitForModeration,
});
```

There is no `kycLevel` key. **`TR-22`** fails the build if one appears.

This table is what makes §2's matrix and §12's tests mechanical rather than aspirational: the matrix is generated from it and diffed against a committed fixture. A route added without an `ownership` or `scopeToActor` declaration fails `TR-05` at build time — it cannot be forgotten, only deliberately declared absent.

---

## 9. Session and security rules

### 9.1 Brute-force lockout

Two layers. Spec 02 §5's rate limits are the first; this section adds the second.

**Layer 1 — rate limits (spec 02 §5, unchanged):** `auth.login.ip` 20/15 min; `auth.login.identity` 5/15 min. Failed requests consume budget. A successful login resets the identity bucket, not the IP bucket.

**Layer 2 — progressive account lockout (new):** counters on the `User` document.

| Field | Type | Purpose |
|---|---|---|
| `failedLoginCount` | number, default `0` | Consecutive failures since the last success |
| `lockedUntil` | Date, optional | Login refused until this instant |
| `lastFailedLoginAt` | Date, optional | For the reset window |

`Δ-12` — three new `User` fields.

| Consecutive failures | Lockout |
|---|---|
| 1–4 | none |
| 5 | 1 minute |
| 6 | 5 minutes |
| 7 | 15 minutes |
| 8 | 1 hour |
| 9+ | 1 hour, and **audit `ACCOUNT_LOCKOUT_ESCALATED`** so an operator can see a sustained attack |

- Reset to `0` on any successful login, and on a successful password reset redemption (E-75).
- Counters also reset if `lastFailedLoginAt` is more than 24 h old — a user who mistypes twice a month is not on a path to a lockout.
- **Never a permanent lock.** Permanent lockout on failure count is a denial-of-service primitive: anyone who knows an email address can lock that account out forever, including every admin account.
- A locked account returns `401 UNAUTHENTICATED` with the standard message — **not** a distinct "locked" code. Distinguishing it confirms the account exists and tells an attacker their spray is working. The lockout's job is to slow guessing, not to inform the guesser.

> **OQ-A18.** This conflicts in spirit with spec 02 OQ-12, which chose to distinguish `ACCOUNT_INACTIVE` from `UNAUTHENTICATED` on login (telling a banned user why). The distinction: a ban is an operator decision the user needs to understand and appeal; a lockout is transient and self-healing, and naming it only helps an attacker. Assumption: `ACCOUNT_INACTIVE` stays distinguished (spec 02's choice), lockout stays silent. Confirm the asymmetry is intended.

### 9.2 Timing uniformity on login

Every login attempt performs exactly one `argon2.verify()` — against the real hash, or against a boot-generated dummy hash when the email is unknown (§6.2). Without it, "unknown email" returns in ~1 ms and "wrong password" in ~100 ms, and the uniform error body is decorative.

The lockout check runs **before** the verify, so a locked account short-circuits — which is itself a timing signal. Accepted: the lockout is already publicly inferable from the fact that login stops working, and the alternative (burning 100 ms of argon2 per request on a locked account) hands an attacker a memory-exhaustion amplifier.

### 9.3 Concurrent sessions

**Multiple concurrent sessions per user are ALLOWED and unlimited in count.**

Justification:

1. Phone + laptop is the normal case for a rental platform — browse on a phone, manage listings on a desktop.
2. A single-session policy makes every new login an involuntary logout elsewhere, which users read as a bug.
3. The security benefit of a session cap is small and is better obtained by making sessions *visible and revocable* (E-65, E-64) than by capping them.

Bounded instead by:

| Bound | Value |
|---|---|
| Refresh lifetime | 30 days, enforced by `Session.expiresAt` and a TTL index |
| Idle expiry | A session unused for **14 days** is treated as expired even if `expiresAt` has not passed — checked on refresh against `lastUsedAt` |
| Visibility | E-65 lists them |
| Revocability | E-64 (self), E-74 (super-admin), and every trigger in §4.5 |
| Reuse detection | §4.5 step 3 — the real protection |

**Admin sessions are the exception**: a `SUPER_ADMIN` may cap concurrent sessions for `ADMIN`/`SUPER_ADMIN` accounts via system config (§11.8, `security.adminMaxConcurrentSessions`, default `0` = unlimited). When the cap is exceeded, the **oldest** session is revoked with reason `SUPERSEDED` — never the newest, which would lock out the person actively working.

> **OQ-A19.** Should the admin cap default to something finite (e.g. 3)? Argument for: an admin account is the highest-value target and an unnoticed extra session is the symptom of compromise. Argument against: an operator working from a phone, a laptop, and an office machine hits 3 legitimately. Assumption: unlimited by default, configurable.

### 9.4 Re-login

Logging in while already holding a valid session is allowed (§2.5) and **supersedes** the previous session: the old `Session` is marked `REVOKED` with `revokedReason: 'SUPERSEDED'` in the same transaction that creates the new one. Leaving it `ACTIVE` would accumulate orphaned sessions that appear in E-65 and cannot be attributed to a device.

### 9.5 Session visibility

E-65 (§7). `userAgent` is stored truncated to 200 characters and HTML-escaped on render — it is attacker-controlled text displayed in the user's own account UI, which is a stored-XSS surface if treated as trusted.

### 9.6 Logout

- E-04 revokes the session server-side (`Session.status = REVOKED`), then clears all three cookies.
- **Idempotent and always `204`.** Confirming spec 02 OQ-26: an expired-but-well-formed `rgo_at` still clears cookies rather than returning `401`. A logout that fails because you were already logged out leaves stale cookies in the browser, which is the opposite of what the user asked for.
- **CSRF-exempt.** Forced logout is a nuisance, not a privilege escalation, and requiring a CSRF token means a user with a desynchronised token cannot log out — which is strictly worse for security than the attack it prevents.
- Clearing a cookie means re-issuing it with `Max-Age=0` **and the identical `Path`, `Domain`, `Secure`, `SameSite` attributes**. A mismatched attribute set silently fails to clear it.

### 9.7 Logout everywhere

E-64 (§7). Revokes **all** sessions including the caller's. Backed by `Session`, so it is a real server-side revocation, not a cookie clear — this is the thing a stateless-JWT design cannot do, and the reason §4.5 exists.

`POST /api/auth/password` (E-63) performs the same revocation implicitly for all *other* sessions.

### 9.8 Security headers and transport

| Header | Value |
|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (production) |
| `Content-Security-Policy` | `default-src 'self'; img-src 'self' <storage host>; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` (belt and braces with `frame-ancestors`) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Cache-Control` | `no-store` on every authenticated response — prevents a shared-machine back-button replay of a profile page showing a licence, or a booking detail |
| `Permissions-Policy` | `geolocation=(), camera=(), microphone=()` |

CSP matters disproportionately here: `httpOnly` cookies (§4.1) trade XSS-exfiltration risk for XSS-*action* risk, and CSP is the control that reduces the residual.

### 9.9 What is deliberately not in scope

| Not doing | Why |
|---|---|
| MFA / TOTP | No second factor transport; would need an authenticator-app flow. **Strongly recommended for `ADMIN`/`SUPER_ADMIN` before launch** — see OQ-A20. |
| CAPTCHA | Third-party dependency; rate limits + lockout cover the current threat model. |
| Device fingerprinting | Privacy cost, low value at this scale. |
| IP allowlisting for admin | Worth considering; operationally brittle for a small team. OQ-A21. |
| Anomaly detection | Phase 2 at the earliest. |
| **Identity verification of any kind** | §5. Explicitly out, by decision, not by omission. |

> **OQ-A20.** TOTP MFA for `ADMIN`/`SUPER_ADMIN`. These accounts can approve listings, move money records, read every user's licence number, and (for `SUPER_ADMIN`) mint more admins. The only thing protecting them today is a password, and the only recovery path is an out-of-band conversation with an operator (§6.5). TOTP needs no transport — an authenticator app and a shared secret — so the objection that blocks email-based flows does not apply here. **Recommendation: implement for admin roles before launch.**

> **OQ-A21.** Restrict `/api/superadmin` to an IP allowlist? It is a handful of endpoints used rarely. Assumption: no, documented as a residual risk.

---

## 10. Suspended and banned users

### 10.1 One boolean, two meanings

Spec 01 §1.1 models this as `isActive: boolean` only, and spec 02 C-7/OQ-51 already records that "ban" and "suspend" are the same field, that an enforced `suspendedUntil` needs a scheduler or a check-on-read (neither exists), and that design §15 removed the `SYSTEM` actor class an auto-lift would need.

This document **confirms spec 02's resolution**: `until` on E-59 is advisory audit metadata; an admin lifts a suspension manually via E-60. No new field, no scheduler.

Terminology for the rest of this section: **suspended** and **banned** are the same state (`isActive: false`); only the audited `reason` distinguishes them.

### 10.2 What a suspended user can still access

| Surface | Access | Mechanism |
|---|---|---|
| `GET /api/public/*` (E-06, E-07, E-08) | **✓ FULL** | No auth required; a suspended user browsing logged-out is indistinguishable from a guest, and blocking them is impossible without IP banning, which is out of scope. |
| `POST /api/auth/login` (E-02) | **✗** `403 ACCOUNT_INACTIVE` | `guardAccountActive`. Deliberately distinguished from `401` so the user learns they are suspended rather than believing they mistyped (spec 02 OQ-12). |
| `POST /api/auth/refresh` (E-03) | **✗** `403 ACCOUNT_INACTIVE` | DB re-read (spec 02 E-03) — cannot refresh past a ban. |
| Existing access token, until it expires | **✗ within ≤15 min**, and **immediately** for `/api/admin` | `requireActive` re-reads `User.isActive` on every request (§4.6, step 7). In practice: immediately. |
| `POST /api/auth/logout` (E-04) | **✓** | Always. Clearing your own cookies is never denied. |
| `POST /api/auth/password/reset` (E-75) | **✗** `403 ACCOUNT_INACTIVE` | `guardAccountActive`. A ban must not be escapable by resetting a password. |
| Everything under `/api/user/*` | **✗** `403 ACCOUNT_INACTIVE` | `requireActive` on every route (spec 02 §10). |
| Everything under `/api/admin/*`, `/api/superadmin/*` | **✗** | Same, and a suspended admin is not an admin (§8.2, step 7 before step 8). |
| Their **existing sessions** | **Revoked immediately** | E-59 revokes every `Session` of the target in the same transaction (§4.5). |

**In one line: a suspended user can browse public listings and log out. Nothing else.**

### 10.3 What survives a suspension — the cascade question

E-59 does **not** cascade (spec 02 OQ-52). Stated explicitly, because the consequences are not obvious and at least one is bad:

| Their data | After suspension | Consequence |
|---|---|---|
| `LISTED` cars | **stay listed and publicly bookable** | **A suspended user's car remains rentable, and they cannot log in to manage it or hand it over.** |
| `CONFIRMED` bookings (as renter) | stay confirmed, locks held | See the defect below. |
| `ACTIVE` rentals (as renter) | stay active | They have the car. Suspension does not retrieve it. |
| `REQUESTED` bookings | stay requested | An admin can still confirm them. |
| `drivingLicence` | unchanged | It is inert data and gates nothing (§5.6), so nothing follows from it either way. |
| `Session` rows | all revoked | §4.5. |

**Two defects, raised here because this document is where they become visible:**

> **DEFECT-1 — a suspended owner's car stays on the market.** A user banned for fraud keeps a live listing that strangers can request and that an admin could confirm. The owner cannot log in to arrange the handover, so any booking confirmed against it is guaranteed to fail. This is spec 02 OQ-52 restated with its operational consequence. **Recommendation: E-59 force-delists every `LISTED` car of the target (`CAR_DELISTED_FORCED`, admin action, audited, using the existing forced-delist path from E-32), and E-60 does *not* automatically relist them — relisting is a fresh admin decision (E-33).** See OQ-A22.

> **DEFECT-2 — no guard checks `renter.isActive` at handover.** Spec 02 E-39 (confirm) has `guardRenterActive`; **E-41 (activate) does not.** Under the previous draft E-41 at least had `guardRenterKycVerified`, which incidentally caught revoked users; with verification removed, **E-41 now has no check on the renter at all.** So a renter suspended after confirmation can be handed a car by an admin following the happy path. **Recommendation: add `guardRenterActive` to E-41.** This was a recommendation before; removing KYC makes it the *only* remaining protection. See OQ-A23.

> **OQ-A22 — supersedes spec 02 OQ-52.** Should E-59 force-delist the target's `LISTED` cars? Assumption in this document: **yes**, per DEFECT-1. Spec 02's current assumption is "no cascade". They disagree; this must be settled before `ADM`.

> **OQ-A23 — `BLOCKING` for `BOOK`.** Add `guardRenterActive` to E-41. Previously a recommendation; now the only renter-side check on the handover path. One line.

### 10.4 Suspending an admin

`guardNotSelf` and `guardNotLastAdmin` already exist on E-59 (spec 02). This document adds:

- `guardNotLastAdmin` counts `role ∈ { ADMIN, SUPER_ADMIN }` (§1.5, `Δ-4`).
- `guardNotLastSuperAdmin` — the last active `SUPER_ADMIN` cannot be deactivated (§11.5).
- `guardNotHigherPrivilege` — an `ADMIN` cannot deactivate a `SUPER_ADMIN` (§11.6).

### 10.5 Reactivation

E-60 restores `isActive: true`. It does **not** restore sessions (they were revoked and are not recoverable) and — under OQ-A22's recommendation — does not relist cars. The user logs in fresh.

---

## 11. Admin account provisioning

### 11.1 The bootstrap problem

Admin endpoints require an admin. Registration (E-01) forces `role = USER` and a `role` key in the body is a `400` (AUTHZ-4). So no admin can ever exist through the API. Something outside the API must create the first one.

**No existing spec addresses this.** Spec 01 §2.1 has no role-change transition at all; spec 02 has no promote/demote endpoint. This entire section is new (`Δ-13`).

### 11.2 Decision: a first-run CLI seed, gated on an empty admin set

| Option | Verdict |
|---|---|
| Env vars `SUPER_ADMIN_EMAIL`/`_PASSWORD` read at every boot | **Rejected.** A plaintext admin password in the process environment, in the deploy config, in shell history, and in any crash dump — and re-asserted on every restart, so rotating it in the app is undone by the next deploy. |
| Hard-coded seed in a migration | **Rejected.** A known credential committed to the repository. |
| Manual `mongosh` insert | **Rejected.** Requires hand-computing an argon2 hash; one mistake and the platform ships with an unverifiable or absent admin. |
| Web-based first-run setup page | **Rejected.** A race: whoever reaches the deployed URL first becomes `SUPER_ADMIN`. |
| **First-run CLI seed command** | **Adopted.** |

```
npm run seed:superadmin -- --email <email> --name <name> --phone <phone> --licence <number>
```

Behaviour:

1. **Refuses to run if any `User` with `role = SUPER_ADMIN` exists.** Exits non-zero with a message pointing at E-70. This is what makes it a *bootstrap* rather than a permanent backdoor.
2. Prompts for a password on an interactive TTY, twice, with echo off. **Never accepts a password as an argument** — argv is visible in `ps` and lands in shell history.
3. Enforces the full §6.3 policy. No exemption for the seed account; it is the most valuable password in the system.
4. Creates the user with `role: SUPER_ADMIN`, `isActive: true`, and a populated `drivingLicence` — `number` from `--licence`, `imageUrl` from a placeholder the operator replaces via E-26. **`drivingLicence.number` and `imageUrl` are `required` on `User` (§5.3), so the seed cannot skip them** without making the schema lie.
5. Writes `SUPER_ADMIN_SEEDED` to the audit log with `actor` = the new user (self-referential, the only such row in the system — a bootstrap has no prior actor) and `actorRole: SUPER_ADMIN`.
6. Runs only against a reachable database with a `Session` collection present, so it cannot half-succeed against an unmigrated schema.

> **OQ-A24.** Item 4 is awkward: the seed admin needs a licence image URL before any uploader exists (§5.8, OQ-A13), so it uses a placeholder. Alternatives: make `imageUrl` optional on `User` (weakens §5.3 for everyone), or exempt seeded admins (a schema exception that will outlive its reason). Assumption: placeholder, replaced via E-26. **This is another consequence of OQ-A13 and resolves with it.**

> **OQ-A25.** Should the seed command support a non-interactive mode for CI/automated deploys (reading a password from a file descriptor or a secret manager)? It weakens item 2. Assumption: interactive only; automated environments run it once by hand.

### 11.3 E-68 `POST /api/superadmin/admins` — promote a user to ADMIN

| | |
|---|---|
| **Auth** | `SUPER_ADMIN` only |
| **Body** | `promoteAdminDto` — `{ userId: ObjectId, reason: string (1..500) }` |
| **Success** | `200 OK` → `{ data: UserSummary }` with `role: ADMIN` |
| **Transition** | `User.role: USER → ADMIN` — **a new transition spec 01 §2.1 does not have** (`Δ-14`) |
| **Guards** | `guardTargetIsUser`; `guardTargetActive` — cannot promote a suspended account; `guardNotSelf` |
| **Errors** | `400`; `401`; `403 FORBIDDEN`; `404`; `409 INVALID_TRANSITION` (already `ADMIN`/`SUPER_ADMIN`); `409 GUARD_FAILED`; `429`; `500` |
| **Audit** | `USER_PROMOTED_TO_ADMIN` — **new action**. Actor, target, `reason`. |

**Promotion revokes every session of the target** (§4.5, `ADMIN_REVOKED`). Their next login issues a token carrying the new role. Leaving old sessions alive would leave `role: USER` access tokens in circulation for a now-admin — harmless in itself, but it means the audit trail and the live token disagree.

**Promotion is by `userId`, never by email.** An email-addressed promotion is one typo away from granting moderation authority over every listing and every licence number in the system to the wrong person. The super-admin looks the user up via E-57 first and promotes the id they saw.

**There is no verification prerequisite for promotion**, and under §5 there could not be — an admin is an operator, not a renter, and the platform verifies nobody. `guardTargetActive` is the only state check.

### 11.4 E-69 `POST /api/superadmin/admins/:userId/demote`

| | |
|---|---|
| **Auth** | `SUPER_ADMIN` only |
| **Body** | `demoteAdminDto` — `{ reason: string (1..500) }` |
| **Success** | `200 OK` → `{ data: UserSummary }` with `role: USER` |
| **Transition** | `User.role: ADMIN → USER`, and `SUPER_ADMIN → USER` |
| **Guards** | `guardNotSelf`; `guardNotLastSuperAdmin`; `guardNotLastAdmin` |
| **Errors** | `400`; `401`; `403`; `404`; `409 INVALID_TRANSITION` (already `USER`); `409 GUARD_FAILED`; `429`; `500` |
| **Audit** | `USER_DEMOTED_FROM_ADMIN` — **new action** |

Also revokes every session of the target — and here it is **not** optional. A demoted admin holding a valid access token with `role: ADMIN` must lose authority at once; §4.6's DB re-read handles `/api/admin`, and session revocation closes the rest.

Their historical `AuditLog` rows keep `actorRole: ADMIN` — spec 01 §1.6 designed `actorRole` as a denormalised snapshot *"so history reads correctly even if role changes later"*. This is exactly that case.

### 11.5 E-70 `POST /api/superadmin/admins/:userId/promote-super`

| | |
|---|---|
| **Auth** | `SUPER_ADMIN` only |
| **Body** | `promoteSuperAdminDto` — `{ reason: string (1..500), confirmEmail: string }` |
| **Success** | `200 OK` → `{ data: UserSummary }` with `role: SUPER_ADMIN` |
| **Transition** | `User.role: ADMIN → SUPER_ADMIN` |
| **Guards** | `guardTargetIsAdmin` — must already be `ADMIN`; promotion is two deliberate steps, never one; `guardTargetActive`; `guardConfirmEmailMatches` |
| **Errors** | `400 VALIDATION_FAILED`; `401`; `403`; `404`; `409 INVALID_TRANSITION`; `409 GUARD_FAILED`; `429`; `500` |
| **Audit** | `USER_PROMOTED_TO_SUPER_ADMIN` — **new action** |

`confirmEmail` is a deliberate typing-the-name-to-confirm step. This is the single most consequential write in the platform — the new `SUPER_ADMIN` can demote the one who promoted them — and an id-only call is one paste error away from irreversible.

**`guardNotLastSuperAdmin`**, used by E-59 and E-69:

```
count(User { role: 'SUPER_ADMIN', isActive: true, _id: { $ne: targetId } }) >= 1
```

Failing this means demoting or deactivating the last super-admin, which permanently removes the ability to provision admins — recoverable only by re-running the seed against the database, which itself refuses while a `SUPER_ADMIN` row exists. That is a genuine one-way door, and it must be closed by a guard, not by a warning.

> **OQ-A26.** Should there be a floor of **two** `SUPER_ADMIN` accounts rather than one? One super-admin who loses their password has no recovery path at all: E-66 requires an admin with equal-or-higher privilege (§11.6), and there is none. Two is the standard answer to a single point of failure like this. Assumption: minimum one enforced, **two strongly recommended operationally**, not enforced in code.

### 11.6 `guardNotHigherPrivilege` — the missing guard in spec 02

Spec 02's E-59/E-60 have `guardNotSelf` and `guardNotLastAdmin` but **no privilege-ordering check**. Against a two-role model that was fine. With `SUPER_ADMIN` it is a privilege-escalation hole:

> Without it, any `ADMIN` may call `POST /api/admin/users/<super-admin-id>/deactivate` and remove the only account that can demote them — or call E-66 and take over the super-admin's account outright. `guardNotLastAdmin` does not stop it while other admins exist.

```
rank = { USER: 0, ADMIN: 1, SUPER_ADMIN: 2 }
guardNotHigherPrivilege(actor, target) := rank[actor.role] >= rank[target.role]
```

| Endpoint | Guard applies | Effect |
|---|---|---|
| E-59 deactivate | ✓ | An `ADMIN` cannot deactivate a `SUPER_ADMIN` |
| E-60 reactivate | ✓ | An `ADMIN` cannot reactivate a `SUPER_ADMIN` a super-admin suspended |
| E-66 password reset | ✓ | An `ADMIN` cannot force-reset a `SUPER_ADMIN`'s password |
| E-74 revoke sessions | ✓ | `SUPER_ADMIN`-only anyway |

Failure is `403 GUARD_FAILED { guard: "guardNotHigherPrivilege" }` — **`403`, not `404`**, because an admin can legitimately *see* the target via E-57/E-58 and is being refused an action on a visible record. That is spec 02 §3.4 rule 2's own definition of when `403` is correct rather than `404`.

Note `rank[actor] >= rank[target]`, not `>`: one `ADMIN` may deactivate another `ADMIN`, and one `SUPER_ADMIN` may deactivate another. Peer action is intentional — it is the recovery path for a compromised peer account — and it is `guardNotSelf` plus the last-admin guards that keep it from becoming self-destruction.

> **OQ-A27.** Should peer action be blocked instead, i.e. `>` rather than `>=`, so only a `SUPER_ADMIN` may suspend an `ADMIN`? Argument for: it removes admin-vs-admin conflict entirely. Argument against: it makes every compromised-admin response depend on a super-admin being reachable. Assumption: `>=`, peer action allowed and audited.

### 11.7 Audit log scoping

Spec 02 E-61 gives every `ADMIN` unrestricted audit read. With `SUPER_ADMIN`, that needs a line drawn:

| Reader | Sees |
|---|---|
| `ADMIN` (E-61) | All rows **except** those with `entityType: USER` and an `action` in the privileged set: `USER_PROMOTED_TO_ADMIN`, `USER_DEMOTED_FROM_ADMIN`, `USER_PROMOTED_TO_SUPER_ADMIN`, `SUPER_ADMIN_SEEDED`, `USER_PASSWORD_RESET_ISSUED`, `SYSTEM_CONFIG_CHANGED`, `ADMIN_SESSIONS_REVOKED` |
| `SUPER_ADMIN` (E-73 `/api/superadmin/audit`) | Everything, unfiltered |

Rationale: an admin needs the operational trail (who approved what, who moved money) to do their job, and does not need the provisioning trail. Hiding it means a rogue admin cannot confirm which accounts are super-admins by reading history, and cannot see whether their own actions are being reviewed.

The filter is applied as a **query constraint at the service layer**, in the same shape as the `/api/public` visibility predicate (spec 02 §9) — not as a post-filter on results, which would corrupt `meta.total` and let page counts leak the existence of hidden rows.

> **OQ-A28.** Is hiding provisioning events from `ADMIN` the right call, or should every admin see the full trail on transparency grounds? A single-operator deployment makes the distinction moot; a team of five makes it matter. Assumption: scoped as tabled.

### 11.8 System configuration (E-71 / E-72)

A single `SystemConfig` document (`_id: 'singleton'`) — `Δ-15`, a new entity spec 01 does not have.

| Key | Type | Default | Effect |
|---|---|---|---|
| `booking.maxDurationDays` | int | `90` | `guardDateRangeValid` (E-17) |
| `booking.maxAdvanceDays` | int | `365` | How far ahead a booking may start |
| `availability.publicWindowDays` | int | `180` | E-08's window cap (spec 02 OQ-28) |
| `security.adminMaxConcurrentSessions` | int | `0` *(unlimited)* | §9.3 |
| `security.accessTokenTtlMinutes` | int | `15` | Bounded 5–60; out of range rejected |
| `listing.maxImagesPerCar` | int | `12` | |
| `platform.registrationOpen` | bool | `true` | Emergency switch: `false` → E-01 returns `503 SERVICE_UNAVAILABLE` |

**All `kyc.*` keys from the previous draft are removed** — `kyc.requireDrivingLicenceToRent` and `kyc.requiredToSubmitListing` both described gates that no longer exist.

E-72 rules: `z.strictObject`, one audit row (`SYSTEM_CONFIG_CHANGED`) per call carrying `{ key, previousValue, newValue }` for each changed key, and **no key may change an authorization rule**. Roles, the permission matrix, the exception list, and the guards are code and spec, never configuration — a config-editable permission matrix is a permission matrix with no review step.

### 11.9 E-74 `POST /api/superadmin/users/:userId/sessions/revoke-all`

| | |
|---|---|
| **Auth** | `SUPER_ADMIN` only |
| **Body** | `{ reason: string (1..500) }` |
| **Success** | `200 OK` → `{ data: { revoked: n } }` |
| **Guards** | None beyond the role gate — a `SUPER_ADMIN` may revoke anyone's sessions, including another `SUPER_ADMIN`'s and their own |
| **Audit** | `ADMIN_SESSIONS_REVOKED` — **new action** |

The incident-response tool: evict a suspected-compromised account without suspending it, which preserves their listings and bookings while forcing re-authentication.

---

## 12. Required tests

Extending spec 02's `TR-01`…`TR-05`. Each is a build-failing static or integration test, not a review checklist.

| # | Test | Kind |
|---|---|---|
| `TR-06` | Exactly eight routes across `/api/user` and `/api/auth` write a status field, and they are E1–E6, E7, E8. A ninth fails the build. (Extends `TR-04`.) | Static |
| `TR-07` | `flags.isOwner` is referenced only in serialisation; never in `guards/`, `services/`, or a route declaration. | Static |
| `TR-08` | No handler under `/api/user` branches on `actor.role`. | Static |
| `TR-09` | Every route not in the guest-allowed set (E-01, E-02, E-03, E-06, E-07, E-08, E-75) declares `auth: 'required'`. | Static |
| `TR-10` | The generated permission matrix's `USER` and `OWNER` columns are identical on every row. | Unit |
| `TR-11` | `SUPER_ADMIN` ⊇ `ADMIN` on every row of the generated matrix. | Unit |
| `TR-12` | Every `/api/admin` and `/api/superadmin` route denies GUEST/USER before any record lookup — asserted with a non-existent id, expecting `401`/`403`, never `404`. | Integration |
| `TR-13` | No file under `guards/` or `services/` reads `req.tokenClaims` or any JWT claim. | Static |
| `TR-14` | `+passwordHash` appears in at most one file. | Static |
| `TR-15` | The log redactor drops `password`, `currentPassword`, `newPassword`, `token`, `resetToken`, `drivingLicenceNumber` by key, at any nesting depth. | Unit |
| `TR-16` | `req.actor` is assigned only by `authenticate`. | Static |
| `TR-17` | The generated matrix equals the committed fixture. A permission change must be an intentional fixture diff in the same commit. | Unit |
| `TR-18` | For every `OWN_ONLY` route, a request from a non-owning authenticated user returns `404` — never `403`, never `200`. Runs against every such route, not a sample. | Integration |
| `TR-19` | Middleware order matches §8.1 exactly, asserted against the composed router rather than the source. | Unit |
| `TR-20` | A revoked session's refresh token returns `401` and, on reuse, revokes the whole `family`. | Integration |
| `TR-21` | A deactivated user is rejected on the next request with a still-valid access token. | Integration |
| `TR-22` | **No route declaration carries a `kycLevel` (or equivalent) key, no registered guard name matches `/kyc\|verif/i`, and `ActorContext` has no verification field.** The verification concept cannot grow back by accident. | Static |
| `TR-23` | `POST /api/auth/register` rejects a body with a missing or malformed `drivingLicenceNumber` or `drivingLicenceImageUrl` with `400`. | Integration |
| `TR-24` | No response body outside `/api/admin`, `/api/superadmin`, and the user's own profile/session endpoints contains `drivingLicence` in any form. | Integration |

`TR-18` remains the single most valuable test in this list: it is the automated form of the IDOR argument in spec 02 §10, and it is the one a hand-written handler will fail. `TR-22` is the second: it is what keeps §5's decision from being quietly reversed one guard at a time.

---

## 13. Deltas this document requires in specs 01 and 02

Every item is a change to an already-merged document. None may be applied by an implementation task; each needs a spec amendment first (`CLAUDE.md`: *"Never modify specs while implementing"*).

**Removals (the KYC apparatus):**

| # | Target | Change |
|---|---|---|
| `Δ-1` | spec 01 §1.2, §2.2, §4; spec 02 §8–§11, §12, §13.1–§13.3 | **Delete the `KYC` entity in full** — schema, indexes, Zod schemas (`kycSchema`, `submitKycSchema`, `reviewKycSchema`), state machine §2.2, ERD node, and all eight endpoints (E-22, E-23, E-24, E-52, E-53, E-54, E-55, E-56) with their DTOs (`submitKycDto`, `verifyKycDto`, `rejectKycDto`, `revokeKycDto`, `adminKycQueryDto`) and representations (`KycRecord`, `AdminKycRecord`). |
| `Δ-2` | spec 01 §1.1 | **Delete `User.kycStatus`** and its enum. **Add `User.drivingLicence`** as §5.3 defines it, with `number` and `imageUrl` required. |
| `Δ-3` | spec 02 §12 | **Delete guards** `guardOwnerKycIfRequired`, `guardRenterKycVerified`, `guardDrivingLicenceIfRequired`, `guardNoOpenKycSubmission`, `guardStatusIsVerified`. **Retain** `guardDocumentUrlsAllowed`, repointed at `drivingLicence.imageUrl`. **Delete audit actions** `KYC_SUBMITTED`, `KYC_VERIFIED`, `KYC_REJECTED`, `KYC_REVOKED`, `KYC_DOCUMENT_VIEWED`. |
| `Δ-8` | spec 02 E-05, E-57, E-62 | Remove `permissions.canRequestBooking` / `canCreateListing` from E-05 (nothing gates them now); remove `kycStatus` from `adminUsersQueryDto` (E-57) and from `UserSummary`; remove `queues.kycPending` from E-62's payload. |

**Additions and changes:**

| # | Target | Change |
|---|---|---|
| `Δ-4` | spec 01 §1.1, §1.6 | `User.role` and `AuditLog.actorRole` enums gain `SUPER_ADMIN`. `guardNotLastAdmin` must count both admin roles. |
| `Δ-5` | spec 01 §1.1, §3 | `passwordHash` note: argon2id, fixed (§6.1). `createUserSchema` password minimum 8 → **12**, plus blocklist and contextual rules (§6.3). `createUserSchema` also gains the four driving-licence fields (§5.5). |
| `Δ-6` | spec 01 §1.3 | `CarSchema` index `{ owner: 1 }` → `{ owner: 1, moderationStatus: 1 }` for the `isOwner` derivation (§1.4). |
| `Δ-9` | spec 01 §1 | **New entities `Session`** (§4.5) **and `PasswordReset`** (§7, E-66). |
| `Δ-10` | spec 02 §8, §13.1, §13.3 | Twelve new endpoints: E-63, E-64, E-65, E-66, E-67…E-74, E-75. New DTOs: `changePasswordDto`, `revokeAllSessionsDto`, `adminPasswordResetDto`, `redeemPasswordResetDto`, `promoteAdminDto`, `demoteAdminDto`, `promoteSuperAdminDto`, `revokeSessionsDto`, `updateSystemConfigDto`. E-22…E-24 and E-52…E-56 retired, numbers never reused. |
| `Δ-11` | spec 02 §3.4 | Error-precedence chain must place CSRF `403` and `ACCOUNT_INACTIVE` `403` (§8.3). |
| `Δ-12` | spec 01 §1.1 | `User` gains `failedLoginCount`, `lockedUntil`, `lastFailedLoginAt` (§9.1). |
| `Δ-13` | spec 01 §2.1 | `User` state machine gains role transitions: `USER → ADMIN`, `ADMIN → USER`, `ADMIN → SUPER_ADMIN`, `SUPER_ADMIN → USER` (§11). Currently §2.1 models only `isActive`. |
| `Δ-14` | spec 02 §13.1 | Transition→endpoint table: remove the five KYC rows; add the four role edges plus the `Session` and `PasswordReset` rows. The "nine endpoints write status" count becomes **eight**. |
| `Δ-15` | spec 01 §1 | **New entity `SystemConfig`** (§11.8). |
| `Δ-16` | spec 01 §1.6 | New audit actions: `USER_PASSWORD_CHANGED`, `USER_SESSIONS_REVOKED`, `USER_PASSWORD_RESET_ISSUED`, `USER_PASSWORD_RESET_REDEEMED`, `USER_PROMOTED_TO_ADMIN`, `USER_DEMOTED_FROM_ADMIN`, `USER_PROMOTED_TO_SUPER_ADMIN`, `SUPER_ADMIN_SEEDED`, `ADMIN_SESSIONS_REVOKED`, `SESSION_REUSE_DETECTED`, `ACCOUNT_LOCKOUT_ESCALATED`, `SYSTEM_CONFIG_CHANGED`, `USER_REGISTERED`, `CAR_DELISTED_FORCED` *(if OQ-A22 resolves to yes)*. |
| `Δ-17` | spec 02 E-41 | Add `guardRenterActive` (DEFECT-2, §10.3). |
| `Δ-18` | spec 02 §5 | New rate-limit buckets: `auth.password.reset` (IP, 10/hour), `superadmin.write` (user id, 30/hour). **Remove** `user.kyc.submit`. |
| `Δ-19` | spec 02 §7.1, §7.2 | Read-visibility matrix: delete the `KYC` row; add a `User.drivingLicence` row per §5.7. `PartyContact` unchanged (gains nothing). |
| `Δ-20` | `CLAUDE.md` | Still titled *"Rental + Resale Platform"* — stale, per spec 02 OQ-54. Also states the absolute hard rule this document narrows in §0; both need updating together. |
| `Δ-21` | `tasks/01-implementation-plan.md` | The `KYC` block is deleted. Its `CL-05` client work becomes a licence field on the registration form. `S-12`'s KYC questions (spec 01 OQ#1, OQ#2) are answered by deletion rather than decision. |

---

## 14. Consolidated open questions

`BLOCKING` means no implementation task touching the affected area may start until answered.

| # | § | Question | Assumption here | Blocking |
|---|---|---|---|---|
| **OQ-A1** | §0.3 | Confirm AUTHZ-1…AUTHZ-4 as the operative form of the hard rule, replacing the absolute literal form. | Narrowed form, eight closed exceptions | **YES — all of `AUTH`** |
| **OQ-A2** | §1.4 | `isOwner` threshold: `moderationStatus = APPROVED` now, vs. ever-approved, vs. currently `LISTED`. | `APPROVED` now | No |
| **OQ-A3** | §1.7 | Does "owner views own bookings read-only" exclude E-19 (request cancellation) for car owners? | E-19 stays open to both parties | No |
| **OQ-A4** | §2.5 | Register/login while already authenticated: `409` / replace-session. | As tabled | No |
| **OQ-A5** | §4.1 | Confirm browser-only clients, so cookie-based auth needs no bearer alternative. | Browser only | No |
| **OQ-A6** | §4.5 | Per-request session validation on `/api/admin` only, or everywhere? | Admin only | No |
| **OQ-A7** | §4.7 | JWT secret rotation with a `_PREVIOUS` verification fallback in phase 1? | Implement | No |
| **OQ-A8** | §5.4 | Licence number validator: permissive format-only (8–20 chars, `[A-Z0-9- ]`) vs. a per-state Indian DL regex. | Permissive | No |
| **OQ-A9** | §5.4 | Is `expiryDate` required, and should an expired licence block anything? | Optional, never enforced | No |
| **OQ-A10** | §5.5 | Collect the licence at registration (chosen) vs. at first booking request. | **Registration, required for everyone** | No |
| **OQ-A11** | §5.7 | **Restates spec 02 OQ-20 against `drivingLicence`.** Encrypt the licence number at rest? Removing the KYC workflow removed the process, not the PII. | Unresolved | **YES — before `AUTH` ships** |
| **OQ-A12** | §5.7 | Audit admin reads of `drivingLicence`? Would be the only read-audit in the system. | No read-auditing; residual risk accepted | No |
| **OQ-A13** | §5.8 | **Escalates spec 02 OQ-35.** No endpoint produces an image URL, and the licence image is now required **at registration** — so registration is not implementable end-to-end. Specify upload transport, or relax the image requirement (which contradicts OQ-A10). | None — genuinely blocked | **YES — all of `AUTH`** |
| **OQ-A14** | §6.3 | Password minimum 12 (was 8 in spec 01 §3). | 12 | No |
| **OQ-A15** | §6.5 | **Restates spec 02 OQ-38.** No email transport → no self-service password reset. Add a transactional email provider before launch? | Admin-mediated reset only (E-66) | **YES — before launch** |
| **OQ-A16** | §7 (E-65) | Revoke a single named session, or all-or-nothing? | All-or-nothing in phase 1 | No |
| **OQ-A17** | §8.3 | Amend spec 02 §3.4's precedence chain to place CSRF and `ACCOUNT_INACTIVE`. | As §8.1 | **YES — `INF-03`** |
| **OQ-A18** | §9.1 | Lockout is silent (`401`) while a ban is explicit (`403 ACCOUNT_INACTIVE`, spec 02 OQ-12). Confirm the asymmetry. | Asymmetric, as reasoned | No |
| **OQ-A19** | §9.3 | Default concurrent-session cap for admin accounts. | Unlimited, configurable | No |
| **OQ-A20** | §9.9 | **TOTP MFA for `ADMIN`/`SUPER_ADMIN`.** No transport dependency. Password is the only protection on the highest-value accounts, and with KYC gone the platform has no other identity signal at all. | **Recommended before launch** | No — but decide |
| **OQ-A21** | §9.9 | IP allowlist for `/api/superadmin`. | No | No |
| **OQ-A22** | §10.3 | **Conflicts with spec 02 OQ-52.** Should E-59 force-delist a suspended user's `LISTED` cars? DEFECT-1: today a banned owner's car stays rentable and un-handoverable. | **Yes, cascade** *(spec 02 says no — must be settled)* | **YES — `ADM`** |
| **OQ-A23** | §10.3 | DEFECT-2: E-41 (activate) has **no** check on the renter now that `guardRenterKycVerified` is deleted. Add `guardRenterActive`. | Add the guard | **YES — `BOOK`** |
| **OQ-A24** | §11.2 | The seed super-admin needs a licence image URL before any uploader exists. Placeholder, optional field, or seed exemption? | Placeholder, replaced via E-26 | Resolves with **OQ-A13** |
| **OQ-A25** | §11.2 | Non-interactive mode for the super-admin seed command. | Interactive only | No |
| **OQ-A26** | §11.5 | Enforce a floor of two `SUPER_ADMIN` accounts? One super-admin who loses their password has **no** recovery path. | One enforced, two recommended | No — but decide |
| **OQ-A27** | §11.6 | `guardNotHigherPrivilege` uses `>=` (peers may act on peers). Block peer action instead? | `>=`, peer action allowed | No |
| **OQ-A28** | §11.7 | Hide provisioning audit events from plain `ADMIN`? | Hide (E-61 scoped, E-73 full) | No |

**Closed by this revision** (previously blocking, no longer meaningful): spec 01 OQ#1 *(is KYC required to list?)*, spec 01 OQ#2 / spec 02 OQ-49 *(must a renter hold a verified driving licence?)*, spec 01 OQ#11 *(liveness selfie?)*, spec 02 OQ-29, and the previous draft's OQ-A8/A9/A10. **There is no verification, so none of them has anything left to decide.** Spec 02 OQ-20 is *not* closed — it survives as OQ-A11, because the data survives.

---

## 15. Out of scope for this document

- **Identity verification of any kind.** §5. No KYC, no document review, no verification states, no verifier role, no third-party verification API. This is a decision, not an omission.
- **Checking the driving licence against any authority.** §5.4. The number is self-asserted and unverified.
- **OAuth / social login / SSO.** Single first-party client, email+password only.
- **MFA.** Recommended for admin roles (OQ-A20) but not specified here; if adopted it is a new section and a new entity.
- **Email verification at registration.** No email transport (spec 02 §15). This is also why spec 02 OQ-22's account-enumeration oracle on register cannot currently be closed.
- **Self-service password reset.** §6.5 — not implementable without a transport. E-66 is the substitute.
- **Phone/OTP verification.** Spec 01 OQ#13 assumes phone is trusted as entered; no SMS gateway is in scope.
- **Per-endpoint or per-field ACLs beyond the five roles.** If a sixth authority level is ever needed, that is a new spec, not an amendment.
- **Delegated access / team accounts / an owner granting a co-manager.** Ownership is a single `userId`, per spec 01 §1.3 (*"Never changes"*).
- **Impersonation ("log in as user") for support.** Deliberately excluded: it defeats the audit trail's actor attribution, which spec 01 §1.6 treats as non-negotiable.
- **API keys / machine-to-machine auth.** No third-party API (spec 02 §15).
- **Image and document byte upload.** Still deferred to `docs/design/02` (spec 02 OQ-35). Now blocking registration itself — OQ-A13.
