import express from 'express';
import { authMiddleware, judgeOnly } from '../middleware/auth.js';
import { JudgeNote } from '../models/JudgeNote.js';
import { asyncHandler, HttpError } from '../utils/httpError.js';

export const judgeNoteRoutes = express.Router();

judgeNoteRoutes.use(authMiddleware, judgeOnly);

judgeNoteRoutes.get(
  '/:round/:contestantId',
  asyncHandler(async (req, res) => {
    const { round, contestantId } = req.params;
    const noteDoc = await JudgeNote.findOne({
      judgeId: req.judge.judgeId,
      contestantId,
      round: round.toUpperCase()
    });
    res.json({ note: noteDoc?.note || '' });
  })
);

judgeNoteRoutes.post(
  '/',
  asyncHandler(async (req, res) => {
    const { contestantId, round, note } = req.body;
    if (!contestantId || !round) throw new HttpError(422, 'contestantId and round are required.');

    const noteDoc = await JudgeNote.findOneAndUpdate(
      {
        judgeId: req.judge.judgeId,
        contestantId,
        round: round.toUpperCase()
      },
      {
        $set: { note: String(note || '').trim() }
      },
      { upsert: true, new: true }
    );

    res.json({ note: noteDoc.note });
  })
);

