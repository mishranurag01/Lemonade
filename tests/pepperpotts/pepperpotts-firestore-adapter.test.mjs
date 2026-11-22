import test from 'node:test';
import assert from 'node:assert/strict';
import { createPepperpottsFirestoreAdapter } from '../../packages/pepperpotts/pepperpotts-firestore-adapter.mjs';
import { pepperpottsValidateBooking } from '../../packages/pepperpotts/pepperpotts-contracts.mjs';

function fixture() {
  const docs = new Map([
    ['bookingPublicReferences/PF26-ABCDEFGH', { bookingId: 'book_1' }],
    ['bookings/book_1', { paymentStatus: 'paid', paymentVerification: { method: 'manual_upi_reconciled', bankTransactionId: 'a'.repeat(64), verifiedAt: '2026-11-18T10:00:00.000Z' }, amount: 125, currency: 'INR', clientName: 'Ada Example', clientEmail: 'ada@example.invalid', serviceName: 'Consultation', status: 'confirmed' }],
    ['manualPaymentClaims/book_1', { status: 'reconciled', bankTransactionId: 'a'.repeat(64), reference: 'BANK-123456', amountPaise: 12500, paymentDate: '2026-11-18' }],
    ['bankTransactions/' + 'a'.repeat(64), { source: 'bank_statement_import' }]
  ]);
  const ref = path => ({ path, get: async () => snap(path), collection: name => ({ doc: id => ref(`${path}/${name}/${id}`) }) });
  const snap = path => { const data = docs.get(path); return { exists: !!data, id: path.split('/').at(-1), get: key => key.split('.').reduce((value, part) => value?.[part], data), data: () => data }; };
  const db = { doc: ref, runTransaction: fn => fn({ get: async r => snap(r.path), create: (r, d) => docs.set(r.path, d), update: (r, d) => docs.set(r.path, { ...docs.get(r.path), ...d }) }) };
  return { db };
}

const baseOptions = ({ db, resolveServiceAcceptance = async () => '2026-11-19T10:00:00.000Z', resolveLedgerDate = async () => '2026-11-19T10:01:00.000Z' }) => ({
  db,
  assertBankEvidence: (bank, claim, id) => { assert.equal(bank.source, 'bank_statement_import'); assert.equal(claim.status, 'reconciled'); assert.equal(id, 'book_1'); },
  receiptFromEvidence: () => ({ customer: 'Ada Example', service: 'Consultation', method: 'UPI reconciled', transactionReference: 'BANK-123456' }),
  resolveServiceAcceptance, resolveLedgerDate,
  protectToken: async token => `protected:${token}`, recoverToken: async protectedValue => protectedValue.slice('protected:'.length)
});

test('projects VERIFIED only from reconciled claim and bank evidence, with explicit acceptance and ledger dates', async () => {
  const { db } = fixture();
  const adapter = createPepperpottsFirestoreAdapter(baseOptions({ db }));
  const booking = await adapter.getAuthoritativeBooking('PF26-ABCDEFGH');
  assert.equal(booking.payment.status, 'VERIFIED');
  assert.equal(booking.service.status, 'ACCEPTED');
  assert.equal(booking.payment.amountMinor, 12500);
  assert.equal(booking.payment.paymentDate, '2026-11-18');
  assert.equal(pepperpottsValidateBooking(booking), true);
});

test('leaves service pending without an explicit acceptance event and blocks missing ledger date', async () => {
  const { db } = fixture();
  const adapter = createPepperpottsFirestoreAdapter(baseOptions({ db, resolveServiceAcceptance: async () => null, resolveLedgerDate: async () => null }));
  const booking = await adapter.getAuthoritativeBooking('PF26-ABCDEFGH');
  assert.equal(booking.service.status, 'PENDING');
  assert.throws(() => pepperpottsValidateBooking(booking), /Missing required/);
});

test('requires server evidence and protected token dependencies at construction', () => {
  assert.throws(() => createPepperpottsFirestoreAdapter({}), /dependency db is required/);
});
