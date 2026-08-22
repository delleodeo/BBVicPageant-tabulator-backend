import express from 'express';
import { adminOnly, authMiddleware } from '../middleware/auth.js';
import { Contestant } from '../models/Contestant.js';
import { Finalist } from '../models/Finalist.js';
import { FinalRoundScore } from '../models/FinalRoundScore.js';
import { JudgeNote } from '../models/JudgeNote.js';
import { RoundOneScore } from '../models/RoundOneScore.js';
import { SpecialAward } from '../models/SpecialAward.js';
import { logAudit } from '../services/auditService.js';
import { asyncHandler, HttpError } from '../utils/httpError.js';

export const contestantRoutes = express.Router();

contestantRoutes.use(authMiddleware);

contestantRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = {};
    if (req.query.status) query.status = req.query.status;
    if (req.query.search) {
      const regex = new RegExp(String(req.query.search).trim(), 'i');
      query.$or = [{ name: regex }, { contestantNumber: regex }, { hometown: regex }];
    }
    const contestants = await Contestant.find(query).sort({ contestantNumber: 1 });
    res.json({ contestants });
  })
);

contestantRoutes.post(
  '/',
  adminOnly,
  asyncHandler(async (req, res) => {
    const contestant = await Contestant.create({
      contestantNumber: req.body.contestantNumber,
      name: req.body.name,
      photo: req.body.photo || '',
      hometown: req.body.hometown || '',
      advocacy: req.body.advocacy || '',
      age: req.body.age ? Number(req.body.age) : undefined,
      height: req.body.height || '',
      bio: req.body.bio || '',
      tagline: req.body.tagline || '',
      status: req.body.status || 'ACTIVE'
    });

    await logAudit({ user: req.user, action: 'CONTESTANT_CREATED', contestantId: contestant._id, newValue: contestant });
    res.status(201).json({ contestant });
  })
);

contestantRoutes.post(
  '/bulk-import',
  adminOnly,
  asyncHandler(async (req, res) => {
    const items = Array.isArray(req.body.contestants) ? req.body.contestants : [];
    if (items.length === 0) throw new HttpError(422, 'No contestants data provided for bulk import.');

    const created = [];
    for (const item of items) {
      if (!item.contestantNumber || !item.name) continue;
      const contestant = await Contestant.findOneAndUpdate(
        { contestantNumber: String(item.contestantNumber).trim() },
        {
          $set: {
            name: String(item.name).trim(),
            photo: item.photo || '',
            hometown: item.hometown || '',
            advocacy: item.advocacy || '',
            age: item.age ? Number(item.age) : undefined,
            height: item.height || '',
            bio: item.bio || '',
            status: item.status || 'ACTIVE'
          }
        },
        { upsert: true, new: true }
      );
      created.push(contestant);
    }

    await logAudit({
      user: req.user,
      action: 'CONTESTANTS_BULK_IMPORTED',
      newValue: { count: created.length }
    });

    res.json({ count: created.length, contestants: created });
  })
);

contestantRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const contestant = await Contestant.findById(req.params.id);
    if (!contestant) throw new HttpError(404, 'Contestant not found.');
    res.json({ contestant });
  })
);

contestantRoutes.put(
  '/:id',
  adminOnly,
  asyncHandler(async (req, res) => {
    const previous = await Contestant.findById(req.params.id);
    if (!previous) throw new HttpError(404, 'Contestant not found.');

    const contestant = await Contestant.findByIdAndUpdate(
      req.params.id,
      {
        contestantNumber: req.body.contestantNumber,
        name: req.body.name,
        photo: req.body.photo !== undefined ? req.body.photo : previous.photo,
        hometown: req.body.hometown !== undefined ? req.body.hometown : previous.hometown,
        advocacy: req.body.advocacy !== undefined ? req.body.advocacy : previous.advocacy,
        age: req.body.age !== undefined ? (req.body.age ? Number(req.body.age) : null) : previous.age,
        height: req.body.height !== undefined ? req.body.height : previous.height,
        bio: req.body.bio !== undefined ? req.body.bio : previous.bio,
        tagline: req.body.tagline !== undefined ? req.body.tagline : previous.tagline,
        status: req.body.status || previous.status
      },
      { new: true, runValidators: true }
    );

    await logAudit({
      user: req.user,
      action: 'CONTESTANT_UPDATED',
      contestantId: contestant._id,
      previousValue: previous,
      newValue: contestant
    });
    res.json({ contestant });
  })
);

contestantRoutes.delete(
  '/:id',
  adminOnly,
  asyncHandler(async (req, res) => {
    const contestant = await Contestant.findByIdAndDelete(req.params.id);
    if (!contestant) throw new HttpError(404, 'Contestant not found.');

    await Promise.all([
      Finalist.deleteMany({ contestantId: contestant._id }),
      RoundOneScore.deleteMany({ contestantId: contestant._id }),
      FinalRoundScore.deleteMany({ contestantId: contestant._id }),
      JudgeNote.deleteMany({ contestantId: contestant._id }),
      SpecialAward.updateMany(
        { winnerContestantId: contestant._id },
        { $set: { winnerContestantId: null, winnerDetails: null } }
      )
    ]);

    await logAudit({ user: req.user, action: 'CONTESTANT_DELETED', contestantId: contestant._id, previousValue: contestant });
    res.json({ message: 'Contestant deleted.' });
  })
);

