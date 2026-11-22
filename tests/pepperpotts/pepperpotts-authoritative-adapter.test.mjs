import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PepperpottsRecordNotFoundError,
  pepperpottsFindVerification,
  pepperpottsIssueAuthoritative,
  pepperpottsLoadAuthoritativeReceipt
} from '../../packages/pepperpotts/pepperpotts-authoritative-adapter.mjs';
import { createPepperpottsDevelopmentAdapter } from '../../packages/pepperpotts/pepperpotts-development-adapter.mjs';

const booking = () => ({
  reference: 'PP-1001', customer: { fullName: 'Trusted Customer', email: 'trusted@example.invalid' },
  service: { status: 'ACCEPTED', name: 'Trusted Service', deliveryMode: 'Online' },
  payment: { status: 'VERIFIED', amountMinor: 12500, subtotalMinor: 12500, discountMinor: 0, taxMinor: 0, currency: 'INR', transactionReference: 'TRUSTED-TRANSACTION', paymentDate: '2026-11-18T00:00:00+05:30', confirmationDate: '2026-11-18T00:01:00+05:30', ledgerDate: '2026-11-18T00:02:00+05:30' }
});

const fixedOptions = {
  now: () => new Date('2026-11-20T10:00:00.000Z'),
  randomBytes: () => Buffer.alloc(32, 7)
};

test('issues from verified payment and accepted service records', async () => {
  const adapter = createPepperpottsDevelopmentAdapter({ bookings: [booking()] });
  const result = await pepperpottsIssueAuthoritative(adapter, 'PP-1001', fixedOptions);
  assert.deepEqual(result, { status: 'ISSUED', reference: 'PP-1001', receiptIdentity: 'PP-1001' });
  const issued = await pepperpottsLoadAuthoritativeReceipt(adapter, 'PP-1001');
  assert.equal(issued.record.booking.payment.amountMinor, 12500);
  assert.equal(issued.record.booking.service.name, 'Trusted Service');
  assert.equal('pdf' in issued.record, false);
  assert.equal('signingKey' in issued.record, false);
  assert.equal('developmentVerificationToken' in issued.record, false);
});

test('refuses unverified payment', async () => {
  const fixture = booking(); fixture.payment.status = 'UNDER_REVIEW';
  const adapter = createPepperpottsDevelopmentAdapter({ bookings: [fixture] });
  assert.equal((await pepperpottsIssueAuthoritative(adapter, fixture.reference, fixedOptions)).status, 'PAYMENT_UNDER_REVIEW');
  await assert.rejects(pepperpottsLoadAuthoritativeReceipt(adapter, fixture.reference), PepperpottsRecordNotFoundError);
});

test('refuses unaccepted service', async () => {
  const fixture = booking(); fixture.service.status = 'PENDING';
  const adapter = createPepperpottsDevelopmentAdapter({ bookings: [fixture] });
  assert.equal((await pepperpottsIssueAuthoritative(adapter, fixture.reference, fixedOptions)).status, 'AWAITING_SERVICE_ACCEPTANCE');
});

test('rejects a missing authoritative record', async () => {
  const adapter = createPepperpottsDevelopmentAdapter({ bookings: [] });
  await assert.rejects(pepperpottsIssueAuthoritative(adapter, 'PP-4040', fixedOptions), PepperpottsRecordNotFoundError);
});

test('ignores client fields and snapshots only the trusted record', async () => {
  const adapter = createPepperpottsDevelopmentAdapter({ bookings: [booking()] });
  await pepperpottsIssueAuthoritative(adapter, 'PP-1001', { ...fixedOptions, clientData: { payment: { status: 'VERIFIED', amountMinor: 1 }, service: { status: 'ACCEPTED', name: 'Tampered' } } });
  const issued = await pepperpottsLoadAuthoritativeReceipt(adapter, 'PP-1001');
  assert.equal(issued.record.booking.payment.amountMinor, 12500);
  assert.equal(issued.record.booking.service.name, 'Trusted Service');
});

test('concurrent repeat issuance keeps one receipt identity and token', async () => {
  const adapter = createPepperpottsDevelopmentAdapter({ bookings: [booking()] });
  const results = await Promise.all(Array.from({ length: 8 }, () => pepperpottsIssueAuthoritative(adapter, 'PP-1001')));
  assert.deepEqual(new Set(results.map(result => result.receiptIdentity)), new Set(['PP-1001']));
  const issued = await pepperpottsLoadAuthoritativeReceipt(adapter, 'PP-1001');
  const found = await pepperpottsFindVerification(adapter, issued.verificationToken);
  assert.equal(found.reference, 'PP-1001');
});
