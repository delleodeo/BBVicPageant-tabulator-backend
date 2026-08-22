import mongoose from 'mongoose';

const judgeNoteSchema = new mongoose.Schema(
  {
    judgeId: { type: String, required: true },
    contestantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contestant', required: true },
    round: { type: String, enum: ['ROUND_1', 'FINAL'], required: true },
    note: { type: String, default: '', trim: true }
  },
  { timestamps: true }
);

judgeNoteSchema.index({ judgeId: 1, contestantId: 1, round: 1 }, { unique: true });

export const JudgeNote = mongoose.model('JudgeNote', judgeNoteSchema);

