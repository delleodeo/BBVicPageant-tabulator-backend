import PDFDocument from 'pdfkit';
import { Pageant } from '../models/Pageant.js';
import { Judge } from '../models/Judge.js';

export async function generateCertifiedPdf({ res, filename, title, roundName, rankings, isFinal = false }) {
  const pageant = (await Pageant.findOne()) || {
    pageantName: 'Pageant Tabulation',
    eventName: 'Grand Coronation Night',
    venue: 'Grand Ballroom',
    organizationName: 'Board of Tabulators'
  };

  const judges = await Judge.find({ status: 'active' }).sort({ judgeId: 1 });

  const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
  res.header('Content-Type', 'application/pdf');
  res.attachment(filename);
  doc.pipe(res);

  // Header Banner
  doc.rect(40, 40, 515, 60).fill('#10233f');

  doc.fillColor('#c99a2e').fontSize(14).font('Helvetica-Bold').text(pageant.pageantName.toUpperCase(), 50, 50, { align: 'center', width: 495 });
  doc.fillColor('#ffffff').fontSize(11).font('Helvetica').text(pageant.eventName, 50, 68, { align: 'center', width: 495 });
  doc.fillColor('#e7ded0').fontSize(8).text(`${pageant.venue || ''} | Official Tabulation Certificate`, 50, 83, { align: 'center', width: 495 });

  doc.moveDown(2);
  doc.y = 115;

  doc.fillColor('#10233f').fontSize(14).font('Helvetica-Bold').text(title, { align: 'center' });
  doc.fillColor('#6d7480').fontSize(8).font('Helvetica').text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
  doc.moveDown(1);

  // Table Setup
  const startX = 40;
  let startY = doc.y + 10;
  const colWidths = isFinal
    ? [35, 45, 140, 75, 75, 75, 70]
    : [30, 40, 130, 60, 55, 60, 60, 80];

  const headers = isFinal
    ? ['Rank', '#', 'Contestant Name', 'Round 1', 'Intelligence', 'Beauty', 'Final Score']
    : ['Rank', '#', 'Contestant Name', 'Prod (10%)', 'Swim (10%)', 'Costume (30%)', 'Gown (20%)', 'B&I (30%)'];

  // Table Header Row
  doc.rect(startX, startY, 515, 20).fill('#18385f');
  let currentX = startX;
  doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');

  headers.forEach((header, i) => {
    doc.text(header, currentX + 3, startY + 6, { width: colWidths[i] - 6, align: i >= 3 ? 'center' : 'left' });
    currentX += colWidths[i];
  });

  startY += 20;

  // Table Rows
  rankings.forEach((row, rowIndex) => {
    const isEven = rowIndex % 2 === 0;
    doc.rect(startX, startY, 515, 18).fill(isEven ? '#f9f9fb' : '#ffffff');
    doc.rect(startX, startY, 515, 18).stroke('#e7ded0');

    let x = startX;
    doc.fillColor('#1e242b').fontSize(8).font('Helvetica');

    const values = isFinal
      ? [
          String(row.rank),
          String(row.contestant?.contestantNumber || ''),
          String(row.contestant?.name || ''),
          row.roundOneTotal != null ? Number(row.roundOneTotal).toFixed(2) : '-',
          row.intelligenceAverage != null ? Number(row.intelligenceAverage).toFixed(2) : '-',
          row.beautyAverage != null ? Number(row.beautyAverage).toFixed(2) : '-',
          row.finalScore != null ? Number(row.finalScore).toFixed(2) : '-'
        ]
      : [
          String(row.rank),
          String(row.contestant?.contestantNumber || ''),
          String(row.contestant?.name || ''),
          row.categories?.find((c) => c.key === 'productionOutfit')?.weighted != null
            ? Number(row.categories.find((c) => c.key === 'productionOutfit').weighted).toFixed(2)
            : '-',
          row.categories?.find((c) => c.key === 'swimsuit')?.weighted != null
            ? Number(row.categories.find((c) => c.key === 'swimsuit').weighted).toFixed(2)
            : '-',
          row.categories?.find((c) => c.key === 'festivalCostume')?.weighted != null
            ? Number(row.categories.find((c) => c.key === 'festivalCostume').weighted).toFixed(2)
            : '-',
          row.categories?.find((c) => c.key === 'eveningGown')?.weighted != null
            ? Number(row.categories.find((c) => c.key === 'eveningGown').weighted).toFixed(2)
            : '-',
          row.categories?.find((c) => c.key === 'beautyIntelligence')?.weighted != null
            ? Number(row.categories.find((c) => c.key === 'beautyIntelligence').weighted).toFixed(2)
            : '-'
        ];

    values.forEach((val, i) => {
      if (i === 0 && Number(val) <= 3) {
        doc.font('Helvetica-Bold').fillColor('#c99a2e');
      } else if (i === values.length - 1) {
        doc.font('Helvetica-Bold').fillColor('#10233f');
      } else {
        doc.font('Helvetica').fillColor('#1e242b');
      }
      doc.text(val, x + 3, startY + 5, { width: colWidths[i] - 6, align: i >= 3 ? 'center' : 'left' });
      x += colWidths[i];
    });

    startY += 18;
  });

  // Certification Statement
  startY += 15;
  if (startY > 620) {
    doc.addPage();
    startY = 50;
  }

  doc.fillColor('#10233f').fontSize(9).font('Helvetica-Bold').text('BOARD OF JUDGES & TABULATION CERTIFICATION', startX, startY);
  doc.moveDown(0.3);
  startY = doc.y;
  doc.fillColor('#4a5568').fontSize(7.5).font('Helvetica').text(
    'We hereby certify that the scores, ratings, and rankings indicated above are true, accurate, and computed strictly in accordance with the official rules, criteria, and weights set by the pageant committee.',
    startX,
    startY,
    { width: 515 }
  );

  startY = doc.y + 15;

  // Signature Blocks
  const sigBoxWidth = 150;
  const sigRowHeight = 45;
  judges.slice(0, 6).forEach((judge, idx) => {
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const sigX = startX + col * 175;
    const sigY = startY + row * sigRowHeight;

    doc.moveTo(sigX, sigY + 20).lineTo(sigX + sigBoxWidth, sigY + 20).stroke('#a0aec0');
    doc.fillColor('#10233f').fontSize(7.5).font('Helvetica-Bold').text(judge.name, sigX, sigY + 23, { width: sigBoxWidth, align: 'center' });
    doc.fillColor('#718096').fontSize(6.5).font('Helvetica').text(judge.designation || `Judge ${judge.judgeId}`, sigX, sigY + 32, { width: sigBoxWidth, align: 'center' });
  });

  doc.end();
}

