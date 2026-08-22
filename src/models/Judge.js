import mongoose from 'mongoose';

const judgeSchema = new mongoose.Schema(
  {
    judgeId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    designation: { type: String, default: 'Judge', trim: true },
    avatar: { type: String, default: '' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' }
  },
  { timestamps: true }
);

export const Judge = mongoose.model('Judge', judgeSchema);

