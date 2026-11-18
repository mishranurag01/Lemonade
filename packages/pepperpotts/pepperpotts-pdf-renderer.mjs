import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import QRCode from 'qrcode';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib';
import { pepperpottsMoney, pepperpottsDate, pepperpottsValidateBooking } from './pepperpotts-contracts.mjs';

// Resolve from this module, not process.cwd() (npm --prefix changes the working directory).
const TEMPLATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..', 'PurvaPhalguni Letterhead.pdf');
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
    fs.readFile(process.env.PEPPERPOTTS_LIBERATION_SERIF_REGULAR || installedLiberationSerif('Regular')),
    fs.readFile(process.env.PEPPERPOTTS_LIBERATION_SERIF_BOLD || installedLiberationSerif('Bold'))
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
  line('Subtotal', pepperpottsMoney(subtotal, booking.payment.currency));
  line('Discount', pepperpottsMoney(discount, booking.payment.currency));
  line('Tax (if applicable)', pepperpottsMoney(tax, booking.payment.currency));
  line('Total Paid', pepperpottsMoney(total, booking.payment.currency));
  if (y < 172) throw new Error('Receipt content exceeds available letterhead area; no clipping allowed');
  const qrPng = await QRCode.toBuffer(verificationUrl, { type:'png', width:220, margin:1, errorCorrectionLevel:'M' });
  const qr = await pdf.embedPng(qrPng);
  page.drawImage(qr, { x: width - 153, y: 107, width: 75, height: 75 });
  page.drawText('Verify on official record', { x: width - 167, y: 96, size: 7, font: regular, color: ink });
  page.drawText('Electronically issued after verified payment and service acceptance.', { x, y: 141, size: 8, font: regular, color: ink });
  page.drawText('Not a prescription, diagnosis, consultation record or proof of service delivery.', { x, y: 126, size: 7.6, font: regular, color: ink });
  if (sign) {
    // Visual indicator is covered by the subsequent PDF signature. Trust the embedded
    // cryptographic signature for integrity; this graphic is not a validation result.
    page.drawCircle({ x: x + 6, y: 112, size: 6, color: signedGreen });
    page.drawLine({ start: { x: x + 3, y: 112 }, end: { x: x + 5, y: 110 }, thickness: 1.3, color: rgb(1, 1, 1) });
    page.drawLine({ start: { x: x + 5, y: 110 }, end: { x: x + 9, y: 115 }, thickness: 1.3, color: rgb(1, 1, 1) });
    page.drawText('Digitally signed - verify signature integrity in a PDF validator', { x: x + 17, y: 109, size: 7.4, font: regular, color: signedGreen });
  } else {
    page.drawText('Unsigned development acknowledgement.', { x, y: 111, size: 7.4, font: regular, color: ink });
  }
  pdf.setTitle('Payment & Service Acknowledgement — '+booking.reference);
  pdf.setSubject('PurvaPhalguni verified payment and accepted booking acknowledgement');
  pdf.setCreator('Pepperpotts acknowledgement engine');
  if (sign) {
    pdflibAddPlaceholder({ pdfDoc: pdf, reason: 'Payment and service acknowledgement', name: 'PurvaPhalguni Development Signer', contactInfo: 'PurvaPhalguni development signing', location: 'India', signatureLength: 16384 });
  }
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}
