import mongoose from 'mongoose';
import {
  DEFAULT_FINAL_CATEGORIES,
  DEFAULT_ROUND_ONE_CATEGORIES,
  cloneCriteria
} from '../config/scoringCriteria.js';

const criterionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true, trim: true },
    weight: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

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
    finalistCount: { type: Number, default: 5 },
    roundOneCategories: {
      type: [criterionSchema],
      default: () => cloneCriteria(DEFAULT_ROUND_ONE_CATEGORIES)
    },
    finalCategories: {
      type: [criterionSchema],
      default: () => cloneCriteria(DEFAULT_FINAL_CATEGORIES)
    },
    roundOneLocked: { type: Boolean, default: false },
    finalRoundLocked: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export const Pageant = mongoose.model('Pageant', pageantSchema);
