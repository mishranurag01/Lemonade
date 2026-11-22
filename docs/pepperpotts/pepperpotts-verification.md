# Pepperpotts verification page — local test and integration

The QR in an issued acknowledgement points to `/verify?token=<64-character-random-token>`. The server renders `pepperpotts-verification.html`, which loads `pepperpotts-verification.css` and `pepperpotts-verification.js`. The browser looks up `/api/pepperpotts/verify?token=...` and renders a status panel instead of raw JSON. The API is kept separate for later PurvaPhalguni integration.

## Test locally
```sh
cd ~/Lemonade
git switch Pepperpotts
git pull --ff-only origin Pepperpotts
npm install --prefix packages/pepperpotts
PEPPERPOTTS_ENABLE_DEMO=1 npm --prefix packages/pepperpotts start
```
Open `http://127.0.0.1:8000` on the same device and use **Issue acknowledgement**. Open the generated PDF or its verification link. A different device cannot reach `127.0.0.1` on the issuing device. Missing, malformed, tampered, and unknown tokens return a privacy-safe not-found result.

**Already issued PDFs:** Their QR URL path remains `/verify`; the new route will now display HTML instead of JSON. Existing PDF bytes are not rewritten. Do not clear `.pepperpotts-local` unless you explicitly want to reset the fictional demo record.

## Security boundaries
- QR tokens are random 256-bit values and lookup uses their SHA-256 hashes. The development index also retains its local token solely to regenerate the same QR without storing PDF bytes; a production adapter must choose an appropriately protected token-recovery strategy.
- The verification page removes the token from browser address-bar history after loading. It uses no third-party scripts and applies restrictive CSP and no-referrer headers.
- Public response contains only receipt reference, issuance date, service name, paid amount/currency, and current acknowledgement status. It excludes customer identity, email, gateway references/secrets, booking internals, signing data, and PDF bytes.
- A copied genuine QR can still validate an unrelated forged paper. Compare displayed details; authenticated retrieval of the original document is a **separate future production integration**.
- Status values ISSUED, REVOKED, and REFUNDED are supported. Local transitions append audit events; production still needs a durable, tamper-evident audit trail and controlled administrator workflow.
- Local token lookup has a per-process rate limiter. Production needs a distributed limiter, abuse monitoring, and proxy-aware client identification.
- No customer-vault authentication, production HTTPS URL, production authoritative-adapter implementation, trusted production signing identity, or backend deployment is implemented.
- The verification page is portable and uniquely prefixed. Move it with the backend package into an integration branch based on VISION, then adapt PurvaPhalguni routing and theme without replacing existing files.

Automated tests cover token rejection, privacy minimisation, lifecycle states, access denial, concurrency/restart persistence, CMS verification, and signed-PDF tampering. Browser/device QR scanning remains a manual localhost check.
