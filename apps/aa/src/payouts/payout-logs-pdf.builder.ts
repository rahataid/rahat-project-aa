// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit');
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { DownloadPayoutLogsPdfType } from './dto/types';

// Report typeface. Mukta covers Latin + Devanagari; pdfkit's built-in
// Helvetica only covers Latin, which renders Nepali names as mojibake.
// Falls back to Helvetica when the font files are unavailable.
let REPORT_FONT = 'Helvetica';
let REPORT_FONT_BOLD = 'Helvetica-Bold';

let resolvedFontPaths: { regular: string; bold: string } | null | undefined;
function resolveFontPaths(): { regular: string; bold: string } | null {
  if (resolvedFontPaths !== undefined) return resolvedFontPaths;
  const candidates = (file: string) => [
    path.join(__dirname, 'assets', 'fonts', file),
    path.join(__dirname, '..', 'assets', 'fonts', file),
    path.join(
      process.cwd(),
      'dist',
      'apps',
      'aa',
      'assets',
      'fonts',
      file
    ),
    path.join(
      process.cwd(),
      'apps',
      'aa',
      'src',
      'assets',
      'fonts',
      file
    ),
  ];
  const pick = (file: string): string | null => {
    for (const p of candidates(file)) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  };
  const regular = pick('Mukta-Regular.ttf');
  const bold = pick('Mukta-Bold.ttf');
  resolvedFontPaths = regular && bold ? { regular, bold } : null;
  return resolvedFontPaths;
}

function registerReportFonts(doc: typeof PDFDocument) {
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

export interface PayoutLogsPdfFile {
  filename: string;
  mimeType: string;
  base64: string;
}

// Landscape A4 in points (NOTE: pass size:'A4' + layout to pdfkit;
// a numeric [w,h] array does not reliably honor layout).
const MARGIN = 32;
const HEADER_BG: [number, number, number] = [47, 127, 193];
const GRID_COLOR = '#B9C6D2';
const ZEBRA_COLOR = '#F2F7FC';

const PHOTO_SIZE = 68;
const PHOTO_MIN_ROW_HEIGHT = 75;
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

// Slim report table: only the requested fields plus photo evidence.
const COLUMNS: PdfColumn[] = [
  { key: 'sn', label: 'S.N.', width: 28 },
  { key: 'name', label: 'Beneficiary Name', width: 120 },
  { key: 'phone', label: 'Phone Number', width: 82 },
  { key: 'amount', label: 'Amount Disbursed', width: 92 },
  { key: 'municipality', label: 'Municipality', width: 102 },
  { key: 'governmentId', label: 'Government ID', width: 102 },
  { key: 'location', label: 'Location (Address)', width: 122 },
  { key: 'photo', label: 'Photo Evidence', width: 118 },
];

type CellLine = { text: string; sub?: boolean };

function beneficiaryName(row: DownloadPayoutLogsPdfType): string {
  const name =
    row.beneficiaryName ||
    [row['Beneficiary First Name'], row['Beneficiary Last Name']]
      .filter(Boolean)
      .join(' ');
  return name || '-';
}

/**
 * Fetch photo evidence server-side. Any failure (network, timeout,
 * non-image content, oversized file) resolves to null so PDF generation
 * never fails when photo evidence is missing.
 */
async function fetchPhoto(url: string): Promise<Buffer | null> {
  try {
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: PHOTO_TIMEOUT_MS,
      maxContentLength: PHOTO_MAX_BYTES,
      validateStatus: (status) => status >= 200 && status < 300,
    });
    const contentType = String(res.headers?.['content-type'] || '');
    if (!contentType.startsWith('image/')) return null;
    const buf = Buffer.from(res.data);
    if (buf.length === 0 || buf.length > PHOTO_MAX_BYTES) return null;
    return buf;
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
      batch.map(async (url) => ({
        url: url as string,
        buf: await fetchPhoto(url as string),
      }))
    );
    for (const { url, buf } of results) {
      if (buf) cache.set(url, buf);
    }
  }

  return cache;
}

function columnX(index: number): number {
  let x = MARGIN;
  for (let i = 0; i < index; i++) x += COLUMNS[i].width;
  return x;
}

function tableWidth(): number {
  return COLUMNS.reduce((sum, c) => sum + c.width, 0);
}

function drawTableHead(doc: typeof PDFDocument, y: number) {
  doc.save();
  doc.rect(MARGIN, y, tableWidth(), TABLE_HEAD_HEIGHT).fill(HEADER_BG);
  doc.restore();
  doc.font(REPORT_FONT_BOLD).fontSize(7.5).fillColor('#FFFFFF');
  COLUMNS.forEach((col, i) => {
    doc.text(col.label, columnX(i) + 3, y + 7, {
      width: col.width - 6,
      align: i === 0 ? 'center' : 'left',
    });
  });
}

/** Build the printable lines for every column of one row. */
function buildRowCells(
  row: DownloadPayoutLogsPdfType,
  index: number
): CellLine[][] {
  const nonEmpty = (lines: CellLine[]): CellLine[] =>
    lines.filter((l) => l.text && l.text !== '-');
  const orDash = (lines: CellLine[]): CellLine[] =>
    lines.length > 0 ? lines : [{ text: '-' }];

  // Location (address): district + tole combined.
  const location = nonEmpty([
    ...(row.district ? [{ text: row.district }] : []),
    ...(row.tole ? [{ text: row.tole, sub: true }] : []),
  ]);

  // Municipality with ward joined on one line (e.g. "Tarakeshor-6").
  // Falls back gracefully when either part is missing.
  const municipalityText =
    row.municipality && row.ward
      ? `${row.municipality} - ${row.ward}`
      : row.municipality || (row.ward ? `Ward ${row.ward}` : '');
  const municipality = municipalityText ? [{ text: municipalityText }] : [];

  const governmentId = nonEmpty([
    ...(row.governmentIdType ? [{ text: row.governmentIdType }] : []),
    ...(row.governmentIdNumber ? [{ text: row.governmentIdNumber }] : []),
  ]);

  return [
    [{ text: String(index + 1) }],
    [{ text: beneficiaryName(row) }],
    [{ text: row['Phone number'] || row.beneficiaryPhone || '-' }],
    [{ text: String(row['Amount Disbursed'] ?? '-') }],
    orDash(municipality),
    orDash(governmentId),
    orDash(location),
    // Photo-column note (e.g. OTP skip reason) when there is no photo.
    // Drawn as wrappable text and measured like any other cell.
    row.infoNote ? [{ text: row.infoNote, sub: true }] : [],
  ];
}

function measureRowHeight(
  doc: typeof PDFDocument,
  cells: CellLine[][],
  hasPhoto: boolean
): number {
  doc.font(REPORT_FONT).fontSize(7);
  let max = 0;
  cells.forEach((lines, i) => {
    const w = COLUMNS[i].width - 6;
    let h = 0;
    for (const line of lines) {
      h += doc.heightOfString(line.text || ' ', { width: w });
    }
    if (h > max) max = h;
  });
  const floor = hasPhoto ? PHOTO_MIN_ROW_HEIGHT : TEXT_MIN_ROW_HEIGHT;
  return Math.max(floor, max + ROW_PADDING);
}

function drawRow(
  doc: typeof PDFDocument,
  row: DownloadPayoutLogsPdfType,
  cells: CellLine[][],
  photo: Buffer | undefined,
  y: number,
  rowHeight: number
) {
  const photoColIndex = COLUMNS.length - 1;

  doc.font(REPORT_FONT).fontSize(7).fillColor('#111111');
  cells.forEach((lines, i) => {
    if (i === photoColIndex) return;
    let ly = y + 4;
    const w = COLUMNS[i].width - 6;
    const x = columnX(i) + 3;
    for (const line of lines) {
      if (line.sub) {
        doc.font(REPORT_FONT).fontSize(6.5).fillColor('#555555');
      } else {
        doc.font(REPORT_FONT).fontSize(7).fillColor('#111111');
      }
      if (i === 0) {
        doc.text(line.text, x, ly, { width: w, align: 'center' });
      } else {
        doc.text(line.text, x, ly, { width: w });
      }
      ly += doc.heightOfString(line.text || ' ', { width: w });
    }
  });

  // Photo evidence cell: thumbnail when present; otherwise the info note
  // (e.g. OTP skip reason) when available; otherwise blank. The cell links
  // to the full-size photo URL (clickable) whenever one exists.
  const photoX = columnX(photoColIndex);
  const photoW = COLUMNS[photoColIndex].width;
  const imgX = photoX + (photoW - PHOTO_SIZE) / 2;
  const imgY = y + 3;
  if (photo) {
    try {
      doc.image(photo, imgX, imgY, {
        fit: [PHOTO_SIZE, PHOTO_SIZE],
        align: 'center',
        valign: 'center',
      });
    } catch {
      // Corrupt image data: leave blank, never fail.
    }
  } else {
    const noteLines = cells[photoColIndex];
    if (noteLines.length > 0) {
      doc.font(REPORT_FONT).fontSize(6.5).fillColor('#555555');
      let ly = y + 4;
      for (const line of noteLines) {
        doc.text(line.text, photoX + 3, ly, {
          width: photoW - 6,
          align: 'center',
        });
        ly += doc.heightOfString(line.text || ' ', { width: photoW - 6 });
      }
    }
  }
  if (row.photoUrl) {
    doc.link(photoX, y, photoW, rowHeight, row.photoUrl);
  }

  // Row separator
  doc
    .moveTo(MARGIN, y + rowHeight)
    .lineTo(MARGIN + tableWidth(), y + rowHeight)
    .strokeColor(GRID_COLOR)
    .lineWidth(0.5)
    .stroke();
}

function drawTableFrame(doc: typeof PDFDocument, top: number, bottom: number) {
  doc.save();
  doc
    .rect(MARGIN, top, tableWidth(), bottom - top)
    .strokeColor(GRID_COLOR)
    .lineWidth(0.75)
    .stroke();
  for (let i = 1; i < COLUMNS.length; i++) {
    const x = columnX(i);
    doc
      .moveTo(x, top)
      .lineTo(x, bottom)
      .strokeColor(GRID_COLOR)
      .lineWidth(0.5)
      .stroke();
  }
  doc.restore();
}

/**
 * Build the CVA payout logs PDF server-side: table only, no header —
 * S.N., Name, Phone, Amount Disbursed, Municipality, Gov ID, Location,
 * Photo Evidence, one row per payout log. Rows with photos keep a tall row
 * for the thumbnail; text-only rows shrink to their content. The photo cell
 * shows the thumbnail (clickable link to the full-size photo), the info
 * note (e.g. OTP skip reason) when there is no photo but other info exists,
 * or blank otherwise — never failing.
 */
export async function buildPayoutLogsPdf(
  rows: DownloadPayoutLogsPdfType[]
): Promise<Buffer> {
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
        doc.font(REPORT_FONT).fontSize(10).fillColor('#555555');
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
        if (
          tableTop === 0 ||
          y + rowHeight > pageHeight - MARGIN - FOOTER_RESERVE
        ) {
          if (tableTop !== 0) {
            drawTableFrame(doc, tableTop - TABLE_HEAD_HEIGHT, y);
            doc.addPage();
            y = MARGIN;
          }
          openTable();
        }
        if (idx % 2 === 1) {
          doc.save();
          doc.rect(MARGIN, y, tableWidth(), rowHeight).fill(ZEBRA_COLOR);
          doc.restore();
        }
        drawRow(doc, row, cells, photo, y, rowHeight);
        y += rowHeight;
      });

      if (tableTop !== 0) {
        drawTableFrame(doc, tableTop - TABLE_HEAD_HEIGHT, y);
      }

      // Footer page numbers
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        doc.font(REPORT_FONT).fontSize(7).fillColor('#888888');
        doc.text(`Page ${i + 1} of ${range.count}`, MARGIN, pageHeight - 18, {
          width: tableWidth(),
          align: 'right',
        });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export function toPayoutLogsPdfFile(
  buffer: Buffer,
  payoutUUID: string
): PayoutLogsPdfFile {
  return {
    filename: `payout-logs-${payoutUUID}.pdf`,
    mimeType: 'application/pdf',
    base64: buffer.toString('base64'),
  };
}
