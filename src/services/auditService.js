import { AuditLog } from '../models/AuditLog.js';

export async function logAudit({
  user,
  action,
  contestantId,
  judgeId,
  round,
  category,
  previousValue,
  newValue
}) {
  return AuditLog.create({
    userId: user?._id,
    role: user?.role || 'system',
    action,
    contestantId,
    judgeId,
    round,
    category,
    previousValue,
    newValue
  });
}

