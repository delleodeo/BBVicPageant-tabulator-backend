import express from 'express';
import { adminOnly, authMiddleware } from '../middleware/auth.js';
import { buildFinalResults } from './finalRoutes.js';
import { buildRoundOneResults } from './roundOneRoutes.js';
import { computeSpecialAwardsSummary } from './specialAwardRoutes.js';
import { Contestant } from '../models/Contestant.js';
import { FinalRoundScore } from '../models/FinalRoundScore.js';
import { Judge } from '../models/Judge.js';
import { RoundOneScore } from '../models/RoundOneScore.js';
import { getFinalists } from '../services/finalistService.js';
import { getScoringCriteria } from '../services/criteriaService.js';
import { generateCategoryScorePdf, generateCertifiedPdf } from '../services/pdfService.js';
import { asyncHandler, HttpError } from '../utils/httpError.js';

export const exportRoutes = express.Router();

exportRoutes.use(authMiddleware, adminOnly);

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function sendCsv(res, filename, rows) {
  const headers = Object.keys(rows[0] || {});
  const csv = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(','))
  ].join('\n');
  res.header('Content-Type', 'text/csv');
  res.attachment(filename);
  res.send(csv);
}

function sendExcel(res, filename, rows) {
  const headers = Object.keys(rows[0] || {});
  const html = `<!doctype html><html><head><meta charset="utf-8" /></head><body><table><thead><tr>${headers
    .map((header) => `<th>${header}</th>`)
    .join('')}</tr></thead><tbody>${rows
    .map((row) => `<tr>${headers.map((header) => `<td>${row[header] ?? ''}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></body></html>`;
  res.header('Content-Type', 'application/vnd.ms-excel');
  res.attachment(filename);
  res.send(html);
}

function roundOneRows(rankings, categories) {
  return rankings.map((result) => {
    const row = {
      Rank: result.rank,
      'Contestant Number': result.contestant.contestantNumber,
      Name: result.contestant.name,
      Hometown: result.contestant.hometown || ''
    };
    for (const category of categories) {
      row[`${category.label} (${category.weight}%)`] = result.categories.find(
        (entry) => entry.key === category.key
      )?.weighted ?? '';
    }
    row.Total = result.total ?? '';
    row.Status = result.contestant.status;
    return row;
  });
}

function finalRows(rankings, categories) {
  return rankings.map((result) => {
    const row = {
      Rank: result.rank,
      'Contestant Number': result.contestant.contestantNumber,
      Name: result.contestant.name,
      Hometown: result.contestant.hometown || '',
      'Round 1 (20%)': result.roundOneTotal ?? ''
    };
    for (const category of categories) {
      row[`${category.label} (${category.weight}%)`] = result.categories?.find(
        (entry) => entry.key === category.key
      )?.score100 ?? '';
    }
    row['Final Score'] = result.finalScore ?? '';
    return row;
  });
}

exportRoutes.get(
  '/round-one',
  asyncHandler(async (req, res) => {
    const results = await buildRoundOneResults();
    const format = String(req.query.format || 'csv').toLowerCase();
    if (format === 'csv') return sendCsv(res, 'round-one-results.csv', roundOneRows(results.rankings, results.categories));
    if (format === 'xls' || format === 'excel') return sendExcel(res, 'round-one-results.xls', roundOneRows(results.rankings, results.categories));
    if (format === 'pdf') {
      return generateCertifiedPdf({
        res,
        filename: 'official-round-one-results.pdf',
        title: 'OFFICIAL ROUND 1 TABULATION RESULTS',
        roundName: 'ROUND 1',
        rankings: results.rankings,
        isFinal: false,
        categories: results.categories
      });
    }
    throw new HttpError(400, 'Unsupported export format.');
  })
);

exportRoutes.get(
  '/final',
  asyncHandler(async (req, res) => {
    const results = await buildFinalResults();
    const format = String(req.query.format || 'csv').toLowerCase();
    if (format === 'csv') return sendCsv(res, 'final-results.csv', finalRows(results.rankings, results.categories));
    if (format === 'xls' || format === 'excel') return sendExcel(res, 'final-results.xls', finalRows(results.rankings, results.categories));
    if (format === 'pdf') {
      return generateCertifiedPdf({
        res,
        filename: 'official-final-results.pdf',
        title: 'OFFICIAL FINAL ROUND TABULATION RESULTS',
        roundName: 'FINAL ROUND',
        rankings: results.rankings,
        isFinal: true,
        categories: results.categories
      });
    }
    throw new HttpError(400, 'Unsupported export format.');
  })
);

exportRoutes.get(
  '/:round/category/:categoryKey',
  asyncHandler(async (req, res) => {
    const isFinal = req.params.round === 'final';
    if (!isFinal && req.params.round !== 'round-one') throw new HttpError(404, 'Round not found.');
    const criteria = await getScoringCriteria();
    const category = (isFinal ? criteria.finalCategories : criteria.roundOneCategories)
      .find((item) => item.key === req.params.categoryKey);
    if (!category) throw new HttpError(404, 'Category not found.');

    const [judges, contestants, scores] = await Promise.all([
      Judge.find({ status: 'active' }).sort({ judgeId: 1 }),
      isFinal ? getFinalists().then((finalists) => finalists.map((finalist) => finalist.contestantId))
        : Contestant.find().sort({ contestantNumber: 1 }),
      isFinal ? FinalRoundScore.find({ round: 'FINAL' }) : RoundOneScore.find({ round: 'ROUND_1' })
    ]);
    return generateCategoryScorePdf({
      res,
      roundLabel: isFinal ? 'Final Round' : 'Round One',
      category,
      judges,
      contestants,
      scores
    });
  })
);
