import bcrypt from 'bcryptjs';
import express from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { authMiddleware } from '../middleware/auth.js';
import { Judge } from '../models/Judge.js';
import { User } from '../models/User.js';
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

