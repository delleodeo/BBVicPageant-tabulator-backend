import { once } from 'node:events';
import bcrypt from 'bcryptjs';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({ user: null }));

vi.mock('../src/middleware/auth.js', () => ({
  authMiddleware: (req, _res, next) => {
    req.user = authState.user;
    next();
  },
  adminOnly: (req, _res, next) => {
    if (req.user?.role === 'admin') return next();
    const error = new Error('Admin access required.');
    error.status = 403;
    return next(error);
  }
}));

vi.mock('../src/models/Judge.js', () => ({ Judge: { findOne: vi.fn() } }));
vi.mock('../src/models/User.js', () => ({ User: { findOne: vi.fn() } }));
vi.mock('../src/services/auditService.js', () => ({ logAudit: vi.fn() }));

import { errorHandler } from '../src/middleware/errorHandler.js';
import { authRoutes } from '../src/routes/authRoutes.js';
import { logAudit } from '../src/services/auditService.js';

describe('authenticated account password change', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use(errorHandler);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(async () => {
    vi.resetAllMocks();
    authState.user = {
      _id: 'admin-user',
      role: 'admin',
      passwordHash: await bcrypt.hash('CurrentPass123', 4),
      save: vi.fn().mockResolvedValue(undefined)
    };
  });

  function changePassword(body) {
    return fetch(`${baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  it('changes the signed-in administrator password and audits the event', async () => {
    const response = await changePassword({
      currentPassword: 'CurrentPass123',
      newPassword: 'ReplacementPass456',
      confirmPassword: 'ReplacementPass456'
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe('Password changed successfully.');
    expect(await bcrypt.compare('ReplacementPass456', authState.user.passwordHash)).toBe(true);
    expect(authState.user.save).toHaveBeenCalledOnce();
    expect(logAudit).toHaveBeenCalledWith({
      user: authState.user,
      action: 'ADMIN_PASSWORD_CHANGED'
    });
  });

  it('rejects an incorrect current password', async () => {
    const response = await changePassword({
      currentPassword: 'WrongPassword',
      newPassword: 'ReplacementPass456',
      confirmPassword: 'ReplacementPass456'
    });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.message).toBe('Current password is incorrect.');
    expect(authState.user.save).not.toHaveBeenCalled();
  });

  it('rejects mismatched and short replacement passwords', async () => {
    const mismatch = await changePassword({
      currentPassword: 'CurrentPass123',
      newPassword: 'ReplacementPass456',
      confirmPassword: 'DifferentPass456'
    });
    expect(mismatch.status).toBe(422);

    const tooShort = await changePassword({
      currentPassword: 'CurrentPass123',
      newPassword: 'short',
      confirmPassword: 'short'
    });
    expect(tooShort.status).toBe(422);
    expect(authState.user.save).not.toHaveBeenCalled();
  });

  it('allows a judge to change their password and audits the event', async () => {
    authState.user.role = 'judge';
    const response = await changePassword({
      currentPassword: 'CurrentPass123',
      newPassword: 'ReplacementPass456',
      confirmPassword: 'ReplacementPass456'
    });

    expect(response.status).toBe(200);
    expect(await bcrypt.compare('ReplacementPass456', authState.user.passwordHash)).toBe(true);
    expect(authState.user.save).toHaveBeenCalledOnce();
    expect(logAudit).toHaveBeenCalledWith({
      user: authState.user,
      action: 'JUDGE_PASSWORD_CHANGED'
    });
  });
});
