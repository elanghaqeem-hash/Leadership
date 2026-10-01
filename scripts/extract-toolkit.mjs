import ExcelJS from 'exceljs';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'source', 'Leadership_That_Works_Toolkit.xlsx');
const seedPath = path.join(root, 'packages', 'content', 'seed', 'toolkit.seed.json');
const manifestPath = path.join(root, 'source', 'toolkit-manifest.runtime.json');

const bytes = await fs.readFile(source);
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(bytes);

const text = (v) => {
  if (v == null) return null;
  if (typeof v === 'object' && 'result' in v) return v.result ?? null;
  if (typeof v === 'object' && 'text' in v) return v.text ?? null;
  return v;
};
const cell = (sheet, address) => text(workbook.getWorksheet(sheet)?.getCell(address).value);
const rowValues = (sheet, row, fromCol, toCol) => {
  const ws = workbook.getWorksheet(sheet);
  return Array.from({ length: toCol - fromCol + 1 }, (_, i) => text(ws.getCell(row, fromCol + i).value));
};
const rows = (sheet, fromRow, toRow, fromCol, toCol) =>
  Array.from({ length: toRow - fromRow + 1 }, (_, i) => rowValues(sheet, fromRow + i, fromCol, toCol));

const priorityWeights = rowValues('3 Priority Scorecard', 5, 3, 8);
const arenaRows = rows('15 Arena Scoring', 7, 26, 1, 5);
const auctionRows = rows('16 Decision Auction', 7, 13, 1, 8);
const warRows = rows('17 War Room Score', 6, 13, 1, 5);
const testRows = rows('19 Pre-Post Test', 6, 25, 1, 7);
const impactRows = rows('22 Impact Metrics', 6, 14, 1, 3);
const gameRows = rows('24 Kartu Game', 1, 120, 1, 5);

const seed = {
  meta: { source: path.basename(source), sha256, generatedAt: new Date().toISOString() },
  selfDiagnostic: { dimensions: rows('1 Self-Diagnostic', 6, 15, 1, 1).flat().filter(Boolean), scale: { min: 1, max: 5 } },
  priorityScorecard: {
    weights: { urgency: priorityWeights[0], business: priorityWeights[1], customer: priorityWeights[2], risk: priorityWeights[3], compliance: priorityWeights[4], strategic: priorityWeights[5] },
    thresholds: { p1: 4, p2: 3, p3: 2 }, override: { risk: 5, compliance: 5 }
  },
  weeklyPlanner: { categories: rows('4 Weekly Planner', 6, 12, 8, 8).flat().filter(Boolean), slotMinutes: 30, buffer: { min: 0.15, max: 0.20 }, focusEnough: 0.20 },
  arena: {
    decisionMinutes: { Delegate: cell('15 Arena Scoring', 'B5'), Escalate: cell('15 Arena Scoring', 'C5'), Defer: cell('15 Arena Scoring', 'D5') },
    events: arenaRows.map((r, i) => ({ no: i + 1, event: r[0], dimension: r[1], best: r[2], acceptable: r[3], doMinutes: r[4] }))
  },
  decisionAuction: {
    budget: cell('16 Decision Auction', 'B4'), switchingRate: cell('16 Decision Auction', 'D4'), maxActive: 3,
    programs: auctionRows.map((r) => ({ name: r[0], cost: r[1], benefit: r[2], risk: r[3], uncertainty: r[4], factors: { r1: r[5], r2: r[6], r3: r[7] } }))
  },
  warRoom: { dimensions: warRows.map((r) => ({ name: r[0], max: r[1], rubric: { low: r[2], medium: r[3], high: r[4] } })), totalMax: 100 },
  boardroom: { criteria: rowValues('18 Boardroom Rubric', 5, 2, 7), scale: { min: 1, max: 5 }, max: 30 },
  test: { pointsPerQuestion: 5, questions: testRows.map((r) => ({ no: r[0], question: r[1], options: { A: r[2], B: r[3], C: r[4], D: r[5] }, answer: r[6] })) },
  managerFollowUp: { questions: rows('21 Manager Follow-up', 6, 10, 1, 1).flat().filter(Boolean), thresholds: { onTrack: 0.80, needsPush: 0.50 } },
  impactMetrics: { metrics: impactRows.map((r) => ({ name: r[0], unit: r[1], goodDirection: r[2] })) },
  evaluationL1: { statements: rows('25 Evaluasi Training', 16, 23, 2, 2).flat().filter(Boolean) },
  gameCardsRaw: { sheet: '24 Kartu Game', rows: gameRows }
};

const manifest = {
  sourceFile: path.relative(root, source).replaceAll('\\', '/'), sha256, sheetCount: workbook.worksheets.length,
  sheets: workbook.worksheets.map((ws, index) => ({ index, name: ws.name, rowCount: ws.rowCount, columnCount: ws.columnCount }))
};

await fs.mkdir(path.dirname(seedPath), { recursive: true });
await fs.writeFile(seedPath, JSON.stringify(seed, null, 2) + '\n', 'utf8');
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`Toolkit extracted: ${workbook.worksheets.length} sheets, sha256=${sha256}`);
