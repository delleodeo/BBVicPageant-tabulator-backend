import { describe, expect, it } from 'vitest';
import {
  calculateCategoryAverage,
  calculateCategoryJudgeProgress,
  calculateCategoryRankings,
  calculateFinalRankings,
  calculateFinalScore,
  calculateJudgeScoringAnalytics,
  calculateRoundOneRankings,
  calculateRoundOneScore,
  calculateSpecialAwards,
  detectTie,
  isValidScore,
  validateRoundCompletion
} from '../src/services/scoringService.js';
import { assertCategoriesUnlocked, normalizeFinalCriteria, normalizeRoundOneCriteria } from '../src/services/criteriaService.js';

function contestant(id, contestantNumber) {
  return { _id: id, contestantNumber, name: `Contestant ${contestantNumber}` };
}

describe('scoringService', () => {
  it('lists judges and candidates still missing a category score', () => {
    const progress = calculateCategoryJudgeProgress(
      [{ judgeId: 'J1', name: 'Judge One' }, { judgeId: 'J2', name: 'Judge Two' }],
      [contestant('c1', '01'), contestant('c2', '02')],
      [{ judgeId: 'J1', contestantId: 'c1', outfit: 0 }, { judgeId: 'J1', contestantId: 'c2', outfit: 8.7 }],
      [{ key: 'outfit', label: 'Outfit' }]
    )[0];
    expect(progress.pendingJudgeCount).toBe(1);
    expect(progress.judges[0].completed).toBe(2);
    expect(progress.judges[1].missing.map((candidate) => candidate.contestantNumber)).toEqual(['01', '02']);
  });

  it('blocks score changes to a locked category while allowing other categories', () => {
    const categories = [
      { key: 'outfit', label: 'Outfit', locked: true },
      { key: 'swimsuit', label: 'Swimsuit', locked: false }
    ];
    expect(() => assertCategoriesUnlocked(categories, { outfit: 8.7 })).toThrow('Outfit is locked.');
    expect(() => assertCategoriesUnlocked(categories, { swimsuit: 8.7 })).not.toThrow();
  });

  it('validates score range and one-decimal increments', () => {
    expect(isValidScore(0)).toBe(true);
    expect(isValidScore(9.9)).toBe(true);
    expect(isValidScore(10)).toBe(true);
    expect(isValidScore(-1)).toBe(false);
    expect(isValidScore(10.1)).toBe(false);
    expect(isValidScore(9.55)).toBe(false);
    expect(isValidScore('abc')).toBe(false);
  });

  it('calculates category averages and weighted Round 1 totals', () => {
    const result = calculateRoundOneScore(contestant('c1', '01'), [
      {
        productionOutfit: 9.2,
        swimsuit: 9.0,
        festivalCostume: 9.5,
        eveningGown: 9.3,
        beautyIntelligence: 9.4
      },
      {
        productionOutfit: 9.4,
        swimsuit: 9.2,
        festivalCostume: 9.6,
        eveningGown: 9.4,
        beautyIntelligence: 9.5
      }
    ]);

    expect(calculateCategoryAverage([{ festivalCostume: 9.5 }, { festivalCostume: 9.6 }], 'festivalCostume')).toBe(9.55);
    expect(result.categories.find((category) => category.key === 'festivalCostume').weighted).toBe(28.65);
    expect(result.total).toBe(94.1);
  });

  it('ranks contestants by calculated totals and detects cutoff ties', () => {
    const contestants = [contestant('c1', '01'), contestant('c2', '02'), contestant('c3', '03'), contestant('c4', '04'), contestant('c5', '05'), contestant('c6', '06')];
    const scores = contestants.map((entry, index) => ({
      contestantId: entry._id,
      judgeId: 'J001',
      productionOutfit: 10 - index * 0.1,
      swimsuit: 10 - index * 0.1,
      festivalCostume: 10 - index * 0.1,
      eveningGown: 10 - index * 0.1,
      beautyIntelligence: 10 - index * 0.1
    }));
    scores[4] = { ...scores[4], productionOutfit: 9.5, swimsuit: 9.5, festivalCostume: 9.5, eveningGown: 9.5, beautyIntelligence: 9.5 };
    scores[5] = { ...scores[5], productionOutfit: 9.5, swimsuit: 9.5, festivalCostume: 9.5, eveningGown: 9.5, beautyIntelligence: 9.5 };

    const rankings = calculateRoundOneRankings(contestants, scores);
    expect(rankings[0].contestant.contestantNumber).toBe('01');
    expect(detectTie(rankings, 5).tied).toBe(true);
  });

  it('calculates special category awards and judge analytics', () => {
    const c1 = contestant('c1', '01');
    const c2 = contestant('c2', '02');
    const contestants = [c1, c2];
    const scores = [
      { contestantId: 'c1', judgeId: 'J001', swimsuit: 9.8, eveningGown: 9.0 },
      { contestantId: 'c2', judgeId: 'J001', swimsuit: 9.2, eveningGown: 9.9 }
    ];

    const awards = calculateSpecialAwards(contestants, scores);
    const bestSwimsuit = awards.find((a) => a.key === 'swimsuit');
    const bestGown = awards.find((a) => a.key === 'eveningGown');

    expect(bestSwimsuit.winner.contestantNumber).toBe('01');
    expect(bestGown.winner.contestantNumber).toBe('02');

    const judges = [{ judgeId: 'J001', name: 'Judge 1' }];
    const analytics = calculateJudgeScoringAnalytics(judges, contestants, scores);
    expect(analytics[0].totalScoresGiven).toBe(4);
    expect(analytics[0].highestScore).toBe(9.9);
  });

  it('validates completion across all active judges and contestants', () => {
    const completion = validateRoundCompletion(
      [{ judgeId: 'J001' }, { judgeId: 'J002' }],
      [contestant('c1', '01')],
      [
        {
          judgeId: 'J001',
          contestantId: 'c1',
          productionOutfit: 9,
          swimsuit: 9,
          festivalCostume: 9,
          eveningGown: 9,
          beautyIntelligence: 9
        }
      ]
    );

    expect(completion.complete).toBe(false);
    expect(completion.missing[0].judgeId).toBe('J002');
  });

  it('calculates final score using Round 1 contribution plus final averages', () => {
    expect(calculateFinalScore(95.6, 9.5, 9.6)).toBe(95.52);
  });

  it('ignores stale finalist records without a contestant document', () => {
    const c1 = contestant('c1', '01');
    const rankings = calculateFinalRankings(
      [{ contestantId: c1 }, { contestantId: null }],
      [{ contestant: c1, total: 95 }],
      [{ contestantId: 'c1', judgeId: 'J001', intelligence: 9.5, beauty: 9.4 }]
    );

    expect(rankings).toHaveLength(1);
    expect(rankings[0].contestant.contestantNumber).toBe('01');
  });

  it('calculates newly configured Round One criteria using their saved weights', () => {
    const categories = [
      { key: 'stagePresence', label: 'Stage Presence', weight: 60 },
      { key: 'interview', label: 'Interview', weight: 40 }
    ];
    const result = calculateRoundOneScore(
      contestant('c1', '01'),
      [{ stagePresence: 9, interview: 8 }],
      categories
    );

    expect(result.total).toBe(86);
    expect(result.categories.find((category) => category.key === 'stagePresence').weighted).toBe(54);
    expect(validateRoundCompletion(
      [{ judgeId: 'J001' }],
      [contestant('c1', '01')],
      [{ contestantId: 'c1', judgeId: 'J001', stagePresence: 9, interview: 8 }],
      categories
    ).complete).toBe(true);
  });

  it('calculates newly configured Final Round criteria with the 20% carry-over', () => {
    const c1 = contestant('c1', '01');
    const categories = [
      { key: 'poise', label: 'Poise', weight: 30 },
      { key: 'finalAnswer', label: 'Final Answer', weight: 50 }
    ];
    const [result] = calculateFinalRankings(
      [{ contestantId: c1 }],
      [{ contestant: c1, total: 90 }],
      [{ contestantId: 'c1', judgeId: 'J001', poise: 9, finalAnswer: 8 }],
      categories
    );

    expect(result.finalScore).toBe(85);
    expect(result.categories.find((category) => category.key === 'finalAnswer').weighted).toBe(40);
  });

  it('enforces complete criteria weight distributions', () => {
    expect(normalizeRoundOneCriteria([
      { key: 'productionOutfit', label: 'Production Outfit', weight: 10 },
      { key: 'swimsuit', label: 'Swimsuit', weight: 10 },
      { key: 'festivalCostume', label: 'Festival Costume', weight: 30 },
      { key: 'eveningGown', label: 'Evening Gown', weight: 20 },
      { key: 'beautyIntelligence', label: 'Beauty & Intelligence', weight: 20 },
      { key: 'newCriterion', label: 'New Criterion', weight: 10 }
    ])).toHaveLength(6);
    expect(normalizeFinalCriteria([
      { key: 'intelligence', label: 'Intelligence', weight: 35 },
      { key: 'beauty', label: 'Beauty', weight: 35 },
      { key: 'finalCriterion', label: 'Final Criterion', weight: 10 }
    ])).toHaveLength(3);
    expect(() => normalizeRoundOneCriteria([
      { key: 'firstCriterion', label: 'First Criterion', weight: 90 }
    ])).toThrow('existing criteria cannot be removed');
  });
});
