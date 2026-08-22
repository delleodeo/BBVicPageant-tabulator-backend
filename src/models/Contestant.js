import mongoose from 'mongoose';

const contestantSchema = new mongoose.Schema(
  {
    contestantNumber: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    photo: { type: String, default: '' },
    hometown: { type: String, default: '', trim: true },
    advocacy: { type: String, default: '', trim: true },
    age: { type: Number, min: 0, max: 120 },
    height: { type: String, default: '', trim: true },
    bio: { type: String, default: '', trim: true },
    tagline: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'FINALIST', 'ELIMINATED'],
      default: 'ACTIVE'
    }
  },
  { timestamps: true }
);

export const Contestant = mongoose.model('Contestant', contestantSchema);

