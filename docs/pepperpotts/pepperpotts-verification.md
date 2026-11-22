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
Open `http://127.0.0.1:8000` on the same device and tap **Print**. Scan the PDF QR on that same device (or open the QR URL manually) to see the styled verification result. A different device cannot reach `127.0.0.1` on the issuing device. A missing or invalid key shows an error without exposing customer details.

**Already issued PDFs:** Their QR URL path remains `/verify`; the new route will now display HTML instead of JSON. Existing PDF bytes are not rewritten. Do not clear `.pepperpotts-local` unless you explicitly want to reset the fictional demo record.

## Security boundaries
- QR tokens are random 256-bit values and lookup uses their SHA-256 hashes. The development index also retains its local token solely to regenerate the same QR without storing PDF bytes; a production adapter must choose an appropriately protected token-recovery strategy.
- The verification page removes the token from browser address-bar history after loading. It uses no third-party scripts and applies restrictive CSP and no-referrer headers.
- Public response intentionally excludes full customer name, email, transaction reference and full PDF; only the masked name is shown.
- A copied genuine QR can still validate an unrelated forged paper. Compare displayed details; authenticated retrieval of the original document is a **separate future production integration**.
- Status values VALID, REVOKED, REFUNDED and SUPERSEDED are supported by the UI; production lifecycle transitions and audit trail are not yet implemented.
- Local demo token lookup has no persistent rate limiter. Add rate limiting and abuse monitoring before deploying publicly.
- No customer-vault authentication, production HTTPS URL, production authoritative-adapter implementation, trusted production signing identity, or backend deployment is implemented.
- The verification page is portable and uniquely prefixed. Move it with the backend package into an integration branch based on VISION, then adapt PurvaPhalguni routing and theme without replacing existing files.

**No end-to-end browser or PDF QR test was run through the GitHub connector.** Test locally before considering this ready for integration.
