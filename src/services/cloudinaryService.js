import crypto from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';

const candidatePhotoIdPattern = /^pageant-tabulation\/contestants\/[A-Za-z0-9_-]+$/;

function configureCloudinary() {
  if (!env.cloudinaryCloudName || !env.cloudinaryApiKey || !env.cloudinaryApiSecret) {
    throw new HttpError(503, 'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in backend/.env.');
  }

  cloudinary.config({
    cloud_name: env.cloudinaryCloudName,
    api_key: env.cloudinaryApiKey,
    api_secret: env.cloudinaryApiSecret,
    secure: true
  });
}

export function getContestantPhotoPublicId(photoUrl) {
  if (typeof photoUrl !== 'string' || !env.cloudinaryCloudName) return null;

  try {
    const url = new URL(photoUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' ||
        url.port || url.username || url.password ||
        parts[0] !== env.cloudinaryCloudName || parts[1] !== 'image' ||
        parts[2] !== 'upload' || !/^v\d+$/.test(parts[3])) {
      return null;
    }

    const filePath = decodeURIComponent(parts.slice(4).join('/'));
    if (!filePath.endsWith('.webp')) return null;
    const publicId = filePath.slice(0, -'.webp'.length);
    return candidatePhotoIdPattern.test(publicId) ? publicId : null;
  } catch {
    return null;
  }
}

export async function uploadContestantPhoto(file) {
  configureCloudinary();

  try {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          public_id: `pageant-tabulation/contestants/${crypto.randomUUID()}`,
          resource_type: 'image',
          format: 'webp',
          overwrite: false
        },
        (error, uploaded) => error ? reject(error) : resolve(uploaded)
      );
      stream.on('error', reject);
      stream.end(file.buffer);
    });

    if (!result?.secure_url || result.format !== 'webp') {
      throw new Error('Cloudinary did not return a WebP image URL.');
    }

    return { url: result.secure_url, publicId: result.public_id };
  } catch {
    throw new HttpError(502, 'Cloudinary image upload failed. Please try again.');
  }
}

export async function deleteContestantPhoto(publicId) {
  if (!candidatePhotoIdPattern.test(publicId)) return false;
  configureCloudinary();

  try {
    const response = await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
    if (response?.result !== 'ok' && response?.result !== 'not found') {
      throw new Error('Cloudinary did not confirm image deletion.');
    }
    return response.result === 'ok';
  } catch {
    throw new HttpError(502, 'Cloudinary image deletion failed. Candidate was not deleted.');
  }
}
