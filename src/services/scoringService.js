import { HttpError } from '../utils/httpError.js';
import {
  DEFAULT_FINAL_CATEGORIES,
  DEFAULT_ROUND_ONE_CATEGORIES,
  FINAL_ROUND_ONE_CARRYOVER_WEIGHT
} from '../config/scoringCriteria.js';

export const ROUND_ONE_CATEGORIES = DEFAULT_ROUND_ONE_CATEGORIES;
export const FINAL_CATEGORIES = DEFAULT_FINAL_CATEGORIES;

export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function isValidScore(value) {
  const numberValue = Number(value);
  return (
    Number.isFinite(numberValue) &&
    numberValue >= 0 &&
    numberValue <= 10 &&
    Math.abs(numberValue * 10 - Math.round(numberValue * 10)) < 0.000001
  );
}

export function normalizeScore(value) {
  if (!isValidScore(value)) {
    throw new HttpError(422, 'Score must be between 0.0 and 10.0 and use increments of 0.1.');
  }
  return Number(value);
}

export function validateScorePatch(body, allowedKeys) {
  const patch = {};

  for (const key of allowedKeys) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== '') {
      patch[key] = normalizeScore(body[key]);
    }
  }

  if (Object.keys(patch).length === 0) {
    throw new HttpError(422, 'At least one score is required.');
  }

  return patch;
}

export function scoreDocumentComplete(score, categories = ROUND_ONE_CATEGORIES) {
  return categories.every((category) => isValidScore(score?.[category.key]));
}

export function calculateCategoryAverage(scores, categoryKey) {
  const values = scores
    .map((score) => score?.[categoryKey])
    .filter((score) => isValidScore(score));

  if (values.length === 0) {
    return null;
  }

  return round2(values.reduce((sum, score) => sum + Number(score), 0) / values.length);
}

export function calculateWeightedScore(average, weight) {
  if (average === null || average === undefined) {
    return null;
  }
  return round2(Number(average) * (weight / 10));
}

export function calculateRoundOneScore(contestant, scores, configuredCategories = ROUND_ONE_CATEGORIES) {
  const categories = configuredCategories.map((category) => {
    const average = calculateCategoryAverage(scores, category.key);
    const weighted = calculateWeightedScore(average, category.weight);
    return { ...category, average, weighted };
  });

  const total = categories.some((category) => category.weighted === null)
    ? null
    : round2(categories.reduce((sum, category) => sum + category.weighted, 0));

  return {
    contestant,
    categories,
    total,
    complete: scores.length > 0 && categories.every((category) => category.average !== null)
  };
}

export function calculateRoundOneRankings(contestants, scores, categories = ROUND_ONE_CATEGORIES) {
  const results = contestants.map((contestant) => {
    const contestantScores = scores.filter(
      (score) => String(score.contestantId?._id || score.contestantId) === String(contestant._id)
    );
    return calculateRoundOneScore(contestant, contestantScores, categories);
  });

  return results
    .sort((a, b) => (b.total ?? -1) - (a.total ?? -1))
    .map((result, index) => ({ ...result, rank: index + 1 }));
}

export function validateRoundCompletion(activeJudges, contestants, scores, categories = ROUND_ONE_CATEGORIES) {
  const missing = [];

  for (const contestant of contestants) {
    for (const judge of activeJudges) {
      const score = scores.find(
        (entry) =>
          entry.judgeId === judge.judgeId &&
          String(entry.contestantId?._id || entry.contestantId) === String(contestant._id)
      );

      if (!scoreDocumentComplete(score, categories)) {
        missing.push({
          contestantId: contestant._id,
          contestantNumber: contestant.contestantNumber,
          judgeId: judge.judgeId
        });
      }
    }
  }

  return {
    complete: missing.length === 0,
    missing
  };
}

export function detectTie(rankings, cutoff = 5) {
  if (rankings.length <= cutoff) {
    return { tied: false, tiedContestants: [] };
  }

  const cutoffScore = rankings[cutoff - 1]?.total;
  const nextScore = rankings[cutoff]?.total;

  if (cutoffScore === null || nextScore === null || cutoffScore !== nextScore) {
    return { tied: false, tiedContestants: [] };
  }

  return {
    tied: true,
    tiedContestants: rankings.filter((result) => result.total === cutoffScore)
  };
}

export function calculateFinalScore(roundOneScore, intelligenceAverage, beautyAverage) {
  if (
    roundOneScore === null ||
    intelligenceAverage === null ||
    beautyAverage === null ||
    roundOneScore === undefined ||
    intelligenceAverage === undefined ||
    beautyAverage === undefined
  ) {
    return null;
  }

  return round2(Number(roundOneScore) * 0.2 + Number(intelligenceAverage) * 10 * 0.4 + Number(beautyAverage) * 10 * 0.4);
}

export function calculateFinalRankings(finalists, roundOneRankings, finalScores, categories = FINAL_CATEGORIES) {
  const results = finalists
    .filter((finalist) => finalist.contestantId)
    .map((finalist) => {
      const contestant = finalist.contestantId;
      const contestantId = String(contestant?._id || contestant);
      const roundOne = roundOneRankings.find((result) => String(result.contestant._id) === contestantId);
      const scores = finalScores.filter((score) => String(score.contestantId?._id || score.contestantId) === contestantId);
      const categoryResults = categories.map((category) => {
        const average = calculateCategoryAverage(scores, category.key);
        return {
          ...category,
          average,
          score100: average === null ? null : round2(average * 10),
          weighted: calculateWeightedScore(average, category.weight)
        };
      });
      const finalScore = roundOne?.total == null || categoryResults.some((category) => category.average === null)
        ? null
        : round2(
          Number(roundOne.total) * (FINAL_ROUND_ONE_CARRYOVER_WEIGHT / 100) +
            categoryResults.reduce((sum, category) => sum + category.weighted, 0)
        );
      const intelligenceAverage = categoryResults.find((category) => category.key === 'intelligence')?.score100 ?? null;
      const beautyAverage = categoryResults.find((category) => category.key === 'beauty')?.score100 ?? null;

      return {
        contestant,
        roundOneTotal: roundOne?.total ?? null,
        categories: categoryResults,
        intelligenceAverage,
        beautyAverage,
        finalScore,
        complete: finalScore !== null
      };
    });

  return results
    .sort((a, b) => (b.finalScore ?? -1) - (a.finalScore ?? -1))
    .map((result, index) => ({ ...result, rank: index + 1 }));
}

export function calculateCategoryRankings(contestants, scores, categoryKey) {
  const list = contestants.map((contestant) => {
    const contestantScores = scores.filter(
      (score) => String(score.contestantId?._id || score.contestantId) === String(contestant._id)
    );
    const average = calculateCategoryAverage(contestantScores, categoryKey);
    return {
      contestant,
      average,
      score100: average === null ? null : round2(average * 10)
    };
  });

  return list
    .sort((a, b) => (b.average ?? -1) - (a.average ?? -1))
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

export function calculateSpecialAwards(contestants, scores, categories = ROUND_ONE_CATEGORIES) {
  return categories.map((category) => {
    const rankings = calculateCategoryRankings(contestants, scores, category.key);
    const top = rankings[0] || null;
    return {
      key: category.key,
      title: `Best in ${category.label}`,
      categoryLabel: category.label,
      weight: category.weight,
      winner: top?.average !== null && top?.average !== undefined ? top.contestant : null,
      topScore: top?.average ?? null,
      topScore100: top?.score100 ?? null,
      rankings
    };
  });
}

export function calculateJudgeScoringAnalytics(judges, contestants, scores, categories = ROUND_ONE_CATEGORIES) {
  return judges.map((judge) => {
    const judgeScores = scores.filter((score) => score.judgeId === judge.judgeId);
    const allValues = [];

    for (const score of judgeScores) {
      for (const cat of categories) {
        if (isValidScore(score?.[cat.key])) {
          allValues.push(Number(score[cat.key]));
        }
      }
    }

    const count = allValues.length;
    const avg = count ? round2(allValues.reduce((sum, v) => sum + v, 0) / count) : 0;
    const min = count ? Math.min(...allValues) : 0;
    const max = count ? Math.max(...allValues) : 0;

    return {
      judgeId: judge.judgeId,
      name: judge.name,
      designation: judge.designation || 'Judge',
      totalScoresGiven: count,
      averageScore: avg,
      lowestScore: min,
      highestScore: max
    };
  });
}
