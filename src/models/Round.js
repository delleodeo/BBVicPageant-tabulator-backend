import mongoose from 'mongoose';

const roundSchema = new mongoose.Schema(
  {
    name: { type: String, enum: ['ROUND_1', 'FINAL'], required: true, unique: true },
    status: { type: String, enum: ['SETUP', 'OPEN', 'LOCKED'], default: 'SETUP' },
    openedAt: Date,
    lockedAt: Date
  },
  { timestamps: true }
);

export const Round = mongoose.model('Round', roundSchema);

