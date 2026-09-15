import { PassThrough } from 'node:stream';
import { afterEach, expect, it, vi } from 'vitest';
import { Pageant } from '../src/models/Pageant.js';
import { generateCategoryScorePdf } from '../src/services/pdfService.js';

afterEach(() => vi.restoreAllMocks());

it('generates a signed category PDF with judge score columns', async () => {
  vi.spyOn(Pageant, 'findOne').mockResolvedValue({
    pageantName: 'Test Pageant',
    eventName: 'Final Night'
  });

  const response = new PassThrough();
  const headers = {};
  response.header = (name, value) => { headers[name] = value; };
  response.attachment = (filename) => { headers.filename = filename; };
  const chunks = [];
  response.on('data', (chunk) => chunks.push(chunk));
  const finished = new Promise((resolve, reject) => {
    response.on('end', resolve);
    response.on('error', reject);
  });

  await generateCategoryScorePdf({
    res: response,
    roundLabel: 'Round One',
    category: { key: 'outfit', label: 'Production Outfit', weight: 10 },
    judges: Array.from({ length: 7 }, (_, index) => ({ judgeId: `J${index + 1}`, name: `Judge ${index + 1}` })),
    contestants: [{ _id: 'c1', contestantNumber: '01', name: 'Candidate One', hometown: 'Cebu' }],
    scores: [{ judgeId: 'J1', contestantId: 'c1', outfit: 8.7 }]
  });
  await finished;

  const pdf = Buffer.concat(chunks);
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  expect(pdf.length).toBeGreaterThan(1000);
  expect(headers['Content-Type']).toBe('application/pdf');
  expect(headers.filename).toContain('outfit');
});
