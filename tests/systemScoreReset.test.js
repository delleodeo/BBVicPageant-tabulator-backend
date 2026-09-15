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

vi.mock('../src/models/AuditLog.js', () => ({ AuditLog: {} }));
vi.mock('../src/models/Contestant.js', () => ({ Contestant: { updateMany: vi.fn() } }));
vi.mock('../src/models/Finalist.js', () => ({ Finalist: { deleteMany: vi.fn() } }));
vi.mock('../src/models/FinalRoundScore.js', () => ({ FinalRoundScore: { deleteMany: vi.fn() } }));
vi.mock('../src/models/Judge.js', () => ({ Judge: {} }));
vi.mock('../src/models/Pageant.js', () => ({ Pageant: { findOneAndUpdate: vi.fn() } }));
vi.mock('../src/models/Round.js', () => ({ Round: { findOneAndUpdate: vi.fn() } }));
vi.mock('../src/models/RoundOneScore.js', () => ({ RoundOneScore: { deleteMany: vi.fn() } }));
vi.mock('../src/models/SpecialAward.js', () => ({ SpecialAward: {} }));
vi.mock('../src/models/User.js', () => ({ User: {} }));
vi.mock('../src/services/auditService.js', () => ({ logAudit: vi.fn() }));
vi.mock('../src/services/criteriaService.js', () => ({ getScoringCriteria: vi.fn() }));
vi.mock('../src/services/socketBus.js', () => ({ emitToAll: vi.fn() }));

import { errorHandler } from '../src/middleware/errorHandler.js';
import { Contestant } from '../src/models/Contestant.js';
import { Finalist } from '../src/models/Finalist.js';
import { FinalRoundScore } from '../src/models/FinalRoundScore.js';
import { Pageant } from '../src/models/Pageant.js';
import { Round } from '../src/models/Round.js';
import { RoundOneScore } from '../src/models/RoundOneScore.js';
import { systemRoutes } from '../src/routes/systemRoutes.js';
import { logAudit } from '../src/services/auditService.js';
import { emitToAll } from '../src/services/socketBus.js';

describe('admin judge score reset', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/admin/system', systemRoutes);
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
    vi.mocked(RoundOneScore.deleteMany).mockResolvedValue({ deletedCount: 12 });
    vi.mocked(FinalRoundScore.deleteMany).mockResolvedValue({ deletedCount: 5 });
    vi.mocked(Finalist.deleteMany).mockResolvedValue({ deletedCount: 5 });
    vi.mocked(Contestant.updateMany).mockResolvedValue({ modifiedCount: 10 });
    vi.mocked(Round.findOneAndUpdate).mockResolvedValue({});
    vi.mocked(Pageant.findOneAndUpdate).mockResolvedValue({});
  });

  function resetScores(confirmation) {
    return fetch(`${baseUrl}/api/admin/system/reset-scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation })
    });
  }

  it('rejects an incorrect confirmation without deleting scores', async () => {
    const response = await resetScores('Tabulation');
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.message).toContain('Type "tabulation" exactly');
    expect(RoundOneScore.deleteMany).not.toHaveBeenCalled();
    expect(FinalRoundScore.deleteMany).not.toHaveBeenCalled();
    expect(Finalist.deleteMany).not.toHaveBeenCalled();
    expect(Round.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('deletes all scores and finalists, reopens Round 1, and returns Final Round to setup', async () => {
    const response = await resetScores('tabulation');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.deletedScores).toEqual({ roundOne: 12, final: 5, total: 17 });
    expect(body.resetState).toEqual({ finalistsRemoved: 5, roundOne: 'OPEN', finalRound: 'SETUP' });
    expect(RoundOneScore.deleteMany).toHaveBeenCalledWith({});
    expect(FinalRoundScore.deleteMany).toHaveBeenCalledWith({});
    expect(Finalist.deleteMany).toHaveBeenCalledWith({ round: 'FINAL' });
    expect(Contestant.updateMany).toHaveBeenCalledWith(
      { status: { $in: ['FINALIST', 'ELIMINATED'] } },
      { $set: { status: 'ACTIVE' } }
    );
    expect(Round.findOneAndUpdate).toHaveBeenCalledWith(
      { name: 'ROUND_1' },
      { $set: { status: 'OPEN', openedAt: expect.any(Date), lockedAt: null } },
      { upsert: true, new: true }
    );
    expect(Round.findOneAndUpdate).toHaveBeenCalledWith(
      { name: 'FINAL' },
      { $set: { status: 'SETUP', openedAt: null, lockedAt: null } },
      { upsert: true, new: true }
    );
    expect(Pageant.findOneAndUpdate).toHaveBeenCalledWith(
      {},
      { $set: { roundOneLocked: false, finalRoundLocked: false } },
      { upsert: true, new: true }
    );
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ALL_JUDGE_SCORES_RESET',
      previousValue: {
        deletedScores: { roundOne: 12, final: 5, total: 17 },
        finalistsRemoved: 5
      },
      newValue: { roundOneScores: 0, finalScores: 0, roundOne: 'OPEN', finalRound: 'SETUP' }
    }));
    expect(emitToAll).toHaveBeenCalledWith('scores:reset', expect.objectContaining({
      deletedScores: { roundOne: 12, final: 5, total: 17 }
    }));
    expect(emitToAll).toHaveBeenCalledWith('results:updated', expect.any(Object));
    expect(emitToAll).toHaveBeenCalledWith('round:opened', { round: 'ROUND_1' });
  });
});
