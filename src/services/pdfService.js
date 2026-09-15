import PDFDocument from 'pdfkit';
import { Pageant } from '../models/Pageant.js';
import { Judge } from '../models/Judge.js';

export async function generateCertifiedPdf({ res, filename, title, roundName, rankings, isFinal = false, categories = [] }) {
  const pageant = (await Pageant.findOne()) || {
    pageantName: 'Pageant Tabulation',
    eventName: 'Grand Coronation Night',
    venue: 'Grand Ballroom',
    organizationName: 'Board of Tabulators'
  };

  const judges = await Judge.find({ status: 'active' }).sort({ judgeId: 1 });

  const layout = categories.length > 4 ? 'landscape' : 'portrait';
  const doc = new PDFDocument({ margin: 40, size: 'A4', layout, bufferPages: true });
  const contentWidth = doc.page.width - 80;
  res.header('Content-Type', 'application/pdf');
  res.attachment(filename);
  doc.pipe(res);

  // Header Banner
  doc.rect(40, 40, contentWidth, 60).fill('#10233f');

  doc.fillColor('#c99a2e').fontSize(14).font('Helvetica-Bold').text(pageant.pageantName.toUpperCase(), 50, 50, { align: 'center', width: contentWidth - 20 });
  doc.fillColor('#ffffff').fontSize(11).font('Helvetica').text(pageant.eventName, 50, 68, { align: 'center', width: contentWidth - 20 });
  doc.fillColor('#e7ded0').fontSize(8).text(`${pageant.venue || ''} | Official Tabulation Certificate`, 50, 83, { align: 'center', width: contentWidth - 20 });

  doc.moveDown(2);
  doc.y = 115;

  doc.fillColor('#10233f').fontSize(14).font('Helvetica-Bold').text(title, { align: 'center' });
  doc.fillColor('#6d7480').fontSize(8).font('Helvetica').text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
  doc.moveDown(1);

  // Table Setup
  const startX = 40;
  let startY = doc.y + 10;
  const fixedWidths = [35, 40, layout === 'landscape' ? 145 : 120];
  const totalWidth = 70;
  const extraFixedWidth = isFinal ? 65 : 0;
  const criteriaWidth = Math.max(
    34,
    (contentWidth - fixedWidths.reduce((sum, width) => sum + width, 0) - totalWidth - extraFixedWidth) /
      Math.max(categories.length, 1)
  );
  const colWidths = [
    ...fixedWidths,
    ...(isFinal ? [extraFixedWidth] : []),
    ...categories.map(() => criteriaWidth),
    totalWidth
  ];

  const headers = [
    'Rank',
    '#',
    'Contestant Name',
    ...(isFinal ? ['Round 1\n20%'] : []),
    ...categories.map((category) => `${category.label}\n${category.weight}%`),
    isFinal ? 'Final Score' : 'Total'
  ];

  // Table Header Row
  const tableWidth = colWidths.reduce((sum, width) => sum + width, 0);
  const headerHeight = 30;
  doc.rect(startX, startY, tableWidth, headerHeight).fill('#18385f');
  let currentX = startX;
  doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');

  headers.forEach((header, i) => {
    doc.text(header, currentX + 3, startY + 5, { width: colWidths[i] - 6, align: i >= 3 ? 'center' : 'left' });
    currentX += colWidths[i];
  });

  startY += headerHeight;

  // Table Rows
  rankings.forEach((row, rowIndex) => {
    const isEven = rowIndex % 2 === 0;
    doc.rect(startX, startY, tableWidth, 18).fill(isEven ? '#f9f9fb' : '#ffffff');
    doc.rect(startX, startY, tableWidth, 18).stroke('#e7ded0');

    let x = startX;
    doc.fillColor('#1e242b').fontSize(8).font('Helvetica');

    const categoryValues = categories.map((category) => {
      const categoryResult = row.categories?.find((entry) => entry.key === category.key);
      const value = isFinal ? categoryResult?.score100 : categoryResult?.weighted;
      return value != null ? Number(value).toFixed(2) : '-';
    });
    const values = [
      String(row.rank),
      String(row.contestant?.contestantNumber || ''),
      String(row.contestant?.name || ''),
      ...(isFinal ? [row.roundOneTotal != null ? Number(row.roundOneTotal).toFixed(2) : '-'] : []),
      ...categoryValues,
      isFinal
        ? (row.finalScore != null ? Number(row.finalScore).toFixed(2) : '-')
        : (row.total != null ? Number(row.total).toFixed(2) : '-')
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
  if (startY > doc.page.height - 160) {
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
    { width: contentWidth }
  );

  startY = doc.y + 15;

  // Signature Blocks
  const sigBoxWidth = Math.min(180, (contentWidth - 50) / 3);
  const sigRowHeight = 45;
  judges.forEach((judge, idx) => {
    if (idx && idx % 6 === 0) {
      doc.addPage();
      startY = 50;
    }
    const col = idx % 3;
    const row = Math.floor((idx % 6) / 3);
    const sigX = startX + col * ((contentWidth - sigBoxWidth) / 2);
    const sigY = startY + row * sigRowHeight;

    doc.moveTo(sigX, sigY + 20).lineTo(sigX + sigBoxWidth, sigY + 20).stroke('#a0aec0');
    doc.fillColor('#10233f').fontSize(7.5).font('Helvetica-Bold').text(judge.name, sigX, sigY + 23, { width: sigBoxWidth, align: 'center' });
    doc.fillColor('#718096').fontSize(6.5).font('Helvetica').text(judge.designation || `Judge ${judge.judgeId}`, sigX, sigY + 32, { width: sigBoxWidth, align: 'center' });
  });

  doc.end();
}

export async function generateCategoryScorePdf({ res, roundLabel, category, judges, contestants, scores }) {
  const pageant = (await Pageant.findOne()) || {};
  const doc = new PDFDocument({ margin: 38, size: 'A4', layout: 'landscape' });
  res.header('Content-Type', 'application/pdf');
  res.attachment(`${roundLabel.toLowerCase().replaceAll(' ', '-')}-${category.key}-judge-scores.pdf`);
  doc.pipe(res);

  const scoreIndex = new Map(scores.map((score) => [`${score.judgeId}:${score.contestantId}`, score]));
  const judgeGroups = [];
  for (let index = 0; index < judges.length; index += 6) judgeGroups.push(judges.slice(index, index + 6));
  if (!judgeGroups.length) judgeGroups.push([]);
  const left = 38;
  const usableWidth = doc.page.width - 76;
  const rowHeight = 24;

  judgeGroups.forEach((group, groupIndex) => {
    if (groupIndex) doc.addPage();
    const fixedWidths = [38, 172, 150];
    const averageWidth = 62;
    const judgeWidth = (usableWidth - fixedWidths.reduce((sum, width) => sum + width, 0) - averageWidth) / Math.max(group.length, 1);
    const widths = [...fixedWidths, ...group.map(() => judgeWidth), averageWidth];
    const headers = ['#', 'Candidate', 'Representing', ...group.map((judge) => judge.judgeId), 'Average'];

    function drawHeading() {
      doc.rect(left, 38, usableWidth, 58).fill('#10233f');
      doc.fillColor('#e5c158').font('Helvetica-Bold').fontSize(13)
        .text(String(pageant.pageantName || 'Pageant Tabulation').toUpperCase(), left + 10, 47, { width: usableWidth - 20, align: 'center' });
      doc.fillColor('#ffffff').font('Helvetica').fontSize(9)
        .text(`${roundLabel.toUpperCase()} / ${category.label} (${category.weight}%)`, left + 10, 69, { width: usableWidth - 20, align: 'center' });
      doc.fillColor('#243b61').font('Helvetica-Bold').fontSize(11)
        .text('OFFICIAL CATEGORY SCORE SHEET', left, 108, { width: usableWidth, align: 'center' });
      doc.fillColor('#64748b').font('Helvetica').fontSize(7.5)
        .text(`Event: ${pageant.eventName || ''}    Generated: ${new Date().toLocaleString()}`, left, 126, { width: usableWidth, align: 'center' });
      let x = left;
      doc.rect(left, 151, usableWidth, 30).fill('#18385f');
      headers.forEach((header, index) => {
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
          .text(header, x + 3, 160, { width: widths[index] - 6, align: index >= 3 ? 'center' : 'left', lineBreak: false });
        x += widths[index];
      });
      return 181;
    }

    let y = drawHeading();
    contestants.forEach((contestant, rowIndex) => {
      if (y + rowHeight > doc.page.height - 38) {
        doc.addPage();
        y = drawHeading();
      }
      doc.rect(left, y, usableWidth, rowHeight).fill(rowIndex % 2 ? '#ffffff' : '#f4f7fa');
      const judgeScores = group.map((judge) => scoreIndex.get(`${judge.judgeId}:${contestant._id}`)?.[category.key]);
      const present = judges.map((judge) => scoreIndex.get(`${judge.judgeId}:${contestant._id}`)?.[category.key])
        .filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)));
      const values = [
        contestant.contestantNumber,
        contestant.name,
        contestant.hometown || '',
        ...judgeScores.map((value) => value === null || value === undefined ? '—' : Number(value).toFixed(1)),
        present.length ? (present.reduce((sum, value) => sum + Number(value), 0) / present.length).toFixed(2) : '—'
      ];
      let x = left;
      values.forEach((value, index) => {
        doc.fillColor('#17283f').font(index === values.length - 1 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
          .text(String(value), x + 3, y + 7, { width: widths[index] - 6, align: index >= 3 ? 'center' : 'left', lineBreak: false, ellipsis: true });
        x += widths[index];
      });
      y += rowHeight;
    });

    const signatureRows = Math.ceil(group.length / 3);
    if (y + 56 + signatureRows * 62 > doc.page.height - 38) {
      doc.addPage();
      y = 50;
    } else {
      y += 22;
    }
    doc.fillColor('#10233f').font('Helvetica-Bold').fontSize(9)
      .text('JUDGE SIGNATURES', left, y);
    y += 27;
    const signatureWidth = usableWidth / 3 - 15;
    group.forEach((judge, index) => {
      const x = left + (index % 3) * (usableWidth / 3);
      const signatureY = y + Math.floor(index / 3) * 62;
      doc.moveTo(x, signatureY + 16).lineTo(x + signatureWidth, signatureY + 16).strokeColor('#64748b').stroke();
      doc.fillColor('#10233f').font('Helvetica-Bold').fontSize(8)
        .text(judge.name, x, signatureY + 21, { width: signatureWidth, align: 'center' });
      doc.fillColor('#64748b').font('Helvetica').fontSize(7)
        .text(judge.designation || `Judge ${judge.judgeId}`, x, signatureY + 32, { width: signatureWidth, align: 'center' });
    });
  });

  doc.end();
}
