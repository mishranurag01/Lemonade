import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  pepperpottsFindVerification,
  pepperpottsIssueAuthoritative
} from '../../packages/pepperpotts/pepperpotts-authoritative-adapter.mjs';
import { createPepperpottsDevelopmentAdapter } from '../../packages/pepperpotts/pepperpotts-development-adapter.mjs';
import {
  PepperpottsAccessDeniedError,
  PepperpottsAuthenticationRequiredError,
  pepperpottsChangeAuthorizedStatus,
  pepperpottsLoadAuthorizedReceipt
} from '../../packages/pepperpotts/pepperpotts-receipt-access.mjs';
import { createPepperpottsRateLimiter } from '../../packages/pepperpotts/pepperpotts-rate-limit.mjs';

const fixture = () => ({
  reference: 'PP-SECURE-1', customer: { fullName: 'Private Customer', email: 'private@example.invalid' },
  service: { status: 'ACCEPTED', name: 'Private Service', deliveryMode: 'Online' },
  payment: { status: 'VERIFIED', amountMinor: 25000, subtotalMinor: 25000, discountMinor: 0, taxMinor: 0, currency: 'INR', transactionReference: 'GATEWAY-SECRET', paymentDate: '2026-11-18T00:00:00+05:30', confirmationDate: '2026-11-18T00:01:00+05:30', ledgerDate: '2026-11-18T00:02:00+05:30' }
});
const allowOwner = { principal: { subject: 'customer-1' }, authorize: async ({ reference, principal, action }) => reference === 'PP-SECURE-1' && principal.subject === 'customer-1' && action === 'receipt:read' };
const allowAdmin = { principal: { subject: 'administrator-1' }, authorize: async ({ reference, principal, action }) => reference === 'PP-SECURE-1' && principal.subject === 'administrator-1' && action === 'receipt:change-status' };

test('receipt access requires authentication and ownership authorization', async () => {
  const adapter = createPepperpottsDevelopmentAdapter({ bookings: [fixture()] });
  await pepperpottsIssueAuthoritative(adapter, 'PP-SECURE-1');
  await assert.rejects(pepperpottsLoadAuthorizedReceipt(adapter, 'PP-SECURE-1'), PepperpottsAuthenticationRequiredError);
  await assert.rejects(pepperpottsLoadAuthorizedReceipt(adapter, 'PP-SECURE-1', { principal: { subject: 'other' }, authorize: async () => false }), PepperpottsAccessDeniedError);
  await assert.rejects(pepperpottsLoadAuthorizedReceipt(adapter, '../enumerate', allowOwner), PepperpottsAccessDeniedError);
  const receipt = await pepperpottsLoadAuthorizedReceipt(adapter, 'PP-SECURE-1', allowOwner);
  assert.equal(receipt.record.reference, 'PP-SECURE-1');
});

test('verification rejects missing, invalid, and tampered tokens without leaking secrets', async () => {
  const adapter = createPepperpottsDevelopmentAdapter({ bookings: [fixture()] });
  await pepperpottsIssueAuthoritative(adapter, 'PP-SECURE-1');
  const receipt = await pepperpottsLoadAuthorizedReceipt(adapter, 'PP-SECURE-1', allowOwner);
  assert.equal(await pepperpottsFindVerification(adapter, ''), null);
  assert.equal(await pepperpottsFindVerification(adapter, 'not-a-token'), null);
  const tampered = receipt.verificationToken.slice(0, -1) + (receipt.verificationToken.endsWith('0') ? '1' : '0');
  assert.equal(await pepperpottsFindVerification(adapter, tampered), null);
  const publicRecord = await pepperpottsFindVerification(adapter, receipt.verificationToken);
  assert.deepEqual(Object.keys(publicRecord).sort(), ['amount', 'currency', 'issuedAt', 'reference', 'service', 'status']);
  const serialized = JSON.stringify(publicRecord);
  assert.doesNotMatch(serialized, /private@example|Private Customer|GATEWAY-SECRET/);
});

test('refund and revocation require authorization and append audit events', async () => {
  const adapter = createPepperpottsDevelopmentAdapter({ bookings: [fixture()] });
  await pepperpottsIssueAuthoritative(adapter, 'PP-SECURE-1');
  await assert.rejects(pepperpottsChangeAuthorizedStatus(adapter, 'PP-SECURE-1', 'REFUNDED', allowOwner), PepperpottsAccessDeniedError);
  assert.equal((await pepperpottsChangeAuthorizedStatus(adapter, 'PP-SECURE-1', 'REFUNDED', allowAdmin)).status, 'REFUNDED');
  assert.equal((await pepperpottsChangeAuthorizedStatus(adapter, 'PP-SECURE-1', 'REVOKED', allowAdmin)).status, 'REVOKED');
  const receipt = await pepperpottsLoadAuthorizedReceipt(adapter, 'PP-SECURE-1', allowOwner);
  assert.equal((await pepperpottsFindVerification(adapter, receipt.verificationToken)).status, 'REVOKED');
  const audit = await adapter.getDevelopmentAuditEvents('PP-SECURE-1');
  assert.deepEqual(audit.map(event => event.type), ['ISSUED', 'STATUS_CHANGED', 'STATUS_CHANGED']);
});

test('file-backed adapter survives restart and serializes concurrent issuance', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pepperpotts-adapter-'));
  try {
    const indexFile = path.join(directory, 'index.json');
    const first = createPepperpottsDevelopmentAdapter({ bookings: [fixture()], indexFile });
    const second = createPepperpottsDevelopmentAdapter({ bookings: [fixture()], indexFile });
    const results = await Promise.all([
      ...Array.from({ length: 5 }, () => pepperpottsIssueAuthoritative(first, 'PP-SECURE-1')),
      ...Array.from({ length: 5 }, () => pepperpottsIssueAuthoritative(second, 'PP-SECURE-1'))
    ]);
    assert.deepEqual(new Set(results.map(result => result.receiptIdentity)), new Set(['PP-SECURE-1']));
    const restarted = createPepperpottsDevelopmentAdapter({ bookings: [fixture()], indexFile });
    const receipt = await pepperpottsLoadAuthorizedReceipt(restarted, 'PP-SECURE-1', allowOwner);
    assert.equal(receipt.record.reference, 'PP-SECURE-1');
    assert.equal(Object.keys(JSON.parse(await fs.readFile(indexFile, 'utf8'))).length, 1);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('verification rate limiter resets and rejects excess attempts', () => {
  let now = 1000;
  const limiter = createPepperpottsRateLimiter({ limit: 2, windowMs: 1000, now: () => now });
  assert.equal(limiter.consume('client').allowed, true);
  assert.equal(limiter.consume('client').allowed, true);
  assert.equal(limiter.consume('client').allowed, false);
  now = 2000;
  assert.equal(limiter.consume('client').allowed, true);
});
