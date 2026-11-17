import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { pepperpottsEligibility, pepperpottsValidateBooking, PEPPERPOTTS_STATES } from './pepperpotts-contracts.mjs';
import { pepperpottsRenderPdf } from './pepperpotts-pdf-renderer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
process.chdir(root);
const PORT = Number(process.env.PEPPERPOTTS_PORT || 8000);
const HOST = '127.0.0.1';
const stateDir = path.resolve('.pepperpotts-local');
const issuedDir = path.join(stateDir, 'issued');
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
    service:entry.service, amount:entry.amount, currency:entry.currency,
    fingerprintSha256:entry.fingerprintSha256, note:'This verification does not establish that a consultation occurred.' };
}
async function issueDemo() {
  return serialized(async()=>{
    if (process.env.PEPPERPOTTS_ENABLE_DEMO !== '1') throw new Error('Demo issuance is disabled');
    const eligibility = pepperpottsEligibility(demo);
    if(eligibility!==PEPPERPOTTS_STATES.ELIGIBLE) return { status:eligibility };
    pepperpottsValidateBooking(demo);
    const index = await readIndex();
    if(index[demoReference]) return {status:'ISSUED',reference:demoReference};
    const token = crypto.randomBytes(32).toString('hex');
    const issueDate = new Date().toISOString();
    const verificationUrl = 'http://127.0.0.1:'+PORT+'/verify?token='+encodeURIComponent(token);
    const pdf = await pepperpottsRenderPdf(structuredClone(demo),{verificationUrl,issueDate});
    const pdfName = 'pepperpotts-'+demoReference+'.pdf';
    await fs.writeFile(path.join(issuedDir,pdfName),pdf,{flag:'wx',mode:0o600});
    index[demoReference] = {reference:demoReference,status:'VALID',issuedAt:issueDate,
      service:demo.service.name,amount:demo.payment.amountMinor,currency:demo.payment.currency,
      fingerprintSha256:sha(pdf),verificationTokenHash:sha(token),file:pdfName};
    await saveIndex(index);
    return {status:'ISSUED',reference:demoReference};
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
    const pdf=await fs.readFile(path.join(issuedDir,entry.file));
    if(!safeEquals(sha(pdf),entry.fingerprintSha256))return json(res,500,{error:'Stored PDF integrity check failed'});
    res.writeHead(200,{'content-type':'application/pdf','content-disposition':'inline; filename="'+entry.file+'"',...headers});return res.end(pdf);
  }
  if(method==='GET' && url.pathname==='/verify') {
    const token=url.searchParams.get('token')||'';
    const index=await readIndex();
    const entry=Object.values(index).find(e=>safeEquals(sha(token),e.verificationTokenHash));
    if(!entry)return json(res,404,{status:'NOT_FOUND'});
    return json(res,200,publicRecord(entry));
  }
  return json(res,404,{error:'Not found'});
}
await fs.mkdir(issuedDir,{recursive:true,mode:0o700});
http.createServer((req,res)=>{
  handler(req,res).catch(e=>{console.error('Pepperpotts:',e.message);if(!res.headersSent)json(res,500,{error:'Request failed; see local server log'});else res.end();});
}).listen(PORT,HOST,()=>console.log('Pepperpotts local demo: http://'+HOST+':'+PORT+' (demo '+(process.env.PEPPERPOTTS_ENABLE_DEMO==='1'?'enabled':'disabled')+')'));
