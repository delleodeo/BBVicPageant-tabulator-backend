import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDb } from '../config/db.js';
import { env } from '../config/env.js';
import { AuditLog } from '../models/AuditLog.js';
import { Contestant } from '../models/Contestant.js';
import { FinalRoundScore } from '../models/FinalRoundScore.js';
import { Finalist } from '../models/Finalist.js';
import { Judge } from '../models/Judge.js';
import { Pageant } from '../models/Pageant.js';
import { Round } from '../models/Round.js';
import { RoundOneScore } from '../models/RoundOneScore.js';
import { User } from '../models/User.js';

import { SpecialAward } from '../models/SpecialAward.js';

const judgePassword = 'judge12345';

function score(base, judgeIndex, contestantIndex, categoryOffset = 0) {
  const value = base + judgeIndex * 0.1 + contestantIndex * 0.04 + categoryOffset;
  return Math.min(10, Math.round(value * 10) / 10);
}

await connectDb();

await Promise.all([
  AuditLog.deleteMany({}),
  FinalRoundScore.deleteMany({}),
  Finalist.deleteMany({}),
  RoundOneScore.deleteMany({}),
  Contestant.deleteMany({}),
  Judge.deleteMany({}),
  SpecialAward.deleteMany({}),
  User.deleteMany({}),
  Round.deleteMany({}),
  Pageant.deleteMany({})
]);

const adminPasswordHash = await bcrypt.hash(env.adminPassword, 12);
const admin = await User.create({
  username: env.adminUsername,
  passwordHash: adminPasswordHash,
  role: 'admin',
  status: 'active'
});

const judgeDesignations = [
  'Chairman of the Board of Judges',
  'Fashion Designer & Celebrity Stylist',
  'International Pageant Coach',
  'Media Personality & Host',
  'Advocate & Former Titleholder'
];

const judges = [];
for (let index = 1; index <= 5; index += 1) {
  const user = await User.create({
    username: `judge${String(index).padStart(3, '0')}`,
    passwordHash: await bcrypt.hash(judgePassword, 12),
    role: 'judge',
    status: 'active'
  });

  const judge = await Judge.create({
    judgeId: `J${String(index).padStart(3, '0')}`,
    name: `Judge ${index}`,
    designation: judgeDesignations[index - 1],
    userId: user._id,
    status: 'active'
  });

  user.judgeId = judge._id;
  await user.save();
  judges.push(judge);
}

const candidateData = [
  { name: 'Maria Santos', hometown: 'Cebu City', age: 23, height: "5'8\"", advocacy: 'Youth Education & Digital Literacy' },
  { name: 'Sofia Reyes', hometown: 'Davao City', age: 22, height: "5'7\"", advocacy: 'Mental Health Awareness' },
  { name: 'Ana Cruz', hometown: 'Manila', age: 24, height: "5'9\"", advocacy: 'Environmental Sustainability' },
  { name: 'Lisa Garcia', hometown: 'Iloilo City', age: 21, height: "5'6\"", advocacy: 'Women in STEM' },
  { name: 'Nicole Ramos', hometown: 'Baguio City', age: 25, height: "5'8\"", advocacy: 'Indigenous Community Heritage' },
  { name: 'Bianca Torres', hometown: 'Pampanga', age: 23, height: "5'7\"", advocacy: 'Child Nutrition & Welfare' },
  { name: 'Camille Rivera', hometown: 'Batangas', age: 22, height: "5'9\"", advocacy: 'Animal Rescue & Welfare' },
  { name: 'Elaine Mendoza', hometown: 'Palawan', age: 24, height: "5'8\"", advocacy: 'Marine Biodiversity Protection' },
  { name: 'Julia Aquino', hometown: 'Cagayan de Oro', age: 21, height: "5'7\"", advocacy: 'Community Livelihood' },
  { name: 'Katrina Lopez', hometown: 'Bacolod City', age: 25, height: "5'9\"", advocacy: 'Arts & Cultural Preservation' }
];

const contestants = [];
for (let index = 0; index < candidateData.length; index += 1) {
  const item = candidateData[index];
  contestants.push(
    await Contestant.create({
      contestantNumber: String(index + 1).padStart(2, '0'),
      name: item.name,
      hometown: item.hometown,
      advocacy: item.advocacy,
      age: item.age,
      height: item.height,
      photo: '',
      status: 'ACTIVE'
    })
  );
}

for (let contestantIndex = 0; contestantIndex < contestants.length; contestantIndex += 1) {
  for (let judgeIndex = 0; judgeIndex < judges.length; judgeIndex += 1) {
    await RoundOneScore.create({
      judgeId: judges[judgeIndex].judgeId,
      contestantId: contestants[contestantIndex]._id,
      round: 'ROUND_1',
      productionOutfit: score(8.4, judgeIndex, contestantIndex, 0),
      swimsuit: score(8.3, judgeIndex, contestantIndex, 0.1),
      festivalCostume: score(8.5, judgeIndex, contestantIndex, 0.2),
      eveningGown: score(8.4, judgeIndex, contestantIndex, 0.1),
      beautyIntelligence: score(8.6, judgeIndex, contestantIndex, 0.1)
    });
  }
}

await Round.create({ name: 'ROUND_1', status: 'OPEN', openedAt: new Date() });
await Round.create({ name: 'FINAL', status: 'SETUP' });
await Pageant.create({
  pageantName: 'Pageant Tabulation',
  eventName: 'Grand Coronation Night',
  organizationName: 'Official Board of Tabulators',
  motto: 'Beauty, Brains, and Elegance',
  eventDate: new Date(),
  venue: 'Grand Ballroom',
  themeColor: '#c99a2e',
  soundEnabled: true
});

await SpecialAward.create([
  { title: 'Miss Photogenic', description: 'Awarded to the most photogenic delegate', type: 'CUSTOM_AWARD', sponsor: 'Luxe Studios' },
  { title: 'Miss Congeniality', description: 'Voted by fellow candidates for warmth and spirit', type: 'CUSTOM_AWARD', sponsor: 'Grand Hotel' },
  { title: 'Darling of the Press', description: 'Selected by accredited media and journalists', type: 'SPONSOR_AWARD', sponsor: 'National Press Club' }
]);
await AuditLog.create({
  userId: admin._id,
  role: 'admin',
  action: 'DATABASE_SEEDED',
  newValue: {
    judges: judges.length,
    contestants: contestants.length,
    roundOneScores: judges.length * contestants.length
  }
});

console.log('Seed complete.');
console.log(`Admin: ${env.adminUsername} / ${env.adminPassword}`);
console.log(`Judges: judge001-judge005 / ${judgePassword}`);

await mongoose.disconnect();

