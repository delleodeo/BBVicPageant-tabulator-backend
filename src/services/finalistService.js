import { Contestant } from '../models/Contestant.js';
import { Finalist } from '../models/Finalist.js';
import { Judge } from '../models/Judge.js';
import { Round } from '../models/Round.js';
import { RoundOneScore } from '../models/RoundOneScore.js';
import { HttpError } from '../utils/httpError.js';
import { logAudit } from './auditService.js';
import { emitToAdmins } from './socketBus.js';
import { getScoringCriteria } from './criteriaService.js';
import {
  calculateRoundOneRankings,
  detectTie,
  validateRoundCompletion
} from './scoringService.js';

export async function generateFinalists({ user, categories } = {}) {
  const roundOne = await Round.findOne({ name: 'ROUND_1' });

  if (!roundOne || roundOne.status !== 'LOCKED') {
    throw new HttpError(409, 'Round 1 must be locked before finalists are generated.');
  }

  const contestants = await Contestant.find().sort({ contestantNumber: 1 });
  const activeJudges = await Judge.find({ status: 'active' }).sort({ judgeId: 1 });
  const scores = await RoundOneScore.find({ round: 'ROUND_1' });
  const activeCategories = categories || (await getScoringCriteria()).roundOneCategories;
  const completion = validateRoundCompletion(activeJudges, contestants, scores, activeCategories);

  if (!completion.complete) {
    throw new HttpError(409, 'All required scores must be submitted before locking.', completion.missing);
  }

  const rankings = calculateRoundOneRankings(contestants, scores, activeCategories);
  const tie = detectTie(rankings, 5);

  if (tie.tied) {
    throw new HttpError(409, 'A tie exists at the finalist cutoff.', tie.tiedContestants);
  }

  const topFive = rankings.slice(0, 5);
  const finalistIds = topFive.map((result) => result.contestant._id);

  await Finalist.deleteMany({ round: 'FINAL', contestantId: { $nin: finalistIds } });

  for (const contestantId of finalistIds) {
    await Finalist.findOneAndUpdate(
      { contestantId, round: 'FINAL' },
      { $setOnInsert: { contestantId, round: 'FINAL', source: 'ROUND_1_TOP_5', status: 'ACTIVE' } },
      { upsert: true, new: true }
    );
  }

  await Contestant.updateMany({ _id: { $in: finalistIds } }, { $set: { status: 'FINALIST' } });
  await Contestant.updateMany({ _id: { $nin: finalistIds } }, { $set: { status: 'ELIMINATED' } });

  await Round.findOneAndUpdate(
    { name: 'FINAL' },
    { $set: { status: 'OPEN', openedAt: new Date() } },
    { upsert: true, new: true }
  );

  await logAudit({
    user,
    action: 'FINALISTS_GENERATED',
    round: 'FINAL',
    newValue: topFive.map((result) => ({
      contestantId: result.contestant._id,
      contestantNumber: result.contestant.contestantNumber,
      total: result.total,
      rank: result.rank
    }))
  });

  const finalists = await getFinalists();
  emitToAdmins('finalists:generated', { finalists });
  emitToAdmins('round:opened', { round: 'FINAL' });

  return finalists;
}

export async function getFinalists() {
  const finalists = await Finalist.find({ round: 'FINAL' }).populate('contestantId').sort({ createdAt: 1 });
  return finalists.filter((finalist) => finalist.contestantId);
}

export async function validateFinalistRoster() {
  const finalists = await getFinalists();

  if (finalists.length !== 5) {
    throw new HttpError(409, 'Finalist roster must contain exactly 5 contestants.');
  }

  return finalists;
}
