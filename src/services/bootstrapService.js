import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { Pageant } from '../models/Pageant.js';
import { User } from '../models/User.js';

export async function bootstrapRequiredData() {
  const adminExists = await User.exists({ role: 'admin' });
  if (!adminExists) {
    await User.create({
      username: env.adminUsername,
      passwordHash: await bcrypt.hash(env.adminPassword, 12),
      role: 'admin',
      status: 'active'
    });
  }

  const pageantExists = await Pageant.exists({});
  if (!pageantExists) {
    await Pageant.create({});
  }
}

