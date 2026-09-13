import { Writable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('cloudinary', () => ({
  v2: {
    config: vi.fn(),
    uploader: { upload_stream: vi.fn(), destroy: vi.fn() }
  }
}));

vi.mock('../src/config/env.js', () => ({
  env: {
    cloudinaryCloudName: 'test-cloud',
    cloudinaryApiKey: 'test-key',
    cloudinaryApiSecret: 'test-secret'
  }
}));

import { v2 as cloudinary } from 'cloudinary';
import { env } from '../src/config/env.js';
import { deleteContestantPhoto, getContestantPhotoPublicId, uploadContestantPhoto } from '../src/services/cloudinaryService.js';

describe('Cloudinary candidate photo upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('streams the photo and returns its secure URL', async () => {
    const chunks = [];
    vi.mocked(cloudinary.uploader.upload_stream).mockImplementation((_options, callback) => new Writable({
      write(chunk, _encoding, done) {
        chunks.push(chunk);
        done();
      },
      final(done) {
        callback(null, {
          secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/photo.webp',
          format: 'webp',
          public_id: 'pageant-tabulation/contestants/photo'
        });
        done();
      }
    }));

    const result = await uploadContestantPhoto({ buffer: Buffer.from('photo bytes') });

    expect(Buffer.concat(chunks).toString()).toBe('photo bytes');
    expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
      {
        public_id: expect.stringMatching(/^pageant-tabulation\/contestants\/[a-f0-9-]{36}$/),
        resource_type: 'image',
        format: 'webp',
        overwrite: false
      },
      expect.any(Function)
    );
    expect(result).toEqual({
      url: 'https://res.cloudinary.com/test-cloud/image/upload/photo.webp',
      publicId: 'pageant-tabulation/contestants/photo'
    });
  });

  it('requires a cloud name before uploading', async () => {
    const originalCloudName = env.cloudinaryCloudName;
    env.cloudinaryCloudName = '';

    try {
      await expect(uploadContestantPhoto({ buffer: Buffer.from('photo') })).rejects.toMatchObject({ status: 503 });
      expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
    } finally {
      env.cloudinaryCloudName = originalCloudName;
    }
  });

  it('reports a failed Cloudinary upload', async () => {
    vi.mocked(cloudinary.uploader.upload_stream).mockImplementation((_options, callback) => new Writable({
      write(_chunk, _encoding, done) {
        callback(new Error('Cloudinary request failed'));
        done();
      }
    }));

    await expect(uploadContestantPhoto({ buffer: Buffer.from('photo') })).rejects.toMatchObject({ status: 502 });
  });

  it('recognizes only candidate images from the configured Cloudinary account', () => {
    const owned = 'https://res.cloudinary.com/test-cloud/image/upload/v123/pageant-tabulation/contestants/photo.webp';
    expect(getContestantPhotoPublicId(owned)).toBe('pageant-tabulation/contestants/photo');
    expect(getContestantPhotoPublicId(owned.replace('test-cloud', 'other-cloud'))).toBeNull();
    expect(getContestantPhotoPublicId(owned.replace('/contestants/', '/other/'))).toBeNull();
    expect(getContestantPhotoPublicId(owned.replace('https:', 'http:'))).toBeNull();
    expect(getContestantPhotoPublicId('/uploads/contestants/photo.jpg')).toBeNull();
    expect(getContestantPhotoPublicId('https://example.com/photo.webp')).toBeNull();
  });

  it('destroys a candidate image and invalidates cached copies', async () => {
    vi.mocked(cloudinary.uploader.destroy).mockResolvedValue({ result: 'ok' });

    await expect(deleteContestantPhoto('pageant-tabulation/contestants/photo')).resolves.toBe(true);
    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(
      'pageant-tabulation/contestants/photo',
      { resource_type: 'image', invalidate: true }
    );
  });

  it('refuses to delete an image outside the app candidate path', async () => {
    await expect(deleteContestantPhoto('other-folder/photo')).resolves.toBe(false);
    expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
  });

  it('allows an already-missing image but rejects a failed deletion', async () => {
    vi.mocked(cloudinary.uploader.destroy).mockResolvedValueOnce({ result: 'not found' });
    await expect(deleteContestantPhoto('pageant-tabulation/contestants/photo')).resolves.toBe(false);

    vi.mocked(cloudinary.uploader.destroy).mockRejectedValueOnce(new Error('Cloudinary unavailable'));
    await expect(deleteContestantPhoto('pageant-tabulation/contestants/photo')).rejects.toMatchObject({ status: 502 });
  });
});
