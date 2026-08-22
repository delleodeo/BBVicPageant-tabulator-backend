import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: String,
    action: { type: String, required: true },
    contestantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contestant' },
    judgeId: String,
    round: String,
    category: String,
    previousValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed
  },
  { timestamps: { createdAt: 'timestamp', updatedAt: false } }
);

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
