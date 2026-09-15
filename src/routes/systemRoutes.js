import bcrypt from 'bcryptjs';
import express from 'express';
import { adminOnly, authMiddleware } from '../middleware/auth.js';
import { env } from '../config/env.js';
import { AuditLog } from '../models/AuditLog.js';
import { Contestant } from '../models/Contestant.js';
import { Finalist } from '../models/Finalist.js';
import { FinalRoundScore } from '../models/FinalRoundScore.js';
import { Judge } from '../models/Judge.js';
import { Pageant } from '../models/Pageant.js';
import { Round } from '../models/Round.js';
import { RoundOneScore } from '../models/RoundOneScore.js';
import { SpecialAward } from '../models/SpecialAward.js';
import { User } from '../models/User.js';
import { logAudit } from '../services/auditService.js';
import { getScoringCriteria } from '../services/criteriaService.js';
import { emitToAll } from '../services/socketBus.js';
import { asyncHandler, HttpError } from '../utils/httpError.js';

export const systemRoutes = express.Router();

systemRoutes.use(authMiddleware, adminOnly);

const SCORE_RESET_CONFIRMATION = 'tabulation';

// Pageant snapshot backup
systemRoutes.get(
  '/backup',
  asyncHandler(async (_req, res) => {
    const [pageant, contestants, judges, rounds, roundOneScores, finalists, finalScores, specialAwards] =
      await Promise.all([
        Pageant.findOne(),
        Contestant.find(),
        Judge.find(),
        Round.find(),
        RoundOneScore.find(),
        Finalist.find(),
        FinalRoundScore.find(),
        SpecialAward.find()
      ]);

    const backup = {
      exportDate: new Date().toISOString(),
      pageant,
      contestants,
      judges,
      rounds,
      roundOneScores,
      finalists,
      finalScores,
      specialAwards
    };

    res.header('Content-Type', 'application/json');
    res.attachment(`pageant-backup-${Date.now()}.json`);
    res.json(backup);
  })
);

// Permanently delete every judge score while preserving pageant setup data.
systemRoutes.post(
  '/reset-scores',
  asyncHandler(async (req, res) => {
    if (req.body?.confirmation !== SCORE_RESET_CONFIRMATION) {
      throw new HttpError(422, `Type "${SCORE_RESET_CONFIRMATION}" exactly to reset all judge scores.`);
    }

    const resetAt = new Date();
    const [roundOneResult, finalResult, finalistResult] = await Promise.all([
      RoundOneScore.deleteMany({}),
      FinalRoundScore.deleteMany({}),
      Finalist.deleteMany({ round: 'FINAL' }),
      Contestant.updateMany(
        { status: { $in: ['FINALIST', 'ELIMINATED'] } },
        { $set: { status: 'ACTIVE' } }
      ),
      Round.findOneAndUpdate(
        { name: 'ROUND_1' },
        { $set: { status: 'OPEN', openedAt: resetAt, lockedAt: null } },
        { upsert: true, new: true }
      ),
      Round.findOneAndUpdate(
        { name: 'FINAL' },
        { $set: { status: 'SETUP', openedAt: null, lockedAt: null } },
        { upsert: true, new: true }
      ),
      Pageant.findOneAndUpdate(
        {},
        { $set: { roundOneLocked: false, finalRoundLocked: false } },
        { upsert: true, new: true }
      )
    ]);
    const deletedScores = {
      roundOne: roundOneResult.deletedCount || 0,
      final: finalResult.deletedCount || 0
    };
    deletedScores.total = deletedScores.roundOne + deletedScores.final;
    const resetState = {
      finalistsRemoved: finalistResult.deletedCount || 0,
      roundOne: 'OPEN',
      finalRound: 'SETUP'
    };

    await logAudit({
      user: req.user,
      action: 'ALL_JUDGE_SCORES_RESET',
      previousValue: { deletedScores, finalistsRemoved: resetState.finalistsRemoved },
      newValue: { roundOneScores: 0, finalScores: 0, roundOne: 'OPEN', finalRound: 'SETUP' }
    });

    const payload = { deletedScores, resetState, resetAt: resetAt.toISOString() };
    emitToAll('scores:reset', payload);
    emitToAll('results:updated', payload);
    emitToAll('round:opened', { round: 'ROUND_1' });

    res.json({
      message: 'All judge scores were reset. Round 1 is open and the Final Round returned to setup.',
      deletedScores,
      resetState
    });
  })
);

// Demo data reset
systemRoutes.post(
  '/reset-demo',
  asyncHandler(async (req, res) => {
    await Promise.all([
      FinalRoundScore.deleteMany({}),
      Finalist.deleteMany({}),
      RoundOneScore.deleteMany({}),
      Contestant.deleteMany({}),
      SpecialAward.deleteMany({})
    ]);

    const judgePassword = 'judge12345';
    const sampleContestants = [
      { contestantNumber: '01', name: 'Maria Santos', hometown: 'Cebu City', age: 23, height: "5'8\"", advocacy: 'Youth Education & Digital Literacy' },
      { contestantNumber: '02', name: 'Sofia Reyes', hometown: 'Davao City', age: 22, height: "5'7\"", advocacy: 'Mental Health Awareness' },
      { contestantNumber: '03', name: 'Ana Cruz', hometown: 'Manila', age: 24, height: "5'9\"", advocacy: 'Environmental Sustainability' },
      { contestantNumber: '04', name: 'Lisa Garcia', hometown: 'Iloilo City', age: 21, height: "5'6\"", advocacy: 'Women in STEM' },
      { contestantNumber: '05', name: 'Nicole Ramos', hometown: 'Baguio City', age: 25, height: "5'8\"", advocacy: 'Indigenous Community Heritage' },
      { contestantNumber: '06', name: 'Bianca Torres', hometown: 'Pampanga', age: 23, height: "5'7\"", advocacy: 'Child Nutrition & Welfare' },
      { contestantNumber: '07', name: 'Camille Rivera', hometown: 'Batangas', age: 22, height: "5'9\"", advocacy: 'Animal Rescue & Welfare' },
      { contestantNumber: '08', name: 'Elaine Mendoza', hometown: 'Palawan', age: 24, height: "5'8\"", advocacy: 'Marine Biodiversity Protection' },
      { contestantNumber: '09', name: 'Julia Aquino', hometown: 'Cagayan de Oro', age: 21, height: "5'7\"", advocacy: 'Community Livelihood' },
      { contestantNumber: '10', name: 'Katrina Lopez', hometown: 'Bacolod City', age: 25, height: "5'9\"", advocacy: 'Arts & Cultural Preservation' }
    ];

    const createdContestants = await Contestant.insertMany(sampleContestants);
    const activeJudges = await Judge.find({ status: 'active' });
    const { roundOneCategories } = await getScoringCriteria();

    // Seed sample scores
    for (let cIdx = 0; cIdx < createdContestants.length; cIdx += 1) {
      for (let jIdx = 0; jIdx < activeJudges.length; jIdx += 1) {
        const base = 8.6 + ((cIdx % 4) * 0.2) + ((jIdx % 3) * 0.1);
        const seededScore = {
          judgeId: activeJudges[jIdx].judgeId,
          contestantId: createdContestants[cIdx]._id,
          round: 'ROUND_1'
        };
        roundOneCategories.forEach((category, categoryIndex) => {
          const variation = ((categoryIndex % 5) - 1) * 0.1;
          seededScore[category.key] = Math.min(10, Math.round((base + variation) * 10) / 10);
        });
        await RoundOneScore.create(seededScore);
      }
    }

    await Round.findOneAndUpdate(
      { name: 'ROUND_1' },
      { $set: { status: 'OPEN', openedAt: new Date(), lockedAt: null } },
      { upsert: true }
    );

    await Round.findOneAndUpdate(
      { name: 'FINAL' },
      { $set: { status: 'SETUP', openedAt: null, lockedAt: null } },
      { upsert: true }
    );

    await SpecialAward.create([
      { title: 'Miss Photogenic', description: 'Awarded to the most photogenic delegate', type: 'CUSTOM_AWARD', sponsor: 'Luxe Studios' },
      { title: 'Miss Congeniality', description: 'Voted by fellow candidates for friendliness', type: 'CUSTOM_AWARD', sponsor: 'Grand Hotel' }
    ]);

    await logAudit({
      user: req.user,
      action: 'SYSTEM_DEMO_RESET',
      newValue: { contestants: createdContestants.length, judges: activeJudges.length }
    });

    emitToAll('results:updated', {});
    emitToAll('round:opened', { round: 'ROUND_1' });

    res.json({ message: 'Pageant reset with fresh sample data.' });
  })
);
