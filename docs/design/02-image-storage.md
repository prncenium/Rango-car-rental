# 02 — Image storage

Status: DRAFT — resolves the deferral in `docs/design/01-technical-design.md` §13 ("Image upload transport").
Reads: `docs/design/01-technical-design.md` §3–§10 (folder structure, error hierarchy, route pipeline).

## Decision

**Cloudinary** is the image storage backend. Chosen for zero fixed cost (free tier covers phase-1 volume) and because it removes the need for any local-disk or S3-bucket lifecycle management — bytes never touch the app server's filesystem, which also means the upload path works unchanged regardless of where `/server` is eventually deployed.

- `Car.images` continues to store plain URL strings (unchanged from spec 01 §1.3 / design §13) — Cloudinary's `secure_url` is what gets written there. No new field, no new entity.
- Upload is multipart (`multipart/form-data`, field name `images`), handled server-side by `multer` (memory storage — files are streamed to Cloudinary and never written to local disk, not even temporarily) and pushed to Cloudinary via `cloudinary.uploader.upload_stream`.
- Folder convention: `rango/cars/<carId>`, so all of one car's images sit under one Cloudinary folder.
- Validation, enforced before any upload call is made:
  - MIME type: `image/jpeg`, `image/png`, `image/webp` only — anything else is `415 UNSUPPORTED_MEDIA_TYPE`.
  - Size: 5 MB per file — over that is `413 PAYLOAD_TOO_LARGE`.
  - Count: `car.images.length + incoming <= SystemConfig.listing.maxImagesPerCar` (D12, default 12) — over that is `400 VALIDATION_FAILED`.
- Endpoint: `POST /api/user/listings/:carId/images`, owner-only (`loadOwnCarOrThrow`, 404 on any other owner's car — spec 02 §3.4 rule 2), gated by the existing `guardEditableModerationState` (DRAFT/REJECTED only — matches the rule that a live listing's content, images included, cannot change without an admin seeing the result again, D2/CAR-05 intent). Returns the updated `Car` document, per design §10.3 ("a successful mutation returns the full updated resource").
- This is a content edit, not a state transition — it does not go through `transition()`, the same way `updateListing`'s other fields don't. It writes one `CAR_EDITED` audit row (`metadata.changedFields: ['images']`), consistent with how `updateListing` audits field-name-only changes.

## Config

Three new required env vars (`config/env.ts`, fail-fast at boot per design §12): `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. Never logged, same treatment as the JWT secrets.

## Non-goals (still deferred)

- Per-image deletion endpoint — `PATCH /api/user/listings/:carId` already accepts a full replacement `images: string[]`, which covers removal without a new route.
- Image transformation/resizing pipelines, CDN cache tuning — left at Cloudinary defaults.
- Licence/KYC document upload — out of scope permanently (D8); this document is about `Car.images` only.
