import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pepperpottsPaymentRows, pepperpottsRenderPdf } from '../../packages/pepperpotts/pepperpotts-pdf-renderer.mjs';
import { pepperpottsSignPdf } from '../../packages/pepperpotts/pepperpotts-pdf-signer.mjs';
import { pepperpottsVerifyPdfIntegrity } from '../../packages/pepperpotts/pepperpotts-pdf-integrity.mjs';

const booking = taxMinor => ({
  reference: 'PP-PDF-1001', customer: { fullName: 'PDF Customer', email: 'pdf@example.invalid' },
  service: { status: 'ACCEPTED', name: 'PDF Security Test', category: 'Test', deliveryMode: 'Online' },
  payment: { status: 'VERIFIED', amountMinor: 1000000 + taxMinor, subtotalMinor: 1000000, discountMinor: 0, taxMinor, currency: 'INR', method: 'Test', transactionReference: 'PDF-TEST', paymentDate: '2026-11-18T00:00:00+05:30', confirmationDate: '2026-11-18T00:01:00+05:30', ledgerDate: '2026-11-18T00:02:00+05:30' }
});

test('zero tax is omitted and configured nonzero tax remains supported', () => {
  assert.equal(pepperpottsPaymentRows(booking(0).payment).some(([label]) => label.includes('Tax')), false);
  const taxed = pepperpottsPaymentRows(booking(180000).payment);
  assert.equal(taxed.some(([label, value]) => label === 'Tax charged' && value.includes('1,800')), true);
  assert.equal(taxed.at(-1)[1].includes('11,800'), true);
});

test('signed A4 acknowledgement verifies and byte tampering fails', { timeout: 30_000 }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pepperpotts-signature-'));
  try {
    const keyPath = path.join(directory, 'key.pem');
    const certPath = path.join(directory, 'cert.pem');
    const generated = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-subj', '/CN=Pepperpotts Test', '-days', '1'], { timeout: 15_000, maxBuffer: 1024 * 1024 });
    assert.equal(generated.status, 0, generated.stderr?.toString());
    const unsigned = await pepperpottsRenderPdf(booking(0), { verificationUrl: 'http://127.0.0.1:8000/verify?token=' + 'a'.repeat(64), issueDate: '2026-11-20T10:00:00.000Z', sign: true });
    const signed = await pepperpottsSignPdf(unsigned, { keyPath, certPath });
    assert.equal(await pepperpottsVerifyPdfIntegrity(signed), true);
    const tampered = Buffer.from(signed);
    tampered[10] ^= 1;
    await assert.rejects(pepperpottsVerifyPdfIntegrity(tampered), /integrity verification failed/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
