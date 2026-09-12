import express from 'express';
import { adminOnly, authMiddleware } from '../middleware/auth.js';
import { Pageant } from '../models/Pageant.js';
import { logAudit } from '../services/auditService.js';
import { normalizeFinalCriteria, normalizeRoundOneCriteria } from '../services/criteriaService.js';
import { emitToAdmins, emitToAll } from '../services/socketBus.js';
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
    const roundOneCategories = req.body.roundOneCategories === undefined
      ? undefined
      : normalizeRoundOneCriteria(req.body.roundOneCategories);
    const finalCategories = req.body.finalCategories === undefined
      ? undefined
      : normalizeFinalCriteria(req.body.finalCategories);

    const updates = {
      pageantName: req.body.pageantName,
      eventName: req.body.eventName,
      organizationName: req.body.organizationName,
      motto: req.body.motto,
      eventDate: req.body.eventDate || null,
      venue: req.body.venue,
      logo: req.body.logo,
      themeColor: req.body.themeColor,
      finalistCount: req.body.finalistCount ? Number(req.body.finalistCount) : 5
    };
    if (roundOneCategories) updates.roundOneCategories = roundOneCategories;
    if (finalCategories) updates.finalCategories = finalCategories;

    const pageant = await Pageant.findOneAndUpdate(
      {},
      { $set: updates },
      { upsert: true, new: true, runValidators: true }
    );

    await logAudit({ user: req.user, action: 'PAGEANT_UPDATED', previousValue: previous, newValue: pageant });
    if (roundOneCategories || finalCategories) {
      emitToAll('criteria:updated', {
        roundOneCategories: pageant.roundOneCategories,
        finalCategories: pageant.finalCategories
      });
      emitToAdmins('results:updated', { reason: 'criteria-updated' });
    }
    res.json({ pageant });
  })
);
