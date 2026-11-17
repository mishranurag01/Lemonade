export const PEPPERPOTTS_STATES = Object.freeze({
  UNDER_REVIEW: 'PAYMENT_UNDER_REVIEW',
  AWAITING_ACCEPTANCE: 'AWAITING_SERVICE_ACCEPTANCE',
  ELIGIBLE: 'ELIGIBLE',
  ISSUED: 'ISSUED',
  REFUNDED: 'REFUNDED',
  REVOKED: 'REVOKED'
});
export function pepperpottsEligibility(booking) {
  if (!booking || typeof booking !== 'object') throw new Error('Booking is required');
  if (booking.payment?.status !== 'VERIFIED') return PEPPERPOTTS_STATES.UNDER_REVIEW;
  if (booking.service?.status !== 'ACCEPTED') return PEPPERPOTTS_STATES.AWAITING_ACCEPTANCE;
  if (booking.acknowledgementStatus === 'REFUNDED') return PEPPERPOTTS_STATES.REFUNDED;
  if (booking.acknowledgementStatus === 'REVOKED') return PEPPERPOTTS_STATES.REVOKED;
  return PEPPERPOTTS_STATES.ELIGIBLE;
}
export function pepperpottsValidateBooking(booking) {
  const required = [booking?.reference, booking?.customer?.fullName, booking?.customer?.email,
    booking?.service?.name, booking?.payment?.transactionReference,
    booking?.payment?.paymentDate, booking?.payment?.confirmationDate,
    booking?.payment?.ledgerDate];
  if (required.some(value => typeof value !== 'string' || !value.trim())) throw new Error('Missing required verified booking fields');
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(booking.reference)) throw new Error('Invalid booking reference');
  if (!Number.isSafeInteger(booking.payment.amountMinor) || booking.payment.amountMinor < 0) throw new Error('Invalid payment amount');
  if (!/^[A-Z]{3}$/.test(booking.payment.currency)) throw new Error('Invalid currency');
  for (const key of ['paymentDate', 'confirmationDate', 'ledgerDate']) {
    if (!Number.isFinite(Date.parse(booking.payment[key]))) throw new Error('Invalid '+key);
  }
  if (booking.payment.status !== 'VERIFIED' || booking.service.status !== 'ACCEPTED') throw new Error('Acknowledgement is not eligible');
  return true;
}
export function pepperpottsMoney(amountMinor, currency='INR') {
  return new Intl.NumberFormat('en-IN',{style:'currency',currency}).format(amountMinor/100);
}
export function pepperpottsDate(value) {
  return new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(new Date(value))+' IST';
}
