'use strict';
(() => {
  const result=document.getElementById('verification-result');
  const fields=document.getElementById('verification-fields');
  const params=new URLSearchParams(location.search);
  const token=params.get('token');
  // Remove the bearer-style verification token from the address bar after reading it.
  if(token) history.replaceState(null,'',location.pathname);
  const show=(state,message)=>{result.dataset.state=state;result.textContent=message;};
  if(!token || !/^[a-f0-9]{64}$/.test(token)){
    show('error','Verification key missing or malformed. Scan the QR code on the original acknowledgement.');
    return;
  }
  fetch('/api/pepperpotts/verify?token='+encodeURIComponent(token),{cache:'no-store',credentials:'omit'})
    .then(async response=>{
      const data=await response.json();
      if(!response.ok) throw new Error(response.status===404?'No matching official record was found.':'Verification is temporarily unavailable.');
      return data;
    })
    .then(data=>{
      const state=String(data.status||'UNKNOWN').toUpperCase();
      const messages={
        VALID:'Official record found — currently valid. Compare the details below with the document.',
        REVOKED:'This acknowledgement has been revoked. Do not treat it as currently valid.',
        REFUNDED:'The payment associated with this acknowledgement has been marked refunded.',
        SUPERSEDED:'This acknowledgement has been replaced by a later version.'
      };
      show(state.toLowerCase(),messages[state]||'Record found, but its status requires manual review.');
      const set=(id,value)=>document.getElementById(id).textContent=String(value??'Not available');
      set('record-reference',data.reference);
      set('record-status',state);
      set('record-issued',data.issuedAt?new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(new Date(data.issuedAt))+' IST':'Not available');
      set('record-service',data.service);
      const amount=Number(data.amount);
      set('record-amount',Number.isSafeInteger(amount)&&amount>=0?new Intl.NumberFormat('en-IN',{style:'currency',currency:data.currency||'INR'}).format(amount/100):'Not available');
      set('record-fingerprint',data.fingerprintSha256);
      fields.hidden=false;
    })
    .catch(error=>show('error',error.message||'Verification unavailable.'));
})();
