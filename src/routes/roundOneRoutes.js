import express from 'express';
import { adminOnly, authMiddleware, judgeOnly } from '../middleware/auth.js';
import { Contestant } from '../models/Contestant.js';
import { Judge } from '../models/Judge.js';
import { Round } from '../models/Round.js';
import { RoundOneScore } from '../models/RoundOneScore.js';
import { logAudit } from '../services/auditService.js';
import { generateFinalists } from '../services/finalistService.js';
import { getRound } from '../services/roundService.js';
import { Pageant } from '../models/Pageant.js';
import { emitToAdmins } from '../services/socketBus.js';
import { getScoringCriteria } from '../services/criteriaService.js';
import {
  calculateRoundOneRankings,
  validateRoundCompletion,
  validateScorePatch
} from '../services/scoringService.js';
import { asyncHandler, HttpError } from '../utils/httpError.js';

export const judgeRoundOneRoutes = express.Router();
export const adminRoundOneRoutes = express.Router();

async function buildRoundOneResults(configuredCategories) {
  const categories = configuredCategories || (await getScoringCriteria()).roundOneCategories;
  const contestants = await Contestant.find().sort({ contestantNumber: 1 });
  const judges = await Judge.find({ status: 'active' }).sort({ judgeId: 1 });
  const scores = await RoundOneScore.find({ round: 'ROUND_1' });
  const rankings = calculateRoundOneRankings(contestants, scores, categories);
  const completion = validateRoundCompletion(judges, contestants, scores, categories);

  const judgeProgress = judges.map((judge) => {
    const completeCount = contestants.filter((contestant) => {
      const score = scores.find(
        (entry) => entry.judgeId === judge.judgeId && String(entry.contestantId) === String(contestant._id)
      );
      return categories.every((category) => score?.[category.key] !== undefined && score?.[category.key] !== null);
    }).length;

    return {
      judgeId: judge.judgeId,
      name: judge.name,
      complete: completeCount,
      total: contestants.length
    };
  });

  const requiredScoreSheets = judges.length * contestants.length;
  const completedScoreSheets = judgeProgress.reduce((sum, progress) => sum + progress.complete, 0);

  return {
    categories,
    rankings,
    completion,
    judgeProgress,
    overallProgress: requiredScoreSheets === 0 ? 0 : Math.round((completedScoreSheets / requiredScoreSheets) * 100),
    totals: {
      contestants: contestants.length,
      judges: judges.length,
      requiredScoreSheets,
      completedScoreSheets,
      pendingScoreSheets: Math.max(requiredScoreSheets - completedScoreSheets, 0)
    }
  };
}

judgeRoundOneRoutes.use(authMiddleware, judgeOnly);

judgeRoundOneRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    const round = await getRound('ROUND_1');
    const contestants = await Contestant.find().sort({ contestantNumber: 1 });
    const scores = await RoundOneScore.find({ judgeId: req.judge.judgeId, round: 'ROUND_1' });
    const { roundOneCategories: categories } = await getScoringCriteria();
    res.json({ round, contestants, scores, categories });
  })
);

judgeRoundOneRoutes.get(
  '/:contestantId',
  asyncHandler(async (req, res) => {
    const contestant = await Contestant.findById(req.params.contestantId);
    if (!contestant) throw new HttpError(404, 'Contestant not found.');
    const round = await getRound('ROUND_1');
    const score = await RoundOneScore.findOne({
      judgeId: req.judge.judgeId,
      contestantId: contestant._id,
      round: 'ROUND_1'
    });
    const { roundOneCategories: categories } = await getScoringCriteria();
    res.json({ round, contestant, score, categories });
  })
);

judgeRoundOneRoutes.post(
  '/scores',
  asyncHandler(async (req, res) => {
    const round = await getRound('ROUND_1');
    if (round.status !== 'OPEN') throw new HttpError(403, 'Round 1 is not open.');

    const contestant = await Contestant.findById(req.body.contestantId);
    if (!contestant) throw new HttpError(404, 'Contestant not found.');

    const { roundOneCategories: categories } = await getScoringCriteria();
    const patch = validateScorePatch(req.body, categories.map((category) => category.key));
    const previous = await RoundOneScore.findOne({
      judgeId: req.judge.judgeId,
      contestantId: contestant._id,
      round: 'ROUND_1'
    });

    const score = await RoundOneScore.findOneAndUpdate(
      { judgeId: req.judge.judgeId, contestantId: contestant._id, round: 'ROUND_1' },
      { $set: patch },
      { upsert: true, new: true, runValidators: true }
    );

    await logAudit({
      user: req.user,
      action: previous ? 'ROUND_1_SCORE_UPDATED' : 'ROUND_1_SCORE_CREATED',
      contestantId: contestant._id,
      judgeId: req.judge.judgeId,
      round: 'ROUND_1',
      previousValue: previous,
      newValue: score
    });

    const results = await buildRoundOneResults(categories);
    emitToAdmins(previous ? 'score:updated' : 'score:created', { round: 'ROUND_1', score });
    emitToAdmins('progress:updated', results);
    emitToAdmins('results:updated', results);

    res.status(previous ? 200 : 201).json({ score });
  })
);

judgeRoundOneRoutes.put(
  '/scores/:id',
  asyncHandler(async (req, res) => {
    const round = await getRound('ROUND_1');
    if (round.status === 'LOCKED') throw new HttpError(403, 'Round 1 is locked.');
    if (round.status !== 'OPEN') throw new HttpError(403, 'Round 1 is not open.');

    const previous = await RoundOneScore.findById(req.params.id);
    if (!previous) throw new HttpError(404, 'Score not found.');
    if (previous.judgeId !== req.judge.judgeId) {
      throw new HttpError(403, 'You are not authorized to modify this score.');
    }

    const { roundOneCategories: categories } = await getScoringCriteria();
    const patch = validateScorePatch(req.body, categories.map((category) => category.key));
    const score = await RoundOneScore.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true, runValidators: true });

    await logAudit({
      user: req.user,
      action: 'ROUND_1_SCORE_UPDATED',
      contestantId: score.contestantId,
      judgeId: req.judge.judgeId,
      round: 'ROUND_1',
      previousValue: previous,
      newValue: score
    });

    const results = await buildRoundOneResults(categories);
    emitToAdmins('score:updated', { round: 'ROUND_1', score });
    emitToAdmins('progress:updated', results);
    emitToAdmins('results:updated', results);

    res.json({ score });
  })
);

adminRoundOneRoutes.use(authMiddleware, adminOnly);

adminRoundOneRoutes.get(
  '/results',
  asyncHandler(async (_req, res) => {
    const round = await getRound('ROUND_1');
    const results = await buildRoundOneResults();
    res.json({ round, ...results });
  })
);

adminRoundOneRoutes.get(
  '/:contestantId',
  asyncHandler(async (req, res) => {
    const contestant = await Contestant.findById(req.params.contestantId);
    if (!contestant) throw new HttpError(404, 'Contestant not found.');
    const scores = await RoundOneScore.find({ contestantId: contestant._id, round: 'ROUND_1' }).sort({ judgeId: 1 });
    const { roundOneCategories: categories } = await getScoringCriteria();
    const [result] = calculateRoundOneRankings([contestant], scores, categories);
    res.json({ contestant, result, judgeScores: scores, categories });
  })
);

adminRoundOneRoutes.post(
  '/open',
  asyncHandler(async (req, res) => {
    const round = await Round.findOneAndUpdate(
      { name: 'ROUND_1' },
      { $set: { status: 'OPEN', openedAt: new Date(), lockedAt: null } },
      { upsert: true, new: true }
    );

    await logAudit({ user: req.user, action: 'ROUND_1_OPENED', round: 'ROUND_1' });
    emitToAdmins('round:opened', { round: 'ROUND_1' });
    res.json({ round });
  })
);

adminRoundOneRoutes.post(
  '/lock',
  asyncHandler(async (req, res) => {
    const contestants = await Contestant.find().sort({ contestantNumber: 1 });
    const judges = await Judge.find({ status: 'active' }).sort({ judgeId: 1 });
    const scores = await RoundOneScore.find({ round: 'ROUND_1' });
    const { roundOneCategories: categories } = await getScoringCriteria();
    const completion = validateRoundCompletion(judges, contestants, scores, categories);

    if (!completion.complete) {
      throw new HttpError(409, 'All required scores must be submitted before locking.', completion.missing);
    }

    const round = await Round.findOneAndUpdate(
      { name: 'ROUND_1' },
      { $set: { status: 'LOCKED', lockedAt: new Date() } },
      { upsert: true, new: true }
    );
    // Mark round as locked in Pageant document
    await Pageant.findOneAndUpdate({}, { $set: { roundOneLocked: true } });

    await logAudit({ user: req.user, action: 'ROUND_1_LOCKED', round: 'ROUND_1' });
    const finalists = await generateFinalists({ user: req.user, categories });
    const results = await buildRoundOneResults(categories);

    emitToAdmins('round:locked', { round: 'ROUND_1' });
    emitToAdmins('results:updated', results);

    res.json({ round, finalists, ...results });
  })
);

adminRoundOneRoutes.post(
  '/unlock',
  asyncHandler(async (req, res) => {
    const current = await Round.findOne({ name: 'ROUND_1' });
    if (!current || current.status !== 'LOCKED') {
      throw new HttpError(409, 'Round 1 is not locked, cannot unlock.');
    }

    const round = await Round.findOneAndUpdate(
      { name: 'ROUND_1' },
      { $set: { status: 'OPEN', lockedAt: null } },
      { upsert: true, new: true }
    );
    await Pageant.findOneAndUpdate({}, { $set: { roundOneLocked: false } });

    const results = await buildRoundOneResults();
    await logAudit({ user: req.user, action: 'ROUND_1_UNLOCKED', round: 'ROUND_1' });
    emitToAdmins('round:unlocked', { round: 'ROUND_1' });
    emitToAdmins('results:updated', results);

    res.json({ round, ...results });
  })
);

export { buildRoundOneResults };
