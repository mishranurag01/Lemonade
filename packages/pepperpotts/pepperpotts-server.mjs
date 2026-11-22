import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pepperpottsEligibility } from './pepperpotts-contracts.mjs';
import { pepperpottsRenderPdf } from './pepperpotts-pdf-renderer.mjs';
import { pepperpottsSignPdf } from './pepperpotts-pdf-signer.mjs';
import { pepperpottsVerifyPdfIntegrity } from './pepperpotts-pdf-integrity.mjs';
import { pepperpottsFindVerification, pepperpottsIssueAuthoritative } from './pepperpotts-authoritative-adapter.mjs';
import { createPepperpottsDevelopmentAdapter, PEPPERPOTTS_DEVELOPMENT_BOOKING, PEPPERPOTTS_DEVELOPMENT_REFERENCE } from './pepperpotts-development-adapter.mjs';
import { pepperpottsChangeAuthorizedStatus, pepperpottsLoadAuthorizedReceipt } from './pepperpotts-receipt-access.mjs';
import { createPepperpottsRateLimiter } from './pepperpotts-rate-limit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
process.chdir(root);
const PORT = Number(process.env.PEPPERPOTTS_PORT || 8000);
const HOST = '127.0.0.1';
const demoEnabled = process.env.PEPPERPOTTS_ENABLE_DEMO === '1';
const stateDir = process.env.PEPPERPOTTS_STATE_DIR ? path.resolve(process.env.PEPPERPOTTS_STATE_DIR) : path.resolve('.pepperpotts-local');
const adapter = createPepperpottsDevelopmentAdapter({ indexFile: path.join(stateDir, 'pepperpotts-index.json') });
const demoReference = PEPPERPOTTS_DEVELOPMENT_REFERENCE;
const demoSessionToken = crypto.randomBytes(32).toString('hex');
const demoPrincipal = Object.freeze({ subject: 'local-demo-administrator' });
const verificationRateLimit = createPepperpottsRateLimiter({ limit: 30, windowMs: 60_000 });
const securityHeaders = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer' };

const json = (res, status, body, extraHeaders = {}) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...securityHeaders, ...extraHeaders });
  res.end(JSON.stringify(body));
};
const safeEquals = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const cookieValue = req => String(req.headers.cookie ?? '').split(';').map(value => value.trim()).find(value => value.startsWith('pepperpotts_demo_session='))?.split('=')[1] ?? '';
const hasDemoSession = req => demoEnabled && safeEquals(cookieValue(req), demoSessionToken);
const allowedOrigin = req => {
  try {
    const origin = new URL(String(req.headers.origin ?? ''));
    return origin.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(origin.hostname) && origin.port === String(PORT);
  } catch { return false; }
};
const demoAccess = { principal: demoPrincipal, authorize: async ({ reference }) => reference === demoReference };
function requireDemoAccess(req, res, { stateChange = false } = {}) {
  if (!hasDemoSession(req) || (stateChange && !allowedOrigin(req))) {
    json(res, 401, { error: 'Receipt access denied' });
    return false;
  }
  return true;
}
async function readJson(req) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 4096) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
const demoReceipt = () => pepperpottsLoadAuthorizedReceipt(adapter, demoReference, demoAccess);
const verificationUrl = token => '/verify?token=' + encodeURIComponent(token);

async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const method = req.method;
  if (method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    const html = await fs.readFile(path.join(root, 'index.html'));
    const cookie = demoEnabled ? `pepperpotts_demo_session=${demoSessionToken}; HttpOnly; SameSite=Strict; Path=/` : 'pepperpotts_demo_session=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/';
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': cookie, ...securityHeaders });
    return res.end(html);
  }
  if (method === 'GET' && url.pathname === '/PurvaPhalguni%20Letterhead.pdf') return json(res, 404, { error: 'Not found' });
  if (method === 'GET' && url.pathname === '/api/pepperpotts/status') {
    const issued = await adapter.getIssuanceForRendering(demoReference);
    const status = issued?.record.status === 'VALID' ? 'ISSUED' : (issued?.record.status ?? pepperpottsEligibility(PEPPERPOTTS_DEVELOPMENT_BOOKING));
    return json(res, 200, { mode: 'LOCAL_DEMO', enabled: demoEnabled, reference: demoReference, status });
  }
  if (method === 'POST' && url.pathname === '/api/pepperpotts/demo/issue') {
    if (!requireDemoAccess(req, res, { stateChange: true })) return;
    const result = await pepperpottsIssueAuthoritative(adapter, demoReference);
    const issued = ['ISSUED', 'REFUNDED', 'REVOKED'].includes(result.status) ? await demoReceipt() : null;
    return json(res, 200, { ...result, verificationUrl: issued ? verificationUrl(issued.verificationToken) : undefined });
  }
  if (method === 'GET' && url.pathname === '/api/pepperpotts/demo/receipt') {
    if (!requireDemoAccess(req, res)) return;
    const issued = await demoReceipt();
    return json(res, 200, { reference: issued.record.reference, status: issued.record.status === 'VALID' ? 'ISSUED' : issued.record.status, verificationUrl: verificationUrl(issued.verificationToken) });
  }
  if (method === 'POST' && url.pathname === '/api/pepperpotts/demo/status') {
    if (!requireDemoAccess(req, res, { stateChange: true })) return;
    const body = await readJson(req);
    return json(res, 200, await pepperpottsChangeAuthorizedStatus(adapter, demoReference, body.status, demoAccess));
  }
  if (method === 'GET' && url.pathname === '/api/pepperpotts/demo/pdf') {
    if (!requireDemoAccess(req, res)) return;
    let issued;
    try { issued = await demoReceipt(); }
    catch { return json(res, 404, { error: 'Receipt unavailable' }); }
    const unsigned = await pepperpottsRenderPdf(structuredClone(issued.record.booking), {
      verificationUrl: 'http://127.0.0.1:' + PORT + verificationUrl(issued.verificationToken),
      issueDate: issued.record.issuedAt,
      sign: true
    });
    const pdf = await pepperpottsSignPdf(unsigned);
    await pepperpottsVerifyPdfIntegrity(pdf);
    res.writeHead(200, { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="pepperpotts-${demoReference}.pdf"`, ...securityHeaders });
    return res.end(pdf);
  }
  if (method === 'GET' && (url.pathname === '/verify' || url.pathname === '/pepperpotts-verification.html')) {
    const html = await fs.readFile(path.join(root, 'pepperpotts-verification.html'));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'", ...securityHeaders });
    return res.end(html);
  }
  if (method === 'GET' && (url.pathname === '/pepperpotts-verification.css' || url.pathname === '/pepperpotts-verification.js')) {
    const filename = url.pathname.slice(1);
    const asset = await fs.readFile(path.join(root, filename));
    res.writeHead(200, { 'content-type': filename.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8', ...securityHeaders });
    return res.end(asset);
  }
  if (method === 'GET' && url.pathname === '/api/pepperpotts/verify') {
    const rate = verificationRateLimit.consume(req.socket.remoteAddress ?? 'unknown');
    if (!rate.allowed) return json(res, 429, { error: 'Verification temporarily unavailable' }, { 'retry-after': String(rate.retryAfterSeconds) });
    const entry = await pepperpottsFindVerification(adapter, url.searchParams.get('token') || '');
    if (!entry) return json(res, 404, { status: 'NOT_FOUND' });
    return json(res, 200, { ...entry, note: 'This verifies the server record only. Validate the PDF signature separately to check PDF integrity.' });
  }
  return json(res, 404, { error: 'Not found' });
}

await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
http.createServer((req, res) => {
  handler(req, res).catch(error => {
    console.error('Pepperpotts:', error.stack || error.message);
    if (!res.headersSent) json(res, 500, { error: 'Request failed; see local server log' }); else res.end();
  });
}).listen(PORT, HOST, () => console.log(`Pepperpotts local demo: http://${HOST}:${PORT} (demo ${demoEnabled ? 'enabled' : 'disabled'})`));
