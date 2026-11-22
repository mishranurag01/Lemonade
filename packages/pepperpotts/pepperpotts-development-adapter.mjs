import crypto from 'node:crypto';
import fs from 'node:fs/promises';

export const PEPPERPOTTS_DEVELOPMENT_REFERENCE = 'PP-DEMO-0001';
export const PEPPERPOTTS_DEVELOPMENT_BOOKING = Object.freeze({
  reference: PEPPERPOTTS_DEVELOPMENT_REFERENCE,
  customer: { fullName: 'Sample Customer', email: 'sample@example.invalid' },
  service: { status: 'ACCEPTED', name: 'Astrology Consultation (Demo)', category: 'Astrology', deliveryMode: 'Online', schedulingStatus: 'Registration Accepted - Scheduling Pending' },
  payment: { status: 'VERIFIED', amountMinor: 49900, subtotalMinor: 49900, discountMinor: 0, taxMinor: 0, currency: 'INR', method: 'Test UPI', transactionReference: 'DEMO-TRANSACTION-NOT-REAL', paymentDate: '2026-11-18T00:00:00+05:30', confirmationDate: '2026-11-18T00:01:00+05:30', ledgerDate: '2026-11-18T00:02:00+05:30' }
});

const safeEquals = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Development/test adapter only. It is not selected implicitly for production. */
export function createPepperpottsDevelopmentAdapter({ bookings = [PEPPERPOTTS_DEVELOPMENT_BOOKING], indexFile = null } = {}) {
  const trustedBookings = new Map(bookings.map(booking => [booking.reference, structuredClone(booking)]));
  let memoryIndex = {};
  let queue = Promise.resolve();
  const serialized = task => { const result = queue.then(task); queue = result.catch(() => {}); return result; };
  const readIndex = async () => {
    if (!indexFile) return memoryIndex;
    try { return JSON.parse(await fs.readFile(indexFile, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  };
  const saveIndex = async index => {
    if (!indexFile) { memoryIndex = index; return; }
    const temporary = indexFile + '.' + crypto.randomUUID() + '.tmp';
    await fs.writeFile(temporary, JSON.stringify(index, null, 2), { mode: 0o600, flag: 'wx' });
    await fs.rename(temporary, indexFile);
  };
  const issuedView = stored => {
    const { developmentVerificationToken, demoVerificationToken, ...record } = stored;
    return { record: structuredClone(record), verificationToken: developmentVerificationToken ?? demoVerificationToken };
  };
  return {
    async getAuthoritativeBooking(reference) {
      const booking = trustedBookings.get(reference);
      return booking ? structuredClone(booking) : null;
    },
    async getOrCreateIssuance({ record, verificationToken }) {
      return serialized(async () => {
        const index = await readIndex();
        if (!index[record.reference]) {
          index[record.reference] = { ...structuredClone(record), developmentVerificationToken: verificationToken };
          await saveIndex(index);
        } else if (!index[record.reference].booking) {
          const legacy = index[record.reference];
          const legacyToken = legacy.demoVerificationToken;
          index[record.reference] = {
            ...structuredClone(record), issuedAt: legacy.issuedAt ?? record.issuedAt,
            verificationTokenHash: legacyToken ? legacy.verificationTokenHash : record.verificationTokenHash,
            legacyVerificationTokenHash: legacyToken ? legacy.legacyVerificationTokenHash : legacy.verificationTokenHash,
            developmentVerificationToken: legacyToken ?? verificationToken
          };
          await saveIndex(index);
        }
        const stored = index[record.reference];
        return issuedView(stored);
      });
    },
    async getIssuanceForRendering(reference) {
      const stored = (await readIndex())[reference];
      return stored ? issuedView(stored) : null;
    },
    async findIssuanceByTokenHash(tokenHash) {
      const stored = Object.values(await readIndex()).find(entry => safeEquals(tokenHash, entry.verificationTokenHash) || safeEquals(tokenHash, entry.legacyVerificationTokenHash));
      return stored ? structuredClone(stored.publicVerification) : null;
    }
  };
}
