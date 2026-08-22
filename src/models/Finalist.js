import mongoose from 'mongoose';

const finalistSchema = new mongoose.Schema(
  {
    contestantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contestant', required: true },
    round: { type: String, enum: ['FINAL'], default: 'FINAL' },
    source: { type: String, enum: ['ROUND_1_TOP_5'], default: 'ROUND_1_TOP_5' },
    status: { type: String, enum: ['ACTIVE'], default: 'ACTIVE' }
  },
  { timestamps: true }
);

finalistSchema.index({ contestantId: 1, round: 1 }, { unique: true });

export const Finalist = mongoose.model('Finalist', finalistSchema);

