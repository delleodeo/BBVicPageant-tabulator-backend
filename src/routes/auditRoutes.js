import express from 'express';
import { adminOnly, authMiddleware } from '../middleware/auth.js';
import { AuditLog } from '../models/AuditLog.js';
import { asyncHandler } from '../utils/httpError.js';

export const auditRoutes = express.Router();

auditRoutes.use(authMiddleware, adminOnly);

auditRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit || 100), 500);
    const logs = await AuditLog.find().sort({ timestamp: -1 }).limit(limit);
    res.json({ logs });
  })
);

