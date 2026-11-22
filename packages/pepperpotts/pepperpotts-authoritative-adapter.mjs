import crypto from 'node:crypto';
import { pepperpottsEligibility, pepperpottsValidateBooking, PEPPERPOTTS_STATES } from './pepperpotts-contracts.mjs';

/**
 * @typedef {{status: string, name: string, category?: string, deliveryMode?: string, schedulingStatus?: string}} PepperpottsServiceRecord
 * @typedef {{status: string, amountMinor: number, subtotalMinor?: number, discountMinor?: number, taxMinor?: number, currency: string, method?: string, transactionReference: string, paymentDate: string, confirmationDate: string, ledgerDate: string}} PepperpottsPaymentRecord
 * @typedef {{reference: string, customer: {fullName: string, email: string}, service: PepperpottsServiceRecord, payment: PepperpottsPaymentRecord, acknowledgementStatus?: string}} PepperpottsAuthoritativeBooking
 * @typedef {{receiptIdentity: string, reference: string, status: string, issuedAt: string, templateVersion: string, verificationTokenHash: string, booking: PepperpottsAuthoritativeBooking, publicVerification: object, auditEvents: object[]}} PepperpottsIssuanceRecord
 *
 * @typedef {Object} PepperpottsAuthoritativeAdapter
 * @property {(reference: string) => Promise<PepperpottsAuthoritativeBooking|null>} getAuthoritativeBooking
 * @property {(candidate: {record: PepperpottsIssuanceRecord, verificationToken: string}) => Promise<{record: PepperpottsIssuanceRecord, verificationToken: string}>} getOrCreateIssuance Atomically preserves one receiptIdentity per booking reference.
 * @property {(reference: string) => Promise<{record: PepperpottsIssuanceRecord, verificationToken: string}|null>} getIssuanceForRendering
 * @property {(tokenHash: string) => Promise<object|null>} findIssuanceByTokenHash
 * @property {(reference: string, status: string, audit: {actor: string, changedAt: string}) => Promise<object|null>} setAcknowledgementStatus
 */

export class PepperpottsRecordNotFoundError extends Error {
  constructor(reference) { super('Authoritative booking not found: ' + reference); this.name = 'PepperpottsRecordNotFoundError'; }
}

function assertReference(reference) {
  if (typeof reference !== 'string' || !/^[A-Za-z0-9_-]{4,80}$/.test(reference)) throw new Error('Invalid booking reference');
}

/** @param {PepperpottsAuthoritativeAdapter} adapter */
export function pepperpottsAssertAuthoritativeAdapter(adapter) {
  for (const method of ['getAuthoritativeBooking', 'getOrCreateIssuance', 'getIssuanceForRendering', 'findIssuanceByTokenHash', 'setAcknowledgementStatus']) {
    if (typeof adapter?.[method] !== 'function') throw new TypeError('Authoritative adapter is missing ' + method + '()');
  }
  return adapter;
}

function trustedIssuanceRecord(booking, issuedAt, tokenHash) {
  return {
    receiptIdentity: booking.reference,
    reference: booking.reference,
    status: 'ISSUED',
    issuedAt,
    templateVersion: 'v1',
    verificationTokenHash: tokenHash,
    booking: structuredClone(booking),
    publicVerification: {
      reference: booking.reference,
      status: 'ISSUED',
      issuedAt,
      service: booking.service.name,
      amount: booking.payment.amountMinor,
      currency: booking.payment.currency
    },
    auditEvents: [{ type: 'ISSUED', actor: 'pepperpotts-system', occurredAt: issuedAt }]
  };
}

/** Issue solely from records returned by the server-side adapter. Client fields are never accepted. */
export async function pepperpottsIssueAuthoritative(adapter, reference, { now = () => new Date(), randomBytes = crypto.randomBytes } = {}) {
  pepperpottsAssertAuthoritativeAdapter(adapter);
  assertReference(reference);
  const booking = await adapter.getAuthoritativeBooking(reference);
  if (!booking) throw new PepperpottsRecordNotFoundError(reference);
  const eligibility = pepperpottsEligibility(booking);
  if (eligibility !== PEPPERPOTTS_STATES.ELIGIBLE) return { status: eligibility, reference };
  pepperpottsValidateBooking(booking);
  const verificationToken = randomBytes(32).toString('hex');
  const record = trustedIssuanceRecord(booking, now().toISOString(), crypto.createHash('sha256').update(verificationToken).digest('hex'));
  const issued = await adapter.getOrCreateIssuance({ record, verificationToken });
  const status = issued.record.status === 'VALID' ? PEPPERPOTTS_STATES.ISSUED : issued.record.status;
  return { status, reference, receiptIdentity: issued.record.receiptIdentity };
}

export async function pepperpottsLoadAuthoritativeReceipt(adapter, reference) {
  pepperpottsAssertAuthoritativeAdapter(adapter);
  assertReference(reference);
  const issued = await adapter.getIssuanceForRendering(reference);
  if (!issued) throw new PepperpottsRecordNotFoundError(reference);
  pepperpottsValidateBooking(issued.record.booking);
  return issued;
}

export async function pepperpottsFindVerification(adapter, token) {
  pepperpottsAssertAuthoritativeAdapter(adapter);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return adapter.findIssuanceByTokenHash(hash);
}

export async function pepperpottsSetAcknowledgementStatus(adapter, reference, status, { actor, now = () => new Date() } = {}) {
  pepperpottsAssertAuthoritativeAdapter(adapter);
  assertReference(reference);
  if (!['ISSUED', 'REFUNDED', 'REVOKED'].includes(status)) throw new Error('Invalid acknowledgement status');
  if (typeof actor !== 'string' || !actor.trim()) throw new Error('Audit actor is required');
  const changed = await adapter.setAcknowledgementStatus(reference, status, { actor, changedAt: now().toISOString() });
  if (!changed) throw new PepperpottsRecordNotFoundError(reference);
  return changed;
}
