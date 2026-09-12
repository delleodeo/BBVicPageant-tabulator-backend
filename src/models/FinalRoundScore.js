import mongoose from 'mongoose';

const scoreField = {
  type: Number,
  min: 0,
  max: 10,
    validate: {
    validator(value) {
      return value == null || Math.abs(value * 10 - Math.round(value * 10)) < 0.000001;
    },
    message: 'Score must use increments of 0.1.'
  }
};

const finalRoundScoreSchema = new mongoose.Schema(
  {
    judgeId: { type: String, required: true, index: true },
    contestantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contestant', required: true, index: true },
    round: { type: String, enum: ['FINAL'], default: 'FINAL' },
    intelligence: scoreField,
    beauty: scoreField
  },
  { timestamps: true, strict: false }
);

finalRoundScoreSchema.index({ judgeId: 1, contestantId: 1, round: 1 }, { unique: true });

export const FinalRoundScore = mongoose.model('FinalRoundScore', finalRoundScoreSchema);
