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

vi.mock('../src/models/Judge.js', () => ({ Judge: { findById: vi.fn() } }));
vi.mock('../src/models/User.js', () => ({ User: { findByIdAndUpdate: vi.fn() } }));
vi.mock('../src/services/auditService.js', () => ({ logAudit: vi.fn() }));

import { errorHandler } from '../src/middleware/errorHandler.js';
import { Judge } from '../src/models/Judge.js';
import { User } from '../src/models/User.js';
import { judgeRoutes } from '../src/routes/judgeRoutes.js';

describe('admin judge username update', () => {
  let server;
  let baseUrl;
  let judge;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
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
    judge = {
      _id: 'judge-record',
      judgeId: 'J001',
      name: 'Judge One',
      designation: 'Judge',
      avatar: '',
      status: 'active',
      userId: 'judge-user',
      toObject: vi.fn(() => ({ judgeId: 'J001', name: 'Judge One' })),
      save: vi.fn().mockResolvedValue(undefined)
    };
    vi.mocked(Judge.findById).mockResolvedValue(judge);
    vi.mocked(User.findByIdAndUpdate).mockResolvedValue({});
  });

  function updateJudge(body) {
    return fetch(`${baseUrl}/api/judges/judge-record`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  it('normalizes and updates the judge login username', async () => {
    const response = await updateJudge({ username: '  NEW.JUDGE  ' });

    expect(response.status).toBe(200);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      'judge-user',
      { username: 'new.judge' },
      { runValidators: true }
    );
    expect(judge.save).toHaveBeenCalledOnce();
  });

  it('rejects an empty username without changing the judge', async () => {
    const response = await updateJudge({ username: '   ' });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.message).toBe('Username is required.');
    expect(judge.save).not.toHaveBeenCalled();
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
