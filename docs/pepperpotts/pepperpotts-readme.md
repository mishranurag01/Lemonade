# Pepperpotts — local development and transfer guide

## Scope
Pepperpotts is a **backend acknowledgement prototype**, plus a disposable root `index.html` with one Print button. The original uploaded `PurvaPhalguni Letterhead.pdf` in the repository root is the sole letterhead source. The engine **loads and overlays** that PDF, and never recreates the letterhead artwork. No existing PurvaPhalguni repository files have been modified.

## Local run (Node 20+; Termux or Jack)
From the Lemonade repository root on branch `Pepperpotts`:

```sh
npm install --prefix packages/pepperpotts
PEPPERPOTTS_ENABLE_DEMO=1 npm --prefix packages/pepperpotts start
```

Open `http://127.0.0.1:8000` in a browser **on the same device**. Tap **Print**. The server issues one local demonstration acknowledgement, generates a fresh signed PDF over the **original** letterhead, and the PDF viewer offers Print / Save as PDF. Restarting the server does not create a second receipt identity. Only local issuance metadata is stored in `.pepperpotts-local/`; generated PDF bytes are not retained.

The test booking is clearly fictional. It does **not** represent a real paid booking. The original uploaded letterhead PDF must exist at the repository root with exactly the filename `PurvaPhalguni Letterhead.pdf`.

```sh
npm --prefix packages/pepperpotts test
```

Do **not** run the old `python -m http.server` command for this version; Python's static server cannot run the PDF issuance backend. Port 8000 must be free.

## API in local demo
- `GET /api/pepperpotts/status`: local demo eligibility/issuance status
- `POST /api/pepperpotts/demo/issue`: issue the fictional demo once (requires explicit `PEPPERPOTTS_ENABLE_DEMO=1`)
- `GET /api/pepperpotts/demo/pdf`: regenerate the issued demo PDF from trusted metadata
- `GET /verify?token=...`: privacy-reduced local verification record

## Issuance model
Receipt number **equals the booking reference**. Payment verified **AND** service accepted are both mandatory. The original booking/payment data are snapshotted for rendering. Payment, confirmation, ledger, and issue dates are distinct and shown in IST. Total paid, subtotal, discount, and tax use integer minor currency units. The original letterhead is unmodified; the generated PDF includes an official-record QR in the local demo, an SHA-256 fingerprint of the finalized bytes, and a non-cryptographic electronic issuance statement.

The server-side authoritative adapter accepts a booking reference only, loads booking/payment/service fields from its trusted source, and atomically gets or creates the receipt identity. The explicitly selected development adapter uses the fictional fixture, a local JSON index, a serialized issuance queue, a random verification token, and an atomic metadata rename. Persistence remains behind the adapter contract; it stores no PDF bytes or signing secrets. It is **not** a production financial-record system.

## Production integration: required work before use with real bookings
1. Implement the production side of the existing adapter contract using PurvaPhalguni's authenticated booking state, gateway webhook reconciliation and authoritative service acceptance. Never trust the browser or user-submitted UTR as proof of payment.
2. Back the adapter's atomic get-or-create operation with the selected production datastore and add an audit trail, immutable versions, and formal metadata retention policy.
3. Keep regenerating customer PDFs on demand; do not expose generated documents under `public/`.
4. Use an HTTPS verification endpoint under the official domain. Store only hashes of tokens, rate-limit lookup, and prevent public exposure of customer identity/payment references. Printed QR verifies server records, not physical paper integrity.
5. Handle refunds, cancellations, corrections, and revocations by preserving the original record and changing verification status with an audit trail. Do not silently overwrite issued PDFs.
6. Replace the development certificate with the approved managed signing identity. CMS integrity verification is implemented, but production certificate trust is not.
7. Add real PDF rendering tests with the actual uploaded letterhead, visual comparisons, overflow tests, international name/font support, and tests for concurrent issuance/restarts.
8. Protect real API routes with authentication, role checks, CSRF/origin defenses, and rate limits; the loopback-only demo endpoints must **not** be deployed to the public internet.
9. Review financial, tax, and clinical disclaimers against actual services and legal requirements before issuance.

## Transfer plan
Move `packages/pepperpotts/` and approved tests/docs into a **new integration branch based on VISION**. Keep namespaced paths and filenames. Do not merge Lemonade wholesale, do not replace PurvaPhalguni's root package files, and do not copy the disposable `index.html` or `.pepperpotts-local/`. Copy the original PDF into the existing `public/` assets only after confirming the exact destination filename and no collision. The production backend may use the public master letterhead as an input, but generated customer documents and signing secrets must remain private.

**Current limitation:** End-to-end PDF rendering has not been executed against the actual uploaded repository PDF in this chat. Do not treat this prototype as production-approved.
