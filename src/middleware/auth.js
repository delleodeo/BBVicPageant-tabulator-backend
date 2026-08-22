import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Judge } from '../models/Judge.js';
import { HttpError } from '../utils/httpError.js';

export async function authMiddleware(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      throw new HttpError(401, 'Authentication required.');
    }

    const payload = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(payload.userId).select('+passwordHash');

    if (!user || user.status !== 'active') {
      throw new HttpError(401, 'Invalid or inactive account.');
    }

    req.user = user;
    req.auth = payload;

    if (user.role === 'judge') {
      const judge = await Judge.findOne({ userId: user._id });
      if (!judge || judge.status !== 'active') {
        throw new HttpError(401, 'Inactive judge account.');
      }
      req.judge = judge;
    }

    next();
  } catch (err) {
    next(err.status ? err : new HttpError(401, 'Invalid token.'));
  }
}

export function adminOnly(req, _res, next) {
  if (req.user?.role !== 'admin') {
    return next(new HttpError(403, 'Admin access required.'));
  }
  return next();
}

export function judgeOnly(req, _res, next) {
  if (req.user?.role !== 'judge' || !req.judge) {
    return next(new HttpError(403, 'Judge access required.'));
  }
  return next();
}

