import express from 'express';
import { adminOnly, authMiddleware } from '../middleware/auth.js';
import { Pageant } from '../models/Pageant.js';
import { logAudit } from '../services/auditService.js';
import { normalizeFinalCriteria, normalizeRoundOneCriteria } from '../services/criteriaService.js';
import { emitToAdmins, emitToAll } from '../services/socketBus.js';
import { asyncHandler, HttpError } from '../utils/httpError.js';

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
    if (req.body.themeColor !== undefined && !/^#[0-9a-fA-F]{6}$/.test(req.body.themeColor)) {
      throw new HttpError(422, 'Theme color must be a six-digit hex color.');
    }
    const roundOneCategories = req.body.roundOneCategories === undefined
      ? undefined
      : normalizeRoundOneCriteria(req.body.roundOneCategories);
    const finalCategories = req.body.finalCategories === undefined
      ? undefined
      : normalizeFinalCriteria(req.body.finalCategories);

    const updates = {};
    for (const field of ['pageantName', 'eventName', 'organizationName', 'motto', 'venue', 'logo', 'themeColor']) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    if (req.body.eventDate !== undefined) updates.eventDate = req.body.eventDate || null;
    if (req.body.finalistCount !== undefined) updates.finalistCount = Number(req.body.finalistCount) || 5;
    if (roundOneCategories) updates.roundOneCategories = roundOneCategories;
    if (finalCategories) updates.finalCategories = finalCategories;

    const pageant = await Pageant.findOneAndUpdate(
      {},
      { $set: updates },
      { upsert: true, new: true, runValidators: true }
    );

    await logAudit({ user: req.user, action: 'PAGEANT_UPDATED', previousValue: previous, newValue: pageant });
    emitToAll('pageant:updated', { id: pageant._id });
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

pageantRoutes.patch(
  '/categories/:round/:key/lock',
  adminOnly,
  asyncHandler(async (req, res) => {
    const field = req.params.round === 'round-one' ? 'roundOneCategories'
      : req.params.round === 'final' ? 'finalCategories' : null;
    if (!field || typeof req.body.locked !== 'boolean') {
      throw new HttpError(422, 'Choose a valid round and lock state.');
    }

    let pageant = await Pageant.findOne().sort({ createdAt: 1 });
    if (!pageant) pageant = await Pageant.create({});
    const category = pageant[field].find((item) => item.key === req.params.key);
    if (!category) throw new HttpError(404, 'Category not found.');

    const previous = { key: category.key, locked: category.locked === true };
    category.locked = req.body.locked;
    await pageant.save();
    await logAudit({ user: req.user, action: 'CATEGORY_LOCK_UPDATED', previousValue: previous,
      newValue: { round: req.params.round, key: category.key, locked: category.locked } });
    emitToAll('criteria:updated', {
      roundOneCategories: pageant.roundOneCategories,
      finalCategories: pageant.finalCategories
    });
    emitToAdmins('results:updated', { reason: 'category-lock-updated' });
    res.json({ category });
  })
);
