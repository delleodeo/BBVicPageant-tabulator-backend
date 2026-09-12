export const DEFAULT_ROUND_ONE_CATEGORIES = [
  { key: 'productionOutfit', label: 'Production Outfit', weight: 10 },
  { key: 'swimsuit', label: 'Swimsuit', weight: 10 },
  { key: 'festivalCostume', label: 'Festival Costume', weight: 30 },
  { key: 'eveningGown', label: 'Evening Gown', weight: 20 },
  { key: 'beautyIntelligence', label: 'Beauty & Intelligence', weight: 30 }
];

export const DEFAULT_FINAL_CATEGORIES = [
  { key: 'intelligence', label: 'Intelligence', weight: 40 },
  { key: 'beauty', label: 'Beauty', weight: 40 }
];

export const ROUND_ONE_TOTAL_WEIGHT = 100;
export const FINAL_ROUND_ONE_CARRYOVER_WEIGHT = 20;
export const FINAL_CATEGORIES_TOTAL_WEIGHT = 100 - FINAL_ROUND_ONE_CARRYOVER_WEIGHT;

export function cloneCriteria(criteria) {
  return criteria.map((criterion) => ({ ...criterion }));
}
