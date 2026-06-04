// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit');
import * as QRCode from 'qrcode';
import * as path from 'path';
import * as fs from 'fs';

export interface QrCardData {
  walletAddress: string;
  name: string;
  phone?: string;
  otp: string;
  ward?: string;
  location?: string;
  district?: string;
  governmentIdType?: string;
  governmentIdNumber?: string;
}

// A4 dimensions in points at 72dpi
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

// 4 cards per page: 2 cols x 2 rows
const MARGIN = 24;
const COLS = 2;
const ROWS = 2;
const CARDS_PER_PAGE = COLS * ROWS;
const GUTTER_H = 16;
const GUTTER_V = 16;

const CARD_WIDTH = (PAGE_WIDTH - MARGIN * 2 - GUTTER_H * (COLS - 1)) / COLS;
const CARD_HEIGHT = (PAGE_HEIGHT - MARGIN * 2 - GUTTER_V * (ROWS - 1)) / ROWS;

const BLUE_COLOR = '#2F7FC1';
const LOGO_SECTION_H = CARD_HEIGHT * 0.13;
const BLUE_TOP_H = CARD_HEIGHT * 0.56;
const WAVE_DIP = 14;
const QR_SIZE = Math.floor(CARD_WIDTH * 0.55);

function cardOrigin(index: number): { x: number; y: number } {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  return {
    x: MARGIN + col * (CARD_WIDTH + GUTTER_H),
    y: MARGIN + row * (CARD_HEIGHT + GUTTER_V),
  };
}

// Format government ID: "citizenship_card" + "1234567890" → "Citizenship Card: 12345*****"
function formatGovId(typeKey: string, idNumber?: string): string {
  const label = typeKey
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  if (!idNumber) return label;
  const masked =
    idNumber.length <= 5
      ? idNumber
      : idNumber.slice(0, 5) + '*'.repeat(Math.min(idNumber.length - 5, 8));
  return `${label}: ${masked}`;
}

// Card background: full blue, white top strip for logo, white wave section for QR
function drawCardBackground(doc: typeof PDFDocument, x: number, y: number) {
  const waveY = y + BLUE_TOP_H;
  const cp1X = x + CARD_WIDTH * 0.25;
  const cp2X = x + CARD_WIDTH * 0.75;

  doc.save();

  doc
    .rect(x, y, CARD_WIDTH, CARD_HEIGHT)
    .fillColor(BLUE_COLOR)
    .fill();

  doc
    .rect(x, y, CARD_WIDTH, LOGO_SECTION_H)
    .fillColor('#ffffff')
    .fill();

  doc
    .moveTo(x, y + LOGO_SECTION_H)
    .lineTo(x + CARD_WIDTH, y + LOGO_SECTION_H)
    .lineTo(x + CARD_WIDTH, waveY)
    .bezierCurveTo(cp2X, waveY + WAVE_DIP, cp1X, waveY - WAVE_DIP, x, waveY)
    .closePath()
    .fillColor('#ffffff')
    .fill();

  doc.restore();
}

// Tries multiple paths to find logo in both dev and prod runtimes
let logoBuffer: Buffer | null = null;
function getLogoBuffer(): Buffer | null {
  if (logoBuffer) return logoBuffer;
  const candidates = [
    path.join(__dirname, 'assets', 'rahat-logo.png'),
    path.join(__dirname, '..', 'assets', 'rahat-logo.png'),
    path.join(process.cwd(), 'dist', 'apps', 'aa', 'assets', 'rahat-logo.png'),
    path.join(process.cwd(), 'apps', 'aa', 'src', 'assets', 'rahat-logo.png'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      logoBuffer = fs.readFileSync(p);
      return logoBuffer;
    }
  }
  return null;
}

export async function buildQrPdf(cards: QrCardData[]): Promise<Buffer> {
  console.log(`Building QR PDF for ${cards.length} cards...`);

  const logo = getLogoBuffer();
  if (!logo) {
    console.warn('Rahat logo not found — falling back to text');
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    doc.on('end', () => resolve(Buffer.concat(chunks as any)));
    doc.on('error', reject);

    (async () => {
      try {
        for (let i = 0; i < cards.length; i++) {
          console.log(`Adding card ${i + 1}/${cards.length} to PDF...`);
          const posInPage = i % CARDS_PER_PAGE;

          if (i > 0 && posInPage === 0) {
            doc.addPage();
          }

          const { x, y } = cardOrigin(posInPage);
          const card = cards[i];

          doc.save();
          doc.roundedRect(x, y, CARD_WIDTH, CARD_HEIGHT, 6).clip();
          drawCardBackground(doc, x, y);

          // Logo centered in white top strip
          const logoAreaCenterY = y + LOGO_SECTION_H / 2;
          if (logo) {
            const logoH = LOGO_SECTION_H * 0.65;
            const logoW = logoH * 4.2;
            doc.image(logo, x + (CARD_WIDTH - logoW) / 2, logoAreaCenterY - logoH / 2, {
              width: logoW,
              height: logoH,
            });
          } else {
            doc
              .font('Helvetica-Bold')
              .fontSize(12)
              .fillColor(BLUE_COLOR)
              .text('Rahat', x, logoAreaCenterY - 6, {
                width: CARD_WIDTH,
                align: 'center',
              });
          }

          // QR code box: white rounded rect with blue border
          const qrBoxPadding = 5;
          const qrX = x + (CARD_WIDTH - QR_SIZE) / 2;
          const qrY = y + LOGO_SECTION_H + 8;
          const qrBoxX = qrX - qrBoxPadding;
          const qrBoxY = qrY - qrBoxPadding;
          const qrBoxSize = QR_SIZE + qrBoxPadding * 2;

          doc
            .roundedRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 8)
            .fillColor('#ffffff')
            .fill();
          doc
            .roundedRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 8)
            .strokeColor(BLUE_COLOR)
            .lineWidth(1.5)
            .stroke();

          const qrBuffer = await QRCode.toBuffer(card.walletAddress || ' ', {
            type: 'png',
            width: QR_SIZE,
            margin: 1,
          });
          doc.image(qrBuffer, qrX, qrY, { width: QR_SIZE, height: QR_SIZE });

          doc.restore();

          // Text section on blue background below the wave
          const textStartY = y + BLUE_TOP_H + WAVE_DIP + 8;
          let textY = textStartY;
          const lineH = 14;

          doc
            .font('Helvetica-Bold')
            .fontSize(9)
            .fillColor('#ffffff')
            .text(card.name || '', x, textY, { width: CARD_WIDTH, align: 'center' });
          textY += lineH;

          const locationParts = [card.location, card.district].filter(Boolean);
          if (locationParts.length > 0) {
            doc
              .font('Helvetica')
              .fontSize(8)
              .fillColor('#ddeeff')
              .text(locationParts.join(', '), x, textY, { width: CARD_WIDTH, align: 'center' });
            textY += lineH;
          }

          if (card.ward) {
            doc
              .font('Helvetica')
              .fontSize(8)
              .fillColor('#ddeeff')
              .text(`Ward: ${card.ward}`, x, textY, { width: CARD_WIDTH, align: 'center' });
            textY += lineH;
          }

          if (card.phone) {
            doc
              .font('Helvetica')
              .fontSize(8)
              .fillColor('#ddeeff')
              .text(card.phone, x, textY, { width: CARD_WIDTH, align: 'center' });
            textY += lineH;
          }

          if (card.otp) {
            doc
              .font('Helvetica-Bold')
              .fontSize(8.5)
              .fillColor('#ffffff')
              .text(`Rahat Pin: ${card.otp}`, x, textY, { width: CARD_WIDTH, align: 'center' });
            textY += lineH;
          }

          if (card.governmentIdType) {
            doc
              .font('Helvetica')
              .fontSize(8)
              .fillColor('#ddeeff')
              .text(
                `Govt ID: ${formatGovId(card.governmentIdType, card.governmentIdNumber)}`,
                x, textY,
                { width: CARD_WIDTH, align: 'center' }
              );
          }
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    })();
  });
}
