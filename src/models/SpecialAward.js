import mongoose from 'mongoose';

const specialAwardSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    type: {
      type: String,
      enum: ['AUTOMATIC_CATEGORY', 'CUSTOM_AWARD', 'SPONSOR_AWARD'],
      default: 'AUTOMATIC_CATEGORY'
    },
    categoryKey: { type: String, default: '' },
    winnerContestantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contestant' },
    winnerDetails: {
      contestantNumber: String,
      name: String,
      score: Number
    },
    sponsor: { type: String, default: '' },
    announced: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export const SpecialAward = mongoose.model('SpecialAward', specialAwardSchema);

