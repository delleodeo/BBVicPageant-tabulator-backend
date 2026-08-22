import { Round } from '../models/Round.js';

export async function ensureRounds() {
  const roundOne = await Round.findOneAndUpdate(
    { name: 'ROUND_1' },
    { $setOnInsert: { name: 'ROUND_1', status: 'SETUP' } },
    { upsert: true, new: true }
  );

  const finalRound = await Round.findOneAndUpdate(
    { name: 'FINAL' },
    { $setOnInsert: { name: 'FINAL', status: 'SETUP' } },
    { upsert: true, new: true }
  );

  return { roundOne, finalRound };
}

export async function getRound(name) {
  await ensureRounds();
  return Round.findOne({ name });
}
