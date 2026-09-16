    # 03 — Design System

    Status: DRAFT — for review before any component code.
    Reads: `specs/05.5-admin-panel.md` (roles, states, action patterns), `docs/design/01-technical-design.md` (stack, entity states), `CLAUDE.md` (hard constraints).
    Feeds: every future frontend session. **This file is the single source of truth for color, type, spacing, radius, shadow, and breakpoint tokens.** No new color, font, or scale value is introduced anywhere in `/client` without first amending this document.

    > Note on numbering: `docs/design/02-image-storage.md` already occupies `02`. This document is `03` to keep the sequence unbroken, superseding the `02-design-system.md` path named in the original brief.

    ---

    ## 1. Mood and rationale

    Rango is a **rental logistics platform run by admins who gate every transition**, not a marketplace app or a SaaS dashboard. The brief for this system (spec 05.5, `CLAUDE.md`) is blunt about that: no online payment, no online KYC, everything offline and in person, nothing public until an admin approves it. The UI has to *feel* like the operational backbone of a real fleet business — closer to a well-run rental counter or a private members' garage than a startup landing page. Three words drive every decision below: **trustworthy, premium, confident.**

    Concretely, that rules out the two easiest defaults:
    - **No purple/blue gradient, no default Inter.** That vocabulary reads as "generic SaaS tool," which undersells a business built around a physical asset (a car) and a human process (an admin's judgment call at handover).
    - **No rounded-corner/soft-shadow-on-everything treatment.** Cars are precise machines with panel gaps and shutlines, not blobs. The system leans on flatter surfaces, restrained radii, and shadow used sparingly for genuine elevation (modals, popovers) rather than decoration.

    ### 1.1 Color choice: British racing green + brass

    **Primary — Racing Green (`#0B3B2E` family).** Deep, desaturated green has a century of automotive heritage (British racing green liveries, dashboard leather, garage signage) that reads as *established* rather than *trendy*. It is dark enough to carry authority in headers and admin chrome, distinct from every "trust blue" fintech uses, and doesn't compete with the amber/red semantic status colors the admin panel depends on (spec 05.5 §0.3's error/guard states, §1.2's queue severity).

    **Accent — Brass/Copper (`#B8763E` family).**  Warm metallic ochre, evoking dashboard trim, keys, and signage lettering. Used exclusively for primary actions and focus states — it is the one color that says "act here" against the green's otherwise cool, quiet backdrop. Brass reads premium without slipping into gold-and-luxury cliché, and it has enough contrast against racing green to anchor a CTA without needing a gradient.

    Neither color is default-blue, default-purple, or a violet/indigo SaaS tone. Together they read as *heritage automotive*, which is the entire point of the mood brief.

    ### 1.2 Typography choice: Fraunces + Public Sans

    **Display / headings — Fraunces.** A serif with soft, slightly wonky old-style details and heavy optical-size variation. It has editorial, confident weight at large sizes (hero type, page titles, price figures) without reading as a law-firm serif or a generic system serif. It signals "we are a considered, established business," not "we shipped an MVP."

    **Body / UI — Public Sans.** A humanist grotesk designed for dense, legible interface and document text (built for US government digital services, so it is battle-tested at small sizes and in data-heavy tables — exactly what the admin panel's queues and forms need). It is warmer and more distinct than Inter, System UI, or Helvetica-alikes, while staying quiet enough not to compete with Fraunces in headings.

    This is a real pairing, not "one Google font + Inter fallback": a display serif for moments that need confidence (marketing pages, car detail hero, price), a workhorse humanist sans for everything operational (forms, tables, admin queues, buttons).

    ---

    ## 2. Color tokens

    All colors defined as HSL triples for easy Tailwind `<alpha-value>` support, with hex given for reference. Token names are what both `tailwind.config` and any CSS custom properties use — never a raw hex in component code.

    ### 2.1 Brand

    | Token | Hex | HSL | Usage |
    |---|---|---|---|
    | `brand-primary` | `#0B3B2E` | `162 62% 14%` | Header/sidebar chrome, primary text-on-light headings context, dark surfaces |
    | `brand-primary-hover` | `#0F4C3A` | `162 55% 18%` | Hover state of primary-colored surfaces |
    | `brand-primary-active` | `#082E24` | `164 65% 11%` | Pressed state |
    | `brand-accent` | `#B8763E` | `28 49% 47%` | Primary CTAs, focus rings, active nav indicator, links |
    | `brand-accent-hover` | `#A5672F` | `28 55% 41%` | Accent hover |
    | `brand-accent-active` | `#8F5726` | `27 58% 35%` | Accent pressed |
    | `brand-accent-subtle` | `#F3E4D3` | `32 48% 89%` | Accent-tinted backgrounds (badges, selected rows) |

    ### 2.2 Neutral scale

    A warm, slightly green-grey neutral (never pure grey) so surfaces feel related to the brand rather than a bolted-on generic UI kit.

    | Token | Hex | HSL |
    |---|---|---|
    | `neutral-0` | `#FFFFFF` | `0 0% 100%` |
    | `neutral-50` | `#F7F6F3` | `48 15% 96%` |
    | `neutral-100` | `#EFEDE7` | `45 15% 92%` |
    | `neutral-200` | `#E0DDD3` | `41 15% 86%` |
    | `neutral-300` | `#C7C2B3` | `40 14% 75%` |
    | `neutral-400` | `#A29C89` | `38 12% 61%` |
    | `neutral-500` | `#7C7666` | `36 11% 46%` |
    | `neutral-600` | `#5C5749` | `35 12% 33%` |
    | `neutral-700` | `#413D33` | `34 12% 23%` |
    | `neutral-800` | `#2B2822` | `32 14% 15%` |
    | `neutral-900` | `#181613` | `24 15% 8%` |

    Usage: `neutral-50`/`100` for page/card backgrounds, `neutral-200`/`300` for borders and dividers, `neutral-500`/`600` for secondary text, `neutral-800`/`900` for primary body text on light surfaces.

    ### 2.3 Semantic status colors

    These map directly onto the entity state machines in spec 01 (as amended by spec 04) and spec 05.5 — **one color family per real state**, never invented ad hoc per screen. Each has a `-bg` (subtle background, for badges/rows) and `-fg` (text/icon, AA-contrast against `-bg` and against `neutral-0`) pair.

    | Token | Hex (fg) | Hex (bg) | Maps to |
    |---|---|---|---|
    | `status-neutral-fg` / `-bg` | `#5C5749` / `#EFEDE7` | | `Car.moderationStatus: DRAFT`; `Booking.status` states not yet actioned |
    | `status-pending-fg` / `-bg` | `#8A5A12` / `#FBEED8` | | `PENDING_APPROVAL` (car), `REQUESTED` (booking), `Payment.status: PENDING` — "waiting on a human decision" |
    | `status-success-fg` / `-bg` | `#1E5B3A` / `#DFF0E6` | | `APPROVED`, `CONFIRMED`, `ACTIVE`, `COMPLETED`, `LISTED`, `Payment.status: SETTLED` — forward progress, healthy |
    | `status-danger-fg` / `-bg` | `#8C2F23` / `#F8E1DD` | | `REJECTED`, `CANCELLED`, `TERMINATED`, `NO_SHOW`, `Payment.status: VOID` — terminal/negative outcomes |
    | `status-warning-fg` / `-bg` | `#8A5A12` / `#FCEFD9` | | `CANCELLATION_REQUESTED`, overdue-return flags, stale/conflicted queue badges (spec 05.5 §1.2, §3.1's "⚠"/"STALE") — same hue family as `pending` but reserved for *needs-attention-now* rather than *awaiting-routine-review*; distinguished by an icon (⚠), never color alone |
    | `status-inactive-fg` / `-bg` | `#5C5749` / `#E0DDD3` | | `UNLISTED`, `DELISTED`, deactivated users — present but not in play |

    `status-pending` and `status-warning` intentionally share a hue family (amber) but are never the only differentiator on screen — spec 05.5 §3.1's own rule ("`REQUESTED` never means reserved … every surface must say so in words") already requires text/iconography alongside color, so this system leans on that rule rather than inventing a second amber shade that would fail color-blind users identically to the first.

    **Never used for status:** `brand-accent` (brass) — reserved for actions, not state, so a user never confuses "this button will do something" with "this record is in a warning state."

    ### 2.4 Semantic surface & feedback

    | Token | Hex | Usage |
    |---|---|---|
    | `surface-page` | `#F7F6F3` (`neutral-50`) | App background |
    | `surface-card` | `#FFFFFF` | Cards, panels, table rows |
    | `surface-sunken` | `#EFEDE7` (`neutral-100`) | Input backgrounds, code/reference blocks |
    | `surface-overlay` | `rgba(24,22,19,0.55)` | Modal/drawer backdrop (`neutral-900` at 55%) |
    | `border-default` | `#E0DDD3` (`neutral-200`) | Default hairline borders |
    | `border-strong` | `#C7C2B3` (`neutral-300`) | Input borders, table dividers needing more definition |
    | `focus-ring` | `#B8763E` (`brand-accent`) | 2px focus outline, all interactive elements |
    | `info-fg` / `info-bg` | `#2A5A73` / `#E1EEF3` | Informational banners/toasts — deliberately blue-grey, not brand blue, kept desaturated so it never competes with the primary palette |

    ---

    ## 3. Typography scale

    ### 3.1 Families

    ```css
    --font-display: 'Fraunces', ui-serif, Georgia, serif;
    --font-body: 'Public Sans', ui-sans-serif, system-ui, sans-serif;
    --font-mono: 'IBM Plex Mono', ui-monospace, monospace; /* reference numbers, request IDs, plate numbers, audit log */
    ```

    Fraunces is loaded with its optical-size and `SOFT`/`WONK` variable axes available (`font-optical-sizing: auto`); component usage sticks to weights 400 (body-adjacent serif use, rare) and 600/700 (headings) and the default (non-`WONK`) shape for a calmer, more premium letterform than the full wonky display extreme.

    ### 3.2 Scale

    A 1.25 (major third) ratio, base 16px, tuned so the admin panel's dense tables stay readable at the small end while marketing/public pages get real presence at the large end.

    | Token | Size / Line-height | Font | Usage |
    |---|---|---|---|
    | `text-display-xl` | 3.815rem / 1.05 (61px) | Fraunces 600 | Public homepage hero |
    | `text-display-lg` | 3.052rem / 1.1 (49px) | Fraunces 600 | Section heroes, car detail price hero |
    | `text-display-md` | 2.441rem / 1.15 (39px) | Fraunces 600 | Page titles (public) |
    | `text-heading-lg` | 1.953rem / 1.2 (31px) | Fraunces 600 | Section headings, admin page titles |
    | `text-heading-md` | 1.563rem / 1.25 (25px) | Fraunces 600 | Card/panel titles, modal titles |
    | `text-heading-sm` | 1.25rem / 1.3 (20px) | Public Sans 600 | Subsection headings, table group headers — switches to body family at this size, where density matters more than character |
    | `text-body-lg` | 1.125rem / 1.5 (18px) | Public Sans 400 | Lead paragraphs, public marketing copy |
    | `text-body-md` | 1rem / 1.5 (16px) | Public Sans 400 | Default UI text, form labels, table cells |
    | `text-body-sm` | 0.875rem / 1.45 (14px) | Public Sans 400 | Secondary text, helper text, dense admin tables |
    | `text-caption` | 0.75rem / 1.4 (12px) | Public Sans 500 | Badges, timestamps, micro-labels (uppercase tracking-wide where used as an eyebrow) |
    | `text-mono-sm` | 0.8125rem / 1.4 (13px) | IBM Plex Mono 400 | Registration plates, request IDs, booking/payment reference codes |

    Weights available: Public Sans 400/500/600/700; Fraunces 400/600/700.

    ---

    ## 4. Spacing scale

    4px base unit, matching Tailwind's default numeric step but declared explicitly here so it is never silently redefined:

    | Token | Value |
    |---|---|
    | `space-0.5` | 2px |
    | `space-1` | 4px |
    | `space-2` | 8px |
    | `space-3` | 12px |
    | `space-4` | 16px |
    | `space-5` | 20px |
    | `space-6` | 24px |
    | `space-8` | 32px |
    | `space-10` | 40px |
    | `space-12` | 48px |
    | `space-16` | 64px |
    | `space-20` | 80px |
    | `space-24` | 96px |

    Layout rule of thumb: `space-4`/`space-6` for internal component padding, `space-8`/`space-12` between stacked sections, `space-16`+ only for full public-page section rhythm.

    ---

    ## 5. Border-radius scale

    Deliberately restrained — flatter, more "engineered" than the rounded-everywhere AI-generated default. Sharper corners on structural chrome (sidebar, tables), a touch more on interactive surfaces the hand actually touches (buttons, inputs, cards).

    | Token | Value | Usage |
    |---|---|---|
    | `radius-none` | 0px | Table cells, sidebar, admin data-dense chrome |
    | `radius-sm` | 4px | Inputs, buttons, badges |
    | `radius-md` | 6px | Cards, modals, dropdown menus |
    | `radius-lg` | 10px | Large public-page cards (car listing cards), image containers |
    | `radius-full` | 9999px | Avatars, status dots, pill badges only |

    No radius above `radius-lg` is used anywhere — the largest public marketing card still reads as a crafted panel, not a soft bubble.

    ---

    ## 6. Shadow scale

    Shadows signal genuine elevation (something is floating above the page), not decoration on flat cards. Flat cards get a `border-default` hairline instead of a shadow.

    | Token | Value | Usage |
    |---|---|---|
    | `shadow-none` | `none` | Default card/table state — border does the separation work |
    | `shadow-xs` | `0 1px 2px 0 rgba(24,22,19,0.06)` | Buttons on hover/press micro-feedback only |
    | `shadow-sm` | `0 2px 6px -1px rgba(24,22,19,0.08), 0 1px 2px -1px rgba(24,22,19,0.06)` | Dropdown menus, popovers, sticky toolbar on scroll |
    | `shadow-md` | `0 8px 16px -4px rgba(24,22,19,0.12), 0 2px 4px -2px rgba(24,22,19,0.08)` | Modals, dialogs |
    | `shadow-lg` | `0 20px 32px -8px rgba(24,22,19,0.18), 0 4px 8px -4px rgba(24,22,19,0.10)` | Full-screen interstitials (spec 05.5 §0.3's re-authenticate/deactivated overlays), toast stacks |

    All shadow colors are `neutral-900` at low alpha — never a tinted brand-color shadow (a common AI-generated tell).

    ---

    ## 7. Breakpoints

    Matches Tailwind defaults exactly (no reason to diverge — the admin panel especially benefits from the standard `lg`/`xl` split for sidebar-collapse behavior), declared here so they are never silently changed per-component:

    | Token | Min-width | Primary use |
    |---|---|---|
    | `sm` | 640px | Public pages: stack → two-column |
    | `md` | 768px | Admin: sidebar becomes collapsible overlay below this |
    | `lg` | 1024px | Admin: persistent sidebar; public: full nav |
    | `xl` | 1280px | Wide data tables (admin queues) get extra columns |
    | `2xl` | 1536px | Max content width clamp for public marketing pages |

    Admin panel is desktop-first (spec 05.5's keyboard-shortcut-driven queues, §0.6, assume a keyboard-and-mouse operator); public site is mobile-first. Both share the same token set — the difference is which breakpoint each surface treats as its design baseline, not a second scale.

    ---

    ## 8. Governance

    - Every value above is the *only* legal value of its kind in `/client`. A component needing a color/spacing/radius/shadow not listed here amends this file first, in its own commit, before the component lands.
    - `tailwind.config.ts` (client) consumes these tokens directly under `theme.extend` — Tailwind's own default palette (`blue`, `indigo`, `violet`, `slate`, etc.) and default font stack are not disabled outright (utilities like `bg-white` still resolve), but no component may reference a default color name for anything brand- or status-bearing. This is a code-review rule, not a build-time lint, pending a future `no-restricted-syntax` ESLint rule scoped to `/client` if drift becomes a real problem.
    - Status colors are the join point with the backend state machines (spec 01/04). If a future spec amendment adds a state (the way `NO_SHOW` was added late per design D4), this document gets a new row in §2.3 before any component renders that state — never an inline one-off color.
