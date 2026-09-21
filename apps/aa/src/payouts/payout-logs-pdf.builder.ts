// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit');
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { DownloadPayoutLogsPdfType } from './dto/types';

type PdfDoc = typeof PDFDocument;

export interface PayoutLogsPdfFile {
  filename: string;
  mimeType: string;
  base64: string;
}

// --- Report fonts (Mukta for Latin + Devanagari, Helvetica fallback) ---
let REPORT_FONT = 'Helvetica';
let REPORT_FONT_BOLD = 'Helvetica-Bold';

let resolvedFontPaths: { regular: string; bold: string } | null | undefined;
function resolveFontPaths(): { regular: string; bold: string } | null {
  if (resolvedFontPaths !== undefined) return resolvedFontPaths;
  const candidates = (file: string) => [
    path.join(__dirname, 'assets', 'fonts', file),
    path.join(__dirname, '..', 'assets', 'fonts', file),
    path.join(process.cwd(), 'dist', 'apps', 'aa', 'assets', 'fonts', file),
    path.join(process.cwd(), 'apps', 'aa', 'src', 'assets', 'fonts', file),
  ];
  const pick = (file: string): string | null =>
    candidates(file).find((p) => fs.existsSync(p)) ?? null;
  const regular = pick('Mukta-Regular.ttf');
  const bold = pick('Mukta-Bold.ttf');
  resolvedFontPaths = regular && bold ? { regular, bold } : null;
  return resolvedFontPaths;
}

function registerReportFonts(doc: PdfDoc) {
  const paths = resolveFontPaths();
  if (!paths) return;
  try {
    doc.registerFont('Report', paths.regular);
    doc.registerFont('Report-Bold', paths.bold);
    REPORT_FONT = 'Report';
    REPORT_FONT_BOLD = 'Report-Bold';
  } catch {
    REPORT_FONT = 'Helvetica';
    REPORT_FONT_BOLD = 'Helvetica-Bold';
  }
}

// --- Layout constants (landscape A4, points) ---
const MARGIN = 32;
const HEADER_BG: [number, number, number] = [47, 127, 193];
const GRID_COLOR = '#B9C6D2';
const ZEBRA_COLOR = '#F2F7FC';

const PHOTO_SIZE = 84;
const PHOTO_MIN_ROW_HEIGHT = 96;
const TEXT_MIN_ROW_HEIGHT = 26;
const TABLE_HEAD_HEIGHT = 22;
const FOOTER_RESERVE = 24;
const ROW_PADDING = 8;

const PHOTO_TIMEOUT_MS = 8000;
const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
const PHOTO_FETCH_CONCURRENCY = 5;

interface PdfColumn {
  key: string;
  label: string;
  width: number;
}

const COLUMNS: PdfColumn[] = [
  { key: 'sn', label: 'S.N.', width: 28 },
  { key: 'name', label: 'Beneficiary Name', width: 120 },
  { key: 'phone', label: 'Phone Number', width: 82 },
  { key: 'amount', label: 'Amount Disbursed', width: 92 },
  { key: 'municipality', label: 'Municipality', width: 102 },
  { key: 'governmentId', label: 'Government ID', width: 102 },
  { key: 'location', label: 'Location (Address)', width: 100 },
  { key: 'photo', label: 'Photo Evidence', width: 140 },
];

const PHOTO_COL = COLUMNS.length - 1;
const TABLE_WIDTH = COLUMNS.reduce((sum, c) => sum + c.width, 0);
// Precomputed left edge of each column.
const COLUMN_X: number[] = COLUMNS.reduce<number[]>(
  (xs, c) => [...xs, (xs.at(-1) ?? MARGIN) + (xs.length ? COLUMNS[xs.length - 1].width : 0)],
  []
);

type CellLine = { text: string; sub?: boolean };

// --- Small pdfkit helpers ---
function setStyle(doc: PdfDoc, font: string, size: number, color: string) {
  doc.font(font).fontSize(size).fillColor(color);
}

function blockHeight(doc: PdfDoc, lines: CellLine[], width: number): number {
  let h = 0;
  for (const line of lines) h += doc.heightOfString(line.text || ' ', { width });
  return h;
}

/** Draw stacked lines top-down, return the y below the last line. */
function drawLines(
  doc: PdfDoc,
  lines: CellLine[],
  x: number,
  y: number,
  width: number,
  align: 'left' | 'center' = 'left'
): number {
  let ly = y;
  for (const line of lines) {
    doc.text(line.text, x, ly, { width, align });
    ly += doc.heightOfString(line.text || ' ', { width });
  }
  return ly;
}

// --- Photo fetching (never fails the PDF) ---
async function fetchPhoto(url: string): Promise<Buffer | null> {
  try {
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: PHOTO_TIMEOUT_MS,
      maxContentLength: PHOTO_MAX_BYTES,
      validateStatus: (status) => status >= 200 && status < 300,
    });
    if (!String(res.headers?.['content-type'] || '').startsWith('image/'))
      return null;
    const buf = Buffer.from(res.data);
    return buf.length > 0 && buf.length <= PHOTO_MAX_BYTES ? buf : null;
  } catch {
    return null;
  }
}

async function fetchAllPhotos(
  rows: DownloadPayoutLogsPdfType[]
): Promise<Map<string, Buffer>> {
  const urls = [...new Set(rows.map((r) => r.photoUrl).filter(Boolean))];
  const cache = new Map<string, Buffer>();
  for (let i = 0; i < urls.length; i += PHOTO_FETCH_CONCURRENCY) {
    const batch = urls.slice(i, i + PHOTO_FETCH_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (url) => ({ url: url as string, buf: await fetchPhoto(url as string) }))
    );
    for (const { url, buf } of results) if (buf) cache.set(url, buf);
  }
  return cache;
}

// --- Table content ---
function beneficiaryName(row: DownloadPayoutLogsPdfType): string {
  const name =
    row.beneficiaryName ||
    [row['Beneficiary First Name'], row['Beneficiary Last Name']]
      .filter(Boolean)
      .join(' ');
  return name || '-';
}

/** Printable lines per column. Photo cell holds the info note (OTP skip reason). */
function buildRowCells(row: DownloadPayoutLogsPdfType, index: number): CellLine[][] {
  const nonEmpty = (lines: CellLine[]) => lines.filter((l) => l.text && l.text !== '-');
  const orDash = (lines: CellLine[]) => (lines.length > 0 ? lines : [{ text: '-' }]);

  const location = nonEmpty([
    ...(row.district ? [{ text: row.district }] : []),
    ...(row.tole ? [{ text: row.tole, sub: true }] : []),
  ]);
  const municipalityText =
    row.municipality && row.ward
      ? `${row.municipality} - ${row.ward}`
      : row.municipality || (row.ward ? `Ward ${row.ward}` : '');
  const governmentId = nonEmpty([
    ...(row.governmentIdType ? [{ text: row.governmentIdType }] : []),
    ...(row.governmentIdNumber ? [{ text: row.governmentIdNumber }] : []),
  ]);

  return [
    [{ text: String(index + 1) }],
    [{ text: beneficiaryName(row) }],
    [{ text: row['Phone number'] || row.beneficiaryPhone || '-' }],
    [{ text: String(row['Amount Disbursed'] ?? '-') }],
    orDash(municipalityText ? [{ text: municipalityText }] : []),
    orDash(governmentId),
    orDash(location),
    // Note-only, photo-only, or stacked (thumbnail on top, note below).
    row.infoNote ? [{ text: row.infoNote, sub: true }] : [],
  ];
}

function noteHeight(doc: PdfDoc, note: CellLine[]): number {
  doc.font(REPORT_FONT).fontSize(6.5);
  return blockHeight(doc, note, COLUMNS[PHOTO_COL].width - 6);
}

function measureRowHeight(doc: PdfDoc, cells: CellLine[][], hasPhoto: boolean): number {
  doc.font(REPORT_FONT).fontSize(7);
  if (hasPhoto) {
    let maxOther = 0;
    cells.forEach((lines, i) => {
      if (i === PHOTO_COL) return;
      const h = blockHeight(doc, lines, COLUMNS[i].width - 6);
      if (h > maxOther) maxOther = h;
    });
    // Photo cell stacks thumbnail + note (imgY = y + 3, note at imgY + size + 2).
    const h = noteHeight(doc, cells[PHOTO_COL]);
    const photoNeeded = 3 + PHOTO_SIZE + 4 + (h > 0 ? 2 + h : 0);
    return Math.max(PHOTO_MIN_ROW_HEIGHT, maxOther + ROW_PADDING, photoNeeded);
  }
  let max = 0;
  cells.forEach((lines, i) => {
    const h = blockHeight(doc, lines, COLUMNS[i].width - 6);
    if (h > max) max = h;
  });
  return Math.max(TEXT_MIN_ROW_HEIGHT, max + ROW_PADDING);
}

// --- Table drawing ---
function drawTableHead(doc: PdfDoc, y: number) {
  doc.save();
  doc.rect(MARGIN, y, TABLE_WIDTH, TABLE_HEAD_HEIGHT).fill(HEADER_BG);
  doc.restore();
  setStyle(doc, REPORT_FONT_BOLD, 7.5, '#FFFFFF');
  COLUMNS.forEach((col, i) => {
    doc.text(col.label, COLUMN_X[i] + 3, y + 7, {
      width: col.width - 6,
      align: i === 0 ? 'center' : 'left',
    });
  });
}

function drawTextCells(doc: PdfDoc, cells: CellLine[][], y: number) {
  cells.forEach((lines, i) => {
    if (i === PHOTO_COL) return;
    const w = COLUMNS[i].width - 6;
    const x = COLUMN_X[i] + 3;
    let ly = y + 4;
    for (const line of lines) {
      if (line.sub) setStyle(doc, REPORT_FONT, 6.5, '#555555');
      else setStyle(doc, REPORT_FONT, 7, '#111111');
      drawLines(doc, [line], x, ly, w, i === 0 ? 'center' : 'left');
      ly += doc.heightOfString(line.text || ' ', { width: w });
    }
  });
}

function drawPhotoCell(
  doc: PdfDoc,
  row: DownloadPayoutLogsPdfType,
  note: CellLine[],
  photo: Buffer | undefined,
  y: number,
  rowHeight: number
) {
  const photoX = COLUMN_X[PHOTO_COL];
  const photoW = COLUMNS[PHOTO_COL].width;
  const imgX = photoX + (photoW - PHOTO_SIZE) / 2;
  const imgY = y + 3;

  const drawNote = (startY: number) => {
    if (note.length === 0) return;
    setStyle(doc, REPORT_FONT, 6.5, '#555555');
    drawLines(doc, note, photoX + 3, startY, photoW - 6, 'center');
  };

  if (photo) {
    try {
      doc.image(photo, imgX, imgY, {
        fit: [PHOTO_SIZE, PHOTO_SIZE],
        align: 'center',
        valign: 'center',
      });
      drawNote(imgY + PHOTO_SIZE + 2);
    } catch {
      drawNote(imgY); // corrupt image: note only, never fail
    }
  } else {
    drawNote(y + 4);
  }
  if (row.photoUrl) doc.link(photoX, y, photoW, rowHeight, row.photoUrl);
}

function drawRow(
  doc: PdfDoc,
  row: DownloadPayoutLogsPdfType,
  cells: CellLine[][],
  photo: Buffer | undefined,
  y: number,
  rowHeight: number
) {
  setStyle(doc, REPORT_FONT, 7, '#111111');
  drawTextCells(doc, cells, y);
  drawPhotoCell(doc, row, cells[PHOTO_COL], photo, y, rowHeight);
  doc
    .moveTo(MARGIN, y + rowHeight)
    .lineTo(MARGIN + TABLE_WIDTH, y + rowHeight)
    .strokeColor(GRID_COLOR)
    .lineWidth(0.5)
    .stroke();
}

function drawTableFrame(doc: PdfDoc, top: number, bottom: number) {
  doc.save();
  doc.rect(MARGIN, top, TABLE_WIDTH, bottom - top).strokeColor(GRID_COLOR).lineWidth(0.75).stroke();
  for (let i = 1; i < COLUMNS.length; i++) {
    doc.moveTo(COLUMN_X[i], top).lineTo(COLUMN_X[i], bottom).strokeColor(GRID_COLOR).lineWidth(0.5).stroke();
  }
  doc.restore();
}

function drawZebra(doc: PdfDoc, y: number, rowHeight: number) {
  doc.save();
  doc.rect(MARGIN, y, TABLE_WIDTH, rowHeight).fill(ZEBRA_COLOR);
  doc.restore();
}

/**
 * CVA payout logs PDF: S.N., Name, Phone, Amount, Municipality, Gov ID,
 * Location, Photo Evidence — one row per payout log. Photo and info note
 * (e.g. OTP skip reason) stack in the last cell; neither, either, or both
 * render without failing.
 */
export async function buildPayoutLogsPdf(rows: DownloadPayoutLogsPdfType[]): Promise<Buffer> {
  const photos = await fetchAllPhotos(rows);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 0,
      bufferPages: true,
      info: { Title: 'CVA Payout Logs' },
    });
    registerReportFonts(doc);
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    doc.on('end', () => resolve(Buffer.concat(chunks as any)));
    doc.on('error', reject);

    try {
      const pageHeight = doc.page.height;
      let y = MARGIN;

      if (rows.length === 0) {
        setStyle(doc, REPORT_FONT, 10, '#555555');
        doc.text('No payout logs found for the applied filters.', MARGIN, y);
      }

      let tableTop = 0;
      const openTable = () => {
        drawTableHead(doc, y);
        y += TABLE_HEAD_HEIGHT;
        tableTop = y;
      };

      rows.forEach((row, idx) => {
        const cells = buildRowCells(row, idx);
        const photo = row.photoUrl ? photos.get(row.photoUrl) : undefined;
        const rowHeight = measureRowHeight(doc, cells, !!photo);
        if (tableTop === 0 || y + rowHeight > pageHeight - MARGIN - FOOTER_RESERVE) {
          if (tableTop !== 0) {
            drawTableFrame(doc, tableTop - TABLE_HEAD_HEIGHT, y);
            doc.addPage();
            y = MARGIN;
          }
          openTable();
        }
        if (idx % 2 === 1) drawZebra(doc, y, rowHeight);
        drawRow(doc, row, cells, photo, y, rowHeight);
        y += rowHeight;
      });

      if (tableTop !== 0) drawTableFrame(doc, tableTop - TABLE_HEAD_HEIGHT, y);

      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        setStyle(doc, REPORT_FONT, 7, '#888888');
        doc.text(`Page ${i + 1} of ${range.count}`, MARGIN, pageHeight - 18, {
          width: TABLE_WIDTH,
          align: 'right',
        });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export function toPayoutLogsPdfFile(buffer: Buffer, payoutUUID: string): PayoutLogsPdfFile {
  return {
    filename: `payout-logs-${payoutUUID}.pdf`,
    mimeType: 'application/pdf',
    base64: buffer.toString('base64'),
  };
}
