import bcrypt from 'bcryptjs';
import express from 'express';
import { adminOnly, authMiddleware } from '../middleware/auth.js';
import { Judge } from '../models/Judge.js';
import { User } from '../models/User.js';
import { logAudit } from '../services/auditService.js';
import { asyncHandler, HttpError } from '../utils/httpError.js';

export const judgeRoutes = express.Router();

judgeRoutes.use(authMiddleware, adminOnly);

judgeRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    const judges = await Judge.find().populate('userId').sort({ judgeId: 1 });
    res.json({ judges });
  })
);

judgeRoutes.post(
  '/',
  asyncHandler(async (req, res) => {
    const passwordHash = await bcrypt.hash(req.body.password, 12);
    const user = await User.create({
      username: req.body.username,
      passwordHash,
      role: 'judge',
      status: req.body.status || 'active'
    });

    const judge = await Judge.create({
      judgeId: req.body.judgeId,
      name: req.body.name,
      designation: req.body.designation || 'Judge',
      avatar: req.body.avatar || '',
      userId: user._id,
      status: req.body.status || 'active'
    });

    user.judgeId = judge._id;
    await user.save();

    await logAudit({ user: req.user, action: 'JUDGE_CREATED', judgeId: judge.judgeId, newValue: { judge, username: user.username } });
    res.status(201).json({ judge });
  })
);

judgeRoutes.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const judge = await Judge.findById(req.params.id);
    if (!judge) throw new HttpError(404, 'Judge not found.');
    const previous = judge.toObject();

    judge.judgeId = req.body.judgeId ?? judge.judgeId;
    judge.name = req.body.name ?? judge.name;
    judge.designation = req.body.designation ?? judge.designation;
    judge.avatar = req.body.avatar ?? judge.avatar;
    judge.status = req.body.status ?? judge.status;
    await judge.save();

    if (req.body.username || req.body.status) {
      await User.findByIdAndUpdate(judge.userId, {
        ...(req.body.username ? { username: req.body.username } : {}),
        ...(req.body.status ? { status: req.body.status } : {})
      });
    }

    await logAudit({ user: req.user, action: 'JUDGE_UPDATED', judgeId: judge.judgeId, previousValue: previous, newValue: judge });
    res.json({ judge });
  })
);

judgeRoutes.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const judge = await Judge.findById(req.params.id);
    if (!judge) throw new HttpError(404, 'Judge not found.');
    judge.status = req.body.status === 'inactive' ? 'inactive' : 'active';
    await judge.save();
    await User.findByIdAndUpdate(judge.userId, { status: judge.status });
    await logAudit({ user: req.user, action: 'JUDGE_STATUS_UPDATED', judgeId: judge.judgeId, newValue: judge.status });
    res.json({ judge });
  })
);

judgeRoutes.post(
  '/:id/reset-password',
  asyncHandler(async (req, res) => {
    const judge = await Judge.findById(req.params.id);
    if (!judge) throw new HttpError(404, 'Judge not found.');
    const passwordHash = await bcrypt.hash(req.body.password, 12);
    await User.findByIdAndUpdate(judge.userId, { passwordHash });
    await logAudit({ user: req.user, action: 'JUDGE_PASSWORD_RESET', judgeId: judge.judgeId });
    res.json({ message: 'Password reset.' });
  })
);

