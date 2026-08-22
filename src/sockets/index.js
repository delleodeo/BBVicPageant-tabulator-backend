import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Judge } from '../models/Judge.js';
import { User } from '../models/User.js';

const onlineJudges = new Map(); // socket.id -> { judgeId, name, userId, activeContestantId, round, lastActive }

function getOnlineJudgesList() {
  const map = new Map();
  for (const info of onlineJudges.values()) {
    map.set(info.judgeId, info);
  }
  return Array.from(map.values());
}

export function registerSockets(io) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next();
      const payload = jwt.verify(token, env.jwtSecret);
      const user = await User.findById(payload.userId);
      socket.user = user || null;
      if (user?.role === 'judge') {
        const judge = await Judge.findOne({ userId: user._id });
        socket.judge = judge || null;
      }
      next();
    } catch {
      next();
    }
  });

  io.on('connection', (socket) => {
    if (socket.user?.role === 'admin') {
      socket.join('admins');
      socket.emit('presence:judges', getOnlineJudgesList());
    }

    if (socket.user?.role === 'judge' && socket.judge) {
      socket.join(`judge:${socket.user._id}`);
      socket.join('judges');

      onlineJudges.set(socket.id, {
        judgeId: socket.judge.judgeId,
        name: socket.judge.name,
        designation: socket.judge.designation,
        userId: socket.user._id,
        activeContestantId: null,
        round: null,
        lastActive: new Date()
      });

      io.to('admins').emit('presence:judges', getOnlineJudgesList());
    }

    socket.on('admin:join', () => {
      if (socket.user?.role === 'admin') {
        socket.join('admins');
        socket.emit('presence:judges', getOnlineJudgesList());
      }
    });

    socket.on('judge:activity', (data) => {
      if (socket.judge) {
        const existing = onlineJudges.get(socket.id);
        if (existing) {
          existing.activeContestantId = data?.contestantId || null;
          existing.round = data?.round || null;
          existing.lastActive = new Date();
          onlineJudges.set(socket.id, existing);
          io.to('admins').emit('judge:activity_updated', {
            judgeId: socket.judge.judgeId,
            ...data
          });
          io.to('admins').emit('presence:judges', getOnlineJudgesList());
        }
      }
    });

    socket.on('disconnect', () => {
      if (onlineJudges.has(socket.id)) {
        onlineJudges.delete(socket.id);
        io.to('admins').emit('presence:judges', getOnlineJudgesList());
      }
    });
  });
}


