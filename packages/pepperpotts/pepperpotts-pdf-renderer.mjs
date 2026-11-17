import fs from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { pepperpottsMoney, pepperpottsDate, pepperpottsValidateBooking } from './pepperpotts-contracts.mjs';

const TEMPLATE = path.resolve('PurvaPhalguni Letterhead.pdf');
const ink = rgb(0.12, 0.12, 0.12);
const gold = rgb(0.67, 0.43, 0.27);
function fit(text, max = 82) {
  const value = String(text ?? '').replace(/[\r\n\t]+/g,' ').trim();
  const printable = value.normalize('NFKD').replace(/[^\x20-\x7E]/g, '-');
  return printable.length > max ? printable.slice(0, max - 3) + '...' : printable;
}
export async function pepperpottsRenderPdf(booking, { verificationUrl, issueDate }) {
  pepperpottsValidateBooking(booking);
  const original = await fs.readFile(TEMPLATE); // Use the actual user-uploaded PDF, never redraw its artwork.
  const pdf = await PDFDocument.load(original);
  if (pdf.getPageCount() !== 1) throw new Error('Letterhead template must contain exactly one page');
  const page = pdf.getPage(0);
  const { width, height } = page.getSize();
  if (Math.abs(width - 595.28) > 15 || Math.abs(height - 841.89) > 15) throw new Error('Letterhead must be A4 portrait');
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
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
  page.drawText('Signature status: electronically verified; no certificate-based digital signature.', { x, y: 111, size: 7.4, font: regular, color: ink });
  pdf.setTitle('Payment & Service Acknowledgement — '+booking.reference);
  pdf.setSubject('PurvaPhalguni verified payment and accepted booking acknowledgement');
  pdf.setCreator('Pepperpotts acknowledgement engine');
  return Buffer.from(await pdf.save());
}
