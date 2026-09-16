# 05 — UI/UX: Public + User Surface

Status: DRAFT — for review before any component code beyond what already exists (Home, Search — Session 4).
Reads: `specs/01-domain-and-state-machines.md` (entities, state machines — superseded in part), `specs/02-api-contract.md` (endpoints, DTOs, response shapes — superseded in part), `specs/03-auth-and-roles.md` (roles, auth, licence capture — supersedes 01/02 on KYC), `specs/04-business-logic.md` (pricing, availability, cancellation — supersedes 01/02/03 on KYC, deposits, buffers; authoritative for anything it touches), `docs/design/03-design-system.md` (tokens), `docs/design/02-image-storage.md` (image upload transport).
Feeds: every future `/client/src/pages/public/*` and `/client/src/pages/user/*` session.

**Scope.** Car **rental only**. This document covers the public-facing marketing/browse surface and the authenticated-`USER` surface (renter + owner, since any `USER` can be both — spec 03 §1.1). It does **not** cover `/api/admin` or `/api/superadmin` screens — those are `specs/05.5-admin-panel.md`'s territory. No sale, no resale, no online payment, no online identity verification anywhere in what follows.

## Authority note — which spec wins when they disagree

Per `specs/04-business-logic.md`'s own Authority section, spec 04 is the most recent and most authoritative layer for anything it touches, spec 03 is authoritative on auth/roles/licence, and spec 02 is authoritative on endpoint shape *except* where 03 or 04 override it. Concretely, for this document:

- **There is no KYC, no verification status, no document upload of any kind, anywhere in the product.** Spec 01's `KYC` entity, spec 02's `E-22`/`E-23`/`E-24` (user KYC endpoints) and `guardRenterKycVerified` on booking request (`E-17`) are **void** (spec 04 §X-A, §X-B). Nothing in this document gates any screen or action on a verification state, because no such state exists.
- **A user has a self-asserted `drivingLicence.number`** (string only, no image, no back image — spec 03 §5.3 as narrowed by spec 04 §X-C1), captured at registration and editable on the profile screen. It is **never** shown as a status, badge, or gate anywhere in the UI — it is inert data an admin may look at during a dispute, nothing more (spec 03 §5.4, spec 04 §X-E).
- **Car photos are the one real upload in the product.** `docs/design/02-image-storage.md` specifies a real `multipart/form-data` upload to `POST /api/user/listings/:carId/images`, Cloudinary-backed, owner-only, gated on `DRAFT`/`REJECTED`. This resolves spec 02 OQ-35's "KYC and CL-05 blocking" note for the `CL-05` (client) half; the `KYC` half is void per the point above.
- **Booking request (`E-17`) guards, as this document assumes them:** `guardCarPubliclyBookable`, `guardNotOwnRental`, `guardDateRangeValid`, `guardNoExistingRequestForRange`. **`guardRenterKycVerified` does not run** — spec 04 §X-B20 deletes it.
- **Deposits, buffer days, late fees, `CANCELLATION_REQUESTED`, `NO_SHOW`, `TERMINATED`** exist per spec 04 §1–§2 even though spec 01's `Booking` enum does not yet list them. This document designs against the amended machine, consistent with `specs/05.5-admin-panel.md` and `docs/design/03-design-system.md` §2.3, which already do the same.

Where the assumed, amended state machine differs from what a reader would get from spec 01 alone, this document says so inline rather than silently relying on the amendment.

---

## 0. What already exists in code (Session 4) and whether it should be revisited

| File | What it does today | Assessment against this spec |
|---|---|---|
| `client/src/pages/public/Home.tsx` | Hero, "Recently listed" grid (8 cars, `sort=publishedAt:desc`), value props, "How it works" 3-step strip. Loading/error/empty states present. | **Matches §3.1 below closely — keep as built.** One copy issue: the hero and value-prop copy says *"verified by a real admin"* / *"Admin-approved listings … no unverified listings"*. That is accurate for the **listing**, but sits one clause away from implying the **person** is verified, which is false (no KYC exists). **OPEN QUESTION — flagged for revisit, not blocking:** reword to keep the admin-approval claim scoped to the car ("every car is reviewed by an admin before it's listed"), never to the renter/owner's identity. See §3.1. |
| `client/src/pages/public/Search.tsx` | Sidebar filter panel (desktop) / drawer (mobile), sort select, chip row, results grid, pagination, loading/error/empty states. Filters wired: `q`, `city`, `transmission`, `fuelType`, `seatsMin`, `priceMin/Max`. | **Matches §3.2 below closely — keep as built.** Gap: **`availableFrom`/`availableTo` date-range filtering is defined in spec 02 §9 `publicCarQueryDto` but not wired in `FilterPanel`/`toQuery`.** This is the single most-requested filter on a rental site ("is it free on my dates") and its absence is worth a follow-up task, not a rewrite. **OPEN QUESTION — flag for revisit:** add a date-range picker to `FilterPanel`, threading `availableFrom`/`availableTo` into `PublicCarQuery` exactly as the other params are threaded (§9's own note that one date alone is a 400 must be enforced client-side too, not just left to the server error). |
| `client/src/api/cars.ts` | Typed client for `GET /api/public/cars` only. | Needs a sibling module for `GET /api/public/cars/:carId` and `GET /api/public/cars/:carId/availability` (Listing Detail, §3.3) — does not exist yet. |
| `client/src/components/ui/*` (`Badge`, `Button`, `Card`, `Field`, `Input`, `Select`, `Textarea`, `Modal`, `Table`, `Toast`, `Avatar`) | Design-system-token-driven atoms already exist, including a `Badge` component with the exact status→color→icon mapping this document's §6 needs. | Reuse directly. `Badge` already encodes the color-blind-safe icon rule (`§2.3`'s "never color alone"); this document does not re-specify it, only maps statuses onto it (§6). |
| `client/src/pages/auth/*` (`Login`, `Register`, `ResetPassword`) | Exists. Out of scope for this document except where the Booking Request Flow or dashboards redirect to it (§3.4, §5). | Not reviewed here. |
| `client/src/store/auth.store.ts` | Exists — presumed to hold the authenticated user / `GET /api/auth/me` result. | Assumed as the source of `flags.isOwner`, `role`, `isActive` for client-side rendering decisions (never for authorization — spec 03 §3, §4.6). |

No other user-facing page exists yet: Listing Detail, Booking Request Flow, Renter Dashboard, Owner Dashboard, Create/Edit Listing, and Profile are all **new** and are specified in full below.

---

## 1. Route map

Convention: **Auth** column is what the *route* requires client-side (server-side enforcement is per spec 02/03 and is the real gate — this column is about what the client should redirect on). **Role** column is who the route is *for*; per spec 03 §1.1/§2.1, `OWNER` is never a distinct role — every row that says `OWNER` really means "any `USER` (or `ADMIN` acting as themselves), scoped to their own records."

| Route | Auth | Role | Purpose | Endpoint(s) |
|---|---|---|---|---|
| `/` | None | Everyone | Home / marketing | `GET /api/public/cars` (E-06) |
| `/cars` | None | Everyone | Search / browse | `GET /api/public/cars` (E-06) |
| `/cars/:carId` | None | Everyone | Listing detail | `GET /api/public/cars/:carId` (E-07), `GET /api/public/cars/:carId/availability` (E-08) |
| `/cars/:carId/request` | **Required** | `USER`/`ADMIN` (as self) | Booking request flow (date select → quote → confirm) | `GET /api/public/cars/:carId/availability` (E-08), `POST /api/user/bookings` (E-17) |
| `/login` | None (redirects away if already authenticated per spec 03 §2.5) | Everyone | Login | `POST /api/auth/login` (E-02) |
| `/register` | None (same) | Everyone | Registration, incl. driving-licence number capture | `POST /api/auth/register` (E-01) |
| `/reset-password` | None | Everyone | Password reset redemption (admin-initiated — spec 03 §7; there is **no self-service** "forgot password" request step, only redemption of a reset an admin issued) | `POST /api/auth/password` family, per spec 03 §7 (exact endpoint numbers not in scope here) |
| `/account/bookings` | **Required** | `USER`/`ADMIN` (as self) | Renter Dashboard — "My requests" | `GET /api/user/bookings?role=RENTER` (E-20) |
| `/account/bookings/:bookingId` | **Required** | `USER`/`ADMIN` (as self) | Booking detail, either side | `GET /api/user/bookings/:bookingId` (E-21) |
| `/account/listings` | **Required** | `USER`/`ADMIN` (as self) | Owner Dashboard — "My listings" | `GET /api/user/listings` (E-14) |
| `/account/listings/new` | **Required** | `USER`/`ADMIN` (as self) | Create Listing | `POST /api/user/listings` (E-09) |
| `/account/listings/:carId` | **Required** | `USER`/`ADMIN` (as self, `guardIsOwner`) | Listing detail (owner view) + bookings on this car (read-only) | `GET /api/user/listings/:carId` (E-15) |
| `/account/listings/:carId/edit` | **Required** | `USER`/`ADMIN` (as self, `guardIsOwner`) | Edit Listing, incl. photo upload | `PATCH /api/user/listings/:carId` (E-10), `POST /api/user/listings/:carId/images` (design/02) |
| `/account/profile` | **Required** | `USER`/`ADMIN` (as self) | Profile — name, phone, driving licence number | `GET /api/user/profile` (E-25), `PATCH /api/user/profile` (E-26) |

**Not modelled as separate routes, deliberately:**

- There is **no** `/account/listings/:carId/bookings` route — bookings on a car are a tab/section inside `/account/listings/:carId` (E-15 already returns `bookings: BookingSummary[]` inline), not a second fetch on a second URL.
- There is **no** owner-facing availability-block screen — spec 04 §1.6 is explicit that blocks are admin-only; an owner has no in-product lever beyond delisting (E-13) or asking an admin (§1.6's own stated gap, `OQ-B7`).
- `/account` bare (no sub-path) — **OPEN QUESTION.** Redirect to `/account/bookings` as the default landing tab, or render a combined summary? This document assumes a redirect to `/account/bookings`, since a fresh registrant is far more likely to have booked something than listed something, and an owner-only user simply clicks across to "My listings" once. Confirm before building the nav shell.

**Auth redirect behavior (client-side convenience, not a security boundary — spec 03 §3 owns the actual boundary):** any `/account/*` route hit while unauthenticated redirects to `/login?next=<path>`, and `/login` on success returns the user to `next`. This mirrors spec 03 §9.4's re-login-replaces-session behavior without inventing a new one.

---

## 2. Page inventory

| Page | Purpose |
|---|---|
| **Home** | First impression, orientation, funnel into Search. Explains the no-payment/offline-handover model up front so it is never a surprise later in the funnel. |
| **Search / Browse** | The primary discovery surface. Filter, sort, and scan listed cars; funnel into Listing Detail. |
| **Listing Detail** | Convert a browsing visitor into a booking request. Shows everything E-07/E-08 expose, nothing E-07 deliberately withholds (owner identity, registration number — spec 02 §7.2). |
| **Booking Request Flow** | Turn a date range into a `REQUESTED` booking. The one screen that must be most explicit about "this is a request, not a reservation" (spec 04 RULE AV-2) and "confirmation and payment both happen in person" (spec 04 §"No payment gateway"). |
| **Renter Dashboard** | Track the status of every booking the user has requested, see contact details once revealed, act on what's actionable (cancel a `REQUESTED`, request cancellation of a `CONFIRMED`). |
| **Owner Dashboard** | Track the moderation status of every listing owned, and — read-only except for one write — see bookings against those listings. |
| **Create/Edit Listing** | Get a car from nonexistent to `PENDING_APPROVAL`, and later, back through `DRAFT` for corrections (spec 02 E-10's re-moderation path). Includes the one real upload flow in the product. |
| **Profile** | Self-service identity data: name, phone, driving licence number. Never role, email, or any status field (spec 02 E-26, spec 03 AUTHZ-4). |

---

## 3. Wireframe spec per page

Layout regions use a shared shell: `PublicHeader`/`PublicFooter` (already built) for `/`, `/cars`, `/cars/:carId`; an authenticated **account shell** (header + left nav, collapsing to a top tab bar below `md` per `docs/design/03-design-system.md` §7) for every `/account/*` route and `/cars/:carId/request`.

### 3.1 Home (existing — see §0 for the one copy note)

```
┌─────────────────────────────────────────────────────────┐
│ PublicHeader                                             │
├─────────────────────────────────────────────────────────┤
│ HERO (brand-primary bg)                                  │
│  eyebrow → H1 → subcopy → [Browse cars] [List your car]  │
├─────────────────────────────────────────────────────────┤
│ RECENTLY LISTED                                          │
│  heading + "View all →"                                  │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐   (CarCard × up to 8)       │
├─────────────────────────────────────────────────────────┤
│ VALUE PROPS (3-up)                                        │
│  [icon] Admin-approved listings                           │
│  [icon] Handover, in person                               │
│  [icon] Transparent daily pricing                         │
├─────────────────────────────────────────────────────────┤
│ HOW IT WORKS (3-up, numbered)                             │
│  01 Browse & filter · 02 Request a booking · 03 Meet & drive off │
├─────────────────────────────────────────────────────────┤
│ PublicFooter                                              │
└─────────────────────────────────────────────────────────┘
```

- **Data source:** `GET /api/public/cars?limit=8&sort=publishedAt:desc` (E-06).
- **Actions:** "Browse available cars" → `/cars`. "List your car" → `/register` if logged out, `/account/listings/new` if logged in **(gap — currently always links to `/register`; fix when auth state is wired into `Home`)**.
- **States:** loading = 8 `CarCardSkeleton`; error = `EmptyState` ("Couldn't load listings"); empty (zero published cars, a legitimate early-launch state) = `EmptyState` ("No cars listed yet"). All three already implemented.

### 3.2 Search / Browse (existing — see §0 for the date-filter gap)

```
┌─────────────────────────────────────────────────────────┐
│ PublicHeader                                              │
├─────────────────────────────────────────────────────────┤
│ H1 "Browse cars" + subcopy                                │
├───────────────┬───────────────────────────────────────────┤
│ FILTER PANEL   │ TOOLBAR: [Filters (mobile)] result-count  sort▾│
│ (sticky, lg+)  │ chip row (active filters, removable)       │
│ - q            │ ┌──────┐┌──────┐┌──────┐  (CarCard grid)   │
│ - city         │ ├──────┤├──────┤├──────┤                    │
│ - transmission │ └──────┘└──────┘└──────┘                    │
│ - fuelType     │ pagination (‹ Page N of M ›)                │
│ - seatsMin     │                                              │
│ - price range  │                                              │
│ [availableFrom/To — MISSING, §0]                              │
├───────────────┴───────────────────────────────────────────┤
│ PublicFooter                                                │
└─────────────────────────────────────────────────────────┘
```

- **Data source:** `GET /api/public/cars` (E-06) with the full `publicCarQueryDto` (spec 02 §9).
- **Filters/sort/results grid:** as built (`FilterPanel`, `Select` sort, `CarCard` grid) — see §0 for the one gap.
- **States:** loading = skeleton grid; error = `EmptyState`; empty = `EmptyState` with a "Clear all filters" action *only when a filter is active* (already correctly conditional in code); results present = grid + pagination.

### 3.3 Listing Detail — **new**

```
┌─────────────────────────────────────────────────────────┐
│ PublicHeader                                              │
├─────────────────────────────────────────────────────────┤
│ Breadcrumb: Cars / {Make} {Model}                          │
├───────────────────────────────┬───────────────────────────┤
│ PHOTO GALLERY                  │ SUMMARY CARD (sticky)      │
│  main image + thumbnail strip  │  {Make} {Model} {Year}     │
│  (images[], primaryImageUrl    │  {city}, {state}           │
│  first)                        │  ₹{rentalPricePerDay}/day  │
│                                 │  [rentalPricePerWeek note  │
│                                 │   if present — spec 04 §2.1]│
│                                 │  ─────────────────────────│
│                                 │  AVAILABILITY CALENDAR     │
│                                 │  (month grid, blocked days │
│                                 │   struck out — no source   │
│                                 │   disclosed, spec 02 E-08) │
│                                 │  ─────────────────────────│
│                                 │  [Request to book] CTA     │
├───────────────────────────────┴───────────────────────────┤
│ SPECS                                                      │
│  transmission · fuelType · seats · mileageKm · color?      │
├─────────────────────────────────────────────────────────┤
│ DESCRIPTION (if present)                                   │
├─────────────────────────────────────────────────────────┤
│ PublicFooter                                                │
└─────────────────────────────────────────────────────────┘
```

- **Data source:** `GET /api/public/cars/:carId` (E-07) for everything above the calendar; `GET /api/public/cars/:carId/availability?from=&to=` (E-08) for the calendar, windowed to the visible month(s), capped at the 180-day span the endpoint enforces.
- **Deliberately absent from this page**, because E-07's response omits them: owner name/identity in any form, `registrationNumber`, `moderationStatus`/`listingState`, `rejectionReason`, booking history (spec 02 §7.2). **No "About the owner" block exists on this page**, and none should be added without a spec amendment — the read-visibility matrix (spec 02 §7.1) never grants the public an owner identity.
- **Calendar rendering rule (spec 02 E-08 "Leakage"):** a blocked day renders identically regardless of why it is blocked (booking, buffer, admin block). No tooltip, hover state, or label may say "booked" vs. "unavailable" vs. anything else — the API does not disclose `source` to a public caller and the UI must not infer or invent one.
- **CTA logic:**
  - Logged out → `[Request to book]` still visible (so the value proposition is visible pre-auth) but click routes to `/login?next=/cars/:carId/request`.
  - Logged in, **is the car's owner** → CTA replaced with a disabled state, label "You own this car", tooltip explaining `guardNotOwnRental` (E-17) — this is a client-side courtesy; the server is the real enforcement.
  - Logged in, not owner → CTA routes to `/cars/:carId/request`.
- **Empty state:** N/A for a single-resource detail page — a nonexistent or non-public car is a 404 (E-07), which routes to a **not-found** page, not an empty state (see §5).
- **Loading state:** skeleton matching the two-column layout (image block + summary card shimmer).
- **Error state:** `EmptyState`-style panel, "Couldn't load this listing", with a "Back to search" action. Distinguish from 404 (see §5) — a transient fetch failure is retryable, a 404 is not.
- **Unauthorized state:** N/A — this route has no auth requirement.

### 3.4 Booking Request Flow — **new**

A single-route, multi-step flow (not a wizard with its own URLs per step — the whole thing is cheap enough server-side that a route-per-step buys nothing and complicates back-button behavior).

```
┌─────────────────────────────────────────────────────────┐
│ Account shell header                                       │
├─────────────────────────────────────────────────────────┤
│ H1 "Request to book — {Make} {Model}"                      │
├───────────────────────────────┬───────────────────────────┤
│ STEP 1 — DATE SELECTION        │ QUOTE PREVIEW (sticky)     │
│  date-range picker over the    │  {days} days               │
│  availability calendar (same   │  ₹{rentalPricePerDay} × N  │
│  blocked-day rendering as §3.3)│  or weekly-blended total    │
│                                 │  (spec 04 §2.2's formula,   │
│                                 │   computed client-side as   │
│                                 │   a *preview* — the server  │
│                                 │   total at E-17 is what     │
│                                 │   actually counts)          │
│                                 │  ─────────────────────────│
│                                 │  "This is a request, not a │
│                                 │   reservation." (copy rule, │
│                                 │   §7)                       │
│                                 │  [Confirm request] CTA       │
├───────────────────────────────┴───────────────────────────┤
│ WHAT HAPPENS NEXT (static explainer block, always visible) │
│  1. Owner and admin review your request                     │
│  2. Admin confirms — you'll see contact details appear      │
│  3. You meet in person, inspect the car, pay directly        │
├─────────────────────────────────────────────────────────┤
└─────────────────────────────────────────────────────────┘
```

- **Date selection:** two date inputs or a range-picker, bounded by `guardDateRangeValid` (E-17): `startDate ≥ today` (UTC), `endDate > startDate`, span ≤ 90 days. Client-side validation mirrors these bounds so the error is immediate, not a round trip — but the **server result is authoritative**; a client-side pass never implies the request will succeed (dates can go stale between page-load and submit if another admin blocks them, spec 04 §1.6).
- **Price preview, endpoint:** the quote shown is computed **client-side** from the car's `rentalPricePerDay`/`rentalPricePerWeek` (already fetched via E-07) using spec 04 §2.2's formula, purely so the user sees a number before submitting. **The authoritative total is whatever `POST /api/user/bookings` (E-17) returns in `BookingDetail.totalAmount`**, computed server-side from `ratePerDaySnapshot` taken **at request time** (spec 02 E-17, spec 04 §2.2). If the two ever disagree (a price changed between page-load and submit), the confirmation screen shows the server figure with a one-line note, never silently overwrites the preview without saying so.
- **Confirm action:** `POST /api/user/bookings` (E-17), body `{ carId, startDate, endDate }`. On `201`, route to `/account/bookings/:bookingId` (the newly created booking's detail) with a success toast: *"Request sent. You'll be notified once an admin reviews it."* **OPEN QUESTION:** the platform has "no notifications" per spec 02 design §13 references — confirm this toast's "you'll be notified" promise is accurate, or soften it to "check My Requests for updates" if there is genuinely no email/push channel. This document assumes the latter is safer copy until a notification channel is confirmed to exist.
- **Guard-failure handling, mapped to copy (not raw codes):**
  | Guard / error | Copy shown |
  |---|---|
  | `guardCarPubliclyBookable` fails (car delisted mid-flow) | "This car is no longer available to book. [Back to search]" |
  | `guardNotOwnRental` | Should never surface here — CTA is hidden for owners (§3.3) — but if it does: "You can't book your own listing." |
  | `guardDateRangeValid` | Inline field errors per §4.3's `VALIDATION_FAILED` shape — "End date must be after start date," "Start date can't be in the past," "Bookings can't be longer than 90 days." |
  | `guardNoExistingRequestForRange` | "You already have a request on these dates for this car. [View your request]" linking to the existing booking. |
  | `409 CONFLICT` (rare — E-17 takes no locks, so this is essentially never seen in practice, but the DTO's uniqueness constraints could still fire) | Generic retry copy. |
- **Empty state:** N/A (form, not a list).
- **Loading state:** submit button shows a busy state; the whole form is disabled during submission (no double-submit — E-17 is not idempotent in the sense that two clicks make two `REQUESTED` bookings, spec 02 §2.5's point about admin endpoints applies in spirit here too even though this isn't an admin endpoint).
- **Error state:** see the guard table above; a genuine `500`/`503` shows a generic "Something went wrong, please try again" with the request retained (don't clear the form).
- **Unauthorized state:** route requires auth — unauthenticated hit redirects to `/login?next=/cars/:carId/request` per §1.

### 3.5 Renter Dashboard — "My requests" (`/account/bookings`) — **new**

```
┌─────────────────────────────────────────────────────────┐
│ Account shell (nav: My requests | My listings | Profile)  │
├─────────────────────────────────────────────────────────┤
│ H1 "My requests"                    [status filter▾]       │
├─────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────────┐    │
│ │ {Make Model}  [Badge: status]           {dates}     │    │
│ │ ₹{totalAmount}                    [dateConflict ⚠?] │    │
│ │ [stale ⚠?]                              → tap row   │    │
│ └───────────────────────────────────────────────────┘    │
│  … (list, newest first)                                    │
│  pagination                                                 │
└─────────────────────────────────────────────────────────┘
```

Row → `/account/bookings/:bookingId` (detail below).

**Booking detail sub-view** (`/account/bookings/:bookingId`, renter side):

```
┌─────────────────────────────────────────────────────────┐
│ ← Back to My requests                                      │
│ H1 {Make Model}                          [Badge: status]   │
├─────────────────────────────────────────────────────────┤
│ DATES & PRICE                                               │
│  {startDate} → {endDate} · {days} days                      │
│  ₹{totalAmount}  (amountReceived shown if > 0, spec 04 §6)   │
├─────────────────────────────────────────────────────────┤
│ OWNER CONTACT                                               │
│  IF phone revealed (status ∈ CONFIRMED/ACTIVE/COMPLETED/     │
│     TERMINATED/NO_SHOW, spec 02 §7.2 PartyContact rule):     │
│    {name} · {phone}                                          │
│  ELSE:                                                        │
│    {name} · "Contact details appear once your request is     │
│              confirmed."                                      │
├─────────────────────────────────────────────────────────┤
│ STATUS EXPLANATION (copy per §6/§7, keyed to current status) │
├─────────────────────────────────────────────────────────┤
│ ACTIONS (conditional on availableActions[] + status):        │
│  status=REQUESTED  → [Cancel request]                         │
│  status=CONFIRMED  → [Request cancellation]                   │
│  otherwise         → (none — read only)                       │
└─────────────────────────────────────────────────────────┘
```

- **Data source (list):** `GET /api/user/bookings?role=RENTER` (E-20), default sort `createdAt:desc`. Status filter dropdown maps to the repeatable `status` query param.
- **Data source (detail):** `GET /api/user/bookings/:bookingId` (E-21) → `BookingDetail`, renter view (`owner: PartyContact`).
- **Revealed contacts:** exactly the `PartyContact` gating rule from spec 02 §7.2 — `phone` present only once `status ∈ { CONFIRMED, ACTIVE, COMPLETED, TERMINATED, NO_SHOW }`; otherwise `{ id, name }` only. The UI must render the "not yet revealed" copy explicitly (§7) rather than just omitting the phone field silently — an absent field with no explanation reads as a bug.
- **Actions:**
  - `REQUESTED` → **Cancel request** button → confirm dialog ("Withdraw this request? This can't be undone.") → `POST /api/user/bookings/:bookingId/cancel` (E-18, `guardIsRenter`, `guardStatusIsRequested`).
  - `CONFIRMED` → **Request cancellation** button → dialog requiring a `reason` (required per E-19's DTO) → `POST /api/user/bookings/:bookingId/request-cancellation` (E-19). Copy must state plainly that this does **not** cancel the booking by itself — an admin resolves it (§7).
  - `CANCELLATION_REQUESTED`, `ACTIVE`, `REJECTED`, `COMPLETED`, `TERMINATED`, `CANCELLED`, `NO_SHOW` → no renter action; the detail is read-only for the renter at that point. (`ACTIVE → CANCELLED` has no renter-facing path at all per spec 01 §2.4's original defect list and spec 04's `TERMINATED` replacement — only an admin can terminate.)
- **`dateConflict`/`stale`/`competingRequestCount` (spec 04 §1.4):** shown only on `REQUESTED` rows/detail, as a warning badge + inline copy (§6, §7) — never silently hidden, because RULE AV-2 requires every `REQUESTED` surface to say, in words, that it is not a reservation.
- **Empty state:** "You haven't requested any cars yet." + CTA to `/cars`.
- **Loading state:** skeleton rows (list) / skeleton detail card (detail).
- **Error state:** `EmptyState`-style, "Couldn't load your requests," retry action.
- **Unauthorized state:** route-level redirect to login (§1); a booking belonging to someone else is `404` (E-21, spec 02 §3.4 rule 2) rendered as the shared not-found page (§5), never a 403-styled page — the API deliberately does not distinguish "not yours" from "doesn't exist."

### 3.6 Owner Dashboard — "My listings" (`/account/listings`) — **new**

```
┌─────────────────────────────────────────────────────────┐
│ Account shell                                               │
├─────────────────────────────────────────────────────────┤
│ H1 "My listings"                    [+ List a car]          │
│                                       [status filter▾]       │
├─────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────────┐     │
│ │ [thumb] {Make Model} {Year}   [Badge: moderation]    │     │
│ │         {city}, {state}       [Badge: listing state] │     │
│ │         ₹{rentalPricePerDay}/day       → tap row      │     │
│ └───────────────────────────────────────────────────┘     │
│  … (list, newest first)                                     │
└─────────────────────────────────────────────────────────┘
```

Row → `/account/listings/:carId`.

**Listing detail sub-view (owner)** (`/account/listings/:carId`):

```
┌─────────────────────────────────────────────────────────┐
│ ← Back to My listings                                       │
│ H1 {Make Model}          [Badge: moderation] [Badge: listing]│
│                                          [Edit] [⋯ more]     │
├─────────────────────────────────────────────────────────┤
│ SPECS + PHOTOS (read-only summary of what's editable)        │
├─────────────────────────────────────────────────────────┤
│ STATUS EXPLANATION (§6/§7 copy, incl. rejectionReason/         │
│  delistedReason if present)                                    │
├─────────────────────────────────────────────────────────┤
│ BOOKINGS ON THIS CAR (read-only)                              │
│  ┌───────────────────────────────────────────────┐          │
│  │ {renter name via PartyContact} [Badge: status]   │          │
│  │ {dates}                    ₹{totalAmount}         │          │
│  │ [Request cancellation] — only if status=CONFIRMED │          │
│  └───────────────────────────────────────────────┘          │
├─────────────────────────────────────────────────────────┤
│ "⋯ more" menu, conditional on availableActions[]:              │
│  Submit for review (DRAFT/REJECTED)                            │
│  Withdraw (PENDING_APPROVAL/APPROVED)                           │
│  Delist (LISTED)                                                │
│  Delete (DRAFT only, never-moderated, never-booked)             │
└─────────────────────────────────────────────────────────┘
```

- **Data source (list):** `GET /api/user/listings` (E-14), `scopeToActor('owner')`. Filter dropdown maps to repeatable `moderationStatus`/`listingState` query params.
- **Data source (detail):** `GET /api/user/listings/:carId` (E-15) → `OwnerCar & { bookings: BookingSummary[], upcomingLocks }`. The `bookings` array is what populates the read-only bookings section — **no separate fetch**.
- **"Read-only except…" rule (spec 03 §1.7, §2.4 E-19):** every booking row on this page is display-only, with exactly one exception — a `CONFIRMED` booking shows a **[Request cancellation]** button, because `guardIsRenterOrCarOwner` (E-19) permits the car owner too. This is the **only** write this page performs against a `Booking`. It does **not** release the car (spec 02 E-19's own note) — copy must say so (§7).
- **Actions menu**, driven by `availableActions[]` (spec 02 §7.2's advisory field) rather than hand-computed client logic, so the button set tracks the server's transition registry automatically:
  - **Submit for review** → `POST /api/user/listings/:carId/submit` (E-11). On `409 GUARD_FAILED` (`guardListingComplete`), surface `details.missing[]` as a field-by-field checklist, not a generic error.
  - **Withdraw** → `POST /api/user/listings/:carId/withdraw` (E-12). Confirm dialog explains that a `LISTED` car cannot be withdrawn directly — the button is simply absent in that state per `guardNotListed`, and the UI should show "Delist first" as a disabled-state tooltip rather than let the click round-trip into a guard failure.
  - **Delist** → `POST /api/user/listings/:carId/delist` (E-13), requires a `reason` (1–500 chars) in the confirm dialog. On `409 GUARD_FAILED` (`guardNoLiveRental`/`guardNoFutureConfirmedBooking`), show which bookings are blocking it (`details.bookingIds[]`) with links into the bookings section on the same page.
  - **Delete** → `DELETE /api/user/listings/:carId` (E-16), only ever enabled for a `DRAFT` car that was never moderated, never published, and has zero bookings ever (`guardNeverModerated`/`guardNeverPublished`/`guardNoBookingsEver`). Everywhere else this option is absent, not disabled-with-tooltip — a car with any history should not even suggest deletion is possible; **Delist** is the retirement path (spec 02 E-16's own framing).
  - **Edit** → `/account/listings/:carId/edit`. Per spec 02 E-10's `guardEditableModerationState`, only reachable in the UI when `moderationStatus ∈ { DRAFT, REJECTED }`; for `APPROVED`/`PENDING_APPROVAL`/anything `LISTED`, the button is replaced by a disabled state whose tooltip explains the exact path (Withdraw first, if `APPROVED`; wait for review, if `PENDING_APPROVAL`) rather than linking to an edit form that will 409.
- **Empty state:** "You haven't listed a car yet." + CTA to `/account/listings/new`.
- **Loading / error states:** as elsewhere — skeleton, `EmptyState` retry panel.
- **Unauthorized state:** route-level redirect (§1); someone else's listing is `404` (E-15), rendered as the shared not-found page.

### 3.7 Create/Edit Listing (`/account/listings/new`, `/account/listings/:carId/edit`) — **new**

One form component, two modes (`create` / `edit`), because the field set is identical (spec 02 E-10: *"every field of `createCarDto`, all optional"*).

```
┌─────────────────────────────────────────────────────────┐
│ Account shell                                               │
├─────────────────────────────────────────────────────────┤
│ H1 "List a car" / "Edit listing"                            │
├─────────────────────────────────────────────────────────┤
│ VEHICLE                                                      │
│  make · model · year · registrationNumber · color?           │
│  transmission (select) · fuelType (select) · seats · mileageKm│
├─────────────────────────────────────────────────────────┤
│ LOCATION                                                      │
│  city · state                                                 │
├─────────────────────────────────────────────────────────┤
│ PRICING                                                        │
│  rentalPricePerDay · rentalPricePerWeek? · depositAmount?      │
│  (spec 04 §2.1 — weekly rate validated < 7× daily client-side, │
│   mirroring the DTO's own rule, before it ever reaches the      │
│   server)                                                        │
├─────────────────────────────────────────────────────────┤
│ DESCRIPTION (optional, textarea)                                │
├─────────────────────────────────────────────────────────┤
│ PHOTOS  — edit mode only, see note below                        │
│  drag/drop or file picker → upload progress → thumbnail grid    │
│  with per-photo remove (design/02-image-storage.md)              │
├─────────────────────────────────────────────────────────┤
│ [Save draft] [Submit for review →]                               │
└─────────────────────────────────────────────────────────┘
```

**Photo upload sequencing — flagged as a genuine ordering conflict, not silently resolved:**

- Spec 02's `createCarDto` (E-09) requires `images[≥1]` **in the creation body itself**.
- `docs/design/02-image-storage.md`'s upload endpoint (`POST /api/user/listings/:carId/images`) requires an **existing** `carId`, is owner-scoped, and is the **only** way images reach Cloudinary — there is no "upload first, attach later" path and no raw-URL text field anywhere else in the contract.
- These two facts are mutually exclusive for a **first-time** create: the car cannot be created without an image, and the image cannot be uploaded without the car existing.
- **OPEN QUESTION — `BLOCKING` for this page.** This document assumes the practical resolution: **`POST /api/user/listings` (E-09) is called with `images: []`** (i.e., the DTO's `images[≥1]` constraint is relaxed to allow empty at creation), the car is created in `DRAFT`, the user is routed straight into edit mode, and the **photo section only appears once a `carId` exists** — which for a brand-new listing means immediately after the initial create call, not as a separate screen. `guardListingComplete` at submit-time (E-11) is what actually enforces "≥1 image before this can go to `PENDING_APPROVAL`" — which spec 02 E-11 already documents as a submit-time guard, so the enforcement point without the relaxation is not a new invention, only a DTO change. **This needs a spec 02 amendment before implementation, per `CLAUDE.md`'s "never modify specs while implementing" — flagging here, not resolving in code.**
- Until that amendment lands, the **Create** flow in this document is: **Step 1** — a minimal form (vehicle + location + pricing + description, no photos) submits `POST /api/user/listings`; **Step 2** — on success, the user lands on `/account/listings/:carId/edit` where the photo section is now live and the **Submit for review** button is disabled with a tooltip ("Add at least one photo") until `images.length ≥ 1`, mirroring `guardListingComplete`'s own condition client-side.
- **Photo upload UX, once a `carId` exists:** multi-file select, client-side pre-validation matching design/02's server rules exactly (MIME ∈ `{jpeg, png, webp}`, ≤ 5 MB/file, count ≤ `SystemConfig.listing.maxImagesPerCar`) so a rejection is instant rather than a round trip; per-file progress; failed files stay in a retry state rather than silently dropping. Reordering — spec/design says nothing about a display-order field beyond the `images` array's own order and `primaryImageUrl` being "first" (spec 02 §7.2) — so drag-to-reorder within the thumbnail grid, persisted via the same `PATCH .../images` full-array-replacement mechanism `docs/design/02-image-storage.md` §"Non-goals" describes for removal. **OPEN QUESTION:** confirm array order is genuinely load-bearing for `primaryImageUrl`, or whether the server picks the primary image by some other rule.
- **Registration number:** normalized upper-case display, but the input accepts mixed case (server uppercases — spec 01 §1.3). Uniqueness conflict (`409 CONFLICT { field: "registrationNumber" }`, from either E-10 or E-11 depending on when the collision is checked, spec 02 §10.1's D3 note) surfaces as an inline field error, not a toast.
- **Save draft vs. Submit for review:** "Save draft" always calls `PATCH` (edit) — it never transitions status. "Submit for review" saves any pending field changes **then** calls `POST .../submit` (E-11) as a second request; if the save fails, submit is not attempted. **OPEN QUESTION:** should this be a single combined action server-side, or is the two-call sequence acceptable? This document assumes two calls is fine since both are idempotent from the UI's perspective and a partial failure (saved but not submitted) leaves the car in a perfectly valid `DRAFT` state the user can retry submitting from.
- **Empty state:** N/A (form).
- **Loading state:** field-level skeleton on initial edit-mode load (fetching E-15's data to prefill); submit buttons show busy state during their respective calls.
- **Error state:** `VALIDATION_FAILED` → inline per-field errors from `details.fieldErrors` (spec 02 §3.3). `GUARD_FAILED` (`guardEditableModerationState`) → this should be structurally unreachable per the button-hiding rule in §3.6, but if hit (stale tab), show a full-page interstitial: "This listing has moved out of an editable state" + link back to `/account/listings/:carId`.
- **Unauthorized state:** route-level redirect (§1) for logged-out; someone else's `carId` in the URL is `404` (`guardIsOwner`), shared not-found page.

### 3.8 Profile (`/account/profile`) — **new**

```
┌─────────────────────────────────────────────────────────┐
│ Account shell                                               │
├─────────────────────────────────────────────────────────┤
│ H1 "Profile"                                                 │
├─────────────────────────────────────────────────────────┤
│ ACCOUNT                                                       │
│  Name (editable) · Email (read-only, with note why)           │
│  Phone (editable)                                              │
├─────────────────────────────────────────────────────────┤
│ DRIVING LICENCE                                                │
│  Licence number (editable, format-validated only — no image)   │
│  helper text: "We don't verify this — an admin may check it     │
│  against your physical licence when you pick up a car."         │
├─────────────────────────────────────────────────────────┤
│ [Save changes]                                                 │
├─────────────────────────────────────────────────────────┤
│ SESSION                                                          │
│  [Log out] [Log out of all devices] (spec 03 §9.5–9.7, if in scope│
│   for this session — otherwise flagged as a follow-up)            │
└─────────────────────────────────────────────────────────┘
```

- **Data source:** `GET /api/user/profile` (E-25) → `UserSummary & { createdAt }`, extended with `drivingLicence.number` per spec 03 §5.3/§5.5 (note: E-25's response shape in spec 02 predates the licence-number field; this document assumes spec 03's addition to `updateProfileDto`/user shape is mirrored on the read side too — **OPEN QUESTION**, since spec 02 never amended `UserSummary` to include it explicitly and spec 03 §5.5 only lists `PATCH /api/user/profile` as gaining the licence fields, not `GET`).
- **Save action:** `PATCH /api/user/profile` (E-26), body `{ name?, phone?, drivingLicenceNumber? }` — min one key. Explicitly **not** editable here: email, role, `isActive` — the form has no fields for them at all, not disabled fields, so there is nothing to explain away (spec 02 E-26, spec 03 AUTHZ-4). The email field is present read-only with a one-line "why": *"Email can't be changed here — contact support if you need it updated."*
- **Licence number field:** free text, 8–20 chars, `[A-Z0-9- ]`, uppercased on blur to match server normalization (spec 03 §5.4). The helper text is load-bearing copy (§7) — it is the one place in the whole product a user might otherwise assume this field is a verification step, and it must say plainly that it is not.
- **Empty state:** N/A.
- **Loading state:** field skeletons.
- **Error state:** `VALIDATION_FAILED` inline; `409 CONFLICT { field: "phone" }` inline on the phone field.
- **Unauthorized state:** route-level redirect (§1).

---

## 4. Component hierarchy

Existing atoms (`client/src/components/ui/*`) are reused, not redefined. New molecules/organisms are additive.

```
ATOMS (existing, reused everywhere below)
├── Button, Input, Select, Textarea, Field, Badge, Card, Modal, Toast, Avatar
├── icons.ts (add: CalendarIcon, UploadIcon, PhoneIcon if not already present —
│   needed by BookingDetail's contact block and the photo uploader)

MOLECULES
├── (existing, public) CarCard, CarCardSkeleton, EmptyState, FilterPanel
├── StatusBadge                          — wraps Badge; maps a domain status string
│                                            (Car.moderationStatus/listingState,
│                                            Booking.status, Payment.status) to
│                                            {status, label} per §6's table. One
│                                            function, used by every dashboard,
│                                            listing detail, and booking detail.
├── DateRangePicker                      — used by Listing Detail (readonly display
│                                            of blocked days), Booking Request Flow
│                                            (selectable), Search (new — the missing
│                                            availableFrom/To filter, §0)
├── PriceQuote                           — renders spec 04 §2.2's breakdown
│                                            (days × rate, or blended weekly),
│                                            used by Listing Detail (price display)
│                                            and Booking Request Flow (preview)
├── PartyContactCard                     — renders {name, phone?} with the
│                                            "not yet revealed" fallback copy (§3.5)
├── ConfirmDialog                        — wraps Modal; used by every destructive/
│                                            state-changing action (cancel, withdraw,
│                                            delist, request-cancellation, delete)
├── PhotoUploader                        — drag/drop + file picker + progress +
│                                            thumbnail grid with remove/reorder,
│                                            per design/02-image-storage.md
├── ListingStatusExplainer               — the two-badge (moderation + listing state)
│                                            plus explanatory paragraph block (§6, §7)
└── BookingWarningBadges                 — dateConflict / stale / competingRequestCount
                                             indicators (spec 04 §1.4), used on
                                             Renter Dashboard rows + detail

ORGANISMS
├── (existing, public) PublicHeader, PublicFooter, PublicLayout
├── AccountShell                          — header + nav (My requests / My listings /
│                                             Profile) + content outlet, used by every
│                                             /account/* route and the booking-request
│                                             flow
├── PhotoGallery                          — Listing Detail's main image + thumbnails
├── AvailabilityCalendar                  — month-grid calendar rendering blocked
│                                             days uniformly (§3.3's leakage rule);
│                                             read-only mode (Listing Detail) and
│                                             selectable mode (Booking Request Flow)
│                                             share one component with a `mode` prop,
│                                             so the blocked-day rendering can never
│                                             drift between the two surfaces
├── ListingCard (account)                 — Owner Dashboard row (distinct from public
│                                             CarCard — carries moderation/listing
│                                             badges CarCard never shows)
├── BookingCard (account)                 — Renter/Owner Dashboard row
├── ListingForm                           — Create/Edit Listing's full form, mode
│                                             prop (`create`/`edit`)
└── BookingRequestForm                    — date selection + PriceQuote + confirm,
                                              the Booking Request Flow's core
```

**Reuse map, stated explicitly per the brief's ask:**

| Component | Home | Search | Listing Detail | Booking Request | Renter Dash | Owner Dash | Create/Edit | Profile |
|---|---|---|---|---|---|---|---|---|
| `CarCard` | ✓ | ✓ | | | | | | |
| `EmptyState` | ✓ | ✓ | ✓ | | ✓ | ✓ | | |
| `StatusBadge` | | | | | ✓ | ✓ | ✓ (via ListingStatusExplainer) | |
| `AvailabilityCalendar` | | | ✓ (readonly) | ✓ (selectable) | | | | |
| `PriceQuote` | | | ✓ | ✓ | | | | |
| `PartyContactCard` | | | | | ✓ | ✓ | | |
| `ConfirmDialog` | | | | | ✓ | ✓ | | |
| `PhotoUploader` | | | | | | | ✓ | |
| `AccountShell` | | | | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## 5. Empty / loading / error / unauthorized states, per page

| Page | Empty | Loading | Error | Unauthorized |
|---|---|---|---|---|
| Home | "No cars listed yet" (zero published cars — a real early-launch state, not a bug) | 8× `CarCardSkeleton` | "Couldn't load listings" + implicit retry (react-query refetch) | N/A (no auth) |
| Search | "No cars match your filters" + "Clear all filters" (only if a filter is active) | 6× `CarCardSkeleton` | "Couldn't load cars" | N/A |
| Listing Detail | N/A (single resource) | Two-column skeleton | "Couldn't load this listing" + "Back to search" | N/A. **404** (nonexistent or not public — indistinguishable, spec 02 E-07) → shared **NotFoundPage**: "This car isn't available anymore" + "Back to search". Never a bare browser 404. |
| Booking Request Flow | N/A (form) | Form-field skeleton while E-07/E-08 load | Guard-failure copy table (§3.4); generic retry for 5xx | Redirect to `/login?next=…` if logged out. `car.status` changed mid-flow → treated as a guard failure (`guardCarPubliclyBookable`), same copy row as an ordinary guard failure, not a separate crash state. |
| Renter Dashboard (list) | "You haven't requested any cars yet." + CTA to `/cars` | Skeleton rows | "Couldn't load your requests" + retry | Redirect to login. |
| Renter Dashboard (detail) | N/A | Skeleton detail card | "Couldn't load this request" + retry | Redirect to login if logged out. **404** (not this user's booking, spec 02 §3.4 rule 2) → shared NotFoundPage. |
| Owner Dashboard (list) | "You haven't listed a car yet." + CTA to `/account/listings/new` | Skeleton rows | "Couldn't load your listings" + retry | Redirect to login. |
| Owner Dashboard (detail) | N/A | Skeleton detail card | "Couldn't load this listing" + retry | Redirect to login. **404** (not owned) → shared NotFoundPage. |
| Create/Edit Listing | N/A (form) | Field skeletons (edit mode prefill) | `VALIDATION_FAILED` inline; `GUARD_FAILED` (editable-state) full-page interstitial (§3.7) | Redirect to login. **404** (edit, not owned) → shared NotFoundPage. |
| Profile | N/A | Field skeletons | `VALIDATION_FAILED`/`CONFLICT` inline | Redirect to login. |

**One shared `NotFoundPage`** is used for every 404 above, with copy varying only by a passed-in message prop — never a bespoke 404 per page, and never a distinguishable-from-403 message anywhere (spec 02 §3.4 rule 2's whole point).

---

## 6. Status display rules

Per `docs/design/03-design-system.md` §2.3 and the existing `Badge` component (§0), one color family per real state, icon + text always together, never color alone. This table is the **join point** — it says which `Badge status` prop and which label copy each domain status gets. If spec 04 or a future amendment adds a state, this table gets a new row before any component renders it (mirroring §2.3's own governance rule).

### 6.1 `Car.moderationStatus`

| Status | `Badge status` | Label | Explanatory copy (shown alongside, not just the badge) |
|---|---|---|---|
| `DRAFT` | `neutral` | "Draft" | "Not submitted for review yet." |
| `PENDING_APPROVAL` | `pending` | "Under review" | "An admin is reviewing this listing. You'll see it here once it's approved or if it needs changes." |
| `APPROVED` | `success` | "Approved" | If also `UNLISTED`: "Approved, but not published yet." If `LISTED`: subsumed by the listing-state badge instead (§6.2) — do not show both "Approved" and "Listed" as if they were competing states; the listing-state badge is primary once `LISTED`. |
| `REJECTED` | `danger` | "Changes needed" | Always paired with `rejectionReason` verbatim: *"An admin asked for changes: '{rejectionReason}'"*. Never show `REJECTED` without the reason — the field is `required` server-side for exactly this purpose (spec 01 §1.3). |

### 6.2 `Car.listingState`

| Status | `Badge status` | Label | Explanatory copy |
|---|---|---|---|
| `UNLISTED` | `inactive` | "Not listed" | "Not visible to renters yet." |
| `LISTED` | `success` | "Listed" | "Visible to renters and bookable now." |
| `DELISTED` | `inactive` | "Delisted" | Paired with `delistedReason` if present: *"Delisted: '{delistedReason}'"*. |

### 6.3 `Booking.status`

| Status | `Badge status` | Label | Explanatory copy |
|---|---|---|---|
| `REQUESTED` | `pending` | "Requested" | **Always** append RULE AV-2's copy: *"This is a request, not a confirmed booking — an admin still needs to review it."* Never show the bare word "Requested" without this sentence nearby on any surface (dashboard row **and** detail). |
| `CONFIRMED` | `success` | "Confirmed" | "Your booking is confirmed. Meet the owner in person on your start date to pick up the car and pay." |
| `REJECTED` | `danger` | "Rejected" | Paired with `rejectionReason`: *"This request was declined: '{rejectionReason}'"*. |
| `ACTIVE` | `success` | "In progress" | "The car has been handed over. It's due back on {endDate}." |
| `CANCELLATION_REQUESTED` | `warning` | "Cancellation requested" | "A cancellation request is pending admin review. The booking stays confirmed and the car stays held until then." |
| `COMPLETED` | `success` | "Completed" | "This rental is finished." |
| `TERMINATED` | `danger` | "Ended early" | Paired with `terminationReason` if present. |
| `CANCELLED` | `danger` | "Cancelled" | Paired with `cancellationReason` if present. |
| `NO_SHOW` | `danger` | "No-show" | "Marked as a no-show by an admin." |

**Additional non-status flags, rendered as small warning chips alongside the status badge, never replacing it:**

| Flag | `Badge status` | Label | Shown when |
|---|---|---|---|
| `dateConflict.conflicted` | `warning` | "Dates contested" | `status = REQUESTED` and another booking now holds one of these days. |
| `stale` | `warning` | "Can no longer be confirmed" | `status = REQUESTED` and `startDate` has passed. |
| `competingRequestCount > 0` | (text, no badge) | "{n} other request(s) on these dates" | `status = REQUESTED`, shown once in the detail view, not repeated per row in the list. |

### 6.4 `Payment.status` (shown only where a renter can see `amountReceived` on their own booking — no `PaymentRecord` ledger is ever shown outside admin, spec 02 E-21)

| Status | `Badge status` | Label |
|---|---|---|
| `PENDING` | `pending` | "Payment pending" |
| `SETTLED` | `success` | "Payment received" |
| `VOID` | `inactive` | "Voided" |

This document does **not** design a full payment ledger UI for the renter/owner surface — spec 02 explicitly withholds `PaymentRecord` from non-admins (OQ-17). The only payment-adjacent thing a renter/owner sees is `Booking.amountReceived` as a plain figure next to `totalAmount` on the booking detail (§3.5).

---

## 7. Copy rules for the offline flow

There is no payment gateway and no online finalization anywhere in this product. Every screen that could be mistaken for "this is now handled" must say, in words, what actually still has to happen in person. These rules are cumulative with §6's per-status copy, not a replacement for it.

1. **"Requested" never means "booked."** (RULE AV-2, spec 04 §1.4.) Every rendering of a `REQUESTED` booking — dashboard row, detail page, the confirmation toast right after submitting — must include a sentence to that effect, not rely on the badge color. This is the single most important copy rule in the document because it is the one place a user's money-and-time expectations could be set wrong.

2. **"Confirmed" means "meet in person," not "done."** The moment a booking reaches `CONFIRMED`, the copy must tell the renter what happens next: meet the owner, inspect the car, hand over payment, at pickup. Never phrase `CONFIRMED` as if the transaction is complete — it is the point at which the *in-person* transaction becomes scheduled, not executed.

3. **Every price shown before `CONFIRMED` is a quote, never a charge.** The Booking Request Flow's `PriceQuote`, the Listing Detail's per-day rate, and the dashboard's `totalAmount` are all labelled or captioned as an estimate/total-due, never "charged," "paid," or "billed" — those words are reserved for `amountReceived` once an admin has recorded a payment (spec 04 §"No payment gateway": *"every amount it stores as received is an admin's assertion that cash arrived"*).

4. **Cancellation copy must match what actually happens to the car.** `Cancel request` (E-18, on `REQUESTED`) copy: *"withdraws your request — nothing was ever held, so nothing changes for the owner."* `Request cancellation` (E-19, on `CONFIRMED`) copy: *"asks an admin to cancel this booking. The car stays reserved until an admin decides — this doesn't cancel it immediately."* These two must never share wording, because they do materially different things (spec 02 E-18 vs. E-19).

5. **Contact reveal has an explicit "why."** Wherever a name-only party contact is shown pre-`CONFIRMED` (§3.5, §3.6), the copy explains *why* the phone number is withheld — *"Contact details appear once your request is confirmed"* — rather than just omitting the field. An omitted field with no explanation reads as broken; an explained omission reads as intentional trust design.

6. **The driving licence field is data, not a check.** Per §3.8 and spec 03 §5.4's own instruction ("stated plainly so nobody later mistakes this field for an identity control"), the Profile page's helper text must say the platform does not verify it. This is the one place in the product most likely to accidentally imply a security guarantee that does not exist, and the copy is load-bearing against that.

7. **Admin-approval language is scoped to the car, never to the person.** Per §0's flagged Home-page issue: "admin-approved" describes the *listing content* (spec 02 §9's `moderationStatus = APPROVED`), never the renter's or owner's identity. No copy anywhere may say or imply "verified owner," "verified renter," "ID-checked," or similar — there is no such check (spec 04 §X-E).

8. **A blocked calendar day never explains itself.** Per §3.3's calendar rendering rule, no copy — tooltip, label, or otherwise — may say *why* a day is unavailable to a public or renter-side viewer. "Unavailable" is the entire vocabulary; "booked," "under maintenance," "held," etc. are admin-only words (spec 02 E-08's leakage rule).

9. **Every guard failure gets human copy, never a raw code.** Per the Booking Request Flow's guard table (§3.4) and design's own stated intent (spec 02 §3.1: *"the admin UI can say 'cannot activate: payment not settled' instead of '409'"*) — the same courtesy extends to the public/user surface. No screen in this document ever renders a bare `error.code` or `error.message` from the API as user-facing text without translating it through a copy table first; `message` is developer-safe-to-show but not necessarily *good* to show verbatim (it is written for an admin operator's mental model in several cases, e.g. `GUARD_FAILED` messages).

---

## 8. Open questions (consolidated)

Restating every `OPEN QUESTION` raised inline above, in one place, per the brief's instruction to mark ambiguities rather than resolve them silently:

1. **`BLOCKING`** — Photo-upload sequencing conflict (§3.7): `createCarDto` requires `images[≥1]` but the image-upload endpoint requires an existing `carId`. Needs a spec 02 amendment (relax `images` to allow empty at creation) before Create Listing can be implemented as designed.
2. Home page copy: "admin-approved" phrasing risks implying identity verification that doesn't exist (§0, §7 rule 7). Recommend a copy pass, not a structural change.
3. Search page: `availableFrom`/`availableTo` date-range filter is speced (spec 02 §9) but not implemented (§0). Recommend a follow-up task.
4. `/account` bare route: redirect to `/account/bookings`, or a combined summary landing? This document assumes redirect (§1).
5. "You'll be notified" copy in the booking-confirmation toast (§3.4) — confirm a notification channel actually exists; if not, soften to "check My Requests."
6. Photo array order and `primaryImageUrl` selection (§3.7) — confirm order is load-bearing, or find the actual selection rule.
7. Two-call "save then submit" sequencing for listing submission (§3.7) — confirm acceptable, or request a combined server-side action.
8. `GET /api/user/profile` (E-25) — does its response actually include `drivingLicence.number`, given spec 03 §5.5 only documents the field landing on the `PATCH` DTO? (§3.8)
9. Session management screens (log out everywhere, list active sessions — spec 03 §9.5–§9.7, E-63–65) — in scope for the Profile page's first build, or a follow-up? This document sketches a placeholder section (§3.8) without fully specifying it, pending confirmation.
