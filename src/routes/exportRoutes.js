import express from 'express';
import { adminOnly, authMiddleware } from '../middleware/auth.js';
import { buildFinalResults } from './finalRoutes.js';
import { buildRoundOneResults } from './roundOneRoutes.js';
import { computeSpecialAwardsSummary } from './specialAwardRoutes.js';
import { generateCertifiedPdf } from '../services/pdfService.js';
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

function roundOneRows(rankings) {
  return rankings.map((result) => ({
    Rank: result.rank,
    'Contestant Number': result.contestant.contestantNumber,
    Name: result.contestant.name,
    Hometown: result.contestant.hometown || '',
    'Production Outfit': result.categories.find((category) => category.key === 'productionOutfit')?.weighted ?? '',
    Swimsuit: result.categories.find((category) => category.key === 'swimsuit')?.weighted ?? '',
    'Festival Costume': result.categories.find((category) => category.key === 'festivalCostume')?.weighted ?? '',
    EveningGown: result.categories.find((category) => category.key === 'eveningGown')?.weighted ?? '',
    'Beauty & Intelligence': result.categories.find((category) => category.key === 'beautyIntelligence')?.weighted ?? '',
    Total: result.total ?? '',
    Status: result.contestant.status
  }));
}

function finalRows(rankings) {
  return rankings.map((result) => ({
    Rank: result.rank,
    'Contestant Number': result.contestant.contestantNumber,
    Name: result.contestant.name,
    Hometown: result.contestant.hometown || '',
    'Round 1': result.roundOneTotal ?? '',
    Intelligence: result.intelligenceAverage ?? '',
    Beauty: result.beautyAverage ?? '',
    'Final Score': result.finalScore ?? ''
  }));
}

exportRoutes.get(
  '/round-one',
  asyncHandler(async (req, res) => {
    const results = await buildRoundOneResults();
    const format = String(req.query.format || 'csv').toLowerCase();
    if (format === 'csv') return sendCsv(res, 'round-one-results.csv', roundOneRows(results.rankings));
    if (format === 'xls' || format === 'excel') return sendExcel(res, 'round-one-results.xls', roundOneRows(results.rankings));
    if (format === 'pdf') {
      return generateCertifiedPdf({
        res,
        filename: 'official-round-one-results.pdf',
        title: 'OFFICIAL ROUND 1 TABULATION RESULTS',
        roundName: 'ROUND 1',
        rankings: results.rankings,
        isFinal: false
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
    if (format === 'csv') return sendCsv(res, 'final-results.csv', finalRows(results.rankings));
    if (format === 'xls' || format === 'excel') return sendExcel(res, 'final-results.xls', finalRows(results.rankings));
    if (format === 'pdf') {
      return generateCertifiedPdf({
        res,
        filename: 'official-final-results.pdf',
        title: 'OFFICIAL FINAL ROUND TABULATION RESULTS',
        roundName: 'FINAL ROUND',
        rankings: results.rankings,
        isFinal: true
      });
    }
    throw new HttpError(400, 'Unsupported export format.');
  })
);

