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

const roundOneScoreSchema = new mongoose.Schema(
  {
    judgeId: { type: String, required: true, index: true },
    contestantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contestant', required: true, index: true },
    round: { type: String, enum: ['ROUND_1'], default: 'ROUND_1' },
    productionOutfit: scoreField,
    swimsuit: scoreField,
    festivalCostume: scoreField,
    eveningGown: scoreField,
    beautyIntelligence: scoreField
  },
  { timestamps: true, strict: false }
);

roundOneScoreSchema.index({ judgeId: 1, contestantId: 1, round: 1 }, { unique: true });

export const RoundOneScore = mongoose.model('RoundOneScore', roundOneScoreSchema);
