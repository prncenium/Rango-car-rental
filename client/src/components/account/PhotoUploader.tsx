import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { CAR_DEFAULT_MAX_IMAGES_PER_CAR, CAR_IMAGE_MAX_FILE_SIZE_BYTES, CAR_IMAGE_MIME_TYPES } from '@rango/shared';
import { updateListing, uploadListingImages } from '../../api/listings';
import { ApiError } from '../../lib/apiClient';
import { Button } from '../ui/Button';
import { TrashIcon, UploadIcon } from '../ui/icons';

/**
 * docs/design/02-image-storage.md's one real upload flow. Client-side
 * pre-validation mirrors the server's rules exactly (MIME/size/count) so a
 * rejection is instant rather than a round trip — the server remains
 * authoritative (it re-reads SystemConfig.listing.maxImagesPerCar, which may
 * differ from the CAR_DEFAULT_MAX_IMAGES_PER_CAR default assumed here).
 *
 * Pending files are staged locally with an object-URL preview and can be
 * removed before the actual upload request is sent ("remove-before-submit").
 * Rejected files (wrong MIME/too large/over the count cap) never enter the
 * pending queue — they show inline as a rejection reason instead.
 */

interface PendingFile {
  id: string;
  file: File;
  previewUrl: string;
}

interface RejectedFile {
  id: string;
  name: string;
  reason: string;
}

export interface PhotoUploaderProps {
  carId: string;
  images: string[];
  disabled?: boolean;
  maxImages?: number;
  onImagesChange: (images: string[]) => void;
}

function validateFile(file: File, remainingSlots: number): string | null {
  if (!CAR_IMAGE_MIME_TYPES.includes(file.type as (typeof CAR_IMAGE_MIME_TYPES)[number])) {
    return 'Only JPEG, PNG, or WebP images are allowed.';
  }
  if (file.size > CAR_IMAGE_MAX_FILE_SIZE_BYTES) {
    return 'Each image must be 5MB or smaller.';
  }
  if (remainingSlots <= 0) {
    return 'Photo limit reached for this car.';
  }
  return null;
}

export function PhotoUploader({ carId, images, disabled, maxImages = CAR_DEFAULT_MAX_IMAGES_PER_CAR, onImagesChange }: PhotoUploaderProps) {
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [rejected, setRejected] = useState<RejectedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [removingUrl, setRemovingUrl] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const slotsUsed = images.length + pending.length;

  function addFiles(files: FileList | File[]) {
    const nextPending: PendingFile[] = [];
    const nextRejected: RejectedFile[] = [];
    let remaining = maxImages - slotsUsed;

    for (const file of Array.from(files)) {
      const reason = validateFile(file, remaining);
      if (reason) {
        nextRejected.push({ id: `${file.name}-${Date.now()}-${Math.random()}`, name: file.name, reason });
        continue;
      }
      nextPending.push({ id: `${file.name}-${Date.now()}-${Math.random()}`, file, previewUrl: URL.createObjectURL(file) });
      remaining -= 1;
    }

    if (nextPending.length > 0) setPending((prev) => [...prev, ...nextPending]);
    if (nextRejected.length > 0) setRejected((prev) => [...prev, ...nextRejected]);
  }

  function removePending(id: string) {
    setPending((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  function dismissRejected(id: string) {
    setRejected((prev) => prev.filter((r) => r.id !== id));
  }

  // docs/design/02-image-storage.md's "Non-goals" — no per-image delete
  // route; removal is a full-array replacement via the same PATCH endpoint
  // ordinary content edits use.
  async function removeExisting(url: string) {
    setRemoveError(null);
    setRemovingUrl(url);
    const next = images.filter((img) => img !== url);
    try {
      const updated = await updateListing(carId, { images: next });
      onImagesChange(updated.images);
    } catch (err) {
      setRemoveError(err instanceof ApiError ? err.message : 'Could not remove that photo. Please try again.');
    } finally {
      setRemovingUrl(null);
    }
  }

  async function handleUpload() {
    if (pending.length === 0) return;
    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    try {
      const updated = await uploadListingImages(
        carId,
        pending.map((p) => p.file),
        setUploadProgress,
      );
      for (const p of pending) URL.revokeObjectURL(p.previewUrl);
      setPending([]);
      onImagesChange(updated.images);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-6 py-8 text-center transition-colors ${
          isDragOver ? 'border-brand-accent bg-brand-accent-subtle/40' : 'border-border-strong bg-surface-sunken'
        } ${disabled ? 'opacity-50' : ''}`}
      >
        <UploadIcon className="h-6 w-6 text-neutral-500" />
        <p className="text-body-sm text-neutral-600">Drag photos here, or</p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled || slotsUsed >= maxImages}
          onClick={() => inputRef.current?.click()}
        >
          Choose files
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={CAR_IMAGE_MIME_TYPES.join(',')}
          multiple
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <p className="text-body-sm text-neutral-500">
          JPEG, PNG, or WebP · up to 5MB each · {slotsUsed}/{maxImages} photos
        </p>
      </div>

      {removeError && (
        <p role="alert" className="text-body-sm text-status-danger-fg">
          {removeError}
        </p>
      )}

      {rejected.length > 0 && (
        <ul className="flex flex-col gap-1">
          {rejected.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 text-body-sm text-status-danger-fg">
              <span>
                {r.name}: {r.reason}
              </span>
              <button type="button" onClick={() => dismissRejected(r.id)} className="text-neutral-400 hover:text-neutral-700">
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {(images.length > 0 || pending.length > 0) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {images.map((url) => (
            <div key={url} className="group relative aspect-[4/3] overflow-hidden rounded-md border border-border">
              <img src={url} alt="" className="h-full w-full object-cover" />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeExisting(url)}
                  disabled={removingUrl === url}
                  aria-label="Remove photo"
                  className="absolute right-1.5 top-1.5 rounded-sm bg-neutral-900/70 p-1.5 text-neutral-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-100"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          {pending.map((p) => (
            <div key={p.id} className="group relative aspect-[4/3] overflow-hidden rounded-md border border-dashed border-border-strong">
              <img src={p.previewUrl} alt="" className="h-full w-full object-cover opacity-80" />
              <span className="absolute left-1.5 top-1.5 rounded-sm bg-neutral-900/70 px-1.5 py-0.5 text-caption text-neutral-0">
                Pending
              </span>
              {!isUploading && (
                <button
                  type="button"
                  onClick={() => removePending(p.id)}
                  aria-label="Remove pending photo"
                  className="absolute right-1.5 top-1.5 rounded-sm bg-neutral-900/70 p-1.5 text-neutral-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <div className="flex flex-col gap-2">
          {isUploading && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
              <div
                className="h-full bg-brand-accent transition-[width] duration-150"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}
          {uploadError && (
            <p role="alert" className="text-body-sm text-status-danger-fg">
              {uploadError}
            </p>
          )}
          <div>
            <Button type="button" onClick={handleUpload} isLoading={isUploading} disabled={disabled}>
              Upload {pending.length} photo{pending.length === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
