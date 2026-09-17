import { Pageant } from '../models/Pageant.js';
import {
  DEFAULT_FINAL_CATEGORIES,
  DEFAULT_ROUND_ONE_CATEGORIES,
  FINAL_CATEGORIES_TOTAL_WEIGHT,
  ROUND_ONE_TOTAL_WEIGHT,
  cloneCriteria
} from '../config/scoringCriteria.js';
import { HttpError } from '../utils/httpError.js';

const KEY_PATTERN = /^[a-z][A-Za-z0-9]{1,39}$/;
const RESERVED_KEYS = new Set([
  '_id',
  '__v',
  'judgeId',
  'contestantId',
  'round',
  'createdAt',
  'updatedAt',
  'id',
  'constructor',
  'prototype',
  'toString',
  'valueOf',
  'save',
  'validate',
  'model',
  'schema',
  'collection'
]);

function plainCriteria(criteria) {
  return criteria.map((criterion) => ({
    key: criterion.key,
    label: criterion.label,
    weight: Number(criterion.weight),
    locked: criterion.locked === true
  }));
}

export function normalizeCriteria(criteria, { fieldName, expectedWeight }) {
  if (!Array.isArray(criteria) || criteria.length === 0) {
    throw new HttpError(422, `${fieldName} must contain at least one criterion.`);
  }

  if (criteria.length > 12) {
    throw new HttpError(422, `${fieldName} can contain at most 12 criteria.`);
  }

  const normalized = criteria.map((criterion, index) => {
    const key = String(criterion?.key || '').trim();
    const label = String(criterion?.label || '').trim();
    const weight = Number(criterion?.weight);

    if (!KEY_PATTERN.test(key) || RESERVED_KEYS.has(key)) {
      throw new HttpError(422, `${fieldName} criterion ${index + 1} has an invalid key.`);
    }
    if (!label || label.length > 80) {
      throw new HttpError(422, `${fieldName} criterion ${index + 1} needs a label of 1 to 80 characters.`);
    }
    if (!Number.isFinite(weight) || weight <= 0 || weight > expectedWeight) {
      throw new HttpError(422, `${fieldName} criterion ${index + 1} has an invalid weight.`);
    }

    return { key, label, weight, locked: criterion.locked === true };
  });

  const keys = normalized.map(({ key }) => key);
  if (new Set(keys).size !== keys.length) {
    throw new HttpError(422, `${fieldName} criterion keys must be unique.`);
  }
  const labels = normalized.map(({ label }) => label.toLowerCase());
  if (new Set(labels).size !== labels.length) {
    throw new HttpError(422, `${fieldName} criterion labels must be unique.`);
  }

  const totalWeight = normalized.reduce((sum, criterion) => sum + criterion.weight, 0);
  if (Math.abs(totalWeight - expectedWeight) > 0.000001) {
    throw new HttpError(422, `${fieldName} weights must total ${expectedWeight}%.`);
  }

  return normalized;
}

export function normalizeRoundOneCriteria(criteria) {
  return normalizeCriteria(criteria, {
    fieldName: 'Round One criteria',
    expectedWeight: ROUND_ONE_TOTAL_WEIGHT
  });
}

export function normalizeFinalCriteria(criteria) {
  return normalizeCriteria(criteria, {
    fieldName: 'Final Round criteria',
    expectedWeight: FINAL_CATEGORIES_TOTAL_WEIGHT
  });
}

export function criteriaFromPageant(pageant) {
  const roundOneCategories = pageant?.roundOneCategories?.length
    ? plainCriteria(pageant.roundOneCategories)
    : cloneCriteria(DEFAULT_ROUND_ONE_CATEGORIES);
  const finalCategories = pageant?.finalCategories?.length
    ? plainCriteria(pageant.finalCategories)
    : cloneCriteria(DEFAULT_FINAL_CATEGORIES);

  return { roundOneCategories, finalCategories };
}

export async function getScoringCriteria() {
  let pageant = await Pageant.findOne().sort({ createdAt: 1 });
  if (!pageant) pageant = await Pageant.create({});
  return criteriaFromPageant(pageant);
}

export function assertCategoriesUnlocked(categories, scorePatch) {
  const locked = categories.find((category) => category.locked === true && Object.hasOwn(scorePatch, category.key));
  if (locked) throw new HttpError(403, `${locked.label} is locked.`);
}
