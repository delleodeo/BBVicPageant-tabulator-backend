import express from 'express';
import { adminOnly, authMiddleware } from '../middleware/auth.js';
import { Pageant } from '../models/Pageant.js';
import { logAudit } from '../services/auditService.js';
import { asyncHandler } from '../utils/httpError.js';

export const pageantRoutes = express.Router();

pageantRoutes.use(authMiddleware);

pageantRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    let pageant = await Pageant.findOne().sort({ createdAt: 1 });
    if (!pageant) pageant = await Pageant.create({});
    res.json({ pageant });
  })
);

pageantRoutes.put(
  '/',
  adminOnly,
  asyncHandler(async (req, res) => {
    const previous = await Pageant.findOne().sort({ createdAt: 1 });
    const pageant = await Pageant.findOneAndUpdate(
      {},
      {
        pageantName: req.body.pageantName,
        eventName: req.body.eventName,
        organizationName: req.body.organizationName,
        motto: req.body.motto,
        eventDate: req.body.eventDate || null,
        venue: req.body.venue,
        logo: req.body.logo,
        themeColor: req.body.themeColor,
        soundEnabled: req.body.soundEnabled !== undefined ? req.body.soundEnabled : true,
        finalistCount: req.body.finalistCount ? Number(req.body.finalistCount) : 5
      },
      { upsert: true, new: true, runValidators: true }
    );

    await logAudit({ user: req.user, action: 'PAGEANT_UPDATED', previousValue: previous, newValue: pageant });
    res.json({ pageant });
  })
);

