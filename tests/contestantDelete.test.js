import { once } from 'node:events';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/middleware/auth.js', () => ({
  authMiddleware: (_req, _res, next) => next(),
  adminOnly: (_req, _res, next) => next()
}));

vi.mock('../src/models/Contestant.js', () => ({
  Contestant: { findById: vi.fn(), exists: vi.fn(), findByIdAndDelete: vi.fn() }
}));

vi.mock('../src/models/Finalist.js', () => ({ Finalist: { deleteMany: vi.fn() } }));
vi.mock('../src/models/RoundOneScore.js', () => ({ RoundOneScore: { deleteMany: vi.fn() } }));
vi.mock('../src/models/FinalRoundScore.js', () => ({ FinalRoundScore: { deleteMany: vi.fn() } }));
vi.mock('../src/models/JudgeNote.js', () => ({ JudgeNote: { deleteMany: vi.fn() } }));
vi.mock('../src/models/SpecialAward.js', () => ({ SpecialAward: { updateMany: vi.fn() } }));
vi.mock('../src/services/auditService.js', () => ({ logAudit: vi.fn() }));
vi.mock('../src/services/cloudinaryService.js', () => ({
  getContestantPhotoPublicId: vi.fn(),
  deleteContestantPhoto: vi.fn()
}));

import { errorHandler } from '../src/middleware/errorHandler.js';
import { Contestant } from '../src/models/Contestant.js';
import { Finalist } from '../src/models/Finalist.js';
import { contestantRoutes } from '../src/routes/contestantRoutes.js';
import { deleteContestantPhoto, getContestantPhotoPublicId } from '../src/services/cloudinaryService.js';
import { HttpError } from '../src/utils/httpError.js';

describe('candidate deletion and Cloudinary cleanup', () => {
  let server;
  let baseUrl;
  const contestant = {
    _id: 'candidate-1',
    photo: 'https://res.cloudinary.com/test-cloud/image/upload/v123/pageant-tabulation/contestants/photo.webp'
  };

  beforeAll(async () => {
    const app = express();
    app.use('/api/contestants', contestantRoutes);
    app.use(errorHandler);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(Contestant.findById).mockResolvedValue(contestant);
    vi.mocked(Contestant.exists).mockResolvedValue(null);
    vi.mocked(Contestant.findByIdAndDelete).mockResolvedValue(contestant);
    vi.mocked(getContestantPhotoPublicId).mockReturnValue('pageant-tabulation/contestants/photo');
    vi.mocked(deleteContestantPhoto).mockResolvedValue(true);
  });

  function removeCandidate() {
    return fetch(`${baseUrl}/api/contestants/candidate-1`, { method: 'DELETE' });
  }

  it('deletes the Cloudinary photo before the candidate record', async () => {
    const response = await removeCandidate();

    expect(response.status).toBe(200);
    expect(deleteContestantPhoto).toHaveBeenCalledWith('pageant-tabulation/contestants/photo');
    expect(vi.mocked(deleteContestantPhoto).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(Contestant.findByIdAndDelete).mock.invocationCallOrder[0]);
    expect(Finalist.deleteMany).toHaveBeenCalledOnce();
  });

  it('keeps the candidate when Cloudinary deletion fails', async () => {
    vi.mocked(deleteContestantPhoto).mockRejectedValueOnce(new HttpError(502, 'Cloudinary image deletion failed. Candidate was not deleted.'));

    const response = await removeCandidate();
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.message).toBe('Cloudinary image deletion failed. Candidate was not deleted.');
    expect(Contestant.findByIdAndDelete).not.toHaveBeenCalled();
    expect(Finalist.deleteMany).not.toHaveBeenCalled();
  });

  it('keeps a photo that another candidate uses', async () => {
    vi.mocked(Contestant.exists).mockResolvedValueOnce({ _id: 'candidate-2' });

    const response = await removeCandidate();

    expect(response.status).toBe(200);
    expect(deleteContestantPhoto).not.toHaveBeenCalled();
    expect(Contestant.findByIdAndDelete).toHaveBeenCalledOnce();
  });

  it('does not touch external or local photos', async () => {
    vi.mocked(getContestantPhotoPublicId).mockReturnValueOnce(null);

    const response = await removeCandidate();

    expect(response.status).toBe(200);
    expect(deleteContestantPhoto).not.toHaveBeenCalled();
    expect(Contestant.exists).not.toHaveBeenCalled();
  });
});
