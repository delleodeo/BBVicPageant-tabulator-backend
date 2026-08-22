import mongoose from 'mongoose';

const pageantSchema = new mongoose.Schema(
  {
    pageantName: { type: String, default: 'Pageant Tabulation' },
    eventName: { type: String, default: 'Grand Coronation Night' },
    organizationName: { type: String, default: 'Board of Tabulators' },
    motto: { type: String, default: 'Beauty, Brains, and Elegance' },
    eventDate: { type: Date },
    venue: { type: String, default: 'Grand Ballroom' },
    logo: { type: String, default: '' },
    themeColor: { type: String, default: '#c99a2e' },
    soundEnabled: { type: Boolean, default: true },
    finalistCount: { type: Number, default: 5 },
    roundOneLocked: { type: Boolean, default: false },
    finalRoundLocked: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export const Pageant = mongoose.model('Pageant', pageantSchema);
