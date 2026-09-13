import express from 'express';
import multer from 'multer';
import { adminOnly, authMiddleware } from '../middleware/auth.js';
import { uploadContestantPhoto } from '../services/cloudinaryService.js';
import { asyncHandler, HttpError } from '../utils/httpError.js';

export const uploadRoutes = express.Router();
export const MAX_CONTESTANT_PHOTO_BYTES = 15 * 1024 * 1024;

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const upload = multer({
  storage: multer.memoryStorage(),
  // Multer treats a file at the limit as oversized, so allow one extra byte
  // internally to accept exactly 15 MB while rejecting anything larger.
  limits: { fileSize: MAX_CONTESTANT_PHOTO_BYTES + 1 },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(new HttpError(415, 'Only JPG, PNG, WebP, and GIF images are allowed.'));
    }
    return cb(null, true);
  }
});

function handleContestantPhotoUpload(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return next(new HttpError(413, 'Image file must be 15 MB or smaller.'));
    }
    if (err) return next(err);
    return next();
  });
}

uploadRoutes.use(authMiddleware);

uploadRoutes.post(
  '/contestant-photo',
  adminOnly,
  handleContestantPhotoUpload,
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new HttpError(422, 'No image file uploaded.');
    }

    const uploaded = await uploadContestantPhoto(req.file);
    res.status(201).json({
      file: {
        originalName: req.file.originalname,
        publicId: uploaded.publicId,
        size: req.file.size,
        mimeType: req.file.mimetype
      },
      path: uploaded.url,
      url: uploaded.url
    });
  })
);
