import express from 'express';
import { adminOnly, authMiddleware } from '../middleware/auth.js';
import { Contestant } from '../models/Contestant.js';
import { RoundOneScore } from '../models/RoundOneScore.js';
import { SpecialAward } from '../models/SpecialAward.js';
import { logAudit } from '../services/auditService.js';
import { calculateSpecialAwards } from '../services/scoringService.js';
import { getScoringCriteria } from '../services/criteriaService.js';
import { emitToAdmins, emitToAll } from '../services/socketBus.js';
import { asyncHandler, HttpError } from '../utils/httpError.js';

export const specialAwardRoutes = express.Router();

export async function computeSpecialAwardsSummary() {
  const contestants = await Contestant.find().sort({ contestantNumber: 1 });
  const scores = await RoundOneScore.find({ round: 'ROUND_1' });
  const { roundOneCategories } = await getScoringCriteria();
  const categoryAwards = calculateSpecialAwards(contestants, scores, roundOneCategories);
  const customAwards = await SpecialAward.find().populate('winnerContestantId').sort({ createdAt: 1 });

  return {
    categoryAwards,
    customAwards
  };
}

specialAwardRoutes.use(authMiddleware);

specialAwardRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    const summary = await computeSpecialAwardsSummary();
    res.json(summary);
  })
);

specialAwardRoutes.post(
  '/',
  adminOnly,
  asyncHandler(async (req, res) => {
    const { title, description, sponsor, winnerContestantId, type } = req.body;
    if (!title) throw new HttpError(422, 'Award title is required.');

    let winnerDetails = null;
    if (winnerContestantId) {
      const contestant = await Contestant.findById(winnerContestantId);
      if (contestant) {
        winnerDetails = {
          contestantNumber: contestant.contestantNumber,
          name: contestant.name
        };
      }
    }

    const award = await SpecialAward.create({
      title,
      description: description || '',
      sponsor: sponsor || '',
      type: type || 'CUSTOM_AWARD',
      winnerContestantId: winnerContestantId || null,
      winnerDetails
    });

    await logAudit({
      user: req.user,
      action: 'SPECIAL_AWARD_CREATED',
      newValue: award
    });

    emitToAll('special_awards:updated', await computeSpecialAwardsSummary());
    res.status(201).json({ award });
  })
);

specialAwardRoutes.put(
  '/:id',
  adminOnly,
  asyncHandler(async (req, res) => {
    const award = await SpecialAward.findById(req.params.id);
    if (!award) throw new HttpError(404, 'Special award not found.');

    const previous = award.toObject();
    const { title, description, sponsor, winnerContestantId, announced, type } = req.body;

    if (title !== undefined) award.title = title;
    if (description !== undefined) award.description = description;
    if (sponsor !== undefined) award.sponsor = sponsor;
    if (type !== undefined) award.type = type;
    if (announced !== undefined) award.announced = Boolean(announced);

    if (winnerContestantId !== undefined) {
      award.winnerContestantId = winnerContestantId || null;
      if (winnerContestantId) {
        const contestant = await Contestant.findById(winnerContestantId);
        award.winnerDetails = contestant
          ? { contestantNumber: contestant.contestantNumber, name: contestant.name }
          : null;
      } else {
        award.winnerDetails = null;
      }
    }

    await award.save();

    await logAudit({
      user: req.user,
      action: 'SPECIAL_AWARD_UPDATED',
      previousValue: previous,
      newValue: award
    });

    emitToAll('special_awards:updated', await computeSpecialAwardsSummary());
    res.json({ award });
  })
);

specialAwardRoutes.delete(
  '/:id',
  adminOnly,
  asyncHandler(async (req, res) => {
    const award = await SpecialAward.findByIdAndDelete(req.params.id);
    if (!award) throw new HttpError(404, 'Special award not found.');

    await logAudit({
      user: req.user,
      action: 'SPECIAL_AWARD_DELETED',
      previousValue: award
    });

    emitToAll('special_awards:updated', await computeSpecialAwardsSummary());
    res.json({ message: 'Award deleted.' });
  })
);
