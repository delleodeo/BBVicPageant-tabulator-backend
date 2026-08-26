import crypto from 'crypto';
import path from 'path';
import express from 'express';
import multer from 'multer';
import { contestantUploadDir } from '../config/paths.js';
import { adminOnly, authMiddleware } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../utils/httpError.js';

export const uploadRoutes = express.Router();

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const extensionByMimeType = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, contestantUploadDir),
  filename: (_req, file, cb) => {
    const fallbackExt = path.extname(file.originalname || '').toLowerCase();
    const ext = extensionByMimeType[file.mimetype] || fallbackExt || '.jpg';
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
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
      return next(new HttpError(413, 'Image file must be 5MB or smaller.'));
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

    const pathUrl = `/uploads/contestants/${req.file.filename}`;
    res.status(201).json({
      file: {
        originalName: req.file.originalname,
        filename: req.file.filename,
        size: req.file.size,
        mimeType: req.file.mimetype
      },
      path: pathUrl,
      url: pathUrl
    });
  })
);
