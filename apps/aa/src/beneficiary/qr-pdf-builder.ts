// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit');
import * as QRCode from 'qrcode';

export interface QrCardData {
  walletAddress: string;
  name: string;
  phone: string;
  otp: string;
}

// A4 dimensions in points at 72dpi
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

const MARGIN = 20;
const COLS = 3;
const ROWS = 2;
const CARDS_PER_PAGE = COLS * ROWS;
const GUTTER_H = 10;
const GUTTER_V = 10;

const CARD_WIDTH = (PAGE_WIDTH - MARGIN * 2 - GUTTER_H * (COLS - 1)) / COLS;
const CARD_HEIGHT = (PAGE_HEIGHT - MARGIN * 2 - GUTTER_V * (ROWS - 1)) / ROWS;

const QR_SIZE = Math.floor(Math.min(CARD_WIDTH, CARD_HEIGHT) * 0.55);
const QR_PADDING_TOP = 14;
const TEXT_PADDING = 8;

function cardOrigin(index: number): { x: number; y: number } {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  return {
    x: MARGIN + col * (CARD_WIDTH + GUTTER_H),
    y: MARGIN + row * (CARD_HEIGHT + GUTTER_V),
  };
}

export async function buildQrPdf(cards: QrCardData[]): Promise<Buffer> {
  console.log(`Building QR PDF for ${cards.length} cards...`);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
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

          // card border
          doc
            .roundedRect(x, y, CARD_WIDTH, CARD_HEIGHT, 6)
            .strokeColor('#cccccc')
            .lineWidth(0.5)
            .stroke();

          // QR code
          const qrBuffer = await QRCode.toBuffer(card.walletAddress || ' ', {
            type: 'png',
            width: QR_SIZE,
            margin: 1,
          });

          const qrX = x + (CARD_WIDTH - QR_SIZE) / 2;
          const qrY = y + QR_PADDING_TOP;
          doc.image(qrBuffer, qrX, qrY, { width: QR_SIZE, height: QR_SIZE });

          // text block starts below QR
          let textY = qrY + QR_SIZE + TEXT_PADDING;
          const textCenterX = x + CARD_WIDTH / 2;

          // Name
          doc
            .font('Helvetica')
            .fontSize(9)
            .fillColor('#333333')
            .text(card.name || '', x, textY, {
              width: CARD_WIDTH,
              align: 'center',
            });
          textY += 14;

          // Phone (bold)
          doc
            .font('Helvetica-Bold')
            .fontSize(10)
            .fillColor('#000000')
            .text(card.phone || '', x, textY, {
              width: CARD_WIDTH,
              align: 'center',
            });
          textY += 15;

          // OTP Code
          if (card.otp) {
            doc
              .font('Helvetica')
              .fontSize(9)
              .fillColor('#555555')
              .text(card.otp, x, textY, {
                width: CARD_WIDTH,
                align: 'center',
              });
          }

          void textCenterX; // used for alignment via text width
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    })();
  });
}
