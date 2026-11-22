import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pepperpottsEligibility } from './pepperpotts-contracts.mjs';
import { pepperpottsRenderPdf } from './pepperpotts-pdf-renderer.mjs';
import { pepperpottsSignPdf } from './pepperpotts-pdf-signer.mjs';
import { pepperpottsVerifyPdfIntegrity } from './pepperpotts-pdf-integrity.mjs';
import { pepperpottsFindVerification, pepperpottsIssueAuthoritative, pepperpottsLoadAuthoritativeReceipt } from './pepperpotts-authoritative-adapter.mjs';
import { createPepperpottsDevelopmentAdapter, PEPPERPOTTS_DEVELOPMENT_BOOKING, PEPPERPOTTS_DEVELOPMENT_REFERENCE } from './pepperpotts-development-adapter.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
process.chdir(root);
const PORT = Number(process.env.PEPPERPOTTS_PORT || 8000);
const HOST = '127.0.0.1';
const stateDir = path.resolve('.pepperpotts-local');
const indexFile = path.join(stateDir, 'pepperpotts-index.json');
const demoReference = PEPPERPOTTS_DEVELOPMENT_REFERENCE;
const adapter = createPepperpottsDevelopmentAdapter({ indexFile });
const json = (res, status, body) => { res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}); res.end(JSON.stringify(body)); };
function publicRecord(entry) {
  return { ...entry,
    note:'This verification does not establish that a consultation occurred.' };
}
async function issueDemo() {
  if (process.env.PEPPERPOTTS_ENABLE_DEMO !== '1') throw new Error('Demo issuance is disabled');
  return pepperpottsIssueAuthoritative(adapter, demoReference);
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
    const issued=await adapter.getIssuanceForRendering(demoReference);return json(res,200,{mode:'LOCAL_DEMO',reference:demoReference,status:issued?'ISSUED':pepperpottsEligibility(PEPPERPOTTS_DEVELOPMENT_BOOKING)});
  }
  if(method==='POST' && url.pathname==='/api/pepperpotts/demo/issue') {
    if(process.env.PEPPERPOTTS_ENABLE_DEMO!=='1')return json(res,403,{error:'Demo disabled'});
    const result=await issueDemo();return json(res,200,result);
  }
  if(method==='GET' && url.pathname==='/api/pepperpotts/demo/pdf') {
    if(process.env.PEPPERPOTTS_ENABLE_DEMO!=='1')return json(res,403,{error:'Demo disabled'});
    let issued;
    try { issued=await pepperpottsLoadAuthoritativeReceipt(adapter,demoReference); }
    catch { return json(res,409,{error:'Not issued'}); }
    // The private local demo index is authoritative; generate a new signed PDF
    // per request. No generated customer PDF is retained by this endpoint.
    const verificationUrl = 'http://127.0.0.1:' + PORT + '/verify?token=' + encodeURIComponent(issued.verificationToken);
    const unsigned = await pepperpottsRenderPdf(structuredClone(issued.record.booking), {
      verificationUrl, issueDate: issued.record.issuedAt, sign: true
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
    const entry=await pepperpottsFindVerification(adapter,token);
    if(!entry)return json(res,404,{status:'NOT_FOUND'});
    return json(res,200,publicRecord(entry));
  }
  return json(res,404,{error:'Not found'});
}
await fs.mkdir(stateDir,{recursive:true,mode:0o700});
http.createServer((req,res)=>{
  handler(req,res).catch(e=>{console.error('Pepperpotts:', e.stack || e.message);if(!res.headersSent)json(res,500,{error:'Request failed; see local server log'});else res.end();});
}).listen(PORT,HOST,()=>console.log('Pepperpotts local demo: http://'+HOST+':'+PORT+' (demo '+(process.env.PEPPERPOTTS_ENABLE_DEMO==='1'?'enabled':'disabled')+')'));
