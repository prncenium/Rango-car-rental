import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { getTermsAndConditionsMarkdown } from './legalDocs.js';

function loadTermsPlainText(): string {
  const raw = getTermsAndConditionsMarkdown();
  // Strip markdown heading markers and list-bullet dashes for plain-text PDF
  // rendering — the .md file's own content (the words) stays untouched;
  // this only removes the light structural markup this project's own docs/legal
  // file added on top of the operator's original text.
  return raw
    .split('\n')
    .map((line) =>
      line
        .replace(/^#{1,3}\s*/, '')
        .replace(/^- /, '')
        // Helvetica/WinAnsi (pdf-lib's StandardFonts) can't encode these —
        // swap for plain-ASCII equivalents rather than crashing generation.
        .replace(/✓/g, '-')
        .replace(/⚠/g, '!'),
    )
    .join('\n');
}

const PAGE_WIDTH = 595.28; // A4 in points
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const BODY_SIZE = 9;
const LINE_HEIGHT = 12.5;

interface Cursor {
  page: PDFPage;
  y: number;
}

function wrapLine(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (text.trim() === '') return [''];
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function newPage(doc: PDFDocument): PDFPage {
  return doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
}

function drawWrapped(
  doc: PDFDocument,
  cursor: Cursor,
  text: string,
  font: PDFFont,
  size: number,
  options?: { bold?: PDFFont; color?: ReturnType<typeof rgb> },
): Cursor {
  const maxWidth = PAGE_WIDTH - MARGIN * 2;
  const usedFont = options?.bold ?? font;
  const lines = wrapLine(text, usedFont, size, maxWidth);
  let { page, y } = cursor;
  for (const line of lines) {
    if (y < MARGIN + LINE_HEIGHT) {
      page = newPage(doc);
      y = PAGE_HEIGHT - MARGIN;
    }
    page.drawText(line, { x: MARGIN, y, size, font: usedFont, color: options?.color ?? rgb(0.1, 0.1, 0.1) });
    y -= LINE_HEIGHT;
  }
  return { page, y };
}

export interface RentalAgreementInput {
  bookingId: string;
  customerName: string;
  mobileNumber: string;
  drivingLicenceNumber: string;
  vehicleRegistrationNumber: string;
  vehicleDescription: string; // e.g. "Honda City 2021"
  rentalStartDate: string; // display-ready, e.g. "2026-10-01"
  rentalReturnDate: string; // display-ready, e.g. "2026-10-04"
  securityDeposit: number;
}

// Auto-generated when an admin confirms a booking (spec 04 §3.2's E-39).
// Generated fresh on every download request rather than persisted — the
// underlying fields (booking dates/deposit snapshot, user name/phone/licence,
// car registration) are all already stored, so regenerating produces an
// identical document every time without a new storage dependency. If the
// renter's profile changes after confirmation, the agreement reflects the
// *current* profile, not a frozen snapshot — see the OPEN QUESTION in the
// accompanying report about whether that is the intended behaviour.
export async function generateRentalAgreementPdf(input: RentalAgreementInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let cursor: Cursor = { page: newPage(doc), y: PAGE_HEIGHT - MARGIN };

  cursor = drawWrapped(doc, cursor, 'RENTAL AGREEMENT', font, 16, { bold });
  cursor.y -= 6;
  cursor = drawWrapped(doc, cursor, `Booking Reference: ${input.bookingId}`, font, BODY_SIZE);
  cursor.y -= 10;

  const termsText = loadTermsPlainText();
  for (const paragraph of termsText.split('\n')) {
    cursor = drawWrapped(doc, cursor, paragraph, font, BODY_SIZE);
  }

  // Acknowledgement section always starts on its own page so it reads as a
  // distinct, signable form rather than trailing off the terms text.
  cursor = { page: newPage(doc), y: PAGE_HEIGHT - MARGIN };
  cursor = drawWrapped(doc, cursor, 'CUSTOMER ACKNOWLEDGEMENT', font, 13, { bold });
  cursor.y -= 4;
  cursor = drawWrapped(
    doc,
    cursor,
    'I confirm that I have read and understood the above Safety Rules, Guidelines, and Terms & Conditions. I agree to take reasonable care of the vehicle and accept responsibility for applicable charges, damages, fines, penalties, or other costs arising from my use of the vehicle, as specified in the rental agreement and subject to applicable law.',
    font,
    BODY_SIZE,
  );
  cursor.y -= 10;

  const filled: [string, string][] = [
    ['Customer Name', input.customerName],
    ['Mobile Number', input.mobileNumber],
    ['Driving Licence No.', input.drivingLicenceNumber],
    ['Vehicle Registration No.', input.vehicleRegistrationNumber],
    ['Vehicle', input.vehicleDescription],
    ['Rental Start Date & Time', input.rentalStartDate],
    ['Rental Return Date & Time', input.rentalReturnDate],
    ['Security Deposit', `Rs. ${input.securityDeposit.toLocaleString('en-IN')}`],
  ];
  for (const [label, value] of filled) {
    cursor = drawWrapped(doc, cursor, `${label}: ${value}`, font, 10, { bold });
    cursor.y -= 2;
  }

  // Left blank deliberately — signed physically at the godown handover, not
  // online (per the operator's own instruction: these three are never
  // auto-filled).
  const blank: string[] = ['Customer Signature', 'Rental Company Representative', 'Date'];
  cursor.y -= 8;
  for (const label of blank) {
    cursor = drawWrapped(doc, cursor, `${label}: _______________________________________`, font, 10);
    cursor.y -= 6;
  }

  return doc.save();
}
