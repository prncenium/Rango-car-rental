import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import { CAR_IMAGE_MAX_FILE_SIZE_BYTES, CAR_IMAGE_MIME_TYPES } from '@rango/shared';
import { env } from '../config/env.js';
import { UnsupportedMediaTypeError } from './errors.js';

// docs/design/02-image-storage.md — Cloudinary is the sole image backend;
// bytes never touch local disk (memoryStorage), not even temporarily.
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

// Sourced from @rango/shared so the client's pre-validation (PhotoUploader)
// can never drift from what the server actually enforces.
const ALLOWED_MIME_TYPES = new Set<string>(CAR_IMAGE_MIME_TYPES);
const MAX_FILE_SIZE_BYTES = CAR_IMAGE_MAX_FILE_SIZE_BYTES;

// Absolute request-level ceiling, independent of SystemConfig.listing.maxImagesPerCar
// (that value is read at call time in car.service.ts) — this just bounds how much
// multipart work a single request can ask multer to parse.
export const MAX_FILES_PER_UPLOAD_REQUEST = 12;

export const carImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: MAX_FILES_PER_UPLOAD_REQUEST },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new UnsupportedMediaTypeError(`Unsupported image type: ${file.mimetype}`, { allowed: [...ALLOWED_MIME_TYPES] }));
      return;
    }
    cb(null, true);
  },
});

// Streams one buffer to Cloudinary and resolves with its secure URL — the
// only shape Car.images ever stores (design §13: "the API accepts URLs").
export function uploadCarImage(buffer: Buffer, carId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `rango/cars/${carId}`, resource_type: 'image' },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('Cloudinary upload returned no result.'));
          return;
        }
        resolve(result.secure_url);
      },
    );
    stream.end(buffer);
  });
}
