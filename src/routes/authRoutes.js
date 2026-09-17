import bcrypt from 'bcryptjs';
import express from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { authMiddleware } from '../middleware/auth.js';
import { Judge } from '../models/Judge.js';
import { User } from '../models/User.js';
import { logAudit } from '../services/auditService.js';
import { asyncHandler, HttpError } from '../utils/httpError.js';

export const authRoutes = express.Router();

function signUser(user, judge) {
  return jwt.sign(
    {
      userId: user._id,
      role: user.role,
      judgeId: judge?.judgeId
    },
    env.jwtSecret,
    { expiresIn: '12h' }
  );
}

authRoutes.post(
  '/login',
  asyncHandler(async (req, res) => {
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    const user = await User.findOne({ username });
    if (!user || user.status !== 'active') {
      throw new HttpError(401, 'Invalid login.');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new HttpError(401, 'Invalid login.');
    }

    const judge = user.role === 'judge' ? await Judge.findOne({ userId: user._id }) : null;
    if (user.role === 'judge' && (!judge || judge.status !== 'active')) {
      throw new HttpError(401, 'Inactive judge account.');
    }

    res.json({
      token: signUser(user, judge),
      user: user.toJSON(),
      judge
    });
  })
);

authRoutes.post('/logout', authMiddleware, (_req, res) => {
  res.json({ message: 'Logged out.' });
});

authRoutes.get(
  '/me',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const judge = req.user.role === 'judge' ? await Judge.findOne({ userId: req.user._id }) : null;
    res.json({ user: req.user.toJSON(), judge });
  })
);

authRoutes.post(
  '/change-password',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    const confirmPassword = String(req.body.confirmPassword || '');

    if (!currentPassword || !newPassword || !confirmPassword) {
      throw new HttpError(422, 'Current password, new password, and confirmation are required.');
    }
    if (newPassword !== confirmPassword) {
      throw new HttpError(422, 'New password and confirmation do not match.');
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      throw new HttpError(422, 'New password must be between 8 and 128 characters.');
    }

    const currentPasswordValid = await bcrypt.compare(currentPassword, req.user.passwordHash);
    if (!currentPasswordValid) {
      throw new HttpError(422, 'Current password is incorrect.');
    }
    if (await bcrypt.compare(newPassword, req.user.passwordHash)) {
      throw new HttpError(422, 'New password must be different from the current password.');
    }

    req.user.passwordHash = await bcrypt.hash(newPassword, 12);
    await req.user.save();
    await logAudit({
      user: req.user,
      action: req.user.role === 'judge' ? 'JUDGE_PASSWORD_CHANGED' : 'ADMIN_PASSWORD_CHANGED'
    });

    res.json({ message: 'Password changed successfully.' });
  })
);
