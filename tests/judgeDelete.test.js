import { once } from 'node:events';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/middleware/auth.js', () => ({
  authMiddleware: (req, _res, next) => {
    req.user = { _id: 'admin-user', role: 'admin' };
    next();
  },
  adminOnly: (_req, _res, next) => next()
}));

vi.mock('../src/models/FinalRoundScore.js', () => ({ FinalRoundScore: { deleteMany: vi.fn() } }));
vi.mock('../src/models/Judge.js', () => ({ Judge: { findById: vi.fn(), findByIdAndDelete: vi.fn() } }));
vi.mock('../src/models/JudgeNote.js', () => ({ JudgeNote: { deleteMany: vi.fn() } }));
vi.mock('../src/models/RoundOneScore.js', () => ({ RoundOneScore: { deleteMany: vi.fn() } }));
vi.mock('../src/models/User.js', () => ({ User: { findByIdAndDelete: vi.fn() } }));
vi.mock('../src/services/auditService.js', () => ({ logAudit: vi.fn() }));

import { errorHandler } from '../src/middleware/errorHandler.js';
import { FinalRoundScore } from '../src/models/FinalRoundScore.js';
import { Judge } from '../src/models/Judge.js';
import { JudgeNote } from '../src/models/JudgeNote.js';
import { RoundOneScore } from '../src/models/RoundOneScore.js';
import { User } from '../src/models/User.js';
import { judgeRoutes } from '../src/routes/judgeRoutes.js';
import { logAudit } from '../src/services/auditService.js';

describe('admin judge deletion', () => {
  let server;
  let baseUrl;
  const judge = {
    _id: 'judge-record',
    judgeId: 'J001',
    name: 'Judge One',
    userId: 'judge-user',
    toObject: vi.fn(() => ({
      _id: 'judge-record',
      judgeId: 'J001',
      name: 'Judge One',
      userId: 'judge-user'
    }))
  };

  beforeAll(async () => {
    const app = express();
    app.use('/api/judges', judgeRoutes);
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
    vi.mocked(Judge.findById).mockResolvedValue(judge);
    vi.mocked(Judge.findByIdAndDelete).mockResolvedValue(judge);
    vi.mocked(User.findByIdAndDelete).mockResolvedValue({});
    vi.mocked(RoundOneScore.deleteMany).mockResolvedValue({ deletedCount: 2 });
    vi.mocked(FinalRoundScore.deleteMany).mockResolvedValue({ deletedCount: 1 });
    vi.mocked(JudgeNote.deleteMany).mockResolvedValue({ deletedCount: 3 });
  });

  function removeJudge() {
    return fetch(`${baseUrl}/api/judges/judge-record`, { method: 'DELETE' });
  }

  it('deletes the judge, login, scores, notes, and records an audit event', async () => {
    const response = await removeJudge();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe('Judge deleted.');
    expect(Judge.findByIdAndDelete).toHaveBeenCalledWith('judge-record');
    expect(User.findByIdAndDelete).toHaveBeenCalledWith('judge-user');
    expect(RoundOneScore.deleteMany).toHaveBeenCalledWith({ judgeId: 'J001' });
    expect(FinalRoundScore.deleteMany).toHaveBeenCalledWith({ judgeId: 'J001' });
    expect(JudgeNote.deleteMany).toHaveBeenCalledWith({ judgeId: 'J001' });
    expect(logAudit).toHaveBeenCalledWith({
      user: { _id: 'admin-user', role: 'admin' },
      action: 'JUDGE_DELETED',
      judgeId: 'J001',
      previousValue: {
        _id: 'judge-record',
        judgeId: 'J001',
        name: 'Judge One',
        userId: 'judge-user'
      }
    });
  });

  it('returns not found without deleting related data', async () => {
    vi.mocked(Judge.findById).mockResolvedValueOnce(null);

    const response = await removeJudge();

    expect(response.status).toBe(404);
    expect(Judge.findByIdAndDelete).not.toHaveBeenCalled();
    expect(User.findByIdAndDelete).not.toHaveBeenCalled();
    expect(RoundOneScore.deleteMany).not.toHaveBeenCalled();
  });
});
