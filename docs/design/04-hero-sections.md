# 04 — Hero Sections (all public pages)

Status: DRAFT — for review before any component code.
Reads: `specs/05-ui-ux-public.md` (page inventory, existing Home hero), `docs/design/03-design-system.md` (tokens — single source of truth for color/type/spacing used below).
Feeds: a `PageHero` component shared across every public page.

> Scope note: `specs/05-ui-ux-public.md` §2 lists the page inventory this document covers. "Service" and "About us" (present in the built nav) are not yet in that inventory — add them there first if a hero is needed for either; this file does not invent new pages.

---

## 1. Why one shared component

Every public page currently either has a custom hero (Home) or none (Search/Browse, and by extension the rest). Rango is a small, admin-run operation, not a marketing site with a different hero treatment per landing page — one `PageHero` component, reused everywhere with page-specific copy, keeps the "trustworthy, premium, confident" mood (design system §1) consistent and avoids seven one-off hero implementations drifting apart.

`PageHero` takes props: `eyebrow?`, `title`, `subcopy?`, `backgroundImage?` (falls back to `brand-primary` flat color when omitted), `actions?` (0–2 buttons).

---

## 2. Shared layout prompt (applies to every page below)

- Full-width band directly under `PublicHeader`. Height: `min-h-[340px]` mobile, `min-h-[440px]` `sm`, `min-h-[520px]` `lg`+ — never a fixed unresponsive `px` height, uses `min-h` so content can still grow it.
- Background: `backgroundImage` prop renders as a `background-image` div; when not yet supplied, render `bg-brand-primary` (`#0B3B2E`) as the flat fallback. Leave a `{/* TODO: background image */}` marker in code until an image is chosen per page.
- Overlay: `surface-overlay` (`rgba(24,22,19,0.55)`) gradient between image and text, always present (even over the flat-color fallback, for consistency when the image is later added) — keeps text AA-legible regardless of photo content.
- Content: left-aligned, vertically centered, clamped to the `2xl` container width, `space-6`/`space-8` side gutters.
- Eyebrow (optional): `text-caption`, uppercase, tracking-wide, `brand-accent` (`#B8763E`).
- Title: `text-display-md`, Fraunces 600, white.
- Subcopy (optional): `text-body-lg`, Public Sans 400, `neutral-100`.
- Actions (optional, 0–2 buttons): primary = `brand-accent` filled button; secondary = outline/ghost on the dark background. Only Home uses two actions today.
- No search/filter inputs, no card previews, no collage imagery inside the band — flat photographic/color band + text only, per design system's restraint rule (§1).
- Responsive: stack eyebrow/title/subcopy/actions on mobile, reduce height, keep overlay contrast identical.

Do not introduce any color, font, radius, or shadow value outside `docs/design/03-design-system.md` — this is a reuse of existing tokens, not a new style.

---

## 3. Per-page copy

| Page | Eyebrow | Title | Subcopy | Actions |
|---|---|---|---|---|
| **Home** | — | "Rent or resell, without the runaround" *(placeholder — keep existing Home hero copy if already written; do not duplicate spec)* | Explains no-payment/offline-handover model (per spec §3.1 existing copy) | "Browse cars", "List your car" |
| **Search / Browse** | "ADMIN-APPROVED LISTINGS" | "Browse cars" | "Every car below is admin-approved and currently listed." | none |
| **Listing Detail** | — | *(car make/model, rendered dynamically — not static copy)* | none (detail content follows below the fold) | none |
| **Booking Request Flow** | "REQUEST, NOT RESERVATION" | "Request a booking" | "Confirmation and payment both happen in person once the owner accepts." | none |
| **Renter Dashboard** | — | "Your bookings" | "Track every request you've made, from pending to completed." | none |
| **Owner Dashboard** | — | "Your listings" | "See moderation status and bookings for every car you've listed." | none |
| **Create/Edit Listing** | — | "List your car" | "Submit your car for admin approval before it goes live." | none |

Listing Detail is the one exception: its hero renders the car's own name/photo dynamically (from `GET /api/public/cars/:id`, spec 02) rather than static copy — treat its `backgroundImage` as the car's primary photo once that endpoint is wired in, not a stock background.

---

## 3.1 Browse Cars — implemented

`PageHero` is wired into `client/src/pages/public/Search.tsx` with the copy from §3 above and a sourced `backgroundImage` (`https://res.cloudinary.com/gitn9iob/image/upload/v1789912528/Gemini_Generated_Image_by8x9cby8x9cby8x.png`). Prompt used to generate the original attempt, kept for reference / regeneration:

> A wide-angle photo of a small, well-kept fleet of 5–6 clean, modern cars (mixed sedans and SUVs, mostly white/silver/grey) parked in neat diagonal rows in an open outdoor lot at golden hour, low warm sunlight raking across the vehicles, long soft shadows, a plain paved lot with faint white parking-line markings, no visible people, no logos or license plates legible, no text or watermarks, shallow depth of field with the nearest car slightly sharper than the back row, muted natural color grading (desaturated warm tones, not oversaturated/HDR), cinematic but understated — trustworthy operational fleet photography, not a flashy car-ad hero. Horizontal 16:9, generous empty sky/negative space in the upper-left third of the frame for overlaid white text. No blue or purple color cast.

**Revised, brand-matched prompt (2026-09-20 amendment)** — the first-generated image (`v1789912052`) reads as a generic bright-orange sunset stock photo; it doesn't carry the design system's British-racing-green + brass palette (`docs/design/03-design-system.md` §1.1/§2.1). Regenerate with:

> A wide-angle photo of a small, well-kept fleet of 5–6 clean, modern cars (mixed sedans and SUVs, mostly white/silver/pewter) parked in neat diagonal rows in an open lot, photographed at dusk/blue-hour transition so the sky and distant tree line sit in deep, desaturated racing-green shadow (`#0B3B2E` family) rather than bright orange, with warm brass/copper rim-light (`#B8763E` family) catching the car bodies and glass from a low side angle — like a single warm garage floodlight or the last low sun, not a full orange sky. Long soft shadows, plain paved lot with faint white line markings, no visible people, no legible logos or plates, no text or watermarks. Shallow depth of field, nearest car slightly sharper than the back row. Overall grade: deep green midtones/shadows, warm amber-brass highlights, muted and cinematic — heritage-automotive mood, not a bright travel-brochure sunset. Horizontal 16:9, upper-left third kept dark and visually quiet (sky/negative space) for overlaid white text.

Notes (kept for regeneration):
- Keep the upper-left third visually quiet (sky, blurred background) — that's where the eyebrow/title/subcopy render (`PageHero` overlay handles contrast, but a busy image there still fights legibility).
- Avoid any single "hero car" close-up — this is the fleet-overview page, not a listing detail page; a lineup reads as inventory, matching the "7 cars found" grid immediately below it.

#### 3.1.2 Browse Cars hero — 3-image crossfade

`PageHero` gained an optional `backgroundImages: string[]` prop (takes precedence over the single `backgroundImage`). When 2+ images are given, they crossfade every 3s (`SLIDE_INTERVAL_MS`), frozen on the first image for `prefers-reduced-motion` visitors — same convention as `VideoHero`'s own reduced-motion handling.

Browse Cars is wired with all 3 images now: `v1789912528` (dusk fleet lineup), `v1789916056`, `v1789916057` — the latter two generated from an aerial/top-down variant prompt (below) after the first daytime-lighting attempt read as too similar to image 1.

**Prompt 2 (daytime companion to the existing dusk shot):**

> A wide-angle photo of the same kind of small, well-kept fleet (5–6 clean modern cars, mixed sedans/SUVs, mostly white/silver/pewter) parked in neat diagonal rows in an open lot, but shot in overcast, soft midday light instead of dusk — flat, even, shadowless lighting, muted desaturated colors leaning toward racing-green in the pavement/sky rather than warm amber, no harsh sun, no blue sky visible (overcast grey-green sky). No visible people, no legible logos or plates, no text or watermarks. Shallow depth of field, nearest car sharper than the back row. Calm, operational, trustworthy mood — a fleet ready and waiting, not a lifestyle ad. Horizontal 16:9, upper-left third kept quiet/low-contrast for overlaid white text.

**Prompt 3 (closer, single-car variant for rotation variety):**

> A photo of one clean, modern SUV or sedan (white or pewter) parked at a slight three-quarter angle in the same open paved lot, shot at dusk with warm brass/copper light raking across the body panels and deep racing-green shadow in the background trees/sky, long soft shadow on the pavement, no people, no legible logo or plate, no text or watermarks, shallow depth of field with soft-blurred lot and a couple of indistinct parked cars in the far background. Same color grading as the fleet shot (deep green shadows, warm amber highlights, no blue/purple cast) so it slots into the same rotation. Horizontal 16:9, right-weighted composition so the car doesn't overlap the overlaid text on the left.

## 3.1.1 Browse Cars hero — quick-search card

`PageHero` gained an optional `content` slot (freeform `ReactNode`, rendered below `actions`, no imposed layout) so a page can drop in something bespoke instead of being limited to eyebrow/title/subcopy/button-row. Browse Cars uses it for a white quick-search card sitting on the hero image — a real-inputs "City" + "Transmission" pair wired to the same `FilterState` the sidebar/drawer use, a "Search" button that smooth-scrolls to `#results`, and below it a "Ready to drive today?" line with a "Book now" button (also scrolls to `#results` — there's no single car chosen yet at this point, so it can't jump straight to a booking flow per spec 04's request-not-reservation model; it points the visitor at the listings instead of implying a real reservation).

This mirrors a doctor-directory-style hero (quick search + a bold secondary CTA) that was given as a reference image, reworked with brand tokens (`surface-card`, `brand-accent`, `radius-sm`) instead of the reference's own blue/rounded-pill styling — kept in the same restrained, non-bubble language as the rest of the design system (§5).

## 3.2 Browse Cars — pre-footer section

`PreFooterSection` (already used on Home) was made reusable via `eyebrow`/`heading`/`body`/`showBrowseCta` props and added to the bottom of `Search.tsx`, above `PublicLayout`'s footer. On Browse Cars it reads:

- Eyebrow: "Have a car of your own?"
- Heading: "List it, and let an admin get it in front of real renters."
- Body: "Every listing is reviewed before it goes public — no payment gateway, no unvetted cars, handover happens in person."
- `showBrowseCta={false}` — the "Browse available cars" button is hidden here since the visitor is already on that page; only "List your car" remains.

`PreFooterSection` now takes an optional `backgroundImage` prop (defaults to the shared `PRE_FOOTER_IMAGE_URL` used by Home). Browse Cars passes its own sourced image: `https://res.cloudinary.com/gitn9iob/image/upload/v1789912349/ChatGPT_Image_Sep_20_2026_07_22_18_PM.png`.

Prompt used to generate it, kept for reference / regeneration:

> A single clean, modern car (white or silver sedan or SUV) parked in front of a plain garage or gated residential driveway at dusk, warm porch/garage light spilling out, the car's owner's hand visible mid-frame holding out a car key toward camera (handover gesture, no face/identity visible), soft focus background, warm amber and deep green color grading, no other cars in frame, no logos or visible license plate, no text or watermarks, intimate and personal in tone (contrasts with the fleet-lineup hero image), cinematic but understated. Horizontal 16:9, with clear darker area in the lower-center/bottom third for overlaid white heading text and a button. No blue or purple color cast.

## 3.3 Listing Detail — implemented (supersedes §3's dynamic-photo note)

§3's original plan was for Listing Detail's hero to use the car's own photo as `backgroundImage` rather than a stock image. In practice (2026-09-20 session) the page was built to match Browse Cars' treatment instead — a static, brand-graded stock background shared across all cars, with the car's own photo staying in its existing large gallery below the hero (so the hero doesn't duplicate/compete with the actual product photo).

`PageHero` gained a `breadcrumb` slot (rendered above eyebrow/title) to carry the page's existing "Cars / {Model}" trail, which used to sit above the content grid on its own. `CarDetailPage` now renders:
- `breadcrumb`: "Cars / {make} {model}"
- `eyebrow`: "Admin-approved listing"
- `title`: "{make} {model} {year}"
- `subcopy`: "{city}, {state} · ₹{price} / day"
- `backgroundImage`: `https://res.cloudinary.com/gitn9iob/image/upload/v1789915305/Gemini_Generated_Image_wv0rrcwv0rrcwv0r.png` (its own dedicated image, distinct from Browse Cars' hero)

A `PreFooterSection` was added at the bottom (`showBrowseCta={false}`) with copy tailored to this specific car ("Ready to make the {make} {model} yours?" / "Request to book above — an admin reviews it…") and its own sourced `backgroundImage`: `https://res.cloudinary.com/gitn9iob/image/upload/v1789915336/Gemini_Generated_Image_jk6v9djk6v9djk6v.png`.

### Image-generation prompts

**Hero background** (behind the breadcrumb/title/price — the car's own photo stays in the gallery below, so this should feel like an atmospheric backdrop, not another car close-up):

> A softly out-of-focus, wide shot of an indoor car showroom or covered inspection bay at dusk, warm brass/copper spot-lighting on polished concrete floor, deep racing-green shadows in the background structure (steel beams, a parked car silhouette or two well out of focus), no legible text, logos, or license plates, no people, no single car in sharp focus — this is a backdrop, not a product shot. Muted, cinematic, heritage-automotive color grading (deep green shadows, warm amber highlights, no blue/purple cast). Horizontal 16:9, kept dark and low-contrast overall so white text and a small breadcrumb read clearly on top, left two-thirds especially quiet/negative-space.

**Pre-footer background** (page-specific version, to eventually replace the shared Home image via `PreFooterSection`'s `backgroundImage` prop):

> A close, warm-toned photo of two hands mid-handshake or exchanging a car key fob just outside a car door (door edge and window visible but blurred), shot at golden hour, no faces or identifying features visible, warm amber highlights on skin and the key fob with the car's paint rendered as a soft green-grey blur behind, no text, logos, or plates, intimate and trustworthy in tone — "the moment of an in-person handover," reinforcing the page's "no online payment, confirmed in person" copy. Horizontal 16:9, darker toward the bottom-center third for overlaid white heading text and a button. No blue/purple color cast.

## 4. Open items before implementation

- Background images themselves are **not sourced yet** for any page — every hero ships with the `brand-primary` flat fallback until real photography is chosen.
- Add "Service" and "About us" to `specs/05-ui-ux-public.md` §2 page inventory (with their own purpose/content rows) before giving them a hero here — this file intentionally does not speculate on their copy.
- This document does not change `specs/05-ui-ux-public.md`'s existing Home hero (§3.1) or Browse (§3.2) ASCII layouts — once `PageHero` is approved, those sections should be updated to reference `PageHero` instead of inlining hero markup, as a separate spec-amendment step.
