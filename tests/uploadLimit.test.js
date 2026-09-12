import { once } from 'node:events';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/middleware/auth.js', () => ({
  authMiddleware: (_req, _res, next) => next(),
  adminOnly: (_req, _res, next) => next()
}));

import { contestantUploadDir } from '../src/config/paths.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { MAX_CONTESTANT_PHOTO_BYTES, uploadRoutes } from '../src/routes/uploadRoutes.js';

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

  async function sendPhoto(size) {
    const form = new FormData();
    form.append('image', new Blob([new Uint8Array(size)], { type: 'image/jpeg' }), 'photo.jpg');
    return fetch(`${baseUrl}/api/uploads/contestant-photo`, { method: 'POST', body: form });
  }

  it('accepts a photo of exactly 15 MB', async () => {
    const response = await sendPhoto(MAX_CONTESTANT_PHOTO_BYTES);
    const body = await response.json();
    const uploadedPath = body.file?.filename
      ? path.join(contestantUploadDir, body.file.filename)
      : null;

    try {
      expect(response.status).toBe(201);
      expect(body.file.size).toBe(MAX_CONTESTANT_PHOTO_BYTES);
    } finally {
      if (uploadedPath) await unlink(uploadedPath);
    }
  }, 30000);

  it('rejects a photo larger than 15 MB', async () => {
    const response = await sendPhoto(MAX_CONTESTANT_PHOTO_BYTES + 1);
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.message).toBe('Image file must be 15 MB or smaller.');
  }, 30000);
});
