import crypto from 'node:crypto';
import { pepperpottsValidateBooking } from './pepperpotts-contracts.mjs';

const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const validInstant = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));

/**
 * Server-only Firebase Admin adapter. Inject the VISION reconciliation validator and
 * approved policy/date resolvers from the Node API; absent policy fails closed.
 * `protectToken`/`recoverToken` must use a managed key service in production.
 */
export function createPepperpottsFirestoreAdapter({ db, assertBankEvidence, receiptFromEvidence,
  resolveServiceAcceptance, resolveLedgerDate, resolveTaxBreakdown = ({ amountMinor }) => ({ subtotalMinor: amountMinor, discountMinor: 0, taxMinor: 0 }),
  protectToken, recoverToken, now = () => new Date() } = {}) {
  for (const [name, fn] of Object.entries({ db, assertBankEvidence, receiptFromEvidence, resolveServiceAcceptance, resolveLedgerDate, resolveTaxBreakdown, protectToken, recoverToken })) {
    if (!fn || (name !== 'db' && typeof fn !== 'function')) throw new TypeError(`Pepperpotts production dependency ${name} is required`);
  }
  if (typeof db.doc !== 'function' || typeof db.runTransaction !== 'function') throw new TypeError('Firebase Admin Firestore is required');

  const publicRef = reference => db.doc(`bookingPublicReferences/${reference}`);
  const issuanceRef = reference => db.doc(`pepperpottsIssuances/${reference}`);
  const tokenRef = hash => db.doc(`pepperpottsTokenHashes/${hash}`);

  async function authoritativeInTransaction(tx, reference) {
    const refDoc = await tx.get(publicRef(reference));
    if (!refDoc.exists || !validId(refDoc.get('bookingId'))) return null;
    const id = refDoc.get('bookingId');
    const bookingRef = db.doc(`bookings/${id}`);
    const [bookingSnap, claimSnap] = await Promise.all([
      tx.get(bookingRef), tx.get(db.doc(`manualPaymentClaims/${id}`))
    ]);
    if (!bookingSnap.exists) return null;
    const booking = bookingSnap.data();
    const claim = claimSnap.exists ? claimSnap.data() : undefined;
    const bankId = booking.paymentVerification?.bankTransactionId;
    if (booking.paymentStatus !== 'paid' || booking.paymentVerification?.method !== 'manual_upi_reconciled' ||
        typeof bankId !== 'string' || !/^[a-f0-9]{64}$/.test(bankId) || !claim || claim.status !== 'reconciled' ||
        claim.bankTransactionId !== bankId) return { reference, payment: { status: 'UNDER_REVIEW' } };
    const bankSnap = await tx.get(db.doc(`bankTransactions/${bankId}`));
    const receipt = receiptFromEvidence(id, booking, claim, bankSnap.exists ? bankSnap.data() : undefined);
    // This call must be the host application's exact assertBankEvidence implementation.
    assertBankEvidence(bankSnap.exists ? bankSnap.data() : undefined, claim, id);
    const amountMinor = Math.round(booking.amount * 100);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || !Number.isFinite(booking.amount) || Number((amountMinor / 100).toFixed(2)) !== booking.amount)
      throw new Error('Authoritative booking amount is invalid');
    const acceptedAt = await resolveServiceAcceptance({ booking, bookingId: id });
    const ledgerDate = await resolveLedgerDate({ booking, bookingId: id, receipt });
    const accepted = acceptedAt && validInstant(acceptedAt);
    const verifiedAt = booking.paymentVerification.verifiedAt;
    const tax = await resolveTaxBreakdown({ booking, bookingId: id, amountMinor });
    if (!tax || !Number.isSafeInteger(tax.subtotalMinor) || !Number.isSafeInteger(tax.discountMinor) ||
        !Number.isSafeInteger(tax.taxMinor) || tax.subtotalMinor < 0 || tax.discountMinor < 0 || tax.taxMinor < 0 ||
        tax.subtotalMinor - tax.discountMinor + tax.taxMinor !== amountMinor) throw new Error('Configured tax breakdown does not match the paid amount');
    return {
      reference,
      customer: { fullName: receipt.customer, email: booking.clientEmail },
      service: { status: accepted ? 'ACCEPTED' : 'PENDING', name: receipt.service, category: booking.serviceCategory, deliveryMode: booking.deliveryMode, schedulingStatus: booking.status },
      payment: {
        status: 'VERIFIED', amountMinor, ...tax, currency: booking.currency, method: receipt.method,
        transactionReference: receipt.transactionReference,
        paymentDate: (typeof claim.paymentDate === 'string' && /^\d{4}-\d\d-\d\d$/.test(claim.paymentDate) && Number.isFinite(Date.parse(claim.paymentDate))) ? claim.paymentDate : '',
        confirmationDate: verifiedAt, ledgerDate
      },
    };
  }

  return {
    async getAuthoritativeBooking(reference) {
      if (typeof reference !== 'string' || !/^[A-Za-z0-9_-]{4,80}$/.test(reference)) return null;
      return db.runTransaction(tx => authoritativeInTransaction(tx, reference));
    },
    async getOrCreateIssuance({ record, verificationToken }) {
      const hash = crypto.createHash('sha256').update(verificationToken).digest('hex');
      const protectedToken = await protectToken(verificationToken);
      return db.runTransaction(async tx => {
        const ref = issuanceRef(record.reference);
        const existing = await tx.get(ref);
        if (existing.exists) {
          const saved = existing.data();
          const token = await recoverToken(saved.protectedToken);
          return { record: saved.record, verificationToken: token };
        }
        const tokenIndex = tokenRef(hash);
        const collision = await tx.get(tokenIndex);
        if (collision.exists) throw new Error('Pepperpotts token collision');
        const persisted = { record: structuredClone(record), protectedToken, createdAt: now().toISOString() };
        tx.create(ref, persisted);
        tx.create(tokenIndex, { reference: record.reference, recordHash: hash });
        return { record: persisted.record, verificationToken };
      });
    },
    async getIssuanceForRendering(reference) {
      const snap = await issuanceRef(reference).get();
      if (!snap.exists) return null;
      const saved = snap.data();
      return { record: saved.record, verificationToken: await recoverToken(saved.protectedToken) };
    },
    async findIssuanceByTokenHash(hash) {
      if (!/^[a-f0-9]{64}$/.test(hash)) return null;
      return db.runTransaction(async tx => {
        const index = await tx.get(tokenRef(hash));
        if (!index.exists) return null;
        const issuance = await tx.get(issuanceRef(index.get('reference')));
        if (!issuance.exists || issuance.get('record.verificationTokenHash') !== hash) return null;
        const r = issuance.get('record');
        return { reference: r.reference, status: r.status === 'VALID' ? 'ISSUED' : r.status,
          issuedAt: r.issuedAt, service: r.publicVerification.service,
          amount: r.publicVerification.amount, currency: r.publicVerification.currency };
      });
    },
    async setAcknowledgementStatus(reference, status, audit) {
      return db.runTransaction(async tx => {
        const ref = issuanceRef(reference);
        const snap = await tx.get(ref);
        if (!snap.exists) return null;
        const saved = snap.data();
        const eventRef = ref.collection('auditEvents').doc(crypto.randomUUID());
        const updated = { ...saved.record, status, publicVerification: { ...saved.record.publicVerification, status } };
        tx.update(ref, { record: updated, updatedAt: audit.changedAt });
        tx.create(eventRef, { type: 'STATUS_CHANGED', status, actor: audit.actor, occurredAt: audit.changedAt });
        return updated.publicVerification;
      });
    }
  };
}

export { pepperpottsValidateBooking };
