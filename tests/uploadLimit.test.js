import { once } from 'node:events';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/middleware/auth.js', () => ({
  authMiddleware: (_req, _res, next) => next(),
  adminOnly: (_req, _res, next) => next()
}));

vi.mock('../src/services/cloudinaryService.js', () => ({
  uploadContestantPhoto: vi.fn()
}));

import { errorHandler } from '../src/middleware/errorHandler.js';
import { MAX_CONTESTANT_PHOTO_BYTES, uploadRoutes } from '../src/routes/uploadRoutes.js';
import { uploadContestantPhoto } from '../src/services/cloudinaryService.js';
import { HttpError } from '../src/utils/httpError.js';

describe('candidate photo upload size limit', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    const app = express();
    app.use('/api/uploads', uploadRoutes);
    app.use(errorHandler);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    vi.mocked(uploadContestantPhoto).mockReset();
    vi.mocked(uploadContestantPhoto).mockResolvedValue({
      url: 'https://res.cloudinary.com/test/image/upload/photo.webp',
      publicId: 'pageant-tabulation/contestants/photo'
    });
  });

  async function sendPhoto(size) {
    const form = new FormData();
    form.append('image', new Blob([new Uint8Array(size)], { type: 'image/jpeg' }), 'photo.jpg');
    return fetch(`${baseUrl}/api/uploads/contestant-photo`, { method: 'POST', body: form });
  }

  it('accepts a photo of exactly 15 MB', async () => {
    const response = await sendPhoto(MAX_CONTESTANT_PHOTO_BYTES);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.file.size).toBe(MAX_CONTESTANT_PHOTO_BYTES);
    expect(body.url).toBe('https://res.cloudinary.com/test/image/upload/photo.webp');
    expect(uploadContestantPhoto).toHaveBeenCalledOnce();
  }, 30000);

  it('rejects a photo larger than 15 MB', async () => {
    const response = await sendPhoto(MAX_CONTESTANT_PHOTO_BYTES + 1);
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.message).toBe('Image file must be 15 MB or smaller.');
    expect(uploadContestantPhoto).not.toHaveBeenCalled();
  }, 30000);

  it('returns an error when Cloudinary cannot save the photo', async () => {
    vi.mocked(uploadContestantPhoto).mockRejectedValueOnce(new HttpError(502, 'Cloudinary image upload failed. Please try again.'));

    const response = await sendPhoto(100);
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.message).toBe('Cloudinary image upload failed. Please try again.');
  });
});
