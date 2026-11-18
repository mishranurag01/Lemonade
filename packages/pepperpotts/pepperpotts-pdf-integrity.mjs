import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Verify the detached CMS signature over the exact signed PDF byte ranges.
// The check deliberately does not assert CA trust or legal signer identity.
export async function pepperpottsVerifyPdfIntegrity(pdfBytes) {
  const pdf = Buffer.from(pdfBytes);
  const text = pdf.toString('latin1');
  const matches = [...text.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)];
  if (matches.length !== 1) throw new Error('Expected exactly one PDF signature byte range');
  const [start, firstLength, secondStart, secondLength] = matches[0].slice(1).map(Number);
  if (![start, firstLength, secondStart, secondLength].every(Number.isSafeInteger) ||
      start !== 0 || firstLength <= 0 || secondStart <= firstLength ||
      secondStart + secondLength !== pdf.length) {
    throw new Error('PDF signature does not cover the complete document');
  }
  const gap = text.slice(firstLength, secondStart);
  const hexMatch = /^\s*<([\da-fA-F\s]+)>\s*$/.exec(gap);
  if (!hexMatch) throw new Error('PDF signature contents are malformed');
  const hex = hexMatch[1].replace(/\s/g, '');
  if (hex.length % 2) throw new Error('Invalid signature hex length');
  const padded = Buffer.from(hex, 'hex');
  if (padded[0] !== 0x30) throw new Error('Signature is not DER-encoded CMS');
  let header = 2;
  let bodyLength = padded[1];
  if (bodyLength & 0x80) {
    const bytes = bodyLength & 0x7f;
    if (bytes < 1 || bytes > 4 || padded.length < 2 + bytes) throw new Error('Invalid CMS length');
    bodyLength = 0;
    for (let i = 0; i < bytes; i++) bodyLength = bodyLength * 256 + padded[2 + i];
    header += bytes;
  }
  const cmsLength = header + bodyLength;
  if (cmsLength > padded.length || cmsLength < header) throw new Error('CMS length exceeds placeholder');
  if (padded.subarray(cmsLength).some(byte => byte !== 0)) throw new Error('Unexpected data after CMS signature');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pepperpotts-verify-'));
  try {
    const contentPath = path.join(dir, 'signed-content.bin');
    const cmsPath = path.join(dir, 'signature.der');
    await fs.writeFile(contentPath, Buffer.concat([pdf.subarray(0, firstLength), pdf.subarray(secondStart)]), { mode: 0o600 });
    await fs.writeFile(cmsPath, padded.subarray(0, cmsLength), { mode: 0o600 });
    const result = spawnSync('openssl', [
      'cms', '-verify', '-binary', '-inform', 'DER', '-in', cmsPath,
      '-content', contentPath, '-noverify', '-out', path.join(dir, 'verified.bin')
    ], { timeout: 15000, maxBuffer: 1024 * 1024 });
    if (result.error || result.status !== 0) {
      throw new Error('PDF signature integrity verification failed: ' +
        (result.error?.message || result.stderr?.toString('utf8').trim() || 'OpenSSL CMS verification failed'));
    }
    return true;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
