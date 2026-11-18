import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { SignPdf } from '@signpdf/signpdf';
import { P12Signer } from '@signpdf/signer-p12';

// Development-only key loading. Never expose the private key or PKCS#12 to browsers.
// OpenSSL creates a PKCS#12 bundle in memory; no permanent copy is written.
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const defaultDir = path.join(repositoryRoot, '.pepperpotts-local', 'signing');
export async function pepperpottsSignPdf(pdfBytes) {
  const keyPath = process.env.PEPPERPOTTS_SIGNING_KEY || path.join(defaultDir, 'private-key.pem');
  const certPath = process.env.PEPPERPOTTS_SIGNING_CERT || path.join(defaultDir, 'certificate.pem');
  await Promise.all([fs.access(keyPath), fs.access(certPath)]);
  const result = spawnSync('openssl', [
    'pkcs12', '-export', '-inkey', keyPath, '-in', certPath,
    '-passout', 'pass:'
  ], { encoding: 'buffer', maxBuffer: 1024 * 1024, timeout: 15000 });
  if (result.error || result.status !== 0) {
    throw new Error('OpenSSL PKCS#12 preparation failed: ' + (result.error?.message || result.stderr?.toString('utf8') || 'unknown error'));
  }
  const signer = new P12Signer(result.stdout, { passphrase: '' });
  return Buffer.from(await new SignPdf().sign(Buffer.from(pdfBytes), signer));
}
