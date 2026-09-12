import express from 'express';
import { adminOnly, authMiddleware, judgeOnly } from '../middleware/auth.js';
import { Contestant } from '../models/Contestant.js';
import { Finalist } from '../models/Finalist.js';
import { FinalRoundScore } from '../models/FinalRoundScore.js';
import { Judge } from '../models/Judge.js';
import { Round } from '../models/Round.js';
import { RoundOneScore } from '../models/RoundOneScore.js';
import { logAudit } from '../services/auditService.js';
import { getFinalists, validateFinalistRoster } from '../services/finalistService.js';
import { getRound } from '../services/roundService.js';
import { emitToAdmins } from '../services/socketBus.js';
import { Pageant } from '../models/Pageant.js';
import { getScoringCriteria } from '../services/criteriaService.js';
import {
  calculateFinalRankings,
  calculateRoundOneRankings,
  scoreDocumentComplete,
  validateScorePatch
} from '../services/scoringService.js';
import { asyncHandler, HttpError } from '../utils/httpError.js';

export const judgeFinalRoutes = express.Router();
export const adminFinalRoutes = express.Router();
export const finalistRoutes = express.Router();

async function buildFinalResults(configuredCriteria) {
  const criteria = configuredCriteria || await getScoringCriteria();
  const { roundOneCategories, finalCategories: categories } = criteria;
  const finalists = await getFinalists();
  const contestants = await Contestant.find().sort({ contestantNumber: 1 });
  const roundOneScores = await RoundOneScore.find({ round: 'ROUND_1' });
  const finalScores = await FinalRoundScore.find({ round: 'FINAL' });
  const activeJudges = await Judge.find({ status: 'active' }).sort({ judgeId: 1 });
  const roundOneRankings = calculateRoundOneRankings(contestants, roundOneScores, roundOneCategories);
  const rankings = calculateFinalRankings(finalists, roundOneRankings, finalScores, categories);

  const missing = [];
  for (const finalist of finalists) {
    for (const judge of activeJudges) {
      const score = finalScores.find(
        (entry) => entry.judgeId === judge.judgeId && String(entry.contestantId) === String(finalist.contestantId._id)
      );
      if (!scoreDocumentComplete(score, categories)) {
        missing.push({ contestantId: finalist.contestantId._id, judgeId: judge.judgeId });
      }
    }
  }

  return {
    categories,
    rankings,
    completion: { complete: missing.length === 0, missing },
    totals: {
      finalists: finalists.length,
      judges: activeJudges.length,
      requiredScoreSheets: finalists.length * activeJudges.length,
      completedScoreSheets: finalists.length * activeJudges.length - missing.length,
      pendingScoreSheets: missing.length
    }
  };
}

judgeFinalRoutes.use(authMiddleware, judgeOnly);

judgeFinalRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    const round = await getRound('FINAL');
    const finalists = await getFinalists();
    const scores = await FinalRoundScore.find({ judgeId: req.judge.judgeId, round: 'FINAL' });
    const contestants = await Contestant.find();
    const roundOneScores = await RoundOneScore.find({ round: 'ROUND_1' });
    const criteria = await getScoringCriteria();
    const roundOneRankings = calculateRoundOneRankings(contestants, roundOneScores, criteria.roundOneCategories);

    res.json({ round, finalists, scores, roundOneRankings, categories: criteria.finalCategories });
  })
);

judgeFinalRoutes.get(
  '/:contestantId',
  asyncHandler(async (req, res) => {
    const round = await getRound('FINAL');
    if (round.status === 'SETUP') throw new HttpError(409, 'Final Round is not yet available.');

    const finalist = await Finalist.findOne({ contestantId: req.params.contestantId, round: 'FINAL' }).populate('contestantId');
    if (!finalist) throw new HttpError(403, 'This contestant is not a finalist.');

    const contestants = await Contestant.find();
    const roundOneScores = await RoundOneScore.find({ round: 'ROUND_1' });
    const criteria = await getScoringCriteria();
    const roundOneRankings = calculateRoundOneRankings(contestants, roundOneScores, criteria.roundOneCategories);
    const roundOne = roundOneRankings.find((result) => String(result.contestant._id) === String(finalist.contestantId._id));
    const score = await FinalRoundScore.findOne({
      judgeId: req.judge.judgeId,
      contestantId: finalist.contestantId._id,
      round: 'FINAL'
    });

    res.json({ round, finalist, roundOne, score, categories: criteria.finalCategories });
  })
);

judgeFinalRoutes.post(
  '/scores',
  asyncHandler(async (req, res) => {
    const round = await getRound('FINAL');
    if (round.status === 'LOCKED') throw new HttpError(403, 'Final Round is locked.');
    if (round.status !== 'OPEN') throw new HttpError(403, 'Final Round is not yet available.');

    const finalist = await Finalist.findOne({ contestantId: req.body.contestantId, round: 'FINAL' });
    if (!finalist) throw new HttpError(403, 'This contestant is not a finalist.');

    const criteria = await getScoringCriteria();
    const patch = validateScorePatch(req.body, criteria.finalCategories.map((category) => category.key));
    const previous = await FinalRoundScore.findOne({
      judgeId: req.judge.judgeId,
      contestantId: req.body.contestantId,
      round: 'FINAL'
    });

    const score = await FinalRoundScore.findOneAndUpdate(
      { judgeId: req.judge.judgeId, contestantId: req.body.contestantId, round: 'FINAL' },
      { $set: patch },
      { upsert: true, new: true, runValidators: true }
    );

    await logAudit({
      user: req.user,
      action: previous ? 'FINAL_SCORE_UPDATED' : 'FINAL_SCORE_CREATED',
      contestantId: score.contestantId,
      judgeId: req.judge.judgeId,
      round: 'FINAL',
      previousValue: previous,
      newValue: score
    });

    const results = await buildFinalResults(criteria);
    emitToAdmins(previous ? 'score:updated' : 'score:created', { round: 'FINAL', score });
    emitToAdmins('results:updated', results);
    res.status(previous ? 200 : 201).json({ score });
  })
);

judgeFinalRoutes.put(
  '/scores/:id',
  asyncHandler(async (req, res) => {
    const round = await getRound('FINAL');
    if (round.status === 'LOCKED') throw new HttpError(403, 'Final Round is locked.');
    if (round.status !== 'OPEN') throw new HttpError(403, 'Final Round is not yet available.');

    const previous = await FinalRoundScore.findById(req.params.id);
    if (!previous) throw new HttpError(404, 'Score not found.');
    if (previous.judgeId !== req.judge.judgeId) {
      throw new HttpError(403, 'You are not authorized to modify this score.');
    }

    const criteria = await getScoringCriteria();
    const patch = validateScorePatch(req.body, criteria.finalCategories.map((category) => category.key));
    const score = await FinalRoundScore.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true, runValidators: true });
    await logAudit({
      user: req.user,
      action: 'FINAL_SCORE_UPDATED',
      contestantId: score.contestantId,
      judgeId: req.judge.judgeId,
      round: 'FINAL',
      previousValue: previous,
      newValue: score
    });

    const results = await buildFinalResults(criteria);
    emitToAdmins('score:updated', { round: 'FINAL', score });
    emitToAdmins('results:updated', results);
    res.json({ score });
  })
);

adminFinalRoutes.use(authMiddleware, adminOnly);

adminFinalRoutes.get(
  '/results',
  asyncHandler(async (_req, res) => {
    const round = await getRound('FINAL');
    const results = await buildFinalResults();
    res.json({ round, ...results });
  })
);

adminFinalRoutes.post(
  '/open',
  asyncHandler(async (req, res) => {
    const roundOne = await getRound('ROUND_1');
    if (roundOne.status !== 'LOCKED') {
      throw new HttpError(409, 'Round 1 must be locked before Final Round.');
    }

    await validateFinalistRoster();

    const round = await Round.findOneAndUpdate(
      { name: 'FINAL' },
      { $set: { status: 'OPEN', openedAt: new Date(), lockedAt: null } },
      { upsert: true, new: true }
    );

    await logAudit({ user: req.user, action: 'FINAL_ROUND_OPENED', round: 'FINAL' });
    emitToAdmins('round:opened', { round: 'FINAL' });
    res.json({ round });
  })
);

adminFinalRoutes.post(
  '/lock',
  asyncHandler(async (req, res) => {
    const results = await buildFinalResults();
    if (!results.completion.complete) {
      throw new HttpError(409, 'All required final scores must be submitted before locking.', results.completion.missing);
    }

    const round = await Round.findOneAndUpdate(
      { name: 'FINAL' },
      { $set: { status: 'LOCKED', lockedAt: new Date() } },
      { upsert: true, new: true }
    );
    await Pageant.findOneAndUpdate({}, { $set: { finalRoundLocked: true } });

    await logAudit({ user: req.user, action: 'FINAL_ROUND_LOCKED', round: 'FINAL' });
    emitToAdmins('round:locked', { round: 'FINAL' });
    emitToAdmins('results:updated', results);
    res.json({ round, ...results });
  })
);

// Unlock final round (admin only)
adminFinalRoutes.post(
  '/unlock',
  asyncHandler(async (req, res) => {
    const current = await Round.findOne({ name: 'FINAL' });
    if (!current || current.status !== 'LOCKED') {
      throw new HttpError(409, 'Final round is not locked, cannot unlock');
    }
    const round = await Round.findOneAndUpdate(
      { name: 'FINAL' },
      { $set: { status: 'OPEN', lockedAt: null } },
      { upsert: true, new: true }
    );
    await Pageant.findOneAndUpdate({}, { $set: { finalRoundLocked: false } });
    await logAudit({ user: req.user, action: 'FINAL_ROUND_UNLOCKED', round: 'FINAL' });
    emitToAdmins('round:unlocked', { round: 'FINAL' });
    res.json({ round });
  })
);

finalistRoutes.use(authMiddleware, adminOnly);

finalistRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    const finalists = await getFinalists();
    res.json({ finalists });
  })
);

export { buildFinalResults };
