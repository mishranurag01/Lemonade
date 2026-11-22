import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import QRCode from 'qrcode';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib';
import { pepperpottsDate, pepperpottsValidateBooking } from './pepperpotts-contracts.mjs';

// Resolve from this module, not process.cwd() (npm --prefix changes the working directory).
const TEMPLATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..', 'PurvaPhalguni Letterhead.pdf');
// Prefer fonts shipped with Pepperpotts. A fontconfig lookup is only a local-development fallback.
const BUNDLED_FONTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets', 'fonts');
async function loadLiberationSerif(style) {
  const override = process.env['PEPPERPOTTS_LIBERATION_SERIF_' + style.toUpperCase()];
  if (override) return fs.readFile(override);
  const bundled = path.join(BUNDLED_FONTS, 'LiberationSerif-' + style + '.ttf');
  try {
    return await fs.readFile(bundled);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Bundled Liberation Serif ' + style + ' is missing: ' + bundled + '. Run npm run prepare:fonts and include assets/fonts in deployment.');
    }
    return fs.readFile(installedLiberationSerif(style));
  }
}
// Resolve the installed open-source Liberation Serif font on the signing host.
// Verify the matched family so fontconfig cannot silently substitute a different font.
function installedLiberationSerif(style) {
  const result = spawnSync('fc-match', [
    '-f', '%{family}|%{style}|%{file}',
    'Liberation Serif:style=' + style
  ], { encoding: 'utf8', timeout: 5000 });
  if (result.error || result.status !== 0) {
    throw new Error('Unable to locate Liberation Serif using fontconfig: ' +
      (result.error?.message || result.stderr?.trim() || 'fc-match failed'));
  }
  const parts = result.stdout.trim().split('|');
  if (parts.length !== 3) {
    throw new Error('Unexpected fontconfig output while locating Liberation Serif');
  }
  const [family, matchedStyle, fontPath] = parts;
  const families = family.split(',').map(value => value.trim());
  const styles = matchedStyle.split(',').map(value => value.trim());
  if (!families.includes('Liberation Serif') || !fontPath) {
    throw new Error('Liberation Serif is not installed. Install fonts-liberation.');
  }
  if (!styles.includes(style)) {
    throw new Error('Liberation Serif ' + style + ' is unavailable; fontconfig selected ' + matchedStyle);
  }
  return fontPath;
}
const ink = rgb(0.12, 0.12, 0.12);
const gold = rgb(0.67, 0.43, 0.27);
const signedGreen = rgb(0.09, 0.48, 0.25);
function fit(text, max = 82) {
  const value = String(text ?? '').replace(/[\r\n\t]+/g,' ').trim();
  const printable = value.normalize('NFKD').replace(/[^\x20-\x7E]/g, '-');
  return printable.length > max ? printable.slice(0, max - 3) + '...' : printable;
}
// Use an ASCII currency code in the PDF so a missing currency glyph cannot
// silently become a misleading minus sign (e.g. the INR rupee symbol).
function receiptMoney(amountMinor, currency) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency, currencyDisplay: 'code'
  }).format(amountMinor / 100).replace(/\\s+/gu, ' ');
}
export async function pepperpottsRenderPdf(booking, { verificationUrl, issueDate, sign = false }) {
  pepperpottsValidateBooking(booking);
  const original = await fs.readFile(TEMPLATE); // Use the actual user-uploaded PDF, never redraw its artwork.
  const pdf = await PDFDocument.load(original);
  if (pdf.getPageCount() !== 1) throw new Error('Letterhead template must contain exactly one page');
  const page = pdf.getPage(0);
  const { width, height } = page.getSize();
  if (Math.abs(width - 595.28) > 15 || Math.abs(height - 841.89) > 15) throw new Error('Letterhead must be A4 portrait');
  pdf.registerFontkit(fontkit);
  const [regularBytes, boldBytes] = await Promise.all([
    loadLiberationSerif('Regular'),
    loadLiberationSerif('Bold')
  ]);
  const regular = await pdf.embedFont(regularBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });
  const x = 62;
  let y = height - 145;
  const line = (label, value, options={}) => {
    const size = options.size || 9.3;
    page.drawText(fit(label, 33), { x, y, size, font: bold, color: ink });
    page.drawText(fit(value, 72), { x: x+164, y, size, font: regular, color: ink });
    y -= options.gap || 22;
  };
  const section = (title) => {
    y -= 7;
    page.drawText(title.toUpperCase(), { x, y, size: 10.5, font: bold, color: gold });
    y -= 13;
    page.drawLine({ start:{x,y}, end:{x:width-x,y}, thickness:0.7, color:gold });
    y -= 20;
  };
  page.drawText('PAYMENT & SERVICE ACKNOWLEDGEMENT', { x, y, size: 15, font: bold, color: ink });
  y -= 29;
  line('Receipt / Booking Reference', booking.reference);
  line('Issue Date', pepperpottsDate(issueDate));
  section('Customer & service');
  line('Customer', booking.customer.fullName);
  line('Email', booking.customer.email);
  line('Service', booking.service.name);
  line('Category', booking.service.category || 'Not specified');
  line('Delivery', booking.service.deliveryMode || 'Not specified');
  line('Registration', booking.service.schedulingStatus || 'Registration Accepted — Scheduling Pending');
  section('Payment & ledger');
  line('Payment Date', pepperpottsDate(booking.payment.paymentDate));
  line('Confirmation Date', pepperpottsDate(booking.payment.confirmationDate));
  line('Ledger Date', pepperpottsDate(booking.payment.ledgerDate));
  line('Payment Method', booking.payment.method || 'Not specified');
  line('Transaction Reference', booking.payment.transactionReference);
  line('Payment Status', 'Verified');
  const total = booking.payment.amountMinor;
  const discount = booking.payment.discountMinor || 0;
  const tax = booking.payment.taxMinor || 0;
  const subtotal = booking.payment.subtotalMinor ?? total + discount - tax;
  line('Subtotal', receiptMoney(subtotal, booking.payment.currency));
  line('Discount', receiptMoney(discount, booking.payment.currency));
  line('Tax (if applicable)', receiptMoney(tax, booking.payment.currency));
  line('Total Paid', receiptMoney(total, booking.payment.currency));
  if (y < 172) throw new Error('Receipt content exceeds available letterhead area; no clipping allowed');
  // One aligned verification band: the left column explains the record and
  // the right column contains the QR. Leave the letterhead artwork untouched.
  const footerTop = 165;
  const qrSize = 68;
  const qrX = width - x - qrSize;
  page.drawLine({
    start: { x, y: footerTop }, end: { x: width - x, y: footerTop },
    thickness: 0.6, color: gold
  });
  page.drawText('ISSUANCE & VERIFICATION', {
    x, y: 151, size: 9, font: bold, color: gold
  });
  page.drawText('Payment verified; booking accepted.', {
    x, y: 137, size: 8.3, font: regular, color: ink
  });
  page.drawText('Not proof of consultation, diagnosis or service delivery.', {
    x, y: 124, size: 7.5, font: regular, color: ink
  });
  const qrPng = await QRCode.toBuffer(verificationUrl, {
    type: 'png', width: 220, margin: 1, errorCorrectionLevel: 'M'
  });
  const qr = await pdf.embedPng(qrPng);
  page.drawImage(qr, { x: qrX, y: 91, width: qrSize, height: qrSize });
  const qrCaption = 'SCAN TO VERIFY';
  page.drawText(qrCaption, {
    x: qrX + (qrSize - bold.widthOfTextAtSize(qrCaption, 7)) / 2,
    y: 81, size: 7, font: bold, color: ink
  });
  if (sign) {
    // This mark is a visual issuance cue, NOT proof that a viewer has
    // validated the embedded CMS signature or trusted its certificate.
    const cx = x + 8, cy = 103;
    page.drawCircle({ x: cx, y: cy, size: 8, color: signedGreen });
    page.drawLine({
      start: { x: cx - 4, y: cy }, end: { x: cx - 1, y: cy - 3 },
      thickness: 1.5, color: rgb(1, 1, 1)
    });
    page.drawLine({
      start: { x: cx - 1, y: cy - 3 }, end: { x: cx + 5, y: cy + 4 },
      thickness: 1.5, color: rgb(1, 1, 1)
    });
    page.drawText('DIGITALLY SIGNED', {
      x: x + 23, y: 106, size: 8.3, font: bold, color: signedGreen
    });
    page.drawText('Validate the PDF signature to check document integrity.', {
      x: x + 23, y: 94, size: 7.2, font: regular, color: ink
    });
  } else {
    page.drawText('UNSIGNED DEVELOPMENT PREVIEW', {
      x, y: 103, size: 8, font: bold, color: ink
    });
  }
  pdf.setTitle('Payment & Service Acknowledgement — '+booking.reference);
  pdf.setSubject('PurvaPhalguni verified payment and accepted booking acknowledgement');
  pdf.setCreator('Pepperpotts acknowledgement engine');
  if (sign) {
    pdflibAddPlaceholder({ pdfDoc: pdf, reason: 'Payment and service acknowledgement', name: 'PurvaPhalguni Development Signer', contactInfo: 'PurvaPhalguni development signing', location: 'India', signatureLength: 16384 });
  }
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}
