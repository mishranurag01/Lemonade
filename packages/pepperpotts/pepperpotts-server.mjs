import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { pepperpottsEligibility, pepperpottsValidateBooking, PEPPERPOTTS_STATES } from './pepperpotts-contracts.mjs';
import { pepperpottsRenderPdf } from './pepperpotts-pdf-renderer.mjs';
import { pepperpottsSignPdf } from './pepperpotts-pdf-signer.mjs';
import { pepperpottsVerifyPdfIntegrity } from './pepperpotts-pdf-integrity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
process.chdir(root);
const PORT = Number(process.env.PEPPERPOTTS_PORT || 8000);
const HOST = '127.0.0.1';
const stateDir = path.resolve('.pepperpotts-local');
const indexFile = path.join(stateDir, 'pepperpotts-index.json');
const demoReference = 'PP-DEMO-0001';
const demo = {
  reference: demoReference,
  customer: { fullName: 'Sample Customer', email: 'sample@example.invalid' },
  service: { status: 'ACCEPTED', name: 'Astrology Consultation (Demo)', category: 'Astrology', deliveryMode: 'Online', schedulingStatus: 'Registration Accepted - Scheduling Pending' },
  payment: { status: 'VERIFIED', amountMinor: 49900, subtotalMinor: 49900, discountMinor: 0, taxMinor: 0, currency: 'INR', method: 'Test UPI', transactionReference: 'DEMO-TRANSACTION-NOT-REAL',
    paymentDate: '2026-11-18T00:00:00+05:30', confirmationDate: '2026-11-18T00:01:00+05:30', ledgerDate: '2026-11-18T00:02:00+05:30' }
};
const json = (res, status, body) => { res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}); res.end(JSON.stringify(body)); };
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const safeEquals = (a,b) => typeof a==='string' && typeof b==='string' && a.length===b.length && crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
let queue = Promise.resolve();
function serialized(task) { const result = queue.then(task); queue = result.catch(()=>{}); return result; }
async function readIndex() { try { return JSON.parse(await fs.readFile(indexFile,'utf8')); } catch(e) { if(e.code==='ENOENT') return {}; throw e; } }
async function saveIndex(index) {
  const tmp = indexFile+'.'+crypto.randomUUID()+'.tmp';
  await fs.writeFile(tmp,JSON.stringify(index,null,2),{mode:0o600,flag:'wx'});
  await fs.rename(tmp,indexFile);
}
function publicRecord(entry) {
  return { reference:entry.reference, status:entry.status, issuedAt:entry.issuedAt,
    customerNameMasked:entry.reference===demoReference ? maskCustomerName(demo.customer.fullName) : (entry.customerNameMasked ?? null),
    consultationMode:entry.consultationMode ?? (entry.reference===demoReference ? demo.service.deliveryMode : null),
    service:entry.service, amount:entry.amount, currency:entry.currency,
    note:'This verification does not establish that a consultation occurred.' };
}
function maskCustomerName(fullName) {
  const parts = String(fullName ?? '').trim().split(/\s+/).filter(Boolean);
  const letters = parts.join('');
  const target = letters.length > 12 ? 6 : 4;
  // Select non-adjacent characters across the full first + last name.
  // Very short names cannot always expose four without revealing adjacent letters.
  const count = Math.min(target, Math.ceil(letters.length / 2));
  const indices = [];
  if (count) {
    const maxStart = letters.length - 1 - 2 * (count - 1);
    const start = Math.floor(maxStart / 2);
    for (let i = 0; i < count; i++) indices.push(start + i * 2);
  }
  let offset = 0;
  return parts.map(part => {
    const masked = Array.from(part, (character, i) =>
      indices.includes(offset + i) ? character : '*').join('');
    offset += part.length;
    return masked;
  }).join(' ');
}
async function issueDemo() {
  return serialized(async () => {
    if (process.env.PEPPERPOTTS_ENABLE_DEMO !== '1') throw new Error('Demo issuance is disabled');
    const eligibility = pepperpottsEligibility(demo);
    if (eligibility !== PEPPERPOTTS_STATES.ELIGIBLE) return { status: eligibility };
    pepperpottsValidateBooking(demo);
    const index = await readIndex();
    let entry = index[demoReference];
    if (!entry) {
      const token = crypto.randomBytes(32).toString('hex');
      entry = {
        reference: demoReference, status: 'VALID', issuedAt: new Date().toISOString(),
        service: demo.service.name, customerNameMasked: maskCustomerName(demo.customer.fullName),
        consultationMode: demo.service.deliveryMode, amount: demo.payment.amountMinor,
        currency: demo.payment.currency, verificationTokenHash: sha(token),
        demoVerificationToken: token, templateVersion: 'v1'
      };
      index[demoReference] = entry;
      await saveIndex(index);
    } else if (!entry.demoVerificationToken) {
      // Legacy prototype stored only a token hash and a PDF. Preserve the old hash
      // so previously printed QR codes still resolve, while enabling fresh PDFs.
      const token = crypto.randomBytes(32).toString('hex');
      entry.legacyVerificationTokenHash = entry.verificationTokenHash;
      entry.verificationTokenHash = sha(token);
      entry.demoVerificationToken = token;
      await saveIndex(index);
    }
    return { status: 'ISSUED', reference: demoReference };
  });
}
async function handler(req,res) {
  const url = new URL(req.url,'http://localhost');
  const method=req.method;
  const headers = {'cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer'};
  if(method==='GET' && (url.pathname==='/' || url.pathname==='/index.html')) {
    const html=await fs.readFile(path.join(root,'index.html')); res.writeHead(200,{'content-type':'text/html; charset=utf-8',...headers});return res.end(html);
  }
  if(method==='GET' && url.pathname==='/PurvaPhalguni%20Letterhead.pdf') {
    return json(res,404,{error:'Use the Print button to retrieve an issued acknowledgement'});
  }
  if(method==='GET' && url.pathname==='/api/pepperpotts/status') {
    const index=await readIndex();return json(res,200,{mode:'LOCAL_DEMO',reference:demoReference,status:index[demoReference]?'ISSUED':pepperpottsEligibility(demo)});
  }
  if(method==='POST' && url.pathname==='/api/pepperpotts/demo/issue') {
    if(process.env.PEPPERPOTTS_ENABLE_DEMO!=='1')return json(res,403,{error:'Demo disabled'});
    const result=await issueDemo();return json(res,200,result);
  }
  if(method==='GET' && url.pathname==='/api/pepperpotts/demo/pdf') {
    if(process.env.PEPPERPOTTS_ENABLE_DEMO!=='1')return json(res,403,{error:'Demo disabled'});
    const index=await readIndex(), entry=index[demoReference];
    if(!entry)return json(res,409,{error:'Not issued'});
    // The private local demo index is authoritative; generate a new signed PDF
    // per request. No generated customer PDF is retained by this endpoint.
    const verificationUrl = 'http://127.0.0.1:' + PORT + '/verify?token=' + encodeURIComponent(entry.demoVerificationToken);
    const unsigned = await pepperpottsRenderPdf(structuredClone(demo), {
      verificationUrl, issueDate: entry.issuedAt, sign: true
    });
    const pdf = await pepperpottsSignPdf(unsigned);
    // Fail closed: never serve a PDF labelled signed unless its detached CMS
    // verifies against the complete PDF byte range.
    await pepperpottsVerifyPdfIntegrity(pdf);
    const filename = 'pepperpotts-' + demoReference + '.pdf';
    res.writeHead(200, {'content-type':'application/pdf',
      'content-disposition':'inline; filename="' + filename + '"', ...headers});
    return res.end(pdf);
  }
  if(method==='GET' && (url.pathname==='/verify' || url.pathname==='/pepperpotts-verification.html')) {
    const html=await fs.readFile(path.join(root,'pepperpotts-verification.html'));
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",...headers});
    return res.end(html);
  }
  if(method==='GET' && (url.pathname==='/pepperpotts-verification.css' || url.pathname==='/pepperpotts-verification.js')) {
    const filename=url.pathname.slice(1);
    const asset=await fs.readFile(path.join(root,filename));
    res.writeHead(200,{'content-type':filename.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8',...headers});
    return res.end(asset);
  }
  if(method==='GET' && url.pathname==='/api/pepperpotts/verify') {
    const token=url.searchParams.get('token')||'';
    if(!/^[a-f0-9]{64}$/.test(token))return json(res,404,{status:'NOT_FOUND'});
    const index=await readIndex();
    const entry=Object.values(index).find(e=>(safeEquals(sha(token),e.verificationTokenHash) || safeEquals(sha(token),e.legacyVerificationTokenHash)));
    if(!entry)return json(res,404,{status:'NOT_FOUND'});
    return json(res,200,publicRecord(entry));
  }
  return json(res,404,{error:'Not found'});
}
await fs.mkdir(stateDir,{recursive:true,mode:0o700});
http.createServer((req,res)=>{
  handler(req,res).catch(e=>{console.error('Pepperpotts:', e.stack || e.message);if(!res.headersSent)json(res,500,{error:'Request failed; see local server log'});else res.end();});
}).listen(PORT,HOST,()=>console.log('Pepperpotts local demo: http://'+HOST+':'+PORT+' (demo '+(process.env.PEPPERPOTTS_ENABLE_DEMO==='1'?'enabled':'disabled')+')'));
