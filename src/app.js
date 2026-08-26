import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { env } from './config/env.js';
import { uploadRoot } from './config/paths.js';
import { auditRoutes } from './routes/auditRoutes.js';
import { authRoutes } from './routes/authRoutes.js';
import { contestantRoutes } from './routes/contestantRoutes.js';
import { exportRoutes } from './routes/exportRoutes.js';
import { adminFinalRoutes, finalistRoutes, judgeFinalRoutes } from './routes/finalRoutes.js';
import { judgeNoteRoutes } from './routes/judgeNoteRoutes.js';
import { judgeRoutes } from './routes/judgeRoutes.js';
import { pageantRoutes } from './routes/pageantRoutes.js';
import { adminRoundOneRoutes, judgeRoundOneRoutes } from './routes/roundOneRoutes.js';
import { specialAwardRoutes } from './routes/specialAwardRoutes.js';
import { systemRoutes } from './routes/systemRoutes.js';
import { uploadRoutes } from './routes/uploadRoutes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.clientUrl, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(rateLimit({ windowMs: 15 * 60 * 100000, max: 100000 }));
  app.use('/uploads', express.static(uploadRoot, { index: false, maxAge: '7d' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes);
  app.use('/api/contestants', contestantRoutes);
  app.use('/api/judges', judgeRoutes);
  app.use('/api/judge/round-one', judgeRoundOneRoutes);
  app.use('/api/admin/round-one', adminRoundOneRoutes);
  app.use('/api/judge/final', judgeFinalRoutes);
  app.use('/api/admin/final', adminFinalRoutes);
  app.use('/api/admin/finalists', finalistRoutes);
  app.use('/api/pageant', pageantRoutes);
  app.use('/api/special-awards', specialAwardRoutes);
  app.use('/api/admin/special-awards', specialAwardRoutes);
  app.use('/api/judge/notes', judgeNoteRoutes);
  app.use('/api/admin/audit-logs', auditRoutes);
  app.use('/api/admin/exports', exportRoutes);
  app.use('/api/admin/system', systemRoutes);
  app.use('/api/uploads', uploadRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
